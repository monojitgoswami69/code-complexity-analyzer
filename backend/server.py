#!/usr/bin/env python3
"""
Server entry point for Codalyzer Backend.
"""
import uvicorn
from app.config import settings, logger


def main():
    """Run the server."""
    logger.info(f"Starting Codalyzer on {settings.HOST}:{settings.PORT}")
    
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower(),
    )


if __name__ == "__main__":
    main()
