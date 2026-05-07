"""
ScanAI — FastAPI application.
REST endpoints for auth, scans, and admin management.
"""

import logging
from contextlib import asynccontextmanager
from typing import Any, List, Optional
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


class ScanStatusResponse(BaseModel):
    id: str
    url: str
    status: str
    progress_step: int
    sub_tasks: dict[str, str] | None = None  # tool_key -> status
    report: dict[str, Any] | None = None
    error: str | None = None
    created_at: str
    user_id: str | None = None


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
    pdf_url: str | None = None
    report: dict | None = None
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
    run_scan.delay(scan_id, validated_url)

    logger.info(f"Scan created: id={scan_id}, url={validated_url}, user={current_user.email}")

    return ScanCreateResponse(scan_id=scan_id)


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
            created_at=s.created_at.isoformat(),
            user_id=str(s.user_id) if s.user_id else None,
        )
        for s in scans
    ]


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
            pdf_url=s.pdf_url,
            report=s.report,
            created_at=s.created_at.isoformat(),
            user_email=s.user.email if s.user else None,
            user_name=s.user.name if s.user else None,
        )
        for s in scans
    ]


@app.post("/api/admin/scans/{scan_id}/generate-pdf")
async def admin_generate_pdf(
    scan_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """
    Generate and store a PDF report for a completed scan.
    Only works for scans with status 'complete' and existing report data.
    """
    scan = _get_scan_or_404(db, scan_id)

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

    # Import here to avoid loading if not needed
    from pdf_storage import generate_and_store_pdf

    # Generate and upload PDF
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

    view_url = f"/api/admin/scans/{scan.id}/pdf"
    download_url = f"{view_url}?download=1"

    # Store the internal object reference instead of a public MinIO URL.
    scan.pdf_url = stored_pdf_ref
    db.commit()

    return {
        "pdf_url": view_url,
        "view_url": view_url,
        "download_url": download_url,
        "message": "PDF generated and stored successfully.",
    }


@app.get("/api/admin/scans/{scan_id}/pdf")
async def admin_get_pdf(
    scan_id: str,
    download: bool = Query(False),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Stream a generated PDF through the app instead of exposing MinIO directly."""
    scan = _get_scan_or_404(db, scan_id)

    if not scan.pdf_url:
        raise HTTPException(status_code=404, detail="No generated PDF is available for this scan yet.")

    from pdf_storage import fetch_pdf_from_minio

    pdf_bytes = fetch_pdf_from_minio(str(scan.id))
    if not pdf_bytes:
        raise HTTPException(status_code=404, detail="Stored PDF could not be retrieved.")

    filename = f"scanai-report-{str(scan.id)[:8]}.pdf"
    disposition = "attachment" if download else "inline"
    headers = {
        "Content-Disposition": f'{disposition}; filename="{filename}"',
        "Cache-Control": "private, max-age=300",
    }

    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)


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
