"""
ScanAI — FastAPI application.
REST endpoints for auth, scans, and admin management.
"""

import logging
import json
import re
import base64
import hashlib
import ipaddress
import fnmatch
import smtplib
import secrets
import subprocess
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from typing import Any, List, Optional
from urllib.parse import urlencode, urlparse
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
import redis
import redis.asyncio as aioredis
from fastapi import FastAPI, HTTPException, Depends, Query, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
from sqlalchemy import func, text

from config import settings
from ai_pricing import estimate_ai_cost_usd, format_usd
from auth_profiles import (
    AuthProfileError,
    auth_header_names,
    decrypt_auth_headers,
    encrypt_auth_headers,
    sanitize_auth_headers,
)
from database import init_db, get_db, SessionLocal, engine
from models import (
    AccountVerification,
    AccountVerificationPurpose,
    Asset,
    AssetType,
    AuthProfile,
    EmailDeliveryStatus,
    EmailNotification,
    Evidence,
    Finding,
    FindingSeverity,
    FindingStatus,
    Program,
    Scan,
    ScanStatus,
    ScanTarget,
    ScanTargetStatus,
    ScheduledScan,
    ScopeAssetType,
    ScopeRule,
    ScopeRuleType,
    User,
    UserPlan,
    UserRole,
    TokenUsage,
)
from validators import validate_url, URLValidationError
from auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    get_optional_user,
    require_admin,
    COOKIE_NAME,
    COOKIE_MAX_AGE,
    decode_access_token,
)
from scan_events import SCAN_EVENTS_CHANNEL, publish_scan_event

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Redis client for rate limiting
redis_client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)

