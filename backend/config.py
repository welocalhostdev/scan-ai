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

    # Google OAuth / Cloud Identity
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_OAUTH_REDIRECT_URI: str = ""
    GOOGLE_ALLOWED_DOMAIN: str = ""

    # Application
    SECRET_KEY: str = "change-me-in-production"
    ALLOWED_ORIGINS: str = "http://localhost:3000"
    MAX_SCANS_PER_IP: int = 1
    PAID_BETA_MODE: bool = True
    REQUIRE_TARGET_VERIFICATION: bool = True
    BETA_MONTHLY_SCAN_LIMIT: int = 25
    BETA_ACTIVE_SCAN_LIMIT: int = 1
    BETA_SCHEDULE_LIMIT: int = 3
    SCAN_TIMEOUT_SECONDS: int = 480  # 8 minutes
    TOOL_TIMEOUT_SECONDS: int = 120  # 2 minutes per individual tool
    TLS_DEEP_SCAN_ENABLED: bool = True
    TLS_DEEP_SCAN_TIMEOUT_SECONDS: int = 45
    SCAN_QUEUE_BACKEND: str = "bullmq"
    SCAN_PIPELINE_PARALLELISM: int = 4
    SCHEDULER_TOKEN: str = "scanai-scheduler-dev"
    ACCOUNT_OTP_TTL_MINUTES: int = 10
    ACCOUNT_OTP_MAX_ATTEMPTS: int = 5
    IP_TIMEZONE_LOOKUP_ENABLED: bool = True
    IP_TIMEZONE_LOOKUP_TIMEOUT_SECONDS: float = 2.0

    # SMTP for account security notifications
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "ScanAI Security <security@scanai.local>"
    SMTP_SECURE: bool = False

    # JWT Auth
    JWT_SECRET_KEY: str = "scanai-jwt-secret-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440  # 24 hours
    AUTH_COOKIE_DOMAIN: str = ""

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
