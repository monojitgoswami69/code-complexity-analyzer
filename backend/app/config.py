"""
Configuration for Complexity Analyzer Backend.
"""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings."""
    
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
    
    # Gemini Configuration
    GEMINI_API_KEY: str = Field(default="")
    GEMINI_MODEL: str = Field(default="gemini-2.5-flash-lite")
    
    # Generation settings
    MAX_TOKENS: int = Field(default=4096)
    TEMPERATURE: float = Field(default=0.3)  # Lower for more consistent JSON output


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()


# Logging setup
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("google").setLevel(logging.WARNING)

logger = logging.getLogger("complexity-analyzer")
