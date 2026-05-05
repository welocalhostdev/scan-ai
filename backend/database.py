"""
ScanAI — Database engine, session factory, and initialization.
Provides both sync sessions (for Celery workers) and a FastAPI dependency.
"""

from sqlalchemy import create_engine
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
