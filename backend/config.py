"""
ScanAI — Application configuration via environment variables.
Uses pydantic-settings to load and validate all config from .env or environment.
"""

from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application
    ENVIRONMENT: str = "development"
    DATABASE_URL: str = "postgresql://scanai:scanai@db:5432/scanai"

    # Redis
    REDIS_URL: str = "redis://redis:6379/0"

    # Google Gemini API
    GEMINI_API_KEY: str = ""

    # Application
    SECRET_KEY: str = "change-me-in-production"
    ALLOWED_ORIGINS: str = "http://localhost:3000"
    MAX_SCANS_PER_IP: int = 1
    SCAN_TIMEOUT_SECONDS: int = 480  # 8 minutes
    TOOL_TIMEOUT_SECONDS: int = 120  # 2 minutes per individual tool

    # JWT Auth
    JWT_SECRET_KEY: str = "scanai-jwt-secret-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440  # 24 hours

    # Scanner temp directory
    SCAN_OUTPUT_DIR: str = "/tmp/scanai"

    @property
    def allowed_origins_list(self) -> List[str]:
        """Parse comma-separated origins into a list."""
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",")]

    @property
    def sync_database_url(self) -> str:
        """Return synchronous database URL for Celery workers."""
        return self.DATABASE_URL

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": True,
    }


# Singleton settings instance
settings = Settings()
