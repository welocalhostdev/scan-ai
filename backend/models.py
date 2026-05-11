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
    UniqueConstraint,
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
    auth_profiles = relationship("AuthProfile", back_populates="user", cascade="all, delete-orphan")
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


class ScopeRuleType(str, enum.Enum):
    """Bug bounty scope rule direction."""
    IN_SCOPE = "in_scope"
    OUT_OF_SCOPE = "out_of_scope"


class ScopeAssetType(str, enum.Enum):
    """Type of target described by a scope rule."""
    DOMAIN = "domain"
    WILDCARD = "wildcard"
    URL = "url"
    IP = "ip"
    CIDR = "cidr"
    PATH = "path"


class AssetType(str, enum.Enum):
    """Discovered attack-surface asset type."""
    DOMAIN = "domain"
    SUBDOMAIN = "subdomain"
    URL = "url"
    IP = "ip"
    SERVICE = "service"
    API = "api"
    REPOSITORY = "repository"
    CLOUD = "cloud"
    OTHER = "other"


class FindingStatus(str, enum.Enum):
    """Triage lifecycle for bug bounty findings."""
    NEW = "new"
    TRIAGED = "triaged"
    ACCEPTED = "accepted"
    DUPLICATE = "duplicate"
    FALSE_POSITIVE = "false_positive"
    FIXED = "fixed"
    REGRESSED = "regressed"


class FindingSeverity(str, enum.Enum):
    """Normalized finding severity."""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class EvidenceType(str, enum.Enum):
    """Evidence stored for a finding."""
    SCANNER_JSON = "scanner_json"
    REQUEST = "request"
    RESPONSE = "response"
    SCREENSHOT = "screenshot"
    REPRODUCTION = "reproduction"
    NOTE = "note"


class Program(Base):
    """
    Bug bounty program/workspace.

    A program owns scope rules, assets, and triaged findings. It can represent
    an external bounty program or an internal assessment scope.
    """

    __tablename__ = "programs"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    name = Column(String(180), nullable=False)
    handle = Column(String(120), nullable=True, index=True)
    safe_harbor = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    scan_intensity = Column(String(40), nullable=False, default="standard")
    is_active = Column(Boolean, nullable=False, default=True, index=True)

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
    scope_rules = relationship("ScopeRule", back_populates="program", cascade="all, delete-orphan")
    auth_profiles = relationship("AuthProfile", back_populates="program", cascade="all, delete-orphan")
    assets = relationship("Asset", back_populates="program", cascade="all, delete-orphan")
    findings = relationship("Finding", back_populates="program")

    __table_args__ = (
        UniqueConstraint("user_id", "handle", name="uq_program_user_handle"),
    )

    def __repr__(self) -> str:
        return f"<Program id={self.id} name={self.name}>"