# Rate limit key prefix
RATE_LIMIT_PREFIX = "scanai:active_scan:"
RATE_LIMIT_TTL = settings.SCAN_TIMEOUT_SECONDS + 60
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_OAUTH_STATE_COOKIE = "scanai_google_state"
GOOGLE_OAUTH_VERIFIER_COOKIE = "scanai_google_verifier"
GOOGLE_OAUTH_NEXT_COOKIE = "scanai_google_next"
GOOGLE_OAUTH_COOKIE_MAX_AGE = 10 * 60


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — initialize DB on startup."""
    logger.info("ScanAI starting up...")
    init_db()
    logger.info("Database tables initialized.")
    yield
    logger.info("ScanAI shutting down...")


# Create FastAPI app
app = FastAPI(
    title="ScanAI",
    description="AI-powered web security scanner API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response Models ──────────────────────────────────────

# Auth models
class SignupRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    otp: str = Field(default="", min_length=0, max_length=12)
    timezone: str | None = None


class SignupOtpRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    timezone: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AccountProfileUpdateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class AccountTimezoneUpdateRequest(BaseModel):
    timezone: str = Field(min_length=1, max_length=80)


class EmailChangeStartRequest(BaseModel):
    new_email: EmailStr
    current_password: str = Field(default="", max_length=256)


class EmailChangeConfirmRequest(BaseModel):
    new_email: EmailStr
    otp: str = Field(min_length=4, max_length=12)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(default="", max_length=256)
    new_password: str = Field(min_length=8, max_length=256)


class MessageResponse(BaseModel):
    message: str


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    plan: str
    monthly_scan_limit: int
    active_scan_limit: int
    schedule_limit: int
    auth_provider: str
    email_verified: bool
    timezone: str
    is_active: bool
    created_at: str


class AuthResponse(BaseModel):
    user: UserResponse
    message: str


# Scan models
class ScanRequest(BaseModel):
    url: str
    program_id: str
    auth_profile_id: str | None = None


class ScanCreateResponse(BaseModel):
    scan_id: str


class AccountUsageResponse(BaseModel):
    plan: str
    monthly_scan_limit: int
    monthly_scans_used: int
    monthly_scans_remaining: int
    active_scan_limit: int
    active_scans: int
    schedule_limit: int
    schedules_used: int
    requires_target_verification: bool


class ScanTargetCreateRequest(BaseModel):
    target: str


class ScanTargetResponse(BaseModel):
    id: str
    domain: str
    status: str
    verification_record_name: str
    verification_record_value: str
    verified_at: str | None = None
    created_at: str


class ScanTargetVerifyResponse(BaseModel):
    id: str
    domain: str
    status: str
    message: str


class ScheduledScanCreateRequest(BaseModel):
    url: str
    cron: str
    timezone: str | None = None
    is_active: bool = True


class ScheduledScanUpdateRequest(BaseModel):
    url: str | None = None
    cron: str | None = None
    timezone: str | None = None
    is_active: bool | None = None


class ScheduledScanResponse(BaseModel):
    id: str
    url: str
    cron: str
    timezone: str
    is_active: bool
    last_run_at: str | None = None
    last_scan_id: str | None = None
    created_at: str
    updated_at: str


class InternalScheduleResponse(ScheduledScanResponse):
    user_id: str


class InternalPendingScanResponse(BaseModel):
    id: str
    url: str
    created_at: str


class ScheduledScanTriggerResponse(BaseModel):
    status: str
    scan_id: str | None = None
    message: str


class ScanDispatchResponse(BaseModel):
    status: str
    scan_id: str
    message: str


class InternalEmailNotificationResponse(BaseModel):
    id: str
    scan_id: str
    url: str
    recipient_email: str
    subject: str
    status: str
    attempts: int
    created_at: str


class InternalEmailStatusRequest(BaseModel):
    error: str | None = None


class InternalEmailStatusResponse(BaseModel):
    status: str
    message: str


class ScanCancelResponse(BaseModel):
    scan_id: str
    status: str
    message: str


class ScanStatusResponse(BaseModel):
    id: str
    url: str
    status: str
    progress_step: int
    sub_tasks: dict[str, str] | None = None  # tool_key -> status
    report: dict[str, Any] | None = None
    error: str | None = None
    pdf_url: str | None = None
    program_id: str | None = None
    auth_profile_id: str | None = None
    created_at: str
    user_id: str | None = None


class DashboardRecentScan(BaseModel):
    id: str
    url: str
    status: str
    progress_step: int
    risk_score: int | None = None
    findings_count: int
    pdf_url: str | None = None
    created_at: str


class DashboardCategoryCount(BaseModel):
    label: str
    count: int


class DashboardAssetCount(BaseModel):
    asset: str
    count: int


class DashboardDayCount(BaseModel):
    date: str
    scans: int
    findings: int


class ScanDashboardResponse(BaseModel):
    total_scans: int
    complete_scans: int
    active_scans: int
    failed_scans: int
    reports_ready: int
    total_findings: int
    average_risk_score: int | None = None
    severity_counts: dict[str, int]
    category_counts: list[DashboardCategoryCount]
    top_assets: list[DashboardAssetCount]
    scans_by_day: list[DashboardDayCount]
    recent_scans: list[DashboardRecentScan]


class ProgramCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    handle: str | None = Field(default=None, max_length=120)
    safe_harbor: str | None = None
    notes: str | None = None
    scan_intensity: str = Field(default="standard", max_length=40)
    is_active: bool = True


class ProgramResponse(BaseModel):
    id: str
    name: str
    handle: str | None = None
    safe_harbor: str | None = None
    notes: str | None = None
    scan_intensity: str
    is_active: bool
    created_at: str
    updated_at: str


class ScopeRuleCreateRequest(BaseModel):
    rule_type: str = Field(pattern="^(in_scope|out_of_scope)$")
    asset_type: str = Field(default="domain", pattern="^(domain|wildcard|url|ip|cidr|path)$")
    pattern: str = Field(min_length=1, max_length=2048)
    description: str | None = None
    allowed_tests: list[str] | None = None
    forbidden_tests: list[str] | None = None
    is_active: bool = True


class ScopeRuleResponse(BaseModel):
    id: str
    program_id: str
    rule_type: str
    asset_type: str
    pattern: str
    description: str | None = None
    allowed_tests: list[str] | None = None
    forbidden_tests: list[str] | None = None
    is_active: bool
    created_at: str


class AuthProfileCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    headers: dict[str, str] = Field(default_factory=dict)
    is_active: bool = True


class AuthProfileResponse(BaseModel):
    id: str
    program_id: str
    name: str
    description: str | None = None
    header_names: list[str]
    is_active: bool
    created_at: str
    updated_at: str


class ScopePreviewRequest(BaseModel):
    url: str


class ScopePreviewResponse(BaseModel):
    url: str
    program_id: str
    status: str
    allowed: bool
    message: str
    matched_in_scope_rules: list[ScopeRuleResponse]
    matched_out_of_scope_rules: list[ScopeRuleResponse]
    allowed_tests: list[str]
    forbidden_tests: list[str]


class ReleaseGateResponse(BaseModel):
    program_id: str
    status: str
    blockers: list[str]
    warnings: list[str]
    counts: dict[str, int]
    generated_at: str


class AssetResponse(BaseModel):
    id: str
    value: str
    asset_type: str
    source: str
    metadata_json: dict[str, Any] | None = None
    first_seen_at: str
    last_seen_at: str
    scan_id: str | None = None
    program_id: str | None = None


class EvidenceResponse(BaseModel):
    id: str
    finding_id: str
    evidence_type: str
    title: str
    content: str | None = None
    storage_url: str | None = None
    raw_json: dict[str, Any] | None = None
    created_at: str


class FindingResponse(BaseModel):
    id: str
    title: str
    category: str
    severity: str
    status: str
    affected: str
    evidence_summary: str | None = None
    what_it_means: str | None = None
    remediation: list[str] | None = None
    fix_prompt: str | None = None
    source: str
    dedupe_key: str
    first_seen_at: str
    last_seen_at: str
    scan_id: str | None = None
    asset_id: str | None = None
    program_id: str | None = None


class FindingStatusUpdateRequest(BaseModel):
    status: str = Field(pattern="^(new|triaged|accepted|duplicate|false_positive|fixed|regressed)$")


# Admin models
class AdminStatsResponse(BaseModel):
    total_users: int
    total_scans: int
    active_scans: int


class AdminUserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    plan: str
    monthly_scan_limit: int
    active_scan_limit: int
    schedule_limit: int
    is_active: bool
    created_at: str
    scan_count: int


class AdminScanResponse(BaseModel):
    id: str
    url: str
    status: str
    progress_step: int
    error: str | None = None
    created_at: str
    user_email: str | None = None
    user_name: str | None = None


class HealthResponse(BaseModel):
    status: str
    version: str
    checks: dict[str, str] | None = None


# ── Helper Functions ───────────────────────────────────────────────

def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _check_rate_limit(client_ip: str) -> None:
    try:
        key = f"{RATE_LIMIT_PREFIX}{client_ip}"
        active_count = redis_client.get(key)
        if active_count and int(active_count) >= settings.MAX_SCANS_PER_IP:
            raise HTTPException(
                status_code=429,
                detail=(
                    f"Rate limit exceeded. Maximum {settings.MAX_SCANS_PER_IP} "
                    f"active scan(s) per IP. Please wait for your current scan to complete."
                ),
            )
    except redis.ConnectionError:
        logger.warning("Redis unavailable for rate limiting — allowing scan")


def _increment_rate_limit(client_ip: str) -> None:
    try:
        key = f"{RATE_LIMIT_PREFIX}{client_ip}"
        pipe = redis_client.pipeline()
        pipe.incr(key)
        pipe.expire(key, RATE_LIMIT_TTL)
        pipe.execute()
    except redis.ConnectionError:
        logger.warning("Redis unavailable — rate limit not tracked")


def _decrement_rate_limit(client_ip: str) -> None:
    try:
        key = f"{RATE_LIMIT_PREFIX}{client_ip}"
        current = redis_client.get(key)
        if current and int(current) > 0:
            redis_client.decr(key)
    except redis.ConnectionError:
        pass


def _coerce_risk_score(value: Any) -> int | None:
    """Convert stored report risk_score values into a bounded integer."""
    try:
        if value is None or isinstance(value, bool):
            return None
        return max(0, min(100, int(value)))
    except (TypeError, ValueError):
        return None


def _month_start_utc() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _effective_user_limits(user: User) -> tuple[int, int, int]:
    monthly_limit = int(getattr(user, "monthly_scan_limit", 0) or settings.BETA_MONTHLY_SCAN_LIMIT)
    active_limit = int(getattr(user, "active_scan_limit", 0) or settings.BETA_ACTIVE_SCAN_LIMIT)
    schedule_limit = int(getattr(user, "schedule_limit", 0) or settings.BETA_SCHEDULE_LIMIT)
    if user.role == UserRole.ADMIN or getattr(user, "plan", None) == UserPlan.INTERNAL:
        return max(monthly_limit, 10_000), max(active_limit, 50), max(schedule_limit, 500)
    return monthly_limit, active_limit, schedule_limit


def _account_usage(db: Session, user: User) -> AccountUsageResponse:
    monthly_limit, active_limit, schedule_limit = _effective_user_limits(user)
    monthly_used = (
        db.query(func.count(Scan.id))
        .filter(Scan.user_id == user.id, Scan.created_at >= _month_start_utc())
        .scalar()
        or 0
    )
    active_scans = (
        db.query(func.count(Scan.id))
        .filter(Scan.user_id == user.id, Scan.status.in_([ScanStatus.PENDING, ScanStatus.RUNNING]))
        .scalar()
        or 0
    )
    schedules_used = db.query(func.count(ScheduledScan.id)).filter(ScheduledScan.user_id == user.id).scalar() or 0
    plan = getattr(user, "plan", UserPlan.BETA)
    plan_value = plan.value if isinstance(plan, UserPlan) else str(plan).lower()
    return AccountUsageResponse(
        plan=plan_value,
        monthly_scan_limit=monthly_limit,
        monthly_scans_used=monthly_used,
        monthly_scans_remaining=max(0, monthly_limit - monthly_used),
        active_scan_limit=active_limit,
        active_scans=active_scans,
        schedule_limit=schedule_limit,
        schedules_used=schedules_used,
        requires_target_verification=settings.REQUIRE_TARGET_VERIFICATION,
    )


def _enforce_user_scan_quota(db: Session, user: User) -> None:
    if user.role == UserRole.ADMIN:
        return
    usage = _account_usage(db, user)
    if usage.active_scans >= usage.active_scan_limit:
        raise HTTPException(
            status_code=429,
            detail=f"Your plan allows {usage.active_scan_limit} active scan(s). Wait for a running scan to finish.",
        )
    if usage.monthly_scans_used >= usage.monthly_scan_limit:
        raise HTTPException(
            status_code=402,
            detail=f"Monthly scan quota reached ({usage.monthly_scan_limit}). Contact support to raise your beta limit.",
        )


def _enforce_schedule_quota(db: Session, user: User) -> None:
    if user.role == UserRole.ADMIN:
        return
    usage = _account_usage(db, user)
    if usage.schedules_used >= usage.schedule_limit:
        raise HTTPException(
            status_code=402,
            detail=f"Schedule quota reached ({usage.schedule_limit}). Contact support to raise your beta limit.",
        )


def _normalize_target_domain(target: str) -> str:
    value = target.strip().lower().rstrip(".")
    if not value:
        raise HTTPException(status_code=400, detail="Target domain is required.")
    if "://" not in value:
        value = f"https://{value}"
    try:
        validated = validate_url(value)
    except URLValidationError as e:
        raise HTTPException(status_code=400, detail=e.message)
    domain = extract_domain(validated).lower().rstrip(".")
    if not domain:
        raise HTTPException(status_code=400, detail="Target must contain a valid domain.")
    return domain


def _verification_record_name(domain: str) -> str:
    return f"_scanai.{domain}"


def _verification_record_value(token: str) -> str:
    return f"scanai-verify={token}"


def _scan_target_to_response(target: ScanTarget) -> ScanTargetResponse:
    return ScanTargetResponse(
        id=str(target.id),
        domain=target.domain,
        status=target.status.value,
        verification_record_name=_verification_record_name(target.domain),
        verification_record_value=_verification_record_value(target.verification_token),
        verified_at=target.verified_at.isoformat() if target.verified_at else None,
        created_at=target.created_at.isoformat(),
    )


def _program_to_response(program: Program) -> ProgramResponse:
    return ProgramResponse(
        id=str(program.id),
        name=program.name,
        handle=program.handle,
        safe_harbor=program.safe_harbor,
        notes=program.notes,
        scan_intensity=program.scan_intensity,
        is_active=program.is_active,
        created_at=program.created_at.isoformat(),
        updated_at=program.updated_at.isoformat(),
    )


def _auth_profile_to_response(profile: AuthProfile) -> AuthProfileResponse:
    names = profile.header_names if isinstance(profile.header_names, list) else []
    return AuthProfileResponse(
        id=str(profile.id),
        program_id=str(profile.program_id),
        name=profile.name,
        description=profile.description,
        header_names=[str(name) for name in names],
        is_active=profile.is_active,
        created_at=profile.created_at.isoformat(),
        updated_at=profile.updated_at.isoformat(),
    )


def _scope_rule_to_response(rule: ScopeRule) -> ScopeRuleResponse:
    return ScopeRuleResponse(
        id=str(rule.id),
        program_id=str(rule.program_id),
        rule_type=rule.rule_type.value,
        asset_type=rule.asset_type.value,
        pattern=rule.pattern,
        description=rule.description,
        allowed_tests=rule.allowed_tests,
        forbidden_tests=rule.forbidden_tests,
        is_active=rule.is_active,
        created_at=rule.created_at.isoformat(),
    )


def _asset_to_response(asset: Asset) -> AssetResponse:
    return AssetResponse(
        id=str(asset.id),
        value=asset.value,
        asset_type=asset.asset_type.value,
        source=asset.source,
        metadata_json=asset.metadata_json,
        first_seen_at=asset.first_seen_at.isoformat(),
        last_seen_at=asset.last_seen_at.isoformat(),
        scan_id=str(asset.scan_id) if asset.scan_id else None,
        program_id=str(asset.program_id) if asset.program_id else None,
    )


def _finding_to_response(finding: Finding) -> FindingResponse:
    remediation = finding.remediation if isinstance(finding.remediation, list) else None
    return FindingResponse(
        id=str(finding.id),
        title=finding.title,
        category=finding.category,
        severity=finding.severity.value,
        status=finding.status.value,
        affected=finding.affected,
        evidence_summary=finding.evidence_summary,
        what_it_means=finding.what_it_means,
        remediation=remediation,
        fix_prompt=finding.fix_prompt,
        source=finding.source,
        dedupe_key=finding.dedupe_key,
        first_seen_at=finding.first_seen_at.isoformat(),
        last_seen_at=finding.last_seen_at.isoformat(),
        scan_id=str(finding.scan_id) if finding.scan_id else None,
        asset_id=str(finding.asset_id) if finding.asset_id else None,
        program_id=str(finding.program_id) if finding.program_id else None,
    )


def _evidence_to_response(evidence: Evidence) -> EvidenceResponse:
    return EvidenceResponse(
        id=str(evidence.id),
        finding_id=str(evidence.finding_id),
        evidence_type=evidence.evidence_type.value,
        title=evidence.title,
        content=evidence.content,
        storage_url=evidence.storage_url,
        raw_json=evidence.raw_json,
        created_at=evidence.created_at.isoformat(),
    )


def _dig_txt_records(name: str) -> list[str]:
    try:
        completed = subprocess.run(
            ["dig", "+short", "TXT", name],
            capture_output=True,
            text=True,
            timeout=8,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as e:
        logger.warning(f"TXT verification lookup failed for {name}: {e}")
        raise HTTPException(status_code=503, detail="DNS TXT lookup is temporarily unavailable.")
    if completed.returncode != 0:
        logger.warning(f"dig returned {completed.returncode} for {name}: {completed.stderr[:300]}")
        return []
    records = []
    for line in completed.stdout.splitlines():
        cleaned = line.strip().replace('" "', "").strip('"')
        if cleaned:
            records.append(cleaned)
    return records


def _find_verified_target(db: Session, user: User, domain: str) -> ScanTarget | None:
    targets = (
        db.query(ScanTarget)
        .filter(ScanTarget.user_id == user.id, ScanTarget.status == ScanTargetStatus.VERIFIED)
        .all()
    )
    for target in targets:
        if domain == target.domain or domain.endswith(f".{target.domain}"):
            return target
    return None


def _enforce_target_authorization(db: Session, user: User, url: str) -> None:
    if not settings.REQUIRE_TARGET_VERIFICATION or user.role == UserRole.ADMIN:
        return
    domain = extract_domain(url).lower().rstrip(".")
    if not _find_verified_target(db, user, domain):
        raise HTTPException(
            status_code=403,
            detail=(
                "Target ownership must be verified before scanning. Add the domain in Target settings "
                "and publish the provided DNS TXT record."
            ),
        )


def _validate_cron_pattern(pattern: str) -> str:
    """Validate a standard five-field cron expression for BullMQ."""
    normalized = " ".join(pattern.strip().split())
    fields = normalized.split(" ")
    if len(fields) != 5:
        raise HTTPException(status_code=400, detail="Cron schedule must use five fields: minute hour day month weekday.")

    field_re = re.compile(r"^[0-9*,/\-]+$")
    for field in fields:
        if not field_re.match(field):
            raise HTTPException(status_code=400, detail="Cron fields may only contain numbers, *, commas, ranges, and step values.")
    return normalized


def _validate_timezone(value: str) -> str:
    timezone_name = value.strip() or "UTC"
    offset_match = re.fullmatch(r"UTC(?:([+-])(\d{2}):(\d{2}))?", timezone_name)
    if offset_match:
        if timezone_name == "UTC":
            return timezone_name
        sign, hours_raw, minutes_raw = offset_match.groups()
        hours = int(hours_raw)
        minutes = int(minutes_raw)
        total_minutes = hours * 60 + minutes
        if sign == "-":
            total_minutes *= -1
        if -12 * 60 <= total_minutes <= 14 * 60 and minutes in {0, 30}:
            return timezone_name
        raise HTTPException(status_code=400, detail="Timezone offset must be in 30-minute steps between UTC-12:00 and UTC+14:00.")
    try:
        ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        raise HTTPException(status_code=400, detail="Timezone must be UTC, a UTC+/-HH:MM offset, or a valid IANA timezone.")
    return timezone_name


def _safe_timezone(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return _validate_timezone(value)
    except HTTPException:
        return None


def _is_public_ip(value: str) -> bool:
    try:
        parsed = ipaddress.ip_address(value)
    except ValueError:
        return False
    return not (
        parsed.is_private
        or parsed.is_loopback
        or parsed.is_link_local
        or parsed.is_reserved
        or parsed.is_multicast
        or parsed.is_unspecified
    )


async def _timezone_from_ip(client_ip: str) -> str | None:
    if not settings.IP_TIMEZONE_LOOKUP_ENABLED or not _is_public_ip(client_ip):
        return None
    try:
        async with httpx.AsyncClient(timeout=settings.IP_TIMEZONE_LOOKUP_TIMEOUT_SECONDS) as client:
            response = await client.get(f"https://ipapi.co/{client_ip}/timezone/")
        if response.status_code >= 400:
            logger.warning("IP timezone lookup failed for %s: HTTP %s", client_ip, response.status_code)
            return None
        return _safe_timezone(response.text.strip())
    except Exception as exc:
        logger.warning("IP timezone lookup failed for %s: %s", client_ip, exc)
        return None


async def _resolve_account_timezone(request: Request, timezone_hint: str | None = None) -> tuple[str, str]:
    client_ip = _get_client_ip(request)
    timezone_name = await _timezone_from_ip(client_ip)
    return client_ip, timezone_name or _safe_timezone(timezone_hint) or "UTC"


def _scheduled_scan_to_response(schedule: ScheduledScan) -> ScheduledScanResponse:
    return ScheduledScanResponse(
        id=str(schedule.id),
        url=schedule.url,
        cron=schedule.cron,
        timezone=schedule.timezone,
        is_active=schedule.is_active,
        last_run_at=schedule.last_run_at.isoformat() if schedule.last_run_at else None,
        last_scan_id=schedule.last_scan_id,
        created_at=schedule.created_at.isoformat(),
        updated_at=schedule.updated_at.isoformat(),
    )


def _internal_schedule_to_response(schedule: ScheduledScan) -> InternalScheduleResponse:
    data = _scheduled_scan_to_response(schedule).model_dump()
    return InternalScheduleResponse(**data, user_id=str(schedule.user_id))


def _email_notification_to_response(notification: EmailNotification) -> InternalEmailNotificationResponse:
    return InternalEmailNotificationResponse(
        id=str(notification.id),
        scan_id=str(notification.scan_id),
        url=notification.scan.url if notification.scan else "",
        recipient_email=notification.recipient_email,
        subject=notification.subject,
        status=notification.status.value,
        attempts=notification.attempts,
        created_at=notification.created_at.isoformat(),
    )


def _account_otp_hash(otp: str) -> str:
    return hashlib.sha256(f"{settings.SECRET_KEY}:{otp}".encode("utf-8")).hexdigest()


def _account_email_sender() -> tuple[str, str]:
    raw = settings.SMTP_FROM.strip() or "ScanAI Security <security@scanai.local>"
    if "<" in raw and raw.endswith(">"):
        name, address = raw.rsplit("<", 1)
        return name.strip().strip('"') or "ScanAI Security", address[:-1].strip()
    return "ScanAI Security", raw


def _send_account_email(recipient: str, subject: str, title: str, lines: list[str]) -> bool:
    if not settings.SMTP_HOST:
        logger.warning("Account email skipped because SMTP_HOST is not configured: recipient=%s subject=%s", recipient, subject)
        return False

    sender_name, sender_email = _account_email_sender()
    text_body = "\n\n".join([title, *lines, "ScanAI Security"])
    html_lines = "".join(f"<p style='margin:0 0 14px;color:#30302d;line-height:1.6'>{line}</p>" for line in lines)
    html_body = f"""
    <div style="font-family:Inter,Arial,sans-serif;background:#f5f3ee;padding:28px">
      <div style="max-width:560px;margin:0 auto;background:#fffefa;border:1px solid #ded9cd;border-radius:8px;padding:28px">
        <p style="margin:0 0 10px;color:#176b78;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">ScanAI Security</p>
        <h1 style="margin:0 0 18px;color:#111110;font-size:24px;line-height:1.2">{title}</h1>
        {html_lines}
        <p style="margin:24px 0 0;color:#74716b;font-size:12px;line-height:1.5">If this was not you, sign in and change your password immediately or contact support.</p>
      </div>
    </div>
    """

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"{sender_name} <{sender_email}>"
    message["To"] = recipient
    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")

    try:
        if settings.SMTP_SECURE:
            with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as smtp:
                if settings.SMTP_USER:
                    smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                smtp.send_message(message)
        else:
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as smtp:
                smtp.ehlo()
                if settings.SMTP_USER:
                    smtp.starttls()
                    smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                smtp.send_message(message)
        return True
    except Exception as exc:
        logger.warning("Account email failed: recipient=%s subject=%s error=%s", recipient, subject, exc)
        return False


def _create_account_otp(
    db: Session,
    *,
    email: str,
    purpose: AccountVerificationPurpose,
    user_id: Any | None = None,
) -> str:
    normalized_email = email.lower().strip()
    now = datetime.now(timezone.utc)
    db.query(AccountVerification).filter(
        AccountVerification.email == normalized_email,
        AccountVerification.purpose == purpose,
        AccountVerification.consumed_at.is_(None),
    ).update({AccountVerification.consumed_at: now}, synchronize_session=False)

    otp = f"{secrets.randbelow(1_000_000):06d}"
    verification = AccountVerification(
        user_id=user_id,
        email=normalized_email,
        purpose=purpose,
        otp_hash=_account_otp_hash(otp),
        expires_at=now + timedelta(minutes=settings.ACCOUNT_OTP_TTL_MINUTES),
    )
    db.add(verification)
    db.commit()
    return otp


def _consume_account_otp(
    db: Session,
    *,
    email: str,
    purpose: AccountVerificationPurpose,
    otp: str,
    user_id: Any | None = None,
) -> None:
    normalized_email = email.lower().strip()
    now = datetime.now(timezone.utc)
    query = db.query(AccountVerification).filter(
        AccountVerification.email == normalized_email,
        AccountVerification.purpose == purpose,
        AccountVerification.consumed_at.is_(None),
        AccountVerification.expires_at > now,
    )
    if user_id is not None:
        query = query.filter(AccountVerification.user_id == user_id)
    verification = query.order_by(AccountVerification.created_at.desc()).first()
    if not verification:
        raise HTTPException(status_code=400, detail="Verification code is missing or expired.")

    if verification.attempts >= settings.ACCOUNT_OTP_MAX_ATTEMPTS:
        verification.consumed_at = now
        db.commit()
        raise HTTPException(status_code=429, detail="Too many verification attempts. Request a new code.")

    if verification.otp_hash != _account_otp_hash(otp.strip()):
        verification.attempts += 1
        db.commit()
        raise HTTPException(status_code=400, detail="Verification code is invalid.")

    verification.consumed_at = now
    db.commit()


def _base64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _google_oauth_configured() -> bool:
    return bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET)


def _google_redirect_uri(request: Request) -> str:
    if settings.GOOGLE_OAUTH_REDIRECT_URI:
        return settings.GOOGLE_OAUTH_REDIRECT_URI

    forwarded_host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").split(",")[0].strip()
    forwarded_proto = (request.headers.get("x-forwarded-proto") or request.url.scheme).split(",")[0].strip()
    if not forwarded_host:
        forwarded_host = request.url.netloc
    return f"{forwarded_proto}://{forwarded_host}/api/auth/google/callback"


def _safe_next_path(value: str | None) -> str:
    if not value:
        return "/dashboard"
    if not value.startswith("/") or value.startswith("//"):
        return "/dashboard"
    return value


def _set_google_oauth_cookie(response: Response, key: str, value: str) -> None:
    response.set_cookie(
        key=key,
        value=value,
        max_age=GOOGLE_OAUTH_COOKIE_MAX_AGE,
        httponly=True,
        secure=(settings.ENVIRONMENT == "production"),
        samesite="lax",
        path="/",
    )


def _clear_google_oauth_cookies(response: Response) -> None:
    for key in (GOOGLE_OAUTH_STATE_COOKIE, GOOGLE_OAUTH_VERIFIER_COOKIE, GOOGLE_OAUTH_NEXT_COOKIE):
        response.delete_cookie(key=key, path="/", httponly=True, samesite="lax")


def _auth_cookie_domain() -> str | None:
    return settings.AUTH_COOKIE_DOMAIN.strip() or None


def _auth_error_redirect(message: str) -> RedirectResponse:
    response = RedirectResponse(url=f"/login?{urlencode({'error': message})}", status_code=303)
    _clear_google_oauth_cookies(response)
    return response


async def _exchange_google_code(code: str, code_verifier: str, redirect_uri: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": redirect_uri,
                "code_verifier": code_verifier,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

    if response.status_code >= 400:
        logger.warning("Google token exchange failed: %s", response.text[:500])
        raise HTTPException(status_code=401, detail="Google sign-in could not be completed.")
    return response.json()


def _verify_google_id_token(id_token_value: str) -> dict[str, Any]:
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    try:
        payload = id_token.verify_oauth2_token(
            id_token_value,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID,
            clock_skew_in_seconds=30,
        )
    except ValueError as exc:
        logger.warning("Google ID token verification failed: %s", exc)
        raise HTTPException(status_code=401, detail="Google sign-in token is invalid.")

    if payload.get("iss") not in {"accounts.google.com", "https://accounts.google.com"}:
        raise HTTPException(status_code=401, detail="Google sign-in token issuer is invalid.")
    if not payload.get("email_verified"):
        raise HTTPException(status_code=403, detail="Your Google account email is not verified.")
    if settings.GOOGLE_ALLOWED_DOMAIN and payload.get("hd") != settings.GOOGLE_ALLOWED_DOMAIN:
        raise HTTPException(status_code=403, detail="This Google account is not allowed for this workspace.")
    return payload


def _upsert_google_user(db: Session, payload: dict[str, Any], *, signup_ip: str, timezone_name: str) -> User:
    google_sub = str(payload.get("sub") or "")
    email = str(payload.get("email") or "").lower().strip()
    raw_name = str(payload.get("name") or "").strip()
    name = (raw_name or email.split("@")[0] or "Google user")[:100]
    avatar_url = str(payload.get("picture") or "")[:2048] or None

    if not google_sub or not email:
        raise HTTPException(status_code=401, detail="Google account did not provide a usable identity.")

    user = db.query(User).filter(User.google_sub == google_sub).first()
    if not user:
        user = db.query(User).filter(User.email == email).first()
        if user and user.google_sub and user.google_sub != google_sub:
            raise HTTPException(status_code=409, detail="This email is already linked to another Google account.")

    linked_google_now = False
    if user:
        linked_google_now = not bool(user.google_sub)
        user.google_sub = user.google_sub or google_sub
        user.name = user.name or name
        user.avatar_url = avatar_url or user.avatar_url
        user.signup_ip = user.signup_ip or signup_ip[:45]
        user.timezone = user.timezone or timezone_name
        user.email_verified = True
        user.email_verified_at = user.email_verified_at or datetime.now(timezone.utc)
        if user.auth_provider == "password":
            user.auth_provider = "password_google"
    else:
        user_count = db.query(func.count(User.id)).scalar()
        role = UserRole.ADMIN if user_count == 0 else UserRole.USER
        user = User(
            email=email,
            name=name,
            hashed_password=hash_password(secrets.token_urlsafe(32)),
            role=role,
            plan=UserPlan.INTERNAL if role == UserRole.ADMIN else UserPlan.BETA,
            monthly_scan_limit=10_000 if role == UserRole.ADMIN else settings.BETA_MONTHLY_SCAN_LIMIT,
            active_scan_limit=50 if role == UserRole.ADMIN else settings.BETA_ACTIVE_SCAN_LIMIT,
            schedule_limit=500 if role == UserRole.ADMIN else settings.BETA_SCHEDULE_LIMIT,
            google_sub=google_sub,
            avatar_url=avatar_url,
            auth_provider="google",
            signup_ip=signup_ip[:45],
            timezone=timezone_name,
            email_verified=True,
            email_verified_at=datetime.now(timezone.utc),
        )
        db.add(user)

    db.commit()
    db.refresh(user)
    if linked_google_now:
        _send_account_email(
            user.email,
            "Google sign-in connected to your ScanAI account",
            "Google sign-in connected",
            [
                "A verified Google account with this email was connected to your existing ScanAI account.",
                "You can now sign in with either Google or your existing password.",
            ],
        )
    return user


def _require_scheduler_token(request: Request) -> None:
    token = request.headers.get("x-scanai-scheduler-token")
    if not token or token != settings.SCHEDULER_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid scheduler token.")


def _dispatch_scan_to_celery(scan: Scan) -> None:
    """Submit a scan record to the Python execution worker."""
    from tasks import run_scan

    run_scan.apply_async(args=[str(scan.id), scan.url], task_id=str(scan.id))


def _enqueue_scan(
    db: Session,
    *,
    url: str,
    user_id: Any,
    client_ip: str,
    program_id: Any | None = None,
    auth_profile_id: Any | None = None,
) -> Scan:
    scan = Scan(
        url=url,
        status=ScanStatus.PENDING,
        progress_step=0,
        client_ip=client_ip,
        user_id=user_id,
        program_id=program_id,
        auth_profile_id=auth_profile_id,
    )
    db.add(scan)
    db.commit()
    db.refresh(scan)
    publish_scan_event(scan, "scan.created")

    if settings.SCAN_QUEUE_BACKEND.lower() == "celery":
        _dispatch_scan_to_celery(scan)
        scan.status = ScanStatus.RUNNING
        scan.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(scan)
        publish_scan_event(scan, "scan.updated")
    else:
        logger.info("Scan %s waiting for BullMQ dispatch queue", scan.id)
    return scan


def _set_auth_cookie(response: Response, token: str) -> None:
    """Set the JWT token as an httpOnly cookie."""
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=(settings.ENVIRONMENT == "production"),
        domain=_auth_cookie_domain(),
        path="/",
    )


def _user_to_response(user: User) -> UserResponse:
    """Convert a User model to a response dict."""
    return UserResponse(
        id=str(user.id),
        email=user.email,
        name=user.name,
        role=user.role.value,
        plan=(user.plan.value if isinstance(user.plan, UserPlan) else str(user.plan).lower()),
        monthly_scan_limit=user.monthly_scan_limit,
        active_scan_limit=user.active_scan_limit,
        schedule_limit=user.schedule_limit,
        auth_provider=user.auth_provider,
        email_verified=user.email_verified,
        timezone=user.timezone or "UTC",
        is_active=user.is_active,
        created_at=user.created_at.isoformat(),
    )


def _get_scan_or_404(db: Session, scan_id: str) -> Scan:
    """Load a scan by UUID or raise a consistent HTTP error."""
    try:
        scan_uuid = UUID(scan_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid scan ID format.")

    scan = db.query(Scan).filter(Scan.id == scan_uuid).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found.")
    return scan


def _enforce_scan_access(scan: Scan, current_user: User) -> None:
    """Ensure the current user can access the given scan."""
    if current_user.role != UserRole.ADMIN and scan.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Scan not found.")


def _generate_pdf_for_scan(scan: Scan, db: Session, *, route_prefix: str) -> dict[str, str]:
    """Generate and store a PDF for a completed scan, returning app-relative URLs."""
    if scan.status != ScanStatus.COMPLETE:
        raise HTTPException(
            status_code=400,
            detail="PDF can only be generated for completed scans."
        )

    if not scan.report:
        raise HTTPException(
            status_code=400,
            detail="No report data available for PDF generation."
        )

    from pdf_storage import generate_and_store_pdf

    stored_pdf_ref = generate_and_store_pdf(
        scan_id=str(scan.id),
        url=scan.url,
        report_data=scan.report,
    )

    if not stored_pdf_ref:
        raise HTTPException(
            status_code=500,
            detail="Failed to generate or upload PDF. Check MinIO configuration."
        )

    scan.pdf_url = stored_pdf_ref
    db.commit()

    view_url = f"{route_prefix}/{scan.id}/pdf"
    download_url = f"{view_url}?download=1"
    return {
        "pdf_url": view_url,
        "view_url": view_url,
        "download_url": download_url,
        "message": "PDF generated and stored successfully.",
    }


def _scan_pdf_filename(scan: Scan) -> str:
    """Return a browser-friendly PDF filename for the scan."""
    parsed = urlparse(scan.url)
    raw_target = parsed.netloc or parsed.path or str(scan.id)[:8]
    target = re.sub(r"[^a-zA-Z0-9.-]+", "-", raw_target).strip("-").lower()
    if not target:
        target = str(scan.id)[:8]
    return f"scanai-security-report-{target}.pdf"


def _stream_scan_pdf(scan: Scan, *, download: bool) -> Response:
    """Stream a stored PDF through the app."""
    if not scan.pdf_url:
        raise HTTPException(status_code=404, detail="No generated PDF is available for this scan yet.")

    from pdf_storage import fetch_pdf_from_minio

    pdf_bytes = fetch_pdf_from_minio(str(scan.id))
    if not pdf_bytes:
        raise HTTPException(status_code=404, detail="Stored PDF could not be retrieved.")

    filename = _scan_pdf_filename(scan)
    disposition = "attachment" if download else "inline"
    headers = {
        "Content-Disposition": f'{disposition}; filename="{filename}"',
        "Cache-Control": "private, max-age=300",
    }

    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)


# ── Health ─────────────────────────────────────────────────────────

@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    checks: dict[str, str] = {}
    status = "healthy"
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as e:
        logger.warning(f"Health database check failed: {e}")
        checks["database"] = "failed"
        status = "degraded"

    try:
        redis_client.ping()
        checks["redis"] = "ok"
    except Exception as e:
        logger.warning(f"Health redis check failed: {e}")
        checks["redis"] = "failed"
        status = "degraded"

    checks["paid_beta_mode"] = "on" if settings.PAID_BETA_MODE else "off"
    checks["target_verification"] = "required" if settings.REQUIRE_TARGET_VERIFICATION else "optional"
    return HealthResponse(status=status, version="1.0.0", checks=checks)


@app.get("/health", response_model=HealthResponse)
async def root_health_check():
    """Compatibility health check for Docker dev jobs."""
    return await health_check()


# ── Auth Endpoints ─────────────────────────────────────────────────

@app.post("/api/auth/signup/otp", response_model=MessageResponse)
async def request_signup_otp(
    body: SignupOtpRequest,
    db: Session = Depends(get_db),
):
    """Send an email OTP before creating a password account."""
    email = body.email.lower().strip()
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
    if len(body.name.strip()) < 1:
        raise HTTPException(status_code=400, detail="Name is required.")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    otp = _create_account_otp(db, email=email, purpose=AccountVerificationPurpose.SIGNUP)
    sent = _send_account_email(
        email,
        "Verify your ScanAI account",
        "Verify your ScanAI account",
        [
            f"Your verification code is {otp}.",
            f"This code expires in {settings.ACCOUNT_OTP_TTL_MINUTES} minutes.",
            "Enter it on the signup page to finish creating your workspace.",
        ],
    )
    if not sent and settings.ENVIRONMENT == "production":
        raise HTTPException(status_code=503, detail="Verification email could not be sent. Please try again.")
    return MessageResponse(message="Verification code sent to your email.")


@app.post("/api/auth/signup", response_model=AuthResponse)
async def signup(
    body: SignupRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """
    Register a new user.
    The first user to sign up automatically becomes admin.
    """
    # Validate password
    if len(body.password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 8 characters.",
        )

    if len(body.name.strip()) < 1:
        raise HTTPException(
            status_code=400,
            detail="Name is required.",
        )

    # Check if email already exists
    existing = db.query(User).filter(User.email == body.email.lower()).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists.",
        )

    _consume_account_otp(
        db,
        email=body.email.lower(),
        purpose=AccountVerificationPurpose.SIGNUP,
        otp=body.otp,
    )
    signup_ip, account_timezone = await _resolve_account_timezone(request, body.timezone)

    # Determine role — first user becomes admin
    user_count = db.query(func.count(User.id)).scalar()
    role = UserRole.ADMIN if user_count == 0 else UserRole.USER

    # Create user
    user = User(
        email=body.email.lower(),
        name=body.name.strip(),
        hashed_password=hash_password(body.password),
        role=role,
        plan=UserPlan.INTERNAL if role == UserRole.ADMIN else UserPlan.BETA,
        monthly_scan_limit=10_000 if role == UserRole.ADMIN else settings.BETA_MONTHLY_SCAN_LIMIT,
        active_scan_limit=50 if role == UserRole.ADMIN else settings.BETA_ACTIVE_SCAN_LIMIT,
        schedule_limit=500 if role == UserRole.ADMIN else settings.BETA_SCHEDULE_LIMIT,
        signup_ip=signup_ip[:45],
        timezone=account_timezone,
        email_verified=True,
        email_verified_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Create token and set cookie
    token = create_access_token(str(user.id), user.role.value)
    _set_auth_cookie(response, token)

    logger.info(f"User signed up: email={user.email}, role={role.value}")
    _send_account_email(
        user.email,
        "Welcome to ScanAI",
        "Your ScanAI account is ready",
        [
            f"Hi {user.name}, your ScanAI account has been created successfully.",
            "Security notifications for profile, email, and password changes will be sent to this address.",
        ],
    )

    return AuthResponse(
        user=_user_to_response(user),
        message="Account created successfully."
            + (" You are the admin." if role == UserRole.ADMIN else ""),
    )


@app.post("/api/auth/login", response_model=AuthResponse)
async def login(
    body: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    """Authenticate a user and set a session cookie."""
    user = db.query(User).filter(User.email == body.email.lower()).first()

    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=403,
            detail="Account has been deactivated. Contact admin.",
        )

    # Create token and set cookie
    token = create_access_token(str(user.id), user.role.value)
    _set_auth_cookie(response, token)

    logger.info(f"User logged in: email={user.email}")

    return AuthResponse(
        user=_user_to_response(user),
        message="Logged in successfully.",
    )


@app.get("/api/auth/google/start")
async def google_auth_start(request: Request):
    """Start Google OAuth sign-in using Authorization Code + PKCE."""
    if not _google_oauth_configured():
        return _auth_error_redirect("Google sign-in is not configured yet.")

    state = secrets.token_urlsafe(32)
    code_verifier = secrets.token_urlsafe(64)
    code_challenge = _base64url(hashlib.sha256(code_verifier.encode("ascii")).digest())
    next_path = _safe_next_path(request.query_params.get("next"))
    redirect_uri = _google_redirect_uri(request)

    auth_params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "include_granted_scopes": "true",
    }
    response = RedirectResponse(url=f"{GOOGLE_AUTH_URL}?{urlencode(auth_params)}", status_code=302)
    _set_google_oauth_cookie(response, GOOGLE_OAUTH_STATE_COOKIE, state)
    _set_google_oauth_cookie(response, GOOGLE_OAUTH_VERIFIER_COOKIE, code_verifier)
    _set_google_oauth_cookie(response, GOOGLE_OAUTH_NEXT_COOKIE, next_path)
    return response


@app.get("/api/auth/google/callback")
async def google_auth_callback(
    request: Request,
    db: Session = Depends(get_db),
):
    """Complete Google OAuth sign-in and create the normal ScanAI session."""
    if request.query_params.get("error"):
        return _auth_error_redirect("Google sign-in was cancelled.")

    code = request.query_params.get("code")
    state = request.query_params.get("state")
    expected_state = request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)
    code_verifier = request.cookies.get(GOOGLE_OAUTH_VERIFIER_COOKIE)
    next_path = _safe_next_path(request.cookies.get(GOOGLE_OAUTH_NEXT_COOKIE))

    if not code or not state or not expected_state or state != expected_state or not code_verifier:
        return _auth_error_redirect("Google sign-in session expired. Please try again.")

    try:
        token_response = await _exchange_google_code(code, code_verifier, _google_redirect_uri(request))
        google_id_token = token_response.get("id_token")
        if not google_id_token:
            raise HTTPException(status_code=401, detail="Google did not return an identity token.")
        payload = _verify_google_id_token(google_id_token)
        signup_ip, account_timezone = await _resolve_account_timezone(request)
        user = _upsert_google_user(db, payload, signup_ip=signup_ip, timezone_name=account_timezone)
        if not user.is_active:
            raise HTTPException(status_code=403, detail="Account has been deactivated. Contact admin.")
    except HTTPException as exc:
        detail = str(exc.detail) if exc.detail else "Google sign-in failed."
        return _auth_error_redirect(detail)

    response = RedirectResponse(url=next_path, status_code=303)
    token = create_access_token(str(user.id), user.role.value)
    _set_auth_cookie(response, token)
    _clear_google_oauth_cookies(response)
    logger.info(f"User logged in with Google: email={user.email}")
    return response


@app.post("/api/auth/logout")
async def logout(response: Response):
    """Clear the session cookie."""
    response.delete_cookie(
        key=COOKIE_NAME,
        path="/",
        domain=_auth_cookie_domain(),
        httponly=True,
        samesite="lax",
    )
    return {"message": "Logged out successfully."}


@app.get("/api/auth/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user."""
    return _user_to_response(current_user)


