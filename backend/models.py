"""
ScanAI — SQLAlchemy ORM models.
Defines User and Scan tables for the application.
"""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    Boolean,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    """Base class for all ORM models."""
    pass


# ── User ───────────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    """User roles for access control."""
    ADMIN = "admin"
    USER = "user"


class User(Base):
    """
    Represents a registered user.
    The first user to sign up automatically becomes admin.
    """

    __tablename__ = "users"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    email = Column(String(320), nullable=False, unique=True, index=True)
    name = Column(String(100), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(
        Enum(UserRole),
        nullable=False,
        default=UserRole.USER,
    )
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationship
    scans = relationship("Scan", back_populates="user", cascade="all, delete-orphan")
    token_usage = relationship("TokenUsage", back_populates="user")

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email} role={self.role}>"


# ── Scan ───────────────────────────────────────────────────────────

class ScanStatus(str, enum.Enum):
    """Scan lifecycle states."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETE = "complete"
    FAILED = "failed"


class Scan(Base):
    """
    Represents a single security scan job.

    Tracks the full lifecycle from submission through pipeline execution
    to final AI-generated report.
    """

    __tablename__ = "scans"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    url = Column(String(2048), nullable=False)
    status = Column(
        Enum(ScanStatus),
        nullable=False,
        default=ScanStatus.PENDING,
        index=True,
    )
    progress_step = Column(Integer, nullable=False, default=0)
    sub_tasks = Column(JSONB, nullable=True)
    report = Column(JSONB, nullable=True)
    error = Column(Text, nullable=True)
    pdf_url = Column(String(2048), nullable=True)
    client_ip = Column(String(45), nullable=True)  # IPv6 max length

    # Foreign key to user
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    user = relationship("User", back_populates="scans")
    token_usage = relationship("TokenUsage", back_populates="scan", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Scan id={self.id} url={self.url} status={self.status}>"


# ── Scheduled Scans ────────────────────────────────────────────────

class ScheduledScan(Base):
    """
    User-owned recurring scan configuration.
    BullMQ owns the repeat timer; this table owns user intent and history.
    """

    __tablename__ = "scheduled_scans"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    url = Column(String(2048), nullable=False)
    cron = Column(String(120), nullable=False)
    timezone = Column(String(80), nullable=False, default="UTC")
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    last_scan_id = Column(String(36), nullable=True)

    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    user = relationship("User")

    def __repr__(self) -> str:
        return f"<ScheduledScan id={self.id} url={self.url} cron={self.cron}>"


# ── Token Usage ──────────────────────────────────────────────────────

class TokenUsage(Base):
    """
    Tracks AI API token consumption for cost analysis and monitoring.

    Records prompt tokens, completion tokens, total cost per scan.
    """

    __tablename__ = "token_usage"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )

    # Token counts
    prompt_tokens = Column(Integer, nullable=False, default=0)
    completion_tokens = Column(Integer, nullable=False, default=0)
    total_tokens = Column(Integer, nullable=False, default=0)

    # Cost calculation (in USD, e.g., 0.002 for $0.002)
    estimated_cost = Column(String(20), nullable=True)

    # Model used (e.g., gpt-4, gpt-3.5-turbo)
    model = Column(String(50), nullable=True)

    # Foreign keys
    scan_id = Column(
        UUID(as_uuid=True),
        ForeignKey("scans.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    scan = relationship("Scan", back_populates="token_usage")
    user = relationship("User", back_populates="token_usage")

    def __repr__(self) -> str:
        return f"<TokenUsage id={self.id} tokens={self.total_tokens} cost={self.estimated_cost}>"
