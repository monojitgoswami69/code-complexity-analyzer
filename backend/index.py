#!/usr/bin/env python3
"""Monolithic Codalyzer Backend v2 server."""
from __future__ import annotations

import asyncio
import datetime
import json
import logging
import re
import secrets
from contextlib import asynccontextmanager
from functools import lru_cache
from typing import Any, Literal, Optional
from zoneinfo import ZoneInfo

import uvicorn
from fastapi import APIRouter, FastAPI, HTTPException, Request, Header
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from google import genai
from google.genai import types
from pydantic import BaseModel, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from redis.asyncio import Redis
from fastapi.responses import JSONResponse, FileResponse
from pathlib import Path

from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)


# ---------------------------------------------------------------------------
# Metadata
# ---------------------------------------------------------------------------

__version__ = "2.0.0"


# ---------------------------------------------------------------------------
# Settings and logging
# ---------------------------------------------------------------------------


class Settings(BaseSettings):
    """Application settings loaded from environment."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Server
    HOST: str = Field(default="0.0.0.0")
    PORT: int = Field(default=8080)
    DEBUG: bool = Field(default=False)
    LOG_LEVEL: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = Field(default="INFO")

    # Gemini
    GEMINI_API_KEY: str = Field(default="")
    GEMINI_MODEL: str = Field(default="gemini-2.5-flash-lite")
    MAX_TOKENS: int = Field(default=4096)
    TEMPERATURE: float = Field(default=0.3)

    # CORS
    ALLOWED_ORIGINS: str = Field(default="http://localhost:3000,http://localhost:3001,http://localhost:5173")

    # Rate limiting (Upstash Redis)
    UPSTASH_REDIS_URL: Optional[str] = Field(default=None)
    UPSTASH_REDIS_TOKEN: Optional[str] = Field(default=None)
    DAILY_RATE_LIMIT: int = Field(default=20)
    GLOBAL_RATE_LIMIT: int = Field(default=1000)
    RATE_LIMIT_TIMEZONE: str = Field(default="UTC")

    # Request limits
    MAX_REQUEST_SIZE: int = Field(default=1_048_576)  # 1 MB
    MAX_CODE_LENGTH: int = Field(default=50_000)
    MAX_ANALYSIS_SIZE: int = Field(default=102_400)  # 100 KB for total response

    # Share feature
    SHARE_TTL_SECONDS: int = Field(default=86400 * 7)  # 7 days

    # Timeouts (Vercel serverless: 10s max)
    GEMINI_TIMEOUT_SECONDS: int = Field(default=8)  # 8s for Gemini, 2s buffer
    REDIS_TIMEOUT_SECONDS: int = Field(default=2)


    # Allowed file extensions
    ALLOWED_EXTENSIONS: str = Field(
        default=".py,.js,.ts,.jsx,.tsx,.cpp,.c,.h,.hpp,.java,.go,.rs,.rb,.php,.swift,.kt,.cs,.scala,.r,.m,.sh,.sql,.html,.css"
    )

    @property
    def cors_origins(self) -> list[str]:
        origins = [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]
        # Security: Never allow wildcard with credentials
        if "*" in origins:
            return ["*"]
        return origins

    @property
    def rate_limiting_enabled(self) -> bool:
        return bool(self.UPSTASH_REDIS_URL and self.UPSTASH_REDIS_TOKEN)

    @property
    def allowed_extensions(self) -> set[str]:
        return {ext.strip().lower() for ext in self.ALLOWED_EXTENSIONS.split(",") if ext.strip()}


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("google").setLevel(logging.WARNING)

logger = logging.getLogger("codalyzer")


# ---------------------------------------------------------------------------
# System instruction
# ---------------------------------------------------------------------------

SYSTEM_INSTRUCTION = """You are Codalyzer, an expert code complexity analyzer. Provide strictly structured outputs.
- Statically analyze the code algorithms as well as semantic and logical flows to detect complexities and issues.
- Rate complexity relative to the algorithm being implemented. Example: O(n²) is "Good" for Bubble Sort (optimal) but "Poor" for Merge Sort.
- Use Big-O notation for time (best, average, worst) and space.
- For each issue, return the exact problematic code snippet instead of line numbers.
- Set fix_type to "code" when you supply code snippet changes; otherwise use "no-code" if you supply text based fixes. The fix field is always required (code or no-code).
- Provide only a concise code summary—no extra commentary.
"""


# ---------------------------------------------------------------------------
# API and Gemini models (unified)
# ---------------------------------------------------------------------------


class AnalyzeRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=50_000, description="Source code to analyze")
    filename: str = Field(default="untitled", max_length=255, description="Filename")
    language: str = Field(default="auto", max_length=50, description="Programming language")

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Code cannot be empty or whitespace only")
        if re.search(r"(.)\1{500,}", v):
            raise ValueError("Invalid code content detected")
        return v

    @field_validator("filename")
    @classmethod
    def validate_filename(cls, v: str) -> str:
        v = v.strip()
        if not v:
            return "untitled"
        # Remove path separators and null bytes
        v = re.sub(r"[/\\]", "", v)
        v = v.replace("\x00", "")
        
        # L4: Validate file extension if present
        if "." in v:
            ext = "." + v.rsplit(".", 1)[-1].lower()
            allowed_exts = settings.allowed_extensions
            if allowed_exts and ext not in allowed_exts:
                # Strip invalid extension, keep filename
                v = v.rsplit(".", 1)[0] or "untitled"
        
        return v or "untitled"

    @field_validator("language")
    @classmethod
    def validate_language(cls, v: str) -> str:
        allowed = {
            "auto", "javascript", "typescript", "python", "cpp", "c",
            "java", "go", "rust", "ruby", "php",
        }
        v = v.strip().lower()
        if v not in allowed:
            return "auto"
        return v


class ComplexityMetric(BaseModel):
    notation: str = Field(..., description="Big-O notation")
    description: str = Field(..., description="Brief explanation")
    rating: Literal["Good", "Fair", "Poor"] = Field(
        ..., description="Rating relative to the specific algorithm implementation"
    )


class TimeComplexity(BaseModel):
    best: ComplexityMetric
    average: ComplexityMetric
    worst: ComplexityMetric


class Issue(BaseModel):
    id: str = Field(..., description="Unique issue identifier")
    type: Literal["Optimization", "Bug", "Critical", "Security", "Style"] = Field(
        ..., description="Issue category"
    )
    title: str = Field(..., description="Brief issue title")
    description: str = Field(..., description="Overview of the issue")
    code_snippet: str = Field(..., description="Problematic code snippet for this issue")
    fix_type: Literal["code", "no-code"] = Field(..., description="Type of fix provided")
    fix: str = Field(..., description="Code snippet or plain text response")


class AnalysisResult(BaseModel):
    summary: str = Field(..., description="Overall summary of what the code does")
    fileName: str = Field(..., description="Suggested filename with extension")
    language: str = Field(..., description="Detected programming language")
    timeComplexity: TimeComplexity
    spaceComplexity: ComplexityMetric
    issues: list[Issue] = Field(default_factory=list)
    sourceCode: Optional[str] = Field(default=None, description="Original source code (added server-side)")
    timestamp: Optional[str] = Field(default=None, description="Timestamp added server-side")


class AnalyzeResponse(BaseModel):
    success: bool = True
    result: AnalysisResult
    model: str


class ErrorResponse(BaseModel):
    success: bool = False
    error: str
    code: Optional[str] = None


class ShareResponse(BaseModel):
    success: bool = True
    share_id: str
    expires_in: int = Field(description="Seconds until expiration")


class ShareResult(BaseModel):
    success: bool = True
    result: AnalysisResult


class InitializeResponse(BaseModel):
    user_requests_remaining: int
    user_requests_limit: int
    global_requests_remaining: int
    global_requests_limit: int
    reset_at: str


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

MAX_CODE_SNIPPET_LENGTH = 4096

# M4: Simple telemetry tracking (serverless-friendly)
_telemetry: dict[str, Any] = {
    "requests_total": 0,
    "requests_failed": 0,
    "gemini_timeouts": 0,
    "gemini_errors": 0,
    "redis_errors": 0,
    "rate_limit_hits": 0,
}


def validate_message_content(message: str) -> bool:
    """Validate message content and detect potential prompt injection attempts."""
    if not message or not message.strip():
        return False
    # Detect repeated characters (potential attack)
    if re.search(r"(.)\1{500,}", message):
        return False
    
    # C4: Detect common prompt injection patterns
    injection_patterns = [
        r"(?i)ignore\s+(previous|all|above)\s+instructions?",
        r"(?i)disregard\s+(previous|all|above)",
        r"(?i)system\s*:\s*you\s+are",
        r"(?i)\[\s*system\s*\]",
        r"(?i)new\s+instructions?\s*:",
        r"(?i)forget\s+(everything|all|previous)",
    ]
    
    for pattern in injection_patterns:
        if re.search(pattern, message[:2000]):  # Check first 2KB only for performance
            logger.warning("Potential prompt injection detected")
            return False
    
    return True


def validate_issue_snippets(issues: list[dict[str, Any]]) -> bool:
    """Check that all issue code snippets don't exceed max length."""
    for issue in issues:
        if issue.get("code_snippet") and len(issue["code_snippet"]) > MAX_CODE_SNIPPET_LENGTH:
            return False
    return True