class AuthProfile(Base):
    """Encrypted reusable authenticated-scanning context for a program."""

    __tablename__ = "auth_profiles"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    name = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)
    encrypted_headers = Column(Text, nullable=False)
    header_names = Column(JSONB, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)

    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    program_id = Column(
        UUID(as_uuid=True),
        ForeignKey("programs.id", ondelete="CASCADE"),
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

    user = relationship("User", back_populates="auth_profiles")
    program = relationship("Program", back_populates="auth_profiles")
    scans = relationship("Scan", back_populates="auth_profile")

    __table_args__ = (
        UniqueConstraint("program_id", "name", name="uq_auth_profile_program_name"),
    )

    def __repr__(self) -> str:
        return f"<AuthProfile id={self.id} name={self.name}>"


class ScopeRule(Base):
    """In-scope or out-of-scope rule for a bug bounty program."""

    __tablename__ = "scope_rules"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    program_id = Column(
        UUID(as_uuid=True),
        ForeignKey("programs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    rule_type = Column(Enum(ScopeRuleType), nullable=False, index=True)
    asset_type = Column(Enum(ScopeAssetType), nullable=False, default=ScopeAssetType.DOMAIN)
    pattern = Column(String(2048), nullable=False)
    description = Column(Text, nullable=True)
    allowed_tests = Column(JSONB, nullable=True)
    forbidden_tests = Column(JSONB, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)

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

    program = relationship("Program", back_populates="scope_rules")

    def __repr__(self) -> str:
        return f"<ScopeRule id={self.id} type={self.rule_type} pattern={self.pattern}>"


class Asset(Base):
    """Normalized asset discovered during reconnaissance."""

    __tablename__ = "assets"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    value = Column(String(2048), nullable=False)
    asset_type = Column(Enum(AssetType), nullable=False, default=AssetType.OTHER, index=True)
    source = Column(String(80), nullable=False, default="scan")
    metadata_json = Column(JSONB, nullable=True)
    first_seen_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    last_seen_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    program_id = Column(
        UUID(as_uuid=True),
        ForeignKey("programs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    scan_id = Column(
        UUID(as_uuid=True),
        ForeignKey("scans.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    user = relationship("User")
    program = relationship("Program", back_populates="assets")
    scan = relationship("Scan")
    findings = relationship("Finding", back_populates="asset")

    __table_args__ = (
        UniqueConstraint("user_id", "value", "asset_type", name="uq_asset_user_value_type"),
    )

    def __repr__(self) -> str:
        return f"<Asset id={self.id} type={self.asset_type} value={self.value}>"


class Finding(Base):
    """Persistent, triageable security finding."""

    __tablename__ = "findings"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    title = Column(String(255), nullable=False)
    category = Column(String(80), nullable=False, default="other", index=True)
    severity = Column(Enum(FindingSeverity), nullable=False, default=FindingSeverity.INFO, index=True)
    status = Column(Enum(FindingStatus), nullable=False, default=FindingStatus.NEW, index=True)
    affected = Column(String(2048), nullable=False)
    evidence_summary = Column(Text, nullable=True)
    what_it_means = Column(Text, nullable=True)
    remediation = Column(JSONB, nullable=True)
    fix_prompt = Column(Text, nullable=True)
    source = Column(String(80), nullable=False, default="ai_report")
    dedupe_key = Column(String(128), nullable=False, index=True)
    confidence = Column(Integer, nullable=True)
    first_seen_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    last_seen_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    program_id = Column(
        UUID(as_uuid=True),
        ForeignKey("programs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    scan_id = Column(
        UUID(as_uuid=True),
        ForeignKey("scans.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    asset_id = Column(
        UUID(as_uuid=True),
        ForeignKey("assets.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    user = relationship("User")
    program = relationship("Program", back_populates="findings")
    scan = relationship("Scan")
    asset = relationship("Asset", back_populates="findings")
    evidence = relationship("Evidence", back_populates="finding", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("user_id", "dedupe_key", name="uq_finding_user_dedupe_key"),
    )

    def __repr__(self) -> str:
        return f"<Finding id={self.id} severity={self.severity} title={self.title}>"


class Evidence(Base):
    """Durable proof item for a finding."""

    __tablename__ = "evidence"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    finding_id = Column(
        UUID(as_uuid=True),
        ForeignKey("findings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    evidence_type = Column(Enum(EvidenceType), nullable=False, default=EvidenceType.SCANNER_JSON, index=True)
    title = Column(String(180), nullable=False)
    content = Column(Text, nullable=True)
    storage_url = Column(String(2048), nullable=True)
    raw_json = Column(JSONB, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    finding = relationship("Finding", back_populates="evidence")

    def __repr__(self) -> str:
        return f"<Evidence id={self.id} type={self.evidence_type}>"


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
    program_id = Column(
        UUID(as_uuid=True),
        ForeignKey("programs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    auth_profile_id = Column(
        UUID(as_uuid=True),
        ForeignKey("auth_profiles.id", ondelete="SET NULL"),
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
    program = relationship("Program")
    auth_profile = relationship("AuthProfile", back_populates="scans")
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
