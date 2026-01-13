"""
Core Code Complexity Analyzer.

Minimal analyzer that uses LLM for complexity analysis.
"""

import json
from typing import Optional

from .models import ComplexityResult
from .prompts import SYSTEM_PROMPT, build_analysis_prompt
from providers.groq_provider import GroqProvider, GroqAPIError


class CodeComplexityAnalyzer:
    """
    Code complexity analyzer using LLM.
    
    Takes code as input, returns complexity analysis.
    """
    
    def __init__(self):
        """Initialize analyzer with Groq provider."""
        self._provider: Optional[GroqProvider] = None
    
    async def _get_provider(self) -> GroqProvider:
        """Get or create Groq provider."""
        if self._provider is None:
            self._provider = GroqProvider()
        return self._provider
    
    async def close(self) -> None:
        """Close provider connection."""
        if self._provider:
            await self._provider.close()
            self._provider = None
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
    
    async def analyze(self, code: str) -> ComplexityResult:
        """
        Analyze code complexity.
        
        Args:
            code: Source code string to analyze (any language)
            
        Returns:
            ComplexityResult with time and space complexity
            
        Raises:
            GroqAPIError: If API call fails
            ValueError: If code is empty or response invalid
        """
        if not code or not code.strip():
            raise ValueError("Code cannot be empty")
        
        code = code.strip()
        
        # Build prompt
        prompt = build_analysis_prompt(code)
        
        # Get provider and analyze
        provider = await self._get_provider()
        
        try:
            response = await provider.complete_json(
                prompt=prompt,
                system_prompt=SYSTEM_PROMPT,
            )
            
            # Validate and parse response using Pydantic
            result = ComplexityResult.model_validate(response)
            return result
            
        except json.JSONDecodeError as e:
            raise GroqAPIError(f"Failed to parse LLM response as JSON: {e}")
        except Exception as e:
            raise GroqAPIError(f"Analysis failed: {e}")