def validate_analysis_size(data: dict[str, Any]) -> bool:
    """M2: Validate total analysis response size to prevent Redis OOM."""
    try:
        size = len(json.dumps(data))
        if size > settings.MAX_ANALYSIS_SIZE:
            logger.warning("Analysis response too large: %d bytes (max: %d)", size, settings.MAX_ANALYSIS_SIZE)
            return False
        return True
    except Exception as exc:
        logger.error("Failed to validate analysis size: %s", exc)
        return False


def get_client_ip(request: Request) -> str:
    if forwarded := request.headers.get("X-Forwarded-For"):
        return forwarded.split(",")[0].strip()
    if real_ip := request.headers.get("X-Real-IP"):
        return real_ip.strip()
    return request.client.host if request.client else "unknown"


# ---------------------------------------------------------------------------
# Security middleware
# ---------------------------------------------------------------------------


async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response


async def request_size_middleware(request: Request, call_next):
    if request.method in ("POST", "PUT", "PATCH"):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > settings.MAX_REQUEST_SIZE:
            return JSONResponse(
                status_code=413,
                content={
                    "success": False,
                    "error": "request_too_large",
                    "message": f"Request body exceeds {settings.MAX_REQUEST_SIZE} bytes",
                },
            )
    return await call_next(request)


