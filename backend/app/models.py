"""
Pydantic models for the Codalyzer API.
"""
from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    """Request payload for code analysis."""
    code: str = Field(..., min_length=1, max_length=50000, description="Source code to analyze")
    filename: str = Field(default="untitled", description="Current filename")
    language: str = Field(default="auto", description="Programming language (auto for detection)")


class ComplexityMetric(BaseModel):
    """Complexity metric with notation and rating."""
    notation: str = Field(..., description="Big-O notation (e.g., O(n), O(n²))")
    description: str = Field(..., description="Brief description of the case")
    rating: Literal["Excellent", "Good", "Fair", "Poor", "Critical"] = Field(..., description="Performance rating")


class TimeComplexity(BaseModel):
    """Time complexity breakdown."""
    best: ComplexityMetric
    average: ComplexityMetric
    worst: ComplexityMetric


class Issue(BaseModel):
    """Code issue or optimization opportunity."""
    id: str = Field(..., description="Unique issue identifier")
    line: int = Field(..., ge=1, description="Line number where issue occurs")
    type: Literal["High Impact", "Optimization", "Memory", "Good Practice", "Security"] = Field(..., description="Issue category")
    title: str = Field(..., description="Brief issue title")
    description: str = Field(..., description="Detailed explanation")
    snippet: Optional[str] = Field(default=None, description="Related code snippet")


class AnalysisResult(BaseModel):
    """Complete analysis result matching frontend expectations."""
    fileName: str = Field(..., description="Analyzed file name")
    language: str = Field(..., description="Detected/specified programming language")
    timestamp: str = Field(..., description="Analysis timestamp")
    sourceCode: str = Field(..., description="Original source code")
    timeComplexity: TimeComplexity
    spaceComplexity: ComplexityMetric
    issues: list[Issue] = Field(default_factory=list)
    summary: str = Field(..., description="Brief analysis summary")
    suggestedName: Optional[str] = Field(default=None, description="Suggested filename for untitled snippets")


class AnalyzeResponse(BaseModel):
    """API response wrapper."""
    success: bool = Field(default=True)
    result: AnalysisResult
    model: str = Field(..., description="Model used for analysis")


class ErrorResponse(BaseModel):
    """Error response."""
    success: bool = Field(default=False)
    error: str = Field(..., description="Error message")
    details: Optional[str] = Field(default=None, description="Additional error details")
