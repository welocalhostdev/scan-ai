"""
ScanAI — FastAPI application.
REST endpoints for auth, scans, and admin management.
"""

import logging
import re
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, List, Optional
from urllib.parse import urlparse
from uuid import UUID

import redis
from fastapi import FastAPI, HTTPException, Depends, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from sqlalchemy import func

from config import settings
from database import init_db, get_db
from models import Scan, ScanStatus, User, UserRole, TokenUsage
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
)

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


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    is_active: bool
    created_at: str


class AuthResponse(BaseModel):
    user: UserResponse
    message: str


# Scan models
class ScanRequest(BaseModel):
    url: str


class ScanCreateResponse(BaseModel):
    scan_id: str


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


def _set_auth_cookie(response: Response, token: str) -> None:
    """Set the JWT token as an httpOnly cookie."""
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        samesite="strict",
        secure=(settings.ENVIRONMENT == "production"),
        path="/",
    )


def _user_to_response(user: User) -> UserResponse:
    """Convert a User model to a response dict."""
    return UserResponse(
        id=str(user.id),
        email=user.email,
        name=user.name,
        role=user.role.value,
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
    return HealthResponse(status="healthy", version="1.0.0")


# ── Auth Endpoints ─────────────────────────────────────────────────

@app.post("/api/auth/signup", response_model=AuthResponse)
async def signup(
    body: SignupRequest,
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

    # Determine role — first user becomes admin
    user_count = db.query(func.count(User.id)).scalar()
    role = UserRole.ADMIN if user_count == 0 else UserRole.USER

    # Create user
    user = User(
        email=body.email.lower(),
        name=body.name.strip(),
        hashed_password=hash_password(body.password),
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Create token and set cookie
    token = create_access_token(str(user.id), user.role.value)
    _set_auth_cookie(response, token)

    logger.info(f"User signed up: email={user.email}, role={role.value}")

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


@app.post("/api/auth/logout")
async def logout(response: Response):
    """Clear the session cookie."""
    response.delete_cookie(
        key=COOKIE_NAME,
        path="/",
        httponly=True,
        samesite="strict",
    )
    return {"message": "Logged out successfully."}


@app.get("/api/auth/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user."""
    return _user_to_response(current_user)


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

    # Rate limit check
    client_ip = _get_client_ip(request)
    _check_rate_limit(client_ip)

    # Create scan record tied to user
    scan = Scan(
        url=validated_url,
        status=ScanStatus.PENDING,
        progress_step=0,
        client_ip=client_ip,
        user_id=current_user.id,
    )
    db.add(scan)
    db.commit()
    db.refresh(scan)

    scan_id = str(scan.id)

    # Track rate limit
    _increment_rate_limit(client_ip)

    # Enqueue Celery task
    from tasks import run_scan
    run_scan.apply_async(args=[scan_id, validated_url], task_id=scan_id)

    logger.info(f"Scan created: id={scan_id}, url={validated_url}, user={current_user.email}")

    return ScanCreateResponse(scan_id=scan_id)


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

    if scan.client_ip:
        _decrement_rate_limit(scan.client_ip)

    logger.info(f"Scan cancelled: id={scan_id}, user={current_user.email}")
    return ScanCancelResponse(scan_id=scan_id, status="failed", message="Scan stopped.")


@app.get("/api/scans/dashboard", response_model=ScanDashboardResponse)
async def get_scan_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return real dashboard aggregates from the current user's scans."""
    scans = (
        db.query(Scan)
        .filter(Scan.user_id == current_user.id)
        .order_by(Scan.created_at.desc())
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

    for scan in scans:
        day_key = scan.created_at.date().isoformat()
        day_counts.setdefault(day_key, {"scans": 0, "findings": 0})
        day_counts[day_key]["scans"] += 1

        report = scan.report if isinstance(scan.report, dict) else {}
        risk_score = _coerce_risk_score(report.get("risk_score"))
        if risk_score is not None:
            risk_scores.append(risk_score)

        findings = report.get("findings") if isinstance(report.get("findings"), list) else []
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

        recent_scans.append(
            DashboardRecentScan(
                id=str(scan.id),
                url=scan.url,
                status=scan.status.value,
                progress_step=scan.progress_step,
                risk_score=risk_score,
                findings_count=len(findings),
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
    # Total tokens across all time
    total_tokens = db.query(func.sum(TokenUsage.total_tokens)).scalar() or 0
    total_scans = db.query(TokenUsage).count()
    
    # Calculate rough cost estimate (provider pricing varies by model and tier)
    cost_estimate = (total_tokens / 1000) * 0.0015
    
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
            estimated_cost=t.estimated_cost,
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
    cost_estimate = (total_tokens / 1000) * 0.0015
    
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
                "created_at": t.created_at.isoformat(),
            }
            for t in user_tokens
        ],
    }