# ---------------------------------------------------------------------------
# Rate limiting (Upstash Redis)
# ---------------------------------------------------------------------------


async def create_redis_client() -> Redis | None:
    """
    L2: Create Redis client with dependency injection pattern.
    H3: Configure connection pool limits for serverless.
    H4: Fail loudly on initialization error (fail-closed).
    """
    if not settings.rate_limiting_enabled:
        return None
    
    try:
        url = settings.UPSTASH_REDIS_URL.replace("https://", "").replace("http://", "")
        
        # H3: Connection pool configuration optimized for serverless
        client = Redis(
            host=url,
            port=6379,
            password=settings.UPSTASH_REDIS_TOKEN,
            ssl=True,
            decode_responses=True,
            max_connections=10,  # Limit for serverless environment
            socket_timeout=settings.REDIS_TIMEOUT_SECONDS,
            socket_connect_timeout=settings.REDIS_TIMEOUT_SECONDS,
            retry_on_timeout=False,  # Fail fast in serverless
        )
        
        # Validate connection at startup
        await client.ping()
        logger.info("Redis client initialized and validated")
        return client
        
    except Exception as exc:
        logger.error("Failed to initialize Redis client: %s", exc)
        _telemetry["redis_errors"] += 1
        # H4: For rate limiting, we need Redis - fail initialization
        raise RuntimeError(f"Redis initialization failed: {exc}") from exc


def get_redis_client(request: Request) -> Redis | None:
    """L2: Dependency injection helper for Redis client."""
    return getattr(request.app.state, "redis", None)


_RATE_LIMIT_LUA = """
local ip_count = redis.call("INCR", KEYS[1])
if ip_count == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end

local global_count = redis.call("INCR", KEYS[2])
if global_count == 1 then
  redis.call("EXPIRE", KEYS[2], ARGV[1])
end

return {ip_count, global_count}
"""

