"""
ScanAI — Database engine, session factory, and initialization.
Provides both sync sessions (for Celery workers) and a FastAPI dependency.
"""

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, Session
from contextlib import contextmanager
from typing import Generator

from config import settings
from models import Base


# Synchronous engine — used by both FastAPI and Celery
engine = create_engine(
    settings.sync_database_url,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,  # Verify connections before use
)

# Session factory
SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)


def init_db() -> None:
    """Create all database tables if they don't exist."""
    Base.metadata.create_all(bind=engine)
    _ensure_user_account_columns()
    _ensure_scan_program_columns()
    _ensure_scan_auth_profile_columns()


def _ensure_user_account_columns() -> None:
    """Add account columns to existing deployments without a migration runner."""
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns("users")}
    statements = []
    if "google_sub" not in existing_columns:
        statements.append("ALTER TABLE users ADD COLUMN google_sub VARCHAR(255)")
    if "avatar_url" not in existing_columns:
        statements.append("ALTER TABLE users ADD COLUMN avatar_url VARCHAR(2048)")
    if "auth_provider" not in existing_columns:
        statements.append("ALTER TABLE users ADD COLUMN auth_provider VARCHAR(40) DEFAULT 'password' NOT NULL")
    if "signup_ip" not in existing_columns:
        statements.append("ALTER TABLE users ADD COLUMN signup_ip VARCHAR(45)")
    if "timezone" not in existing_columns:
        statements.append("ALTER TABLE users ADD COLUMN timezone VARCHAR(80) DEFAULT 'UTC' NOT NULL")
    if "email_verified" not in existing_columns:
        statements.append("ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT TRUE NOT NULL")
    if "email_verified_at" not in existing_columns:
        statements.append("ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMP WITH TIME ZONE")
    if "plan" not in existing_columns:
        statements.append("ALTER TABLE users ADD COLUMN plan VARCHAR(40) DEFAULT 'BETA' NOT NULL")
    if "monthly_scan_limit" not in existing_columns:
        statements.append(f"ALTER TABLE users ADD COLUMN monthly_scan_limit INTEGER DEFAULT {settings.BETA_MONTHLY_SCAN_LIMIT} NOT NULL")
    if "active_scan_limit" not in existing_columns:
        statements.append(f"ALTER TABLE users ADD COLUMN active_scan_limit INTEGER DEFAULT {settings.BETA_ACTIVE_SCAN_LIMIT} NOT NULL")
    if "schedule_limit" not in existing_columns:
        statements.append(f"ALTER TABLE users ADD COLUMN schedule_limit INTEGER DEFAULT {settings.BETA_SCHEDULE_LIMIT} NOT NULL")
    statements.append("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_sub ON users (google_sub) WHERE google_sub IS NOT NULL")

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


def _ensure_scan_program_columns() -> None:
    """Add bug-bounty program linkage to existing scan tables."""
    inspector = inspect(engine)
    if "scans" not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns("scans")}
    statements = []
    if "program_id" not in existing_columns:
        statements.append("ALTER TABLE scans ADD COLUMN program_id UUID")
        statements.append("CREATE INDEX IF NOT EXISTS ix_scans_program_id ON scans (program_id)")

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


def _ensure_scan_auth_profile_columns() -> None:
    """Add authenticated-scan linkage to existing scan tables."""
    inspector = inspect(engine)
    if "scans" not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns("scans")}
    statements = []
    if "auth_profile_id" not in existing_columns:
        statements.append("ALTER TABLE scans ADD COLUMN auth_profile_id UUID")
        statements.append("CREATE INDEX IF NOT EXISTS ix_scans_auth_profile_id ON scans (auth_profile_id)")

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency that yields a database session.
    Automatically closes the session when the request is done.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_db_session() -> Generator[Session, None, None]:
    """
    Context manager for database sessions in Celery tasks.
    Commits on success, rolls back on error, always closes.
    """
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