# ── Account / Target Authorization ────────────────────────────────

@app.patch("/api/account/profile", response_model=UserResponse)
async def update_account_profile(
    body: AccountProfileUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update the signed-in user's display name and notify them."""
    new_name = body.name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Name is required.")
    if current_user.name == new_name:
        return _user_to_response(current_user)

    previous_name = current_user.name
    current_user.name = new_name
    db.commit()
    db.refresh(current_user)

    _send_account_email(
        current_user.email,
        "Your ScanAI profile name changed",
        "Profile name changed",
        [
            f"Your ScanAI profile name was changed from {previous_name} to {current_user.name}.",
            "No further action is required if you made this change.",
        ],
    )
    return _user_to_response(current_user)


@app.patch("/api/account/timezone", response_model=UserResponse)
async def update_account_timezone(
    body: AccountTimezoneUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update the account timezone used by recurring scan schedules."""
    new_timezone = _validate_timezone(body.timezone)
    previous_timezone = current_user.timezone or "UTC"
    if previous_timezone == new_timezone:
        return _user_to_response(current_user)

    now = datetime.now(timezone.utc)
    current_user.timezone = new_timezone
    db.query(ScheduledScan).filter(ScheduledScan.user_id == current_user.id).update(
        {
            ScheduledScan.timezone: new_timezone,
            ScheduledScan.updated_at: now,
        },
        synchronize_session=False,
    )
    db.commit()
    db.refresh(current_user)

    _send_account_email(
        current_user.email,
        "Your ScanAI schedule timezone changed",
        "Schedule timezone changed",
        [
            f"Your recurring scan timezone was changed from {previous_timezone} to {new_timezone}.",
            "Existing scheduled checkups were updated to use this timezone.",
        ],
    )
    return _user_to_response(current_user)


@app.post("/api/account/email-change/start", response_model=MessageResponse)
async def start_email_change(
    body: EmailChangeStartRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send an OTP to a new email address before updating account email."""
    new_email = body.new_email.lower().strip()
    if new_email == current_user.email.lower():
        raise HTTPException(status_code=400, detail="Enter a different email address.")
    if db.query(User).filter(User.email == new_email).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    if current_user.auth_provider in {"password", "password_google"} and not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=401, detail="Current password is incorrect.")

    otp = _create_account_otp(
        db,
        email=new_email,
        purpose=AccountVerificationPurpose.EMAIL_CHANGE,
        user_id=current_user.id,
    )
    sent = _send_account_email(
        new_email,
        "Verify your new ScanAI email",
        "Verify your new email",
        [
            f"Your verification code is {otp}.",
            f"This code expires in {settings.ACCOUNT_OTP_TTL_MINUTES} minutes.",
            "Enter it in ScanAI settings to move your account to this email address.",
        ],
    )
    if not sent and settings.ENVIRONMENT == "production":
        raise HTTPException(status_code=503, detail="Verification email could not be sent. Please try again.")

    _send_account_email(
        current_user.email,
        "ScanAI email change requested",
        "Email change requested",
        [
            f"A request was made to change your ScanAI account email to {new_email}.",
            "Your current email will stay active until the new address is verified.",
        ],
    )
    return MessageResponse(message="Verification code sent to your new email.")


@app.post("/api/account/email-change/confirm", response_model=UserResponse)
async def confirm_email_change(
    body: EmailChangeConfirmRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Verify an email-change OTP and update the account email."""
    new_email = body.new_email.lower().strip()
    if db.query(User).filter(User.email == new_email, User.id != current_user.id).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    old_email = current_user.email
    _consume_account_otp(
        db,
        email=new_email,
        purpose=AccountVerificationPurpose.EMAIL_CHANGE,
        otp=body.otp,
        user_id=current_user.id,
    )

    current_user.email = new_email
    current_user.email_verified = True
    current_user.email_verified_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(current_user)

    _send_account_email(
        old_email,
        "Your ScanAI email changed",
        "Account email changed",
        [
            f"Your ScanAI account email was changed from {old_email} to {new_email}.",
            "Future account and scan notifications will go to the new address.",
        ],
    )
    _send_account_email(
        new_email,
        "Your ScanAI email is verified",
        "New email verified",
        [
            "This address is now verified for your ScanAI account.",
            "You can use it for sign-in and account-security notifications.",
        ],
    )
    return _user_to_response(current_user)


@app.post("/api/account/password", response_model=MessageResponse)
async def change_account_password(
    body: PasswordChangeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Change or set a password and notify the account email."""
    has_password = current_user.auth_provider in {"password", "password_google"}
    if has_password and not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=401, detail="Current password is incorrect.")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters.")

    current_user.hashed_password = hash_password(body.new_password)
    if current_user.auth_provider == "google":
        current_user.auth_provider = "password_google"
    db.commit()

    _send_account_email(
        current_user.email,
        "Your ScanAI password changed",
        "Password changed",
        [
            "Your ScanAI account password was changed successfully.",
            "No further action is required if you made this change.",
        ],
    )
    return MessageResponse(message="Password updated successfully.")

@app.get("/api/account/usage", response_model=AccountUsageResponse)
async def get_account_usage(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the current user's beta plan usage and limits."""
    return _account_usage(db, current_user)


@app.get("/api/targets", response_model=List[ScanTargetResponse])
async def list_scan_targets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List domains the current user has added for scan authorization."""
    targets = (
        db.query(ScanTarget)
        .filter(ScanTarget.user_id == current_user.id)
        .order_by(ScanTarget.created_at.desc())
        .all()
    )
    return [_scan_target_to_response(target) for target in targets]


@app.post("/api/targets", response_model=ScanTargetResponse)
async def create_scan_target(
    body: ScanTargetCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create or return a domain authorization record with its DNS TXT token."""
    domain = _normalize_target_domain(body.target)
    existing = (
        db.query(ScanTarget)
        .filter(ScanTarget.user_id == current_user.id, ScanTarget.domain == domain)
        .first()
    )
    if existing:
        return _scan_target_to_response(existing)

    target = ScanTarget(
        user_id=current_user.id,
        domain=domain,
        verification_token=secrets.token_urlsafe(24),
        status=ScanTargetStatus.PENDING,
    )
    db.add(target)
    db.commit()
    db.refresh(target)
    logger.info(f"Scan target created: user={current_user.email} domain={domain}")
    return _scan_target_to_response(target)


@app.post("/api/targets/{target_id}/verify", response_model=ScanTargetVerifyResponse)
async def verify_scan_target(
    target_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Verify domain ownership by checking the required DNS TXT record."""
    try:
        target_uuid = UUID(target_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid target ID format.")

    target = (
        db.query(ScanTarget)
        .filter(ScanTarget.id == target_uuid, ScanTarget.user_id == current_user.id)
        .first()
    )
    if not target:
        raise HTTPException(status_code=404, detail="Target not found.")
    if target.status == ScanTargetStatus.REVOKED:
        raise HTTPException(status_code=409, detail="Target has been revoked.")

    expected = _verification_record_value(target.verification_token)
    records = _dig_txt_records(_verification_record_name(target.domain))
    if expected not in records:
        raise HTTPException(
            status_code=409,
            detail=f"DNS TXT record not found yet. Expected {_verification_record_name(target.domain)} TXT {expected}",
        )

    target.status = ScanTargetStatus.VERIFIED
    target.verified_at = datetime.now(timezone.utc)
    target.updated_at = datetime.now(timezone.utc)
    db.commit()
    logger.info(f"Scan target verified: user={current_user.email} domain={target.domain}")
    return ScanTargetVerifyResponse(
        id=str(target.id),
        domain=target.domain,
        status=target.status.value,
        message="Target ownership verified.",
    )


# ── Bug Bounty Programs / Triage ──────────────────────────────────

def _get_program_or_404(db: Session, program_id: str, current_user: User) -> Program:
    try:
        program_uuid = UUID(program_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid program ID format.")

    query = db.query(Program).filter(Program.id == program_uuid)
    if current_user.role != UserRole.ADMIN:
        query = query.filter(Program.user_id == current_user.id)
    program = query.first()
    if not program:
        raise HTTPException(status_code=404, detail="Program not found.")
    return program


def _get_auth_profile_or_404(db: Session, auth_profile_id: str, current_user: User) -> AuthProfile:
    try:
        auth_profile_uuid = UUID(auth_profile_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid auth profile ID format.")

    query = db.query(AuthProfile).filter(AuthProfile.id == auth_profile_uuid)
    if current_user.role != UserRole.ADMIN:
        query = query.filter(AuthProfile.user_id == current_user.id)
    profile = query.first()
    if not profile:
        raise HTTPException(status_code=404, detail="Auth profile not found.")
    return profile


def _scope_rule_matches_url(rule: ScopeRule, url: str) -> bool:
    """Return whether a program scope rule applies to a validated URL."""
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower().rstrip(".")
    path = parsed.path or "/"
    full_url = url.lower()
    pattern = (rule.pattern or "").strip().lower().rstrip(".")
    if not host or not pattern:
        return False

    if rule.asset_type == ScopeAssetType.DOMAIN:
        normalized = pattern.removeprefix("https://").removeprefix("http://").split("/", 1)[0]
        return host == normalized or host.endswith(f".{normalized}")
    if rule.asset_type == ScopeAssetType.WILDCARD:
        normalized = pattern.removeprefix("https://").removeprefix("http://").split("/", 1)[0]
        return fnmatch.fnmatch(host, normalized)
    if rule.asset_type == ScopeAssetType.URL:
        return fnmatch.fnmatch(full_url, pattern)
    if rule.asset_type == ScopeAssetType.PATH:
        return fnmatch.fnmatch(path, pattern if pattern.startswith("/") else f"/{pattern}")
    if rule.asset_type == ScopeAssetType.IP:
        return host == pattern
    if rule.asset_type == ScopeAssetType.CIDR:
        try:
            return ipaddress.ip_address(host) in ipaddress.ip_network(pattern, strict=False)
        except ValueError:
            return False
    return False


def _active_program_scope_rules(db: Session, program: Program) -> list[ScopeRule]:
    return (
        db.query(ScopeRule)
        .filter(ScopeRule.program_id == program.id, ScopeRule.is_active == True)
        .all()
    )


def _flatten_scope_tests(rules: list[ScopeRule], field: str) -> list[str]:
    tests: list[str] = []
    for rule in rules:
        values = getattr(rule, field, None)
        if not isinstance(values, list):
            continue
        for value in values:
            text = str(value).strip()
            if text and text not in tests:
                tests.append(text)
    return tests


def _preview_program_scope(db: Session, program: Program, url: str) -> ScopePreviewResponse:
    rules = _active_program_scope_rules(db, program)
    in_scope_rules = [rule for rule in rules if rule.rule_type == ScopeRuleType.IN_SCOPE]
    out_of_scope_rules = [rule for rule in rules if rule.rule_type == ScopeRuleType.OUT_OF_SCOPE]
    matched_in_scope = [rule for rule in in_scope_rules if _scope_rule_matches_url(rule, url)]
    matched_out_of_scope = [rule for rule in out_of_scope_rules if _scope_rule_matches_url(rule, url)]

    if not in_scope_rules:
        status = "blocked_no_scope"
        message = "Add at least one active in-scope rule before running a program-gated scan."
    elif matched_out_of_scope:
        status = "blocked_out_of_scope"
        message = "This target matches an out-of-scope rule."
    elif not matched_in_scope:
        status = "blocked_not_in_scope"
        message = "This target does not match any active in-scope rule."
    else:
        status = "allowed"
        message = "This target is allowed by the selected program scope."

    return ScopePreviewResponse(
        url=url,
        program_id=str(program.id),
        status=status,
        allowed=status == "allowed",
        message=message,
        matched_in_scope_rules=[_scope_rule_to_response(rule) for rule in matched_in_scope],
        matched_out_of_scope_rules=[_scope_rule_to_response(rule) for rule in matched_out_of_scope],
        allowed_tests=_flatten_scope_tests(matched_in_scope, "allowed_tests"),
        forbidden_tests=[
            *_flatten_scope_tests(matched_in_scope, "forbidden_tests"),
            *_flatten_scope_tests(matched_out_of_scope, "forbidden_tests"),
        ],
    )


def _enforce_program_scope(db: Session, program: Program, url: str) -> None:
    """Block bug-bounty scans that fall outside the selected program scope."""
    preview = _preview_program_scope(db, program, url)
    if preview.status == "blocked_no_scope":
        raise HTTPException(
            status_code=400,
            detail=preview.message,
        )
    if not preview.allowed:
        raise HTTPException(status_code=403, detail=preview.message)


def _build_release_gate(db: Session, program: Program) -> ReleaseGateResponse:
    blocking_statuses = {
        FindingStatus.NEW,
        FindingStatus.TRIAGED,
        FindingStatus.ACCEPTED,
        FindingStatus.REGRESSED,
    }
    blockers: list[str] = []
    warnings: list[str] = []
    counts = {
        "critical_blocking": 0,
        "high_blocking": 0,
        "medium_open": 0,
        "failed_scans": 0,
        "active_in_scope_rules": 0,
    }

    active_in_scope_count = (
        db.query(func.count(ScopeRule.id))
        .filter(
            ScopeRule.program_id == program.id,
            ScopeRule.is_active == True,
            ScopeRule.rule_type == ScopeRuleType.IN_SCOPE,
        )
        .scalar()
        or 0
    )
    counts["active_in_scope_rules"] = int(active_in_scope_count)
    if active_in_scope_count == 0:
        blockers.append("No active in-scope rules are configured.")

    findings = (
        db.query(Finding)
        .filter(Finding.program_id == program.id, Finding.status.in_(blocking_statuses))
        .all()
    )
    for finding in findings:
        severity = finding.severity
        label = f"{severity.value}: {finding.title}"
        if severity == FindingSeverity.CRITICAL:
            counts["critical_blocking"] += 1
            blockers.append(label)
        elif severity == FindingSeverity.HIGH:
            counts["high_blocking"] += 1
            blockers.append(label)
        elif severity == FindingSeverity.MEDIUM:
            counts["medium_open"] += 1
            warnings.append(label)

    failed_scan_count = (
        db.query(func.count(Scan.id))
        .filter(Scan.program_id == program.id, Scan.status == ScanStatus.FAILED)
        .scalar()
        or 0
    )
    counts["failed_scans"] = int(failed_scan_count)
    if failed_scan_count:
        warnings.append(f"{failed_scan_count} program scan(s) failed and may need a rerun.")

    status = "block" if blockers else ("warn" if warnings else "pass")
    return ReleaseGateResponse(
        program_id=str(program.id),
        status=status,
        blockers=blockers[:20],
        warnings=warnings[:20],
        counts=counts,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )


@app.get("/api/programs", response_model=List[ProgramResponse])
async def list_programs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List bug bounty programs owned by the current user."""
    programs = (
        db.query(Program)
        .filter(Program.user_id == current_user.id)
        .order_by(Program.created_at.desc())
        .all()
    )
    return [_program_to_response(program) for program in programs]


@app.post("/api/programs", response_model=ProgramResponse)
async def create_program(
    body: ProgramCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a bug bounty program container for scoped recon and triage."""
    handle = (body.handle or "").strip().lower() or None
    if handle:
        existing = (
            db.query(Program)
            .filter(Program.user_id == current_user.id, Program.handle == handle)
            .first()
        )
        if existing:
            raise HTTPException(status_code=409, detail="A program with this handle already exists.")

    program = Program(
        user_id=current_user.id,
        name=body.name.strip(),
        handle=handle,
        safe_harbor=body.safe_harbor,
        notes=body.notes,
        scan_intensity=body.scan_intensity.strip().lower() or "standard",
        is_active=body.is_active,
    )
    db.add(program)
    db.commit()
    db.refresh(program)
    return _program_to_response(program)


@app.get("/api/programs/{program_id}/auth-profiles", response_model=List[AuthProfileResponse])
async def list_program_auth_profiles(
    program_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List reusable authenticated-scan profiles for a program."""
    program = _get_program_or_404(db, program_id, current_user)
    profiles = (
        db.query(AuthProfile)
        .filter(AuthProfile.program_id == program.id)
        .order_by(AuthProfile.created_at.desc())
        .all()
    )
    return [_auth_profile_to_response(profile) for profile in profiles]


@app.post("/api/programs/{program_id}/auth-profiles", response_model=AuthProfileResponse)
async def create_program_auth_profile(
    program_id: str,
    body: AuthProfileCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create an encrypted authenticated-scanning profile for a program."""
    program = _get_program_or_404(db, program_id, current_user)
    name = body.name.strip()
    existing = (
        db.query(AuthProfile)
        .filter(AuthProfile.program_id == program.id, AuthProfile.name == name)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="An auth profile with this name already exists.")

    try:
        headers = sanitize_auth_headers(body.headers)
    except AuthProfileError as e:
        raise HTTPException(status_code=400, detail=str(e))

    profile = AuthProfile(
        user_id=current_user.id,
        program_id=program.id,
        name=name,
        description=body.description,
        encrypted_headers=encrypt_auth_headers(headers),
        header_names=auth_header_names(headers),
        is_active=body.is_active,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return _auth_profile_to_response(profile)


@app.delete("/api/auth-profiles/{auth_profile_id}", status_code=204)
async def delete_auth_profile(
    auth_profile_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete an auth profile without exposing the stored secret material."""
    profile = _get_auth_profile_or_404(db, auth_profile_id, current_user)
    db.delete(profile)
    db.commit()
    return Response(status_code=204)


@app.get("/api/programs/{program_id}/scope", response_model=List[ScopeRuleResponse])
async def list_program_scope(
    program_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List in-scope and out-of-scope rules for a program."""
    program = _get_program_or_404(db, program_id, current_user)
    rules = (
        db.query(ScopeRule)
        .filter(ScopeRule.program_id == program.id)
        .order_by(ScopeRule.rule_type.asc(), ScopeRule.created_at.desc())
        .all()
    )
    return [_scope_rule_to_response(rule) for rule in rules]


@app.post("/api/programs/{program_id}/scope-preview", response_model=ScopePreviewResponse)
async def preview_program_scope(
    program_id: str,
    body: ScopePreviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Preview whether a URL is allowed by a program's active scope rules."""
    program = _get_program_or_404(db, program_id, current_user)
    try:
        validated_url = validate_url(body.url)
    except URLValidationError as e:
        raise HTTPException(status_code=400, detail=e.message)
    return _preview_program_scope(db, program, validated_url)


@app.get("/api/programs/{program_id}/release-gate", response_model=ReleaseGateResponse)
async def get_program_release_gate(
    program_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return a PASS/WARN/BLOCK release gate decision for a program."""
    program = _get_program_or_404(db, program_id, current_user)
    return _build_release_gate(db, program)


@app.post("/api/programs/{program_id}/scope", response_model=ScopeRuleResponse)
async def create_program_scope_rule(
    program_id: str,
    body: ScopeRuleCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a scope rule to a bug bounty program."""
    program = _get_program_or_404(db, program_id, current_user)
    rule = ScopeRule(
        program_id=program.id,
        rule_type=ScopeRuleType(body.rule_type),
        asset_type=ScopeAssetType(body.asset_type),
        pattern=body.pattern.strip(),
        description=body.description,
        allowed_tests=body.allowed_tests,
        forbidden_tests=body.forbidden_tests,
        is_active=body.is_active,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return _scope_rule_to_response(rule)


@app.get("/api/assets", response_model=List[AssetResponse])
async def list_assets(
    program_id: str | None = Query(default=None),
    asset_type: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List discovered assets from scans and recon."""
    query = db.query(Asset).filter(Asset.user_id == current_user.id)
    if program_id:
        program = _get_program_or_404(db, program_id, current_user)
        query = query.filter(Asset.program_id == program.id)
    if asset_type:
        try:
            query = query.filter(Asset.asset_type == AssetType(asset_type))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid asset_type filter.")
    assets = query.order_by(Asset.last_seen_at.desc()).limit(limit).all()
    return [_asset_to_response(asset) for asset in assets]


@app.get("/api/findings", response_model=List[FindingResponse])
async def list_findings(
    status: str | None = Query(default=None),
    severity: str | None = Query(default=None),
    program_id: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List persistent findings for triage."""
    query = db.query(Finding).filter(Finding.user_id == current_user.id)
    if status:
        try:
            query = query.filter(Finding.status == FindingStatus(status))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid status filter.")
    if severity:
        try:
            query = query.filter(Finding.severity == FindingSeverity(severity))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid severity filter.")
    if program_id:
        program = _get_program_or_404(db, program_id, current_user)
        query = query.filter(Finding.program_id == program.id)
    findings = query.order_by(Finding.last_seen_at.desc()).limit(limit).all()
    return [_finding_to_response(finding) for finding in findings]


@app.get("/api/findings/{finding_id}/evidence", response_model=List[EvidenceResponse])
async def list_finding_evidence(
    finding_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List stored evidence for a finding."""
    try:
        finding_uuid = UUID(finding_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid finding ID format.")
    finding = db.query(Finding).filter(Finding.id == finding_uuid).first()
    if not finding or (current_user.role != UserRole.ADMIN and finding.user_id != current_user.id):
        raise HTTPException(status_code=404, detail="Finding not found.")
    evidence_items = (
        db.query(Evidence)
        .filter(Evidence.finding_id == finding.id)
        .order_by(Evidence.created_at.desc())
        .all()
    )
    return [_evidence_to_response(item) for item in evidence_items]


@app.patch("/api/findings/{finding_id}/status", response_model=FindingResponse)
async def update_finding_status(
    finding_id: str,
    body: FindingStatusUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a persistent finding's triage status."""
    try:
        finding_uuid = UUID(finding_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid finding ID format.")

    finding = db.query(Finding).filter(Finding.id == finding_uuid).first()
    if not finding or (current_user.role != UserRole.ADMIN and finding.user_id != current_user.id):
        raise HTTPException(status_code=404, detail="Finding not found.")

    finding.status = FindingStatus(body.status)
    finding.last_seen_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(finding)
    return _finding_to_response(finding)


# ── Scan Endpoints ─────────────────────────────────────────────────

@app.post("/api/scans", response_model=ScanCreateResponse)
async def create_scan(
    body: ScanRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new security scan.
    Requires authentication. Scan is tied to the logged-in user.
    """
    # Validate URL
    try:
        validated_url = validate_url(body.url)
    except URLValidationError as e:
        raise HTTPException(status_code=400, detail=e.message)

    program = _get_program_or_404(db, body.program_id, current_user)
    _enforce_program_scope(db, program, validated_url)
    auth_profile = None
    if body.auth_profile_id:
        auth_profile = _get_auth_profile_or_404(db, body.auth_profile_id, current_user)
        if auth_profile.program_id != program.id:
            raise HTTPException(status_code=400, detail="Auth profile does not belong to the selected program.")
        if not auth_profile.is_active:
            raise HTTPException(status_code=400, detail="Auth profile is inactive.")
        try:
            decrypt_auth_headers(auth_profile.encrypted_headers)
        except AuthProfileError as e:
            raise HTTPException(status_code=400, detail=str(e))
    _enforce_target_authorization(db, current_user, validated_url)
    _enforce_user_scan_quota(db, current_user)

    # Rate limit check
    client_ip = _get_client_ip(request)
    _check_rate_limit(client_ip)

    scan = _enqueue_scan(
        db,
        url=validated_url,
        user_id=current_user.id,
        client_ip=client_ip,
        program_id=program.id,
        auth_profile_id=auth_profile.id if auth_profile else None,
    )
    _increment_rate_limit(client_ip)

    scan_id = str(scan.id)
    logger.info(f"Scan created: id={scan_id}, url={validated_url}, user={current_user.email}")

    return ScanCreateResponse(scan_id=scan_id)


@app.get("/api/schedules", response_model=List[ScheduledScanResponse])
async def list_schedules(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List recurring scan schedules owned by the current user."""
    schedules = (
        db.query(ScheduledScan)
        .filter(ScheduledScan.user_id == current_user.id)
        .order_by(ScheduledScan.created_at.desc())
        .all()
    )
    return [_scheduled_scan_to_response(schedule) for schedule in schedules]


@app.post("/api/schedules", response_model=ScheduledScanResponse)
async def create_schedule(
    body: ScheduledScanCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a recurring BullMQ-backed scan schedule."""
    try:
        validated_url = validate_url(body.url)
    except URLValidationError as e:
        raise HTTPException(status_code=400, detail=e.message)

    _enforce_target_authorization(db, current_user, validated_url)
    _enforce_schedule_quota(db, current_user)

    schedule = ScheduledScan(
        url=validated_url,
        cron=_validate_cron_pattern(body.cron),
        timezone=_validate_timezone(body.timezone or current_user.timezone or "UTC"),
        is_active=body.is_active,
        user_id=current_user.id,
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    logger.info(f"Scheduled scan created: id={schedule.id}, url={schedule.url}, user={current_user.email}")
    return _scheduled_scan_to_response(schedule)


@app.patch("/api/schedules/{schedule_id}", response_model=ScheduledScanResponse)
async def update_schedule(
    schedule_id: str,
    body: ScheduledScanUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a recurring scan schedule."""
    try:
        schedule_uuid = UUID(schedule_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid schedule ID format.")

    schedule = (
        db.query(ScheduledScan)
        .filter(ScheduledScan.id == schedule_uuid, ScheduledScan.user_id == current_user.id)
        .first()
    )
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found.")

    if body.url is not None:
        try:
            validated_url = validate_url(body.url)
        except URLValidationError as e:
            raise HTTPException(status_code=400, detail=e.message)
        _enforce_target_authorization(db, current_user, validated_url)
        schedule.url = validated_url
    if body.cron is not None:
        schedule.cron = _validate_cron_pattern(body.cron)
    if body.timezone is not None:
        schedule.timezone = _validate_timezone(body.timezone)
    if body.is_active is not None:
        schedule.is_active = body.is_active

    schedule.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(schedule)
    return _scheduled_scan_to_response(schedule)


@app.delete("/api/schedules/{schedule_id}")
async def delete_schedule(
    schedule_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a recurring scan schedule."""
    try:
        schedule_uuid = UUID(schedule_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid schedule ID format.")

    schedule = (
        db.query(ScheduledScan)
        .filter(ScheduledScan.id == schedule_uuid, ScheduledScan.user_id == current_user.id)
        .first()
    )
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found.")

    db.delete(schedule)
    db.commit()
    return {"message": "Schedule deleted."}


@app.get("/api/internal/schedules", response_model=List[InternalScheduleResponse])
async def list_internal_schedules(
    request: Request,
    db: Session = Depends(get_db),
):
    """List active schedules for the BullMQ scheduler service."""
    _require_scheduler_token(request)
    schedules = (
        db.query(ScheduledScan)
        .filter(ScheduledScan.is_active == True)
        .order_by(ScheduledScan.updated_at.desc())
        .all()
    )
    return [_internal_schedule_to_response(schedule) for schedule in schedules]


@app.get("/api/internal/scans/pending", response_model=List[InternalPendingScanResponse])
async def list_internal_pending_scans(
    request: Request,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """List pending scans for the BullMQ scan dispatch queue."""
    _require_scheduler_token(request)
    scans = (
        db.query(Scan)
        .filter(Scan.status == ScanStatus.PENDING)
        .order_by(Scan.created_at.asc())
        .limit(limit)
        .all()
    )
    return [
        InternalPendingScanResponse(
            id=str(scan.id),
            url=scan.url,
            created_at=scan.created_at.isoformat(),
        )
        for scan in scans
    ]


@app.post("/api/internal/scans/{scan_id}/dispatch", response_model=ScanDispatchResponse)
async def dispatch_internal_scan(
    scan_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Dispatch a pending scan from BullMQ into the Celery execution worker."""
    _require_scheduler_token(request)
    try:
        scan_uuid = UUID(scan_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid scan ID format.")

    scan = db.query(Scan).filter(Scan.id == scan_uuid).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found.")
    if scan.status != ScanStatus.PENDING:
        return ScanDispatchResponse(
            status="skipped",
            scan_id=str(scan.id),
            message=f"Scan is already {scan.status.value}.",
        )

    try:
        _dispatch_scan_to_celery(scan)
    except Exception as exc:
        logger.exception("Failed to dispatch scan %s to Celery", scan.id)
        raise HTTPException(status_code=503, detail=f"Scan worker dispatch failed: {exc}")

    scan.status = ScanStatus.RUNNING
    scan.progress_step = 0
    scan.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(scan)
    publish_scan_event(scan, "scan.updated")
    logger.info("BullMQ dispatched scan %s to Celery", scan.id)
    return ScanDispatchResponse(status="dispatched", scan_id=str(scan.id), message="Scan dispatched to worker.")


@app.post("/api/internal/schedules/{schedule_id}/trigger", response_model=ScheduledScanTriggerResponse)
async def trigger_internal_schedule(
    schedule_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Trigger a persisted schedule from BullMQ and enqueue the real scanner."""
    _require_scheduler_token(request)
    try:
        schedule_uuid = UUID(schedule_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid schedule ID format.")

    schedule = db.query(ScheduledScan).filter(ScheduledScan.id == schedule_uuid).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found.")
    if not schedule.is_active:
        return ScheduledScanTriggerResponse(status="skipped", message="Schedule is paused.")

    owner = db.query(User).filter(User.id == schedule.user_id, User.is_active == True).first()
    if not owner:
        return ScheduledScanTriggerResponse(status="skipped", message="Schedule owner is inactive or missing.")
    try:
        _enforce_user_scan_quota(db, owner)
        _enforce_target_authorization(db, owner, schedule.url)
    except HTTPException as exc:
        return ScheduledScanTriggerResponse(status="skipped", message=str(exc.detail))

    active_scan = (
        db.query(Scan)
        .filter(
            Scan.user_id == schedule.user_id,
            Scan.url == schedule.url,
            Scan.status.in_([ScanStatus.PENDING, ScanStatus.RUNNING]),
        )
        .first()
    )
    if active_scan:
        return ScheduledScanTriggerResponse(
            status="skipped",
            scan_id=str(active_scan.id),
            message="A scan for this scheduled domain is already active.",
        )

    scan = _enqueue_scan(db, url=schedule.url, user_id=schedule.user_id, client_ip="scheduled")
    schedule.last_run_at = datetime.now(timezone.utc)
    schedule.last_scan_id = str(scan.id)
    schedule.updated_at = datetime.now(timezone.utc)
    db.commit()
    logger.info(f"Scheduled scan triggered: schedule={schedule.id}, scan={scan.id}")
    return ScheduledScanTriggerResponse(status="queued", scan_id=str(scan.id), message="Scheduled scan queued.")


@app.get("/api/internal/email-notifications/pending", response_model=List[InternalEmailNotificationResponse])
async def list_pending_email_notifications(
    request: Request,
    limit: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """List pending scan completion emails for the BullMQ email dispatcher."""
    _require_scheduler_token(request)
    notifications = (
        db.query(EmailNotification)
        .join(Scan, EmailNotification.scan_id == Scan.id)
        .filter(
            EmailNotification.status == EmailDeliveryStatus.PENDING,
            Scan.pdf_url.isnot(None),
        )
        .order_by(EmailNotification.created_at.asc())
        .limit(limit)
        .all()
    )
    return [_email_notification_to_response(notification) for notification in notifications]


@app.post("/api/internal/email-notifications/{notification_id}/queued", response_model=InternalEmailStatusResponse)
async def mark_email_notification_queued(
    notification_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Mark a notification as queued after BullMQ accepted the job."""
    _require_scheduler_token(request)
    try:
        notification_uuid = UUID(notification_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid notification ID format.")

    notification = db.query(EmailNotification).filter(EmailNotification.id == notification_uuid).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Email notification not found.")
    if notification.status == EmailDeliveryStatus.SENT:
        return InternalEmailStatusResponse(status="sent", message="Notification was already sent.")

    notification.status = EmailDeliveryStatus.QUEUED
    notification.queued_at = datetime.now(timezone.utc)
    notification.updated_at = datetime.now(timezone.utc)
    notification.last_error = None
    db.commit()
    return InternalEmailStatusResponse(status="queued", message="Notification queued.")


@app.post("/api/internal/email-notifications/{notification_id}/sending", response_model=InternalEmailStatusResponse)
async def mark_email_notification_sending(
    notification_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Mark a notification as actively sending."""
    _require_scheduler_token(request)
    try:
        notification_uuid = UUID(notification_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid notification ID format.")

    notification = db.query(EmailNotification).filter(EmailNotification.id == notification_uuid).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Email notification not found.")
    if notification.status == EmailDeliveryStatus.SENT:
        return InternalEmailStatusResponse(status="sent", message="Notification was already sent.")

    notification.status = EmailDeliveryStatus.SENDING
    notification.attempts += 1
    notification.updated_at = datetime.now(timezone.utc)
    db.commit()
    return InternalEmailStatusResponse(status="sending", message="Notification sending.")


@app.post("/api/internal/email-notifications/{notification_id}/sent", response_model=InternalEmailStatusResponse)
async def mark_email_notification_sent(
    notification_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Mark a notification as delivered."""
    _require_scheduler_token(request)
    try:
        notification_uuid = UUID(notification_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid notification ID format.")

    notification = db.query(EmailNotification).filter(EmailNotification.id == notification_uuid).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Email notification not found.")

    notification.status = EmailDeliveryStatus.SENT
    notification.sent_at = datetime.now(timezone.utc)
    notification.updated_at = datetime.now(timezone.utc)
    notification.last_error = None
    db.commit()
    return InternalEmailStatusResponse(status="sent", message="Notification sent.")


@app.post("/api/internal/email-notifications/{notification_id}/failed", response_model=InternalEmailStatusResponse)
async def mark_email_notification_failed(
    notification_id: str,
    body: InternalEmailStatusRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Mark a notification send attempt as failed."""
    _require_scheduler_token(request)
    try:
        notification_uuid = UUID(notification_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid notification ID format.")

    notification = db.query(EmailNotification).filter(EmailNotification.id == notification_uuid).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Email notification not found.")
    if notification.status == EmailDeliveryStatus.SENT:
        return InternalEmailStatusResponse(status="sent", message="Notification was already sent.")

    notification.status = EmailDeliveryStatus.FAILED
    notification.last_error = (body.error or "SMTP delivery failed.")[:2000]
    notification.updated_at = datetime.now(timezone.utc)
    db.commit()
    return InternalEmailStatusResponse(status="failed", message="Notification failed.")


@app.get("/api/internal/email-notifications/{notification_id}/pdf")
async def get_email_notification_pdf(
    notification_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Return the generated PDF attachment for the internal SMTP worker."""
    _require_scheduler_token(request)
    try:
        notification_uuid = UUID(notification_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid notification ID format.")

    notification = db.query(EmailNotification).filter(EmailNotification.id == notification_uuid).first()
    if not notification or not notification.scan:
        raise HTTPException(status_code=404, detail="Email notification not found.")
    if not notification.scan.pdf_url:
        raise HTTPException(status_code=404, detail="Scan PDF is not available yet.")

    from pdf_storage import fetch_pdf_from_minio

    pdf_bytes = fetch_pdf_from_minio(str(notification.scan_id))
    if not pdf_bytes:
        raise HTTPException(status_code=404, detail="Stored PDF could not be retrieved.")

    filename = _scan_pdf_filename(notification.scan)
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Cache-Control": "private, max-age=60",
    }
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)


@app.post("/api/scans/{scan_id}/cancel", response_model=ScanCancelResponse)
async def cancel_scan(
    scan_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cancel a pending or running scan owned by the current user."""
    try:
        scan_uuid = UUID(scan_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid scan ID format.")

    scan = db.query(Scan).filter(Scan.id == scan_uuid).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found.")

    if current_user.role != UserRole.ADMIN and scan.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Scan not found.")

    if scan.status not in (ScanStatus.PENDING, ScanStatus.RUNNING):
        raise HTTPException(status_code=409, detail="Only pending or running scans can be stopped.")

    from tasks import celery_app
    celery_app.control.revoke(scan_id, terminate=True, signal="SIGTERM")

    scan.status = ScanStatus.FAILED
    scan.error = "Scan stopped by user."
    if scan.sub_tasks:
        next_sub_tasks = dict(scan.sub_tasks)
        for key, value in next_sub_tasks.items():
            if value in ("pending", "running"):
                next_sub_tasks[key] = "failed"
        scan.sub_tasks = next_sub_tasks
    scan.updated_at = datetime.now(timezone.utc)
    db.commit()
    publish_scan_event(scan, "scan.failed")

    if scan.client_ip:
        _decrement_rate_limit(scan.client_ip)

    logger.info(f"Scan cancelled: id={scan_id}, user={current_user.email}")
    return ScanCancelResponse(scan_id=scan_id, status="failed", message="Scan stopped.")


@app.websocket("/api/scans/ws")
async def scan_events_websocket(websocket: WebSocket):
    """Relay scan lifecycle events for the authenticated user."""
    token = websocket.cookies.get(COOKIE_NAME) or websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008)
        return

    payload = decode_access_token(token)
    if not payload or not payload.get("sub"):
        await websocket.close(code=1008)
        return

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == payload["sub"], User.is_active == True).first()
        if not user:
            await websocket.close(code=1008)
            return
        user_id = str(user.id)
    finally:
        db.close()

    await websocket.accept()

    redis_client = aioredis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
    pubsub = redis_client.pubsub()
    await pubsub.subscribe(SCAN_EVENTS_CHANNEL)

    try:
        await websocket.send_json({"type": "scan.events.connected"})
        async for message in pubsub.listen():
            if message.get("type") != "message":
                continue
            try:
                event = json.loads(message.get("data") or "{}")
            except json.JSONDecodeError:
                continue
            if event.get("user_id") != user_id:
                continue
            await websocket.send_json(event)
    except WebSocketDisconnect:
        pass
    finally:
        await pubsub.unsubscribe(SCAN_EVENTS_CHANNEL)
        await pubsub.close()
        await redis_client.close()


@app.get("/api/scans/dashboard", response_model=ScanDashboardResponse)
async def get_scan_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return dashboard aggregates, preferring persistent triage findings."""
    scans = (
        db.query(Scan)
        .filter(Scan.user_id == current_user.id)
        .order_by(Scan.created_at.desc())
        .all()
    )
    persisted_findings = (
        db.query(Finding)
        .filter(Finding.user_id == current_user.id)
        .order_by(Finding.last_seen_at.desc())
        .all()
    )

    severity_counts = {
        "critical": 0,
        "high": 0,
        "medium": 0,
        "low": 0,
        "info": 0,
    }
    category_counts: dict[str, int] = {}
    asset_counts: dict[str, int] = {}
    day_counts: dict[str, dict[str, int]] = {}
    risk_scores: list[int] = []
    persisted_counts_by_scan: dict[str, int] = {}

    for finding in persisted_findings:
        severity = finding.severity.value if isinstance(finding.severity, FindingSeverity) else str(finding.severity)
        if severity not in severity_counts:
            severity = "info"
        severity_counts[severity] += 1

        category = (finding.category or "Uncategorized").strip() or "Uncategorized"
        category_counts[category] = category_counts.get(category, 0) + 1

        affected = (finding.affected or "").strip()
        if affected:
            asset_counts[affected] = asset_counts.get(affected, 0) + 1

        if finding.scan_id:
            scan_key = str(finding.scan_id)
            persisted_counts_by_scan[scan_key] = persisted_counts_by_scan.get(scan_key, 0) + 1

        day_key = finding.last_seen_at.date().isoformat()
        day_counts.setdefault(day_key, {"scans": 0, "findings": 0})
        day_counts[day_key]["findings"] += 1

    for scan in scans:
        day_key = scan.created_at.date().isoformat()
        day_counts.setdefault(day_key, {"scans": 0, "findings": 0})
        day_counts[day_key]["scans"] += 1

        report = scan.report if isinstance(scan.report, dict) else {}
        risk_score = _coerce_risk_score(report.get("risk_score"))
        if risk_score is not None:
            risk_scores.append(risk_score)

        findings = report.get("findings") if isinstance(report.get("findings"), list) else []
        if str(scan.id) not in persisted_counts_by_scan:
            day_counts[day_key]["findings"] += len(findings)

            for finding in findings:
                if not isinstance(finding, dict):
                    continue

                severity = str(finding.get("severity") or "info").lower()
                if severity not in severity_counts:
                    severity = "info"
                severity_counts[severity] += 1

                category = str(finding.get("category") or "Uncategorized").strip() or "Uncategorized"
                category_counts[category] = category_counts.get(category, 0) + 1

                affected = str(finding.get("affected") or scan.url).strip() or scan.url
                asset_counts[affected] = asset_counts.get(affected, 0) + 1

    recent_scans = []
    for scan in scans:
        report = scan.report if isinstance(scan.report, dict) else {}
        findings = report.get("findings") if isinstance(report.get("findings"), list) else []
        risk_score = _coerce_risk_score(report.get("risk_score"))
        findings_count = persisted_counts_by_scan.get(str(scan.id), len(findings))

        recent_scans.append(
            DashboardRecentScan(
                id=str(scan.id),
                url=scan.url,
                status=scan.status.value,
                progress_step=scan.progress_step,
                risk_score=risk_score,
                findings_count=findings_count,
                pdf_url=(f"/api/scans/{scan.id}/pdf" if scan.pdf_url else None),
                created_at=scan.created_at.isoformat(),
            )
        )

    return ScanDashboardResponse(
        total_scans=len(scans),
        complete_scans=sum(1 for scan in scans if scan.status == ScanStatus.COMPLETE),
        active_scans=sum(1 for scan in scans if scan.status in (ScanStatus.RUNNING, ScanStatus.PENDING)),
        failed_scans=sum(1 for scan in scans if scan.status == ScanStatus.FAILED),
        reports_ready=sum(1 for scan in scans if scan.report),
        total_findings=sum(severity_counts.values()),
        average_risk_score=round(sum(risk_scores) / len(risk_scores)) if risk_scores else None,
        severity_counts=severity_counts,
        category_counts=[
            DashboardCategoryCount(label=label, count=count)
            for label, count in sorted(category_counts.items(), key=lambda item: item[1], reverse=True)[:8]
        ],
        top_assets=[
            DashboardAssetCount(asset=asset, count=count)
            for asset, count in sorted(asset_counts.items(), key=lambda item: item[1], reverse=True)[:8]
        ],
        scans_by_day=[
            DashboardDayCount(date=date, scans=counts["scans"], findings=counts["findings"])
            for date, counts in sorted(day_counts.items())[-14:]
        ],
        recent_scans=recent_scans,
    )


@app.get("/api/scans/{scan_id}", response_model=ScanStatusResponse)
async def get_scan_status(
    scan_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get the current status of a scan.
    Users can only see their own scans. Admins can see all.
    """
    try:
        scan_uuid = UUID(scan_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid scan ID format.")

    scan = db.query(Scan).filter(Scan.id == scan_uuid).first()

    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found.")

    # Access control: user can only see own scans, admin sees all
    if current_user.role != UserRole.ADMIN and scan.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Scan not found.")

    # If scan is terminal, clean up rate limit
    if scan.status in (ScanStatus.COMPLETE, ScanStatus.FAILED) and scan.client_ip:
        _decrement_rate_limit(scan.client_ip)

    return ScanStatusResponse(
        id=str(scan.id),
        url=scan.url,
        status=scan.status.value,
        progress_step=scan.progress_step,
        sub_tasks=scan.sub_tasks,
        report=scan.report,
        error=scan.error,
        pdf_url=(f"/api/scans/{scan.id}/pdf" if scan.pdf_url else None),
        program_id=str(scan.program_id) if scan.program_id else None,
        auth_profile_id=str(scan.auth_profile_id) if scan.auth_profile_id else None,
        created_at=scan.created_at.isoformat(),
        user_id=str(scan.user_id) if scan.user_id else None,
    )


@app.get("/api/scans", response_model=List[ScanStatusResponse])
async def list_my_scans(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all scans for the current user."""
    scans = (
        db.query(Scan)
        .filter(Scan.user_id == current_user.id)
        .order_by(Scan.created_at.desc())
        .limit(50)
        .all()
    )

    return [
        ScanStatusResponse(
            id=str(s.id),
            url=s.url,
            status=s.status.value,
            progress_step=s.progress_step,
            report=None,  # Don't send full reports in list view
            error=s.error,
            pdf_url=(f"/api/scans/{s.id}/pdf" if s.pdf_url else None),
            program_id=str(s.program_id) if s.program_id else None,
            auth_profile_id=str(s.auth_profile_id) if s.auth_profile_id else None,
            created_at=s.created_at.isoformat(),
            user_id=str(s.user_id) if s.user_id else None,
        )
        for s in scans
    ]


@app.post("/api/scans/{scan_id}/generate-pdf")
async def generate_scan_pdf(
    scan_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate and store a PDF report for a scan owned by the current user."""
    scan = _get_scan_or_404(db, scan_id)
    _enforce_scan_access(scan, current_user)
    return _generate_pdf_for_scan(scan, db, route_prefix="/api/scans")


@app.get("/api/scans/{scan_id}/pdf")
async def get_scan_pdf(
    scan_id: str,
    download: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Stream a generated PDF for a scan owned by the current user."""
    scan = _get_scan_or_404(db, scan_id)
    _enforce_scan_access(scan, current_user)
    return _stream_scan_pdf(scan, download=download)


# ── Admin Endpoints ────────────────────────────────────────────────

@app.get("/api/admin/stats", response_model=AdminStatsResponse)
async def admin_stats(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Get platform-wide stats (admin only)."""
    total_users = db.query(func.count(User.id)).scalar()
    total_scans = db.query(func.count(Scan.id)).scalar()
    active_scans = (
        db.query(func.count(Scan.id))
        .filter(Scan.status.in_([ScanStatus.PENDING, ScanStatus.RUNNING]))
        .scalar()
    )

    return AdminStatsResponse(
        total_users=total_users or 0,
        total_scans=total_scans or 0,
        active_scans=active_scans or 0,
    )


@app.get("/api/admin/users", response_model=List[AdminUserResponse])
async def admin_list_users(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """List all users with scan counts (admin only)."""
    users = db.query(User).order_by(User.created_at.desc()).all()

    result = []
    for user in users:
        scan_count = db.query(func.count(Scan.id)).filter(Scan.user_id == user.id).scalar()
        result.append(
            AdminUserResponse(
                id=str(user.id),
                email=user.email,
                name=user.name,
                role=user.role.value,
                plan=(user.plan.value if isinstance(user.plan, UserPlan) else str(user.plan).lower()),
                monthly_scan_limit=user.monthly_scan_limit,
                active_scan_limit=user.active_scan_limit,
                schedule_limit=user.schedule_limit,
                is_active=user.is_active,
                created_at=user.created_at.isoformat(),
                scan_count=scan_count or 0,
            )
        )

    return result


@app.get("/api/admin/scans", response_model=List[AdminScanResponse])
async def admin_list_scans(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """List all scans across all users (admin only)."""
    scans = (
        db.query(Scan)
        .outerjoin(User, Scan.user_id == User.id)
        .order_by(Scan.created_at.desc())
        .limit(100)
        .all()
    )

    return [
        AdminScanResponse(
            id=str(s.id),
            url=s.url,
            status=s.status.value,
            progress_step=s.progress_step,
            error=s.error,
            created_at=s.created_at.isoformat(),
            user_email=s.user.email if s.user else None,
            user_name=s.user.name if s.user else None,
        )
        for s in scans
    ]


@app.delete("/api/admin/users/{user_id}")
async def admin_delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Delete a user (admin only). Admin cannot delete themselves."""
    try:
        target_uuid = UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID format.")

    if target_uuid == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own admin account.")

    target = db.query(User).filter(User.id == target_uuid).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")

    db.delete(target)
    db.commit()

    logger.info(f"Admin {admin.email} deleted user {target.email}")

    return {"message": f"User {target.email} deleted."}


# ── Token Usage Admin Endpoints ───────────────────────────────────

class TokenUsageResponse(BaseModel):
    """Single token usage record response."""
    id: str
    scan_id: str
    user_id: str | None
    user_email: str | None
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    model: str | None
    estimated_cost: str | None
    created_at: str


class TokenUsageStats(BaseModel):
    """Aggregated token usage statistics."""
    total_tokens_all_time: int
    total_scans: int
    total_cost_estimate: str
    by_user: list[dict[str, Any]]
    by_model: list[dict[str, Any]]
    recent_usage: list[TokenUsageResponse]


@app.get("/api/admin/token-usage", response_model=TokenUsageStats)
async def admin_token_usage_stats(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Get aggregated AI token usage statistics (admin only)."""
    total_tokens = db.query(func.sum(TokenUsage.total_tokens)).scalar() or 0
    total_scans = db.query(TokenUsage).count()

    token_records = db.query(TokenUsage).all()
    cost_estimate = sum(
        estimate_ai_cost_usd(record.model, record.prompt_tokens, record.completion_tokens)
        for record in token_records
    )
    
    # Usage by user
    user_stats_query = (
        db.query(
            User.id.label("user_id"),
            User.email.label("user_email"),
            func.sum(TokenUsage.total_tokens).label("total_tokens"),
            func.count(TokenUsage.id).label("scan_count"),
        )
        .join(TokenUsage, User.id == TokenUsage.user_id)
        .group_by(User.id, User.email)
        .order_by(func.sum(TokenUsage.total_tokens).desc())
        .all()
    )
    
    by_user = [
        {
            "user_id": str(row.user_id),
            "user_email": row.user_email,
            "total_tokens": row.total_tokens,
            "scan_count": row.scan_count,
            "estimated_cost": format_usd(
                sum(
                    estimate_ai_cost_usd(record.model, record.prompt_tokens, record.completion_tokens)
                    for record in token_records
                    if record.user_id == row.user_id
                )
            ),
        }
        for row in user_stats_query
    ]
    
    # Usage by model
    model_stats_query = (
        db.query(
            TokenUsage.model,
            func.sum(TokenUsage.total_tokens).label("total_tokens"),
            func.count(TokenUsage.id).label("scan_count"),
        )
        .group_by(TokenUsage.model)
        .order_by(func.sum(TokenUsage.total_tokens).desc())
        .all()
    )
    
    by_model = [
        {
            "model": row.model or "unknown",
            "total_tokens": row.total_tokens,
            "scan_count": row.scan_count,
            "estimated_cost": format_usd(
                sum(
                    estimate_ai_cost_usd(record.model, record.prompt_tokens, record.completion_tokens)
                    for record in token_records
                    if (record.model or "unknown") == (row.model or "unknown")
                )
            ),
        }
        for row in model_stats_query
    ]
    
    # Recent usage (last 50 records)
    recent_query = (
        db.query(TokenUsage)
        .outerjoin(User, TokenUsage.user_id == User.id)
        .order_by(TokenUsage.created_at.desc())
        .limit(50)
        .all()
    )
    
    recent_usage = [
        TokenUsageResponse(
            id=str(t.id),
            scan_id=str(t.scan_id),
            user_id=str(t.user_id) if t.user_id else None,
            user_email=t.user.email if t.user else None,
            prompt_tokens=t.prompt_tokens,
            completion_tokens=t.completion_tokens,
            total_tokens=t.total_tokens,
            model=t.model,
            estimated_cost=t.estimated_cost or format_usd(estimate_ai_cost_usd(t.model, t.prompt_tokens, t.completion_tokens)),
            created_at=t.created_at.isoformat(),
        )
        for t in recent_query
    ]
    
    return TokenUsageStats(
        total_tokens_all_time=total_tokens,
        total_scans=total_scans,
        total_cost_estimate=f"${cost_estimate:.4f}",
        by_user=by_user,
        by_model=by_model,
        recent_usage=recent_usage,
    )


@app.get("/api/admin/token-usage/{user_id}")
async def admin_user_token_usage(
    user_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Get token usage for a specific user (admin only)."""
    try:
        target_uuid = UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID format.")
    
    user = db.query(User).filter(User.id == target_uuid).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    
    # Get token usage for this user
    user_tokens = db.query(TokenUsage).filter(TokenUsage.user_id == target_uuid).all()
    
    total_tokens = sum(t.total_tokens for t in user_tokens)
    cost_estimate = sum(
        estimate_ai_cost_usd(record.model, record.prompt_tokens, record.completion_tokens)
        for record in user_tokens
    )
    
    return {
        "user_id": user_id,
        "user_email": user.email,
        "total_tokens": total_tokens,
        "scan_count": len(user_tokens),
        "estimated_cost": f"${cost_estimate:.4f}",
        "usage_records": [
            {
                "scan_id": str(t.scan_id),
                "prompt_tokens": t.prompt_tokens,
                "completion_tokens": t.completion_tokens,
                "total_tokens": t.total_tokens,
                "model": t.model,
                "estimated_cost": t.estimated_cost or format_usd(estimate_ai_cost_usd(t.model, t.prompt_tokens, t.completion_tokens)),
                "created_at": t.created_at.isoformat(),
            }
            for t in user_tokens
        ],
    }