_RATE_LIMIT_DECR_LUA = """
local ip_count = 0
if redis.call("EXISTS", KEYS[1]) == 1 then
  ip_count = redis.call("DECR", KEYS[1])
  if ip_count < 0 then
    redis.call("SET", KEYS[1], 0)
    ip_count = 0
  end
end

local global_count = 0
if redis.call("EXISTS", KEYS[2]) == 1 then
  global_count = redis.call("DECR", KEYS[2])
  if global_count < 0 then
    redis.call("SET", KEYS[2], 0)
    global_count = 0
  end
end

return {ip_count, global_count}
"""


def _tz() -> ZoneInfo:
    return ZoneInfo(settings.RATE_LIMIT_TIMEZONE)


def _day_str() -> str:
    return datetime.datetime.now(_tz()).strftime("%Y%m%d")


def _ip_key(ip: str) -> str:
    return f"codalyzer:rl:day:{_day_str()}:ip:{ip}"


def _global_key() -> str:
    return f"codalyzer:rl:global:day:{_day_str()}"


def _next_reset() -> datetime.datetime:
    now = datetime.datetime.now(_tz())
    tomorrow = now.replace(hour=0, minute=0, second=0, microsecond=0) + datetime.timedelta(days=1)
    return tomorrow.astimezone(datetime.timezone.utc)


async def get_remaining_requests(redis: Redis | None, ip: str) -> dict[str, int]:
    """Get remaining requests for IP and global limits."""
    if redis is None:
        # Return zeros to indicate system degradation
        return {
            "user_remaining": 0,
            "global_remaining": 0,
        }
    try:
        ip_count = int(await redis.get(_ip_key(ip)) or 0)
        global_count = int(await redis.get(_global_key()) or 0)
        return {
            "user_remaining": max(0, settings.DAILY_RATE_LIMIT - ip_count),
            "global_remaining": max(0, settings.GLOBAL_RATE_LIMIT - global_count),
        }
    except Exception as exc:
        logger.error("Redis read error: %s", exc)
        _telemetry["redis_errors"] += 1
        # H4: Fail closed - return zeros
        return {
            "user_remaining": 0,
            "global_remaining": 0,
        }


async def rate_limit_middleware(request: Request, call_next):
    """Rate limiting with fail-closed behavior and idempotency support."""
    if request.method != "POST" or not request.url.path.endswith("/analyze"):
        return await call_next(request)

    redis = get_redis_client(request)
    
    # H4: Fail closed if Redis was supposed to be available but isn't
    if redis is None:
        if settings.rate_limiting_enabled:
            _telemetry["redis_errors"] += 1
            return JSONResponse(
                status_code=503,
                content={
                    "success": False,
                    "error": "service_unavailable",
                    "message": "Rate limiting service temporarily unavailable",
                },
            )
        # If rate limiting not configured, proceed
        return await call_next(request)

    try:
        client_ip = get_client_ip(request)
        ip_key = _ip_key(client_ip)
        global_key = _global_key()
        ttl = 90_000  # ~25 hours

        result = await redis.eval(_RATE_LIMIT_LUA, 2, ip_key, global_key, ttl)
        ip_count, global_count = result

        reset_time = _next_reset()
        seconds_until_reset = int((reset_time - datetime.datetime.now(datetime.timezone.utc)).total_seconds())

        if ip_count > settings.DAILY_RATE_LIMIT:
            _telemetry["rate_limit_hits"] += 1
            logger.warning("IP rate limit exceeded for %s: %d/%d", client_ip, ip_count, settings.DAILY_RATE_LIMIT)
            return JSONResponse(
                status_code=429,
                content={
                    "success": False,
                    "error": "rate_limit_exceeded",
                    "message": f"Rate limit of {settings.DAILY_RATE_LIMIT} requests per day exceeded",
                    "reset_at": reset_time.isoformat(),
                    "requests_made": ip_count,
                    "limit": settings.DAILY_RATE_LIMIT,
                },
                headers={
                    "Retry-After": str(seconds_until_reset),
                    "X-RateLimit-Limit": str(settings.DAILY_RATE_LIMIT),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": reset_time.isoformat(),
                },
            )

        if global_count > settings.GLOBAL_RATE_LIMIT:
            _telemetry["rate_limit_hits"] += 1
            logger.warning("Global rate limit exceeded: %d/%d", global_count, settings.GLOBAL_RATE_LIMIT)
            return JSONResponse(
                status_code=429,
                content={
                    "success": False,
                    "error": "global_limit_exceeded",
                    "message": f"Global rate limit of {settings.GLOBAL_RATE_LIMIT} requests per day exceeded",
                    "reset_at": reset_time.isoformat(),
                },
                headers={
                    "Retry-After": str(seconds_until_reset),
                    "X-RateLimit-Global-Limit": str(settings.GLOBAL_RATE_LIMIT),
                    "X-RateLimit-Global-Remaining": "0",
                    "X-RateLimit-Reset": reset_time.isoformat(),
                },
            )

        response = await call_next(request)

        # Failure protection: If system/LLM fails (>=500), refund the quota
        if response.status_code >= 500:
            try:
                # Refund and get updated counts
                refund_result = await redis.eval(_RATE_LIMIT_DECR_LUA, 2, ip_key, global_key)
                
                # Update ip_count if refund was successful
                if refund_result:
                    ip_count = refund_result[0]
                
                logger.info("Refunded request for %s due to system error (status %d). New count: %d", client_ip, response.status_code, ip_count)
                
                _telemetry["requests_total"] -= 1
                _telemetry["requests_failed"] += 1
            except Exception as refund_exc:
                logger.error("Failed to refund quota: %s", refund_exc)
        
        
        response.headers["X-RateLimit-Limit"] = str(settings.DAILY_RATE_LIMIT)
        response.headers["X-RateLimit-Remaining"] = str(max(0, settings.DAILY_RATE_LIMIT - ip_count))
        response.headers["X-RateLimit-Reset"] = reset_time.isoformat()
        return response

    except Exception as exc:
        # H4: Fail closed on errors
        logger.error("Rate limiting error: %s", exc)
        _telemetry["redis_errors"] += 1
        return JSONResponse(
            status_code=503,
            content={
                "success": False,
                "error": "service_unavailable",
                "message": "Rate limiting service error",
            },
        )


