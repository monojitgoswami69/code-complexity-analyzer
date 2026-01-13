"""
Data models for code complexity analysis.

Minimal Pydantic models for LLM response validation.
"""

from pydantic import BaseModel, Field


class ComplexityResult(BaseModel):
    """
    Complexity analysis result - returns worst case only.
    
    This is the exact schema the LLM must return.
    Pydantic validation ensures the response matches this structure.
    """
    
    time: str = Field(
        description="Worst case time complexity in Big-O notation"
    )
    space: str = Field(
        description="Worst case space complexity in Big-O notation"
    )
