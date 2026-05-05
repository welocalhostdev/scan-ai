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
    report = Column(JSONB, nullable=True)
    error = Column(Text, nullable=True)
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

    # Relationship
    user = relationship("User", back_populates="scans")

    def __repr__(self) -> str:
        return f"<Scan id={self.id} url={self.url} status={self.status}>"
