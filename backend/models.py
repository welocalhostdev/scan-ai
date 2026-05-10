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


class UserPlan(str, enum.Enum):
    """Commercial plan buckets for quota enforcement."""
    BETA = "beta"
    PRO = "pro"
    INTERNAL = "internal"


class AccountVerificationPurpose(str, enum.Enum):
    """One-time verification flows for account security changes."""
    SIGNUP = "signup"
    EMAIL_CHANGE = "email_change"


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
    google_sub = Column(String(255), nullable=True, unique=True, index=True)
    avatar_url = Column(String(2048), nullable=True)
    auth_provider = Column(String(40), nullable=False, default="password")
    signup_ip = Column(String(45), nullable=True)
    timezone = Column(String(80), nullable=False, default="UTC")
    email_verified = Column(Boolean, nullable=False, default=True)
    email_verified_at = Column(DateTime(timezone=True), nullable=True)
    plan = Column(
        Enum(UserPlan),
        nullable=False,
        default=UserPlan.BETA,
    )
    monthly_scan_limit = Column(Integer, nullable=False, default=25)
    active_scan_limit = Column(Integer, nullable=False, default=1)
    schedule_limit = Column(Integer, nullable=False, default=3)
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
    scan_targets = relationship("ScanTarget", back_populates="user", cascade="all, delete-orphan")
    token_usage = relationship("TokenUsage", back_populates="user")
    account_verifications = relationship("AccountVerification", back_populates="user", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email} role={self.role}>"


class AccountVerification(Base):
    """Hashed, expiring OTP challenge for signup and account email changes."""

    __tablename__ = "account_verifications"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    email = Column(String(320), nullable=False, index=True)
    purpose = Column(
        Enum(AccountVerificationPurpose),
        nullable=False,
        index=True,
    )
    otp_hash = Column(String(128), nullable=False)
    attempts = Column(Integer, nullable=False, default=0)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    consumed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    user = relationship("User", back_populates="account_verifications")

    def __repr__(self) -> str:
        return f"<AccountVerification id={self.id} email={self.email} purpose={self.purpose}>"


# ── Scan ───────────────────────────────────────────────────────────

class ScanStatus(str, enum.Enum):
    """Scan lifecycle states."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETE = "complete"
    FAILED = "failed"


class EmailDeliveryStatus(str, enum.Enum):
    """Lifecycle for queued scan completion emails."""
    PENDING = "pending"
    QUEUED = "queued"
    SENDING = "sending"
    SENT = "sent"
    FAILED = "failed"


class ScanTargetStatus(str, enum.Enum):
    """Ownership verification state for a scan target."""
    PENDING = "pending"
    VERIFIED = "verified"
    REVOKED = "revoked"


class ScanTarget(Base):
    """
    User-owned target authorization.

    Paid beta scans require a verified target so the product is not an open
    scanner for arbitrary third-party domains.
    """

    __tablename__ = "scan_targets"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    domain = Column(String(255), nullable=False, index=True)
    status = Column(
        Enum(ScanTargetStatus),
        nullable=False,
        default=ScanTargetStatus.PENDING,
        index=True,
    )
    verification_token = Column(String(120), nullable=False)
    verified_at = Column(DateTime(timezone=True), nullable=True)

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

    user = relationship("User", back_populates="scan_targets")

    def __repr__(self) -> str:
        return f"<ScanTarget id={self.id} domain={self.domain} status={self.status}>"


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


# ── Email Notifications ───────────────────────────────────────────

class EmailNotification(Base):
    """
    Persisted completion email state.
    BullMQ dispatches delivery, while this row keeps the retry/status audit trail.
    """

    __tablename__ = "email_notifications"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    scan_id = Column(
        UUID(as_uuid=True),
        ForeignKey("scans.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    recipient_email = Column(String(320), nullable=False)
    subject = Column(String(255), nullable=False)
    status = Column(
        Enum(EmailDeliveryStatus),
        nullable=False,
        default=EmailDeliveryStatus.PENDING,
        index=True,
    )
    attempts = Column(Integer, nullable=False, default=0)
    last_error = Column(Text, nullable=True)
    queued_at = Column(DateTime(timezone=True), nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)

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

    scan = relationship("Scan")
    user = relationship("User")

    def __repr__(self) -> str:
        return f"<EmailNotification id={self.id} scan_id={self.scan_id} status={self.status}>"


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
