"""
Gemini LLM provider for code complexity analysis.
"""
from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any

from google import genai
from google.genai import types

from app.config import settings, logger
from app.system_instruction import SYSTEM_INSTRUCTION


class GeminiProvider:
    """
    Gemini provider for code complexity analysis.
    """
    
    def __init__(self):
        self._client: genai.Client | None = None
        self._model = settings.GEMINI_MODEL
        self._initialize()
    
    def _initialize(self) -> None:
        """Initialize Gemini client."""
        if not settings.GEMINI_API_KEY:
            logger.warning("Gemini API key not configured")
            return
        
        try:
            self._client = genai.Client(api_key=settings.GEMINI_API_KEY)
            logger.info(f"Gemini client initialized with model: {self._model}")
        except Exception as e:
            logger.error(f"Failed to initialize Gemini client: {e}")
    
    def is_available(self) -> bool:
        """Check if provider is available."""
        return self._client is not None
    
    def get_model_name(self) -> str:
        """Get model name."""
        return self._model
    
    def _extract_json(self, text: str) -> dict[str, Any]:
        """
        Extract JSON from response, handling markdown code blocks if present.
        """
        # Try direct JSON parse first
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
        
        # Try to extract from markdown code block
        json_patterns = [
            r'```json\s*\n?(.*?)\n?```',
            r'```\s*\n?(.*?)\n?```',
            r'\{[\s\S]*\}'
        ]
        
        for pattern in json_patterns:
            match = re.search(pattern, text, re.DOTALL)
            if match:
                try:
                    json_str = match.group(1) if '```' in pattern else match.group(0)
                    return json.loads(json_str.strip())
                except json.JSONDecodeError:
                    continue
        
        raise ValueError(f"Could not extract valid JSON from response: {text[:500]}...")
    
    def _validate_and_fix_response(self, data: dict, code: str, filename: str) -> dict:
        """
        Validate and fix the response to match expected schema.
        """
        # Ensure required fields exist
        if "fileName" not in data:
            data["fileName"] = filename if filename != "untitled" else "analyzed_code.js"
        
        if "language" not in data:
            data["language"] = "JavaScript"
        
        if "suggestedName" not in data:
            data["suggestedName"] = None
        
        # Validate timeComplexity structure
        if "timeComplexity" not in data:
            data["timeComplexity"] = {
                "best": {"notation": "O(n)", "description": "Linear time", "rating": "Good"},
                "average": {"notation": "O(n)", "description": "Linear time", "rating": "Good"},
                "worst": {"notation": "O(n)", "description": "Linear time", "rating": "Good"}
            }
        
        for case in ["best", "average", "worst"]:
            if case not in data["timeComplexity"]:
                data["timeComplexity"][case] = {
                    "notation": "O(n)",
                    "description": "Could not determine",
                    "rating": "Fair"
                }
            # Ensure rating is valid
            tc = data["timeComplexity"][case]
            if tc.get("rating") not in ["Excellent", "Good", "Fair", "Poor", "Critical"]:
                tc["rating"] = "Fair"
        
        # Validate spaceComplexity
        if "spaceComplexity" not in data:
            data["spaceComplexity"] = {
                "notation": "O(1)",
                "description": "Constant space",
                "rating": "Excellent"
            }
        if data["spaceComplexity"].get("rating") not in ["Excellent", "Good", "Fair", "Poor", "Critical"]:
            data["spaceComplexity"]["rating"] = "Good"
        
        # Validate issues
        if "issues" not in data:
            data["issues"] = []
        
        valid_types = ["High Impact", "Optimization", "Memory", "Good Practice", "Security"]
        for i, issue in enumerate(data.get("issues", [])):
            if "id" not in issue:
                issue["id"] = f"issue-{i+1}"
            if "line" not in issue or not isinstance(issue["line"], int):
                issue["line"] = 1
            if issue.get("type") not in valid_types:
                issue["type"] = "Optimization"
            if "title" not in issue:
                issue["title"] = "Issue detected"
            if "description" not in issue:
                issue["description"] = "See code for details"
        
        # Ensure summary exists
        if "summary" not in data:
            data["summary"] = "Code analysis completed."
        
        return data
    
    async def analyze_code(
        self,
        code: str,
        filename: str = "untitled",
        language: str = "auto",
    ) -> dict[str, Any]:
        """
        Analyze code complexity using Gemini.
        
        Args:
            code: Source code to analyze
            filename: Current filename
            language: Programming language (auto for detection)
            
        Returns:
            Analysis result dictionary
        """
        if not self._client:
            raise RuntimeError("Gemini client not initialized")
        
        # Build the prompt
        prompt = f"""Analyze the following code for complexity:

Filename: {filename}
Language: {language if language != "auto" else "Auto-detect"}

```
{code}
```

Provide your analysis as a JSON object following the schema in your instructions.
If the filename starts with "Snippet-" or is "untitled", suggest a meaningful name based on the code's purpose."""

        # Generate response
        response = await self._client.aio.models.generate_content(
            model=self._model,
            contents=[
                types.Content(
                    role="user",
                    parts=[types.Part(text=prompt)]
                )
            ],
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION,
                temperature=settings.TEMPERATURE,
                max_output_tokens=settings.MAX_TOKENS,
            )
        )
        
        response_text = response.text
        logger.debug(f"Raw Gemini response: {response_text[:500]}...")
        
        # Parse and validate JSON
        data = self._extract_json(response_text)
        data = self._validate_and_fix_response(data, code, filename)
        
        # Add metadata
        data["sourceCode"] = code
        data["timestamp"] = datetime.now().strftime("%b %d, %I:%M %p")
        
        return data


# Global provider instance
gemini_provider = GeminiProvider()
