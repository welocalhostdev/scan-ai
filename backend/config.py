"""
ScanAI — Application configuration via environment variables.
Uses pydantic-settings to load and validate all config from .env or environment.
"""

from pydantic_settings import BaseSettings
from typing import List


GEMINI_MODEL_REPLACEMENTS = {
    "gemini-1.5-flash": "gemini-2.5-flash-lite",
    "gemini-1.5-pro": "gemini-2.5-flash",
    "gemini-2.0-flash": "gemini-2.5-flash",
    "gemini-2.0-flash-001": "gemini-2.5-flash",
    "gemini-2.0-flash-lite": "gemini-2.5-flash-lite",
    "gemini-2.0-flash-lite-001": "gemini-2.5-flash-lite",
}


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application
    ENVIRONMENT: str = "development"
    DATABASE_URL: str = "postgresql://scanai:scanai@db:5432/scanai"

    # Redis
    REDIS_URL: str = "redis://redis:6379/0"

    # Google Gemini API (Primary AI provider)
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"
    GEMINI_MODEL_FALLBACKS: str = "gemini-2.5-flash-lite"

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

    # HTML-to-PDF rendering
    PDF_BROWSER_BIN: str = ""
    PDF_RENDER_TIMEOUT_SECONDS: int = 20

    # MinIO / S3 Compatible Storage
    MINIO_ENDPOINT: str = "minio:9000"  # Internal Docker hostname for API communication
    MINIO_PUBLIC_ENDPOINT: str = "localhost:9000"  # Public URL for browser access
    MINIO_ACCESS_KEY: str = "scanai"
    MINIO_SECRET_KEY: str = "scanai-secret-key"
    MINIO_BUCKET: str = "scanai-reports"
    MINIO_SECURE: bool = False

    @property
    def allowed_origins_list(self) -> List[str]:
        """Parse comma-separated origins into a list."""
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",")]

    @property
    def sync_database_url(self) -> str:
        """Return synchronous database URL for Celery workers."""
        return self.DATABASE_URL

    @property
    def gemini_model_candidates(self) -> List[str]:
        """Return the preferred Gemini model followed by configured fallbacks."""
        models = [self.GEMINI_MODEL]
        models.extend(
            model.strip()
            for model in self.GEMINI_MODEL_FALLBACKS.split(",")
            if model.strip()
        )

        deduped: List[str] = []
        for model in models:
            canonical_model = GEMINI_MODEL_REPLACEMENTS.get(model, model)
            if canonical_model not in deduped:
                deduped.append(canonical_model)
        return deduped

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": True,
    }


# Singleton settings instance
settings = Settings()
