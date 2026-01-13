"""
Groq LLM Provider for code complexity analysis.

Uses meta-llama/llama-4-scout-17b-16e-instruct model with JSON mode.
"""

import os
import json
import asyncio
from typing import Optional, Any

import httpx
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)


class GroqAPIError(Exception):
    """Exception for Groq API errors."""
    
    def __init__(self, message: str, status_code: Optional[int] = None):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class GroqProvider:
    """
    Groq LLM provider with JSON mode support.
    
    Uses meta-llama/llama-4-scout-17b-16e-instruct for analysis.
    """
    
    BASE_URL = "https://api.groq.com/openai/v1/chat/completions"
    MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
    
    def __init__(self):
        """
        Initialize Groq provider.
        
        Raises:
            ValueError: If GROQ_API_KEY not set
        """
        self.api_key = os.getenv("GROQ_API_KEY")
        if not self.api_key:
            raise ValueError(
                "GROQ_API_KEY environment variable not set. "
                "Get your key from https://console.groq.com"
            )
        
        self._client: Optional[httpx.AsyncClient] = None
    
    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(60.0),
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
            )
        return self._client
    
    async def close(self):
        """Close HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.NetworkError)),
    )
    async def _make_request(
        self,
        messages: list[dict[str, str]],
    ) -> dict[str, Any]:
        """
        Make API request to Groq with JSON mode enabled.
        
        Args:
            messages: Chat messages
            
        Returns:
            API response dict
        """
        client = await self._get_client()
        
        payload = {
            "model": self.MODEL,
            "messages": messages,
            "max_tokens": 1024,
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
        }
        
        response = await client.post(self.BASE_URL, json=payload)
        
        if response.status_code == 429:
            # Rate limit - wait and retry
            await asyncio.sleep(2)
            response = await client.post(self.BASE_URL, json=payload)
        
        if response.status_code != 200:
            error_detail = response.text
            try:
                error_json = response.json()
                error_detail = error_json.get("error", {}).get("message", error_detail)
            except:
                pass
            raise GroqAPIError(
                f"API error ({response.status_code}): {error_detail}",
                status_code=response.status_code
            )
        
        return response.json()
    
    async def complete_json(
        self,
        prompt: str,
        system_prompt: str,
    ) -> dict[str, Any]:
        """
        Get JSON completion from Groq.
        
        Args:
            prompt: User prompt
            system_prompt: System prompt
            
        Returns:
            Parsed JSON dict
        """
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ]
        
        response = await self._make_request(messages)
        
        # Extract content
        content = response["choices"][0]["message"]["content"].strip()
        
        # Parse JSON
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            # Try to extract JSON from response
            start = content.find("{")
            end = content.rfind("}") + 1
            if start != -1 and end > start:
                try:
                    return json.loads(content[start:end])
                except json.JSONDecodeError:
                    pass
            
            raise GroqAPIError(f"Failed to parse JSON response: {content[:200]}...")
