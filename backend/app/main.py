"""
FastAPI application for Codalyzer.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings, logger
from app.models import (
    AnalyzeRequest, 
    AnalyzeResponse, 
    AnalysisResult,
    TimeComplexity,
    ComplexityMetric,
    Issue,
    ErrorResponse,
)
from app.gemini_provider import gemini_provider
from app import __version__


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management."""
    logger.info("Codalyzer Backend Starting...")
    logger.info(f"Model: {settings.GEMINI_MODEL}")
    logger.info(f"Server: {settings.HOST}:{settings.PORT}")
    
    if not gemini_provider.is_available():
        logger.error("Gemini provider not available - check API key configuration")
    else:
        logger.info("Gemini provider ready")
    
    yield
    
    logger.info("Shutting down...")


app = FastAPI(
    title="Codalyzer API",
    description="AI-powered code complexity analysis using Gemini",
    version=__version__,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "Codalyzer API",
        "version": __version__,
        "model": settings.GEMINI_MODEL,
        "status": "ok" if gemini_provider.is_available() else "unavailable",
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "ok" if gemini_provider.is_available() else "error",
        "model": settings.GEMINI_MODEL,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/analyze", response_model=AnalyzeResponse, responses={
    500: {"model": ErrorResponse},
    503: {"model": ErrorResponse},
})
async def analyze_code(request: AnalyzeRequest):
    """
    Analyze code complexity.
    
    Accepts source code and returns detailed complexity analysis including:
    - Time complexity (best, average, worst case)
    - Space complexity
    - Code issues and optimization opportunities
    - Suggested filename for untitled snippets
    """
    if not gemini_provider.is_available():
        raise HTTPException(
            status_code=503,
            detail="Gemini provider not available. Please check API key configuration."
        )
    
    try:
        # Analyze code with Gemini
        analysis_data = await gemini_provider.analyze_code(
            code=request.code,
            filename=request.filename,
            language=request.language,
        )
        
        # Build response using Pydantic models
        time_complexity = TimeComplexity(
            best=ComplexityMetric(**analysis_data["timeComplexity"]["best"]),
            average=ComplexityMetric(**analysis_data["timeComplexity"]["average"]),
            worst=ComplexityMetric(**analysis_data["timeComplexity"]["worst"]),
        )
        
        space_complexity = ComplexityMetric(**analysis_data["spaceComplexity"])
        
        issues = [Issue(**issue) for issue in analysis_data.get("issues", [])]
        
        result = AnalysisResult(
            fileName=analysis_data["fileName"],
            language=analysis_data["language"],
            timestamp=analysis_data["timestamp"],
            sourceCode=analysis_data["sourceCode"],
            timeComplexity=time_complexity,
            spaceComplexity=space_complexity,
            issues=issues,
            summary=analysis_data["summary"],
            suggestedName=analysis_data.get("suggestedName"),
        )
        
        return AnalyzeResponse(
            success=True,
            result=result,
            model=settings.GEMINI_MODEL,
        )
        
    except ValueError as e:
        logger.error(f"JSON parsing error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse analysis result: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Analysis error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Analysis failed: {str(e)}"
        )
