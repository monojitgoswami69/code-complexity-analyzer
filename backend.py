"""
FastAPI backend for Code Complexity Analyzer.

Minimal API that takes code and returns complexity analysis.
"""

import logging
import time
from datetime import datetime

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from core.analyzer import CodeComplexityAnalyzer
from core.models import ComplexityResult

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)


# Request/Response Models
class AnalyzeRequest(BaseModel):
    """Request model - only accepts code."""
    code: str = Field(..., description="Code to analyze", min_length=1)


class AnalyzeResponse(BaseModel):
    """Response model with complexity results."""
    success: bool
    result: ComplexityResult | None = None
    error: str | None = None


# Initialize FastAPI
app = FastAPI(
    title="Code Complexity Analyzer",
    description="Analyze time and space complexity of code using LLM",
    version="2.0.0"
)

# CORS
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
        "message": "Code Complexity Analyzer API",
        "version": "2.0.0",
        "endpoints": {
            "/analyze": "POST - Analyze code complexity (input: code only)",
            "/health": "GET - Health check"
        }
    }


@app.get("/health")
async def health():
    """Health check."""
    return {"status": "healthy"}


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze_code(request: AnalyzeRequest):
    """
    Analyze code complexity.
    
    Takes ONLY code as input. Returns time and space complexity.
    """
    request_id = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    start_time = time.time()
    
    logger.info(f"[{request_id}] REQUEST RECEIVED - Code length: {len(request.code)} chars")
    
    try:
        async with CodeComplexityAnalyzer() as analyzer:
            result = await analyzer.analyze(request.code)
        
        elapsed_time = time.time() - start_time
        logger.info(f"[{request_id}] REQUEST COMPLETED - Time taken: {elapsed_time:.3f}s - Result: {result.time}, {result.space}")
        
        return AnalyzeResponse(success=True, result=result)
        
    except Exception as e:
        elapsed_time = time.time() - start_time
        logger.error(f"[{request_id}] REQUEST FAILED - Time taken: {elapsed_time:.3f}s - Error: {str(e)}")
        return AnalyzeResponse(success=False, error=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend:app", host="0.0.0.0", port=8000, reload=True)