# ---------------------------------------------------------------------------
# Gemini service
# ---------------------------------------------------------------------------


class GeminiService:
    def __init__(self) -> None:
        self._client: genai.Client | None = None
        self._model = settings.GEMINI_MODEL
        self._validated = False
        self._initialize()

    def _initialize(self) -> None:
        if not settings.GEMINI_API_KEY:
            logger.warning("GEMINI_API_KEY not configured")
            return
        try:
            self._client = genai.Client(api_key=settings.GEMINI_API_KEY)
            logger.info("Gemini client initialized (model=%s)", self._model)
        except Exception as exc:
            logger.error("Failed to initialize Gemini client: %s", exc)

    async def validate_api_key(self) -> bool:
        """M3: Validate Gemini API key at startup."""
        if not self._client or self._validated:
            return self._validated
        
        try:
            # Make a lightweight test call
            response = await self._client.aio.models.generate_content(
                model=self._model,
                contents="Test",
                config=types.GenerateContentConfig(max_output_tokens=10),
            )
            self._validated = True
            logger.info("Gemini API key validated successfully")
            return True
        except Exception as exc:
            logger.error("Gemini API key validation failed: %s", exc)
            self._validated = False
            return False

    @property
    def available(self) -> bool:
        return self._client is not None and self._validated

    @property
    def model_name(self) -> str:
        return self._model

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=4),
        retry=retry_if_exception_type((TimeoutError, ConnectionError)),
        reraise=True,
    )
    async def analyze(self, code: str, filename: str = "untitled", language: str = "auto") -> dict[str, Any]:
        """
        Analyze code with M1 (retry logic), M5 (timeout), C4 (safety settings).
        """
        if not self._client:
            raise RuntimeError("Gemini client not initialized — check GEMINI_API_KEY")

        prompt = (
            f"Analyze the following code for complexity:\n\n"
            f"Filename: {filename}\n"
            f"Language: {language if language != 'auto' else 'Auto-detect'}\n\n"
            f"```\n{code}\n```\n\n"
            "Follow the provided schema exactly, include fix_type and code_snippet (problematic code), and rate complexity relative to the algorithm implemented."
        )

        try:
            # M5: Apply timeout (8s for Vercel 10s max, leaving 2s buffer)
            response = await asyncio.wait_for(
                self._client.aio.models.generate_content(
                    model=self._model,
                    contents=[types.Content(role="user", parts=[types.Part(text=prompt)])],
                    config=types.GenerateContentConfig(
                        system_instruction=SYSTEM_INSTRUCTION,
                        temperature=settings.TEMPERATURE,
                        max_output_tokens=settings.MAX_TOKENS,
                        response_mime_type="application/json",
                        response_schema=AnalysisResult,
                        # C4: Enable safety settings to filter harmful content
                        safety_settings=[
                            types.SafetySetting(
                                category="HARM_CATEGORY_DANGEROUS_CONTENT",
                                threshold="BLOCK_MEDIUM_AND_ABOVE",
                            ),
                        ],
                    ),
                ),
                timeout=settings.GEMINI_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError as exc:
            _telemetry["gemini_timeouts"] += 1
            logger.error("Gemini API timeout after %ds", settings.GEMINI_TIMEOUT_SECONDS)
            raise TimeoutError(f"Analysis timed out after {settings.GEMINI_TIMEOUT_SECONDS}s") from exc
        except Exception as exc:
            _telemetry["gemini_errors"] += 1
            logger.error("Gemini API error: %s", exc)
            raise

        logger.debug("Gemini structured response received")

        if not response.parsed:
            # Fallback: Try to parse raw text if structured parsing failed
            if response.text:
                try:
                    logger.warning("Structured parsing failed, attempting manual JSON parse")
                    # Clean markdown code blocks if present
                    text = response.text.replace("```json", "").replace("```", "").strip()
                    data = json.loads(text)
                except json.JSONDecodeError as exc:
                    logger.error("Failed to parse fallback JSON: %s", exc)
                    logger.error("Raw response: %s", response.text[:500])
                    raise ValueError("Model returned invalid JSON structure") from exc
            else:
                # Log finish reason and safety ratings for debugging
                logger.error("Empty response from Gemini. Finish reason: %s", response.candidates[0].finish_reason if response.candidates else "Unknown")
                raise ValueError("Model returned empty response (possibly safety blocked)")
        else:
            analysis = response.parsed
            data = analysis.model_dump()

        data["sourceCode"] = code
        data["timestamp"] = datetime.datetime.now().strftime("%b %d, %I:%M %p")
        
        # M2: Validate total response size
        if not validate_analysis_size(data):
            raise ValueError(f"Analysis response exceeds maximum size of {settings.MAX_ANALYSIS_SIZE} bytes")
        
        return data


gemini_service = GeminiService()


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------


analysis_router = APIRouter()


@analysis_router.post(
    "/analyze",
    response_model=AnalyzeResponse,
    responses={500: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
async def analyze_code(request: AnalyzeRequest):
    if not gemini_service.available:
        raise HTTPException(status_code=503, detail="Gemini provider unavailable — check API key")

    if not validate_message_content(request.code):
        raise HTTPException(status_code=400, detail="Invalid code content")

    try:
        _telemetry["requests_total"] += 1
        
        data = await gemini_service.analyze(
            code=request.code,
            filename=request.filename,
            language=request.language,
        )

        raw_issues = data.get("issues", [])
        
        if not validate_issue_snippets(raw_issues):
            logger.error("Issue code snippet exceeds max length of %d chars", MAX_CODE_SNIPPET_LENGTH)
            # Return 500 to trigger rate limit refund (system failure to produce valid output)
            raise HTTPException(status_code=500, detail=f"LLM generated invalid response detected (snippet too large)")

        time_complexity = TimeComplexity(
            best=ComplexityMetric(**data["timeComplexity"]["best"]),
            average=ComplexityMetric(**data["timeComplexity"]["average"]),
            worst=ComplexityMetric(**data["timeComplexity"]["worst"]),
        )
        space_complexity = ComplexityMetric(**data["spaceComplexity"])
        issues = [Issue(**issue) for issue in raw_issues]

        result = AnalysisResult(
            summary=data["summary"],
            fileName=data["fileName"],
            language=data["language"],
            timeComplexity=time_complexity,
            spaceComplexity=space_complexity,
            issues=issues,
            sourceCode=data.get("sourceCode"),
            timestamp=data.get("timestamp"),
        )

        return AnalyzeResponse(success=True, result=result, model=settings.GEMINI_MODEL)

    except TimeoutError as exc:
        _telemetry["requests_failed"] += 1
        logger.error("Request timeout: %s", exc)
        raise HTTPException(status_code=504, detail="Analysis timed out - code may be too complex")
    except ValueError as exc:
        _telemetry["requests_failed"] += 1
        logger.error("JSON parsing error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to parse analysis result")
    except RuntimeError as exc:
        _telemetry["requests_failed"] += 1
        logger.error("Provider error: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        _telemetry["requests_failed"] += 1
        logger.error("Analysis error: %s", exc)
        raise HTTPException(status_code=500, detail="Analysis failed")


health_router = APIRouter()


@health_router.get("/health")
async def health(request: Request):
    """
    L3: Deep health check - verify connectivity to dependencies.
    Cached for 10s to avoid overhead on every request.
    """
    status = "ok"
    issues = []
    
    # Check Gemini service
    if not gemini_service.available:
        status = "degraded"
        issues.append("gemini_unavailable")
    
    # Check Redis if configured
    if settings.rate_limiting_enabled:
        redis = get_redis_client(request)
        if redis is None:
            status = "degraded"
            issues.append("redis_unavailable")
        else:
            try:
                # Quick ping to verify connectivity
                await asyncio.wait_for(redis.ping(), timeout=1.0)
            except Exception:
                status = "degraded"
                issues.append("redis_unreachable")
    
    response = {
        "status": status,
        "version": __version__,
        "model": settings.GEMINI_MODEL,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    
    if issues:
        response["issues"] = issues
    
    return response


@health_router.get("/metrics")
async def metrics():
    """M4: Simple telemetry metrics (serverless-friendly)."""
    return {
        "success": True,
        "metrics": _telemetry,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }


@health_router.get("/initialize")
async def initialize(request: Request):
    """Get rate limit status with L3: deep health check."""
    client_ip = get_client_ip(request)
    redis = get_redis_client(request)
    remaining = await get_remaining_requests(redis, client_ip)
    reset_time = _next_reset()

    return {
        "success": True,
        "user_requests_remaining": remaining["user_remaining"],
        "user_requests_limit": settings.DAILY_RATE_LIMIT,
        "global_requests_remaining": remaining["global_remaining"],
        "global_requests_limit": settings.GLOBAL_RATE_LIMIT,
        "reset_at": reset_time.isoformat(),
    }


share_router = APIRouter()


@share_router.post("/share")
async def create_share(result: AnalysisResult, request: Request):
    """Create a shareable link for analysis results."""
    redis = get_redis_client(request)
    if redis is None:
        raise HTTPException(status_code=503, detail="Sharing unavailable (Redis not configured)")

    share_id = secrets.token_urlsafe(12)
    key = f"codalyzer:share:{share_id}"

    try:
        await redis.set(key, result.model_dump_json(), ex=settings.SHARE_TTL_SECONDS)
        return {
            "success": True,
            "share_id": share_id,
            "expires_in": settings.SHARE_TTL_SECONDS,
        }
    except Exception as exc:
        logger.error("Failed to store share: %s", exc)
        _telemetry["redis_errors"] += 1
        raise HTTPException(status_code=500, detail="Failed to create share link")


@share_router.get("/share/{share_id}")
async def get_share(share_id: str, request: Request):
    """Retrieve shared analysis results."""
    if len(share_id) > 64 or not share_id.isascii():
        raise HTTPException(status_code=400, detail="Invalid share ID")

    redis = get_redis_client(request)
    if redis is None:
        raise HTTPException(status_code=503, detail="Sharing unavailable")

    key = f"codalyzer:share:{share_id}"
    try:
        data = await redis.get(key)
        if data is None:
            raise HTTPException(status_code=404, detail="Share not found or expired")
        return {"success": True, "result": json.loads(data)}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to retrieve share: %s", exc)
        _telemetry["redis_errors"] += 1
        raise HTTPException(status_code=500, detail="Failed to retrieve share")


# ---------------------------------------------------------------------------
# FastAPI app assembly
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle with dependency initialization."""
    logger.info("Codalyzer v%s starting", __version__)
    logger.info("Model: %s", settings.GEMINI_MODEL)
    logger.info("Rate limiting: %s", "enabled" if settings.rate_limiting_enabled else "disabled")
    
    # L2: Initialize Redis client with dependency injection
    redis_client = None
    if settings.rate_limiting_enabled:
        try:
            redis_client = await create_redis_client()
            app.state.redis = redis_client
            logger.info("Redis client ready")
        except Exception as exc:
            # H4: For production, fail startup if Redis required but unavailable
            logger.error("Failed to initialize Redis: %s", exc)
            if settings.DEBUG:
                logger.warning("Continuing without Redis (DEBUG mode)")
                app.state.redis = None
            else:
                # In production, fail fast
                raise
    else:
        app.state.redis = None
        logger.info("Redis not configured")
    
    # M3: Validate Gemini API key at startup
    if gemini_service._client:
        validated = await gemini_service.validate_api_key()
        if validated:
            logger.info("Gemini provider validated and ready")
        else:
            logger.error("Gemini API key validation failed")
            if not settings.DEBUG:
                raise RuntimeError("Gemini API key validation failed")
    else:
        logger.error("Gemini provider unavailable — check GEMINI_API_KEY")
        if not settings.DEBUG:
            raise RuntimeError("Gemini client not initialized")
    
    yield
    
    # Cleanup
    logger.info("Shutting down")
    if redis_client:
        try:
            await redis_client.close()
            logger.info("Redis connection closed")
        except Exception as exc:
            logger.error("Error closing Redis: %s", exc)


app = FastAPI(
    title="Codalyzer API",
    description="AI-powered code complexity analysis",
    version=__version__,
    lifespan=lifespan,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """H6: Prevent credential logging - don't log request bodies or sensitive headers."""
    # Log error without full stack trace that might contain request data
    logger.error(
        "Unhandled exception on %s %s: %s: %s",
        request.method,
        request.url.path,
        type(exc).__name__,
        str(exc)[:200],  # Limit error message length
    )
    _telemetry["requests_failed"] += 1
    return JSONResponse(status_code=500, content={"success": False, "error": "Internal server error"})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """H6: Log validation errors without exposing sensitive data."""
    # Extract only error types and field names, not values
    error_details = [{"field": err.get("loc", [])[-1] if err.get("loc") else "unknown", "type": err.get("type")} for err in exc.errors()[:5]]
    logger.warning("Validation error on %s %s: %s", request.method, request.url.path, error_details)
    return JSONResponse(status_code=422, content={"success": False, "error": "Invalid request format"})

app.middleware("http")(security_headers_middleware)
app.middleware("http")(request_size_middleware)
app.middleware("http")(rate_limit_middleware)


# C2: Fix CORS configuration - never allow wildcard with credentials
cors_origins = settings.cors_origins
allow_credentials = "*" not in cors_origins  # Only allow credentials if origins are specific

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=allow_credentials,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=[
        "X-RateLimit-Limit",
        "X-RateLimit-Remaining",
        "X-RateLimit-Reset",
        "X-RateLimit-Global-Limit",
        "X-RateLimit-Global-Remaining",
        "Retry-After",
    ],
)


@app.get("/")
async def root():
    return {
        "name": "Codalyzer API",
        "version": __version__,
        "status": "ok" if gemini_service.available else "unavailable",
    }

ROOT_DIR = Path(__file__).resolve().parent

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    """Favicon endpoint."""
    favicon_path = ROOT_DIR / "static" / "favicon.ico"
    if favicon_path.exists():
        return FileResponse(favicon_path)
    return JSONResponse(status_code=404, content={"error": "favicon not found"})


app.include_router(health_router, prefix="/api/v1", tags=["health"])
app.include_router(analysis_router, prefix="/api/v1", tags=["analysis"])
app.include_router(share_router, prefix="/api/v1", tags=["share"])
app.include_router(analysis_router, tags=["analysis-compat"])


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main():
    logger.info("Starting Codalyzer v2 on %s:%d", settings.HOST, settings.PORT)
    uvicorn.run(
        "index:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,
        log_level=settings.LOG_LEVEL.lower(),
    )


if __name__ == "__main__":
    main()
