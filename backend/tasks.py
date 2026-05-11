"""
ScanAI — Celery task pipeline for security scanning.
Orchestrates the 7-step scan process: subfinder → httpx → naabu → katana → nuclei → testssl → Gemini.
"""

import asyncio
import hashlib
import logging
from datetime import datetime, timezone
from typing import Any
from urllib.parse import parse_qs, urlparse

from celery import Celery
from celery.exceptions import SoftTimeLimitExceeded

from config import settings
from auth_profiles import AuthProfileError, decrypt_auth_headers
from database import get_db_session
from models import (
    Asset,
    AssetType,
    AuthProfile,
    EmailDeliveryStatus,
    EmailNotification,
    Evidence,
    EvidenceType,
    Finding,
    FindingSeverity,
    Scan,
    ScanStatus,
    TokenUsage,
    User,
)
from validators import extract_domain
from scanner import (
    run_subfinder,
    run_dnsx,
    run_httpx,
    run_naabu,
    run_tlsx,
    run_katana,
    run_nuclei,
    run_nuclei_api_checks,
    run_ffuf_api_discovery,
    run_arjun_parameter_discovery,
    run_openapi_schema_discovery,
    run_webcheck_enrichment,
    run_webanalyze,
    run_wafw00f,
    run_testssl,
    run_dalfox,
    cleanup_scan_files,
)
from ai import classify_attack_surface, generate_report
from ai_pricing import estimate_ai_cost_usd, format_usd
from scan_events import publish_scan_event

logger = logging.getLogger(__name__)

# Initialize Celery
celery_app = Celery(
    "scanai",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_soft_time_limit=settings.SCAN_TIMEOUT_SECONDS,
    task_time_limit=settings.SCAN_TIMEOUT_SECONDS + 30,
    worker_max_tasks_per_child=50,  # Restart workers periodically to free memory
    worker_prefetch_multiplier=1,  # Keep queue backpressure honest for long scans
)

# Step labels for progress tracking
STEP_LABELS = {
    1: "Finding subdomains",
    2: "Probing live hosts",
    3: "Scanning open ports",
    4: "Crawling endpoints",
    5: "Running vulnerability checks",
    6: "Analysing TLS & headers",
    7: "Generating AI report",
}


def _queue_completion_email(session, scan: Scan) -> None:
    """Create one pending completion email after a PDF report is available."""
    if not scan.user_id or not scan.pdf_url:
        return

    existing = session.query(EmailNotification).filter(EmailNotification.scan_id == scan.id).first()
    if existing:
        return

    user = session.query(User).filter(User.id == scan.user_id).first()
    if not user or not user.email:
        return

    domain = extract_domain(scan.url)
    notification = EmailNotification(
        scan_id=scan.id,
        user_id=scan.user_id,
        recipient_email=user.email,
        subject=f"ScanAI report ready for {domain}",
        status=EmailDeliveryStatus.PENDING,
    )
    session.add(notification)
    logger.info(f"Queued completion email notification for scan {scan.id} to {user.email}")


def _update_scan_progress(scan_id: str, step: int, status: ScanStatus = ScanStatus.RUNNING) -> None:
    """Update scan progress in the database."""
    with get_db_session() as session:
        scan = session.query(Scan).filter(Scan.id == scan_id).first()
        if scan:
            scan.progress_step = step
            scan.status = status

            # Initialize sub_tasks if not present
            if scan.sub_tasks is None:
                scan.sub_tasks = {
                    "subfinder": "pending",
                    "dnsx": "pending",
                    "httpx": "pending",
                    "naabu": "pending",
                    "katana": "pending",
                    "ffuf_api": "pending",
                    "openapi": "pending",
                    "webcheck": "pending",
                    "webanalyze": "pending",
                    "wafw00f": "pending",
                    "nuclei": "pending",
                    "nuclei_api": "pending",
                    "arjun": "pending",
                    "testssl": "pending",
                    "tlsx": "pending",
                    "dalfox": "pending",
                    "ai": "pending"
                }

            scan.updated_at = datetime.now(timezone.utc)
            session.commit()
            publish_scan_event(scan, "scan.updated")
            logger.info(f"Scan {scan_id}: step {step} — {STEP_LABELS.get(step, 'Unknown')}")


def _update_subtask(scan_id: str, task_key: str, task_status: str) -> None:
    """Update the status of a specific sub-task (pending, running, complete, failed)."""
    with get_db_session() as session:
        scan = session.query(Scan).filter(Scan.id == scan_id).first()
        if scan:
            # Create a copy to trigger SQLAlchemy change tracking for JSONB
            new_sub_tasks = dict(scan.sub_tasks or {})
            new_sub_tasks[task_key] = task_status
            scan.sub_tasks = new_sub_tasks
            scan.updated_at = datetime.now(timezone.utc)
            session.commit()
            publish_scan_event(scan, "scan.updated")
            logger.info(f"Scan {scan_id}: subtask {task_key} -> {task_status}")


def _set_scan_failed(scan_id: str, error: str) -> None:
    """Mark a scan as failed with error message."""
    with get_db_session() as session:
        scan = session.query(Scan).filter(Scan.id == scan_id).first()
        if scan:
            scan.status = ScanStatus.FAILED
            scan.error = error[:2000]  # Truncate long errors
            # Mark all sub-tasks that aren't complete as failed
            if scan.sub_tasks:
                new_sub_tasks = dict(scan.sub_tasks)
                for k, v in new_sub_tasks.items():
                    if v == "running":
                        new_sub_tasks[k] = "failed"
                scan.sub_tasks = new_sub_tasks
            scan.updated_at = datetime.now(timezone.utc)
            session.commit()
            publish_scan_event(scan, "scan.failed")
            logger.error(f"Scan {scan_id} failed: {error[:200]}")


def _normalize_finding_severity(value: Any) -> FindingSeverity:
    normalized = str(value or "info").lower()
    for severity in FindingSeverity:
        if severity.value == normalized:
            return severity
    return FindingSeverity.INFO


def _finding_dedupe_key(user_id: Any, finding: dict[str, Any]) -> str:
    raw = "|".join(
        [
            str(user_id),
            str(finding.get("affected") or "").strip().lower(),
            str(finding.get("title") or "").strip().lower(),
            str(finding.get("category") or "other").strip().lower(),
        ]
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _asset_type_for_value(value: str) -> AssetType:
    lowered = value.lower()
    if lowered.startswith(("http://", "https://")):
        if "/api" in lowered or "graphql" in lowered or "swagger" in lowered or "openapi" in lowered:
            return AssetType.API
        return AssetType.URL
    if ":" in lowered and lowered.rsplit(":", 1)[-1].isdigit():
        return AssetType.SERVICE
    if lowered.count(".") >= 1:
        return AssetType.SUBDOMAIN
    return AssetType.OTHER


def _surface_value_from_item(item: Any, keys: tuple[str, ...] = ("url", "host", "input", "endpoint", "matched-at")) -> str | None:
    if isinstance(item, str):
        value = item.strip()
        return value or None
    if not isinstance(item, dict):
        return None
    for key in keys:
        value = item.get(key)
        if value:
            text = str(value).strip()
            if text:
                return text
    request = item.get("request")
    if isinstance(request, dict):
        endpoint = request.get("endpoint")
        if endpoint:
            text = str(endpoint).strip()
            if text:
                return text
    return None


def _surface_path(value: str) -> str:
    parsed = urlparse(value if value.startswith(("http://", "https://")) else f"https://{value}")
    path = parsed.path or "/"
    query = f"?{parsed.query}" if parsed.query else ""
    return f"{path}{query}"


def _classify_surface(value: str, asset_type: AssetType, source: str, raw: Any | None = None) -> dict[str, Any]:
    path = _surface_path(value)
    haystack = f"{value} {path}".lower()
    signals: list[str] = []
    role = "route" if asset_type in {AssetType.URL, AssetType.API} else asset_type.value
    label = "Discovered route" if role == "route" else "Discovered asset"
    priority = "normal"
    confidence = 0.55

    def mark(next_role: str, next_label: str, signal: str, next_priority: str = "normal", next_confidence: float = 0.78) -> None:
        nonlocal role, label, priority, confidence
        if next_confidence >= confidence:
            role = next_role
            label = next_label
            priority = next_priority
            confidence = next_confidence
        signals.append(signal)

    if any(token in haystack for token in ("/login", "/signin", "/sign-in", "/auth", "/session", "/sso", "/oauth", "/callback")):
        mark("login", "Likely login or SSO route", "authentication keyword", "high", 0.9)
    if any(token in haystack for token in ("/admin", "/dashboard", "/console", "/manage", "/internal", "/staff", "/superuser")):
        mark("admin", "Likely admin or privileged area", "admin keyword", "high", 0.88)
    if any(token in haystack for token in ("/api", "/graphql", "/rpc", "/v1/", "/v2/", "/rest/")) or asset_type == AssetType.API:
        mark("api", "API route", "API route pattern", "high" if role not in {"login", "admin"} else priority, 0.82)
    if any(token in haystack for token in ("swagger", "openapi", "api-docs", "redoc", "/docs")):
        mark("api_docs", "API documentation candidate", "API documentation keyword", "high", 0.86)
    if any(token in haystack for token in ("/account", "/profile", "/settings", "/billing", "/checkout", "/payment")):
        mark("sensitive_user_area", "Likely sensitive user workflow", "account or payment keyword", "high", 0.83)
    if any(token in haystack for token in ("/upload", "/import", "/file", "/attachment")):
        mark("file_upload", "Likely file upload/import route", "file handling keyword", "high", 0.82)
    if any(token in haystack for token in ("/health", "/status", "/metrics", "/debug", "/actuator")):
        mark("operational", "Operational endpoint", "operational keyword", "medium", 0.8)
    if any(token in haystack for token in (".js", ".css", ".png", ".jpg", ".svg", ".woff", "/static/", "/assets/")):
        mark("static", "Static asset", "static asset pattern", "low", 0.75)
    if urlparse(value).query:
        signals.append("query parameters present")
        if role == "route":
            label = "Parameterized route"
            role = "parameterized"
            priority = "medium"
            confidence = max(confidence, 0.76)

    status = raw.get("status") if isinstance(raw, dict) else None
    if status in {401, 403}:
        signals.append(f"access controlled status {status}")
        if role == "route":
            role = "access_controlled"
            label = "Access-controlled route"
            priority = "high"
            confidence = max(confidence, 0.8)

    parsed_query = parse_qs(urlparse(value).query)
    return {
        "surface_role": role,
        "ai_label": label,
        "ai_confidence": round(confidence, 2),
        "priority": priority,
        "signals": sorted(set(signals)),
        "path": path,
        "source": source,
        "status": status,
        "parameters": sorted(parsed_query.keys())[:20],
    }


def _upsert_discovered_asset(session, scan: Scan, value: str, asset_type: AssetType, source: str, metadata: dict[str, Any]) -> Asset | None:
    if not scan.user_id or not value:
        return None
    now = datetime.now(timezone.utc)
    asset = (
        session.query(Asset)
        .filter(
            Asset.user_id == scan.user_id,
            Asset.value == value,
            Asset.asset_type == asset_type,
        )
        .first()
    )
    safe_metadata = {
        **metadata,
        "last_scan_id": str(scan.id),
        "discovered_by": source,
    }
    if asset:
        asset.last_seen_at = now
        asset.scan_id = scan.id
        asset.program_id = scan.program_id or asset.program_id
        asset.source = asset.source or source
        asset.metadata_json = {**(asset.metadata_json or {}), **safe_metadata}
        return asset

    asset = Asset(
        user_id=scan.user_id,
        program_id=scan.program_id,
        scan_id=scan.id,
        value=value,
        asset_type=asset_type,
        source=source,
        metadata_json=safe_metadata,
        first_seen_at=now,
        last_seen_at=now,
    )
    session.add(asset)
    session.flush()
    return asset


def _persist_discovered_surface(session, scan: Scan, scan_results: dict[str, Any] | None) -> None:
    """Retain all useful routes/subdomains from recon with route intent labels."""
    if not scan_results or not scan.user_id:
        return

    candidates: list[tuple[str, AssetType, str, Any]] = []
    for item in scan_results.get("subdomains", []) or []:
        value = _surface_value_from_item(item, ("host", "input", "url"))
        if value:
            candidates.append((value, AssetType.SUBDOMAIN, "subfinder", item))
    for item in scan_results.get("dns_records", []) or []:
        value = _surface_value_from_item(item, ("host", "input", "a", "aaaa"))
        if value:
            candidates.append((value, AssetType.SUBDOMAIN, "dnsx", item))
    for item in scan_results.get("live_hosts", []) or []:
        value = _surface_value_from_item(item, ("url", "host", "input"))
        if value:
            candidates.append((value, _asset_type_for_value(value), "httpx", item))
    for item in scan_results.get("crawled_endpoints", []) or []:
        value = _surface_value_from_item(item, ("url", "endpoint", "matched-at"))
        if value:
            candidates.append((value, _asset_type_for_value(value), "katana", item))
    for item in scan_results.get("api_discovered_routes", []) or []:
        value = _surface_value_from_item(item, ("url", "path"))
        if value:
            candidates.append((value, AssetType.API, "ffuf_api", item))
    for item in scan_results.get("api_schemas", []) or []:
        value = _surface_value_from_item(item, ("schema_url", "url"))
        if value:
            candidates.append((value, AssetType.API, "openapi", item))
    for item in scan_results.get("api_parameters", []) or []:
        value = _surface_value_from_item(item, ("url", "endpoint"))
        if value:
            candidates.append((value, AssetType.API, "arjun", item))

    seen: set[tuple[str, AssetType]] = set()
    unique_candidates: list[tuple[str, AssetType, str, Any, dict[str, Any]]] = []
    ai_input: list[dict[str, Any]] = []
    for value, asset_type, source, raw in candidates:
        normalized = value.strip()
        if not normalized:
            continue
        key = (normalized.lower(), asset_type)
        if key in seen:
            continue
        seen.add(key)
        base_classification = _classify_surface(normalized, asset_type, source, raw)
        unique_candidates.append((normalized, asset_type, source, raw, base_classification))
        ai_input.append(
            {
                "value": normalized[:2048],
                "asset_type": asset_type.value,
                "source": source,
                "path": base_classification.get("path"),
                "status": base_classification.get("status"),
            }
        )
        if len(unique_candidates) >= 1000:
            break

    ai_classifications = classify_attack_surface(ai_input[:150])
    retained = 0
    for normalized, asset_type, source, _raw, classification in unique_candidates:
        ai_classification = ai_classifications.get(normalized)
        if ai_classification:
            merged_signals = [
                str(signal)
                for signal in [*classification.get("signals", []), *ai_classification.get("signals", [])]
                if signal
            ]
            classification = {
                **classification,
                **ai_classification,
                "signals": sorted(set(merged_signals)),
            }
        else:
            classification = {**classification, "classifier": "local_fallback"}
        _upsert_discovered_asset(session, scan, normalized[:2048], asset_type, source, classification)
        retained += 1

    logger.info("Scan %s retained %s discovered surface assets", scan.id, retained)


def _upsert_asset_for_finding(session, scan: Scan, finding: dict[str, Any]) -> Asset | None:
    if not scan.user_id:
        return None
    value = str(finding.get("affected") or scan.url or "").strip()
    if not value:
        return None

    asset_type = _asset_type_for_value(value)
    now = datetime.now(timezone.utc)
    asset = (
        session.query(Asset)
        .filter(
            Asset.user_id == scan.user_id,
            Asset.value == value,
            Asset.asset_type == asset_type,
        )
        .first()
    )
    metadata = {
        "category": finding.get("category"),
        "severity": finding.get("severity"),
        "last_scan_id": str(scan.id),
    }
    if asset:
        asset.last_seen_at = now
        asset.scan_id = scan.id
        asset.program_id = scan.program_id or asset.program_id
        asset.metadata_json = {**(asset.metadata_json or {}), **metadata}
        return asset

    asset = Asset(
        user_id=scan.user_id,
        program_id=scan.program_id,
        scan_id=scan.id,
        value=value,
        asset_type=asset_type,
        source="ai_report",
        metadata_json=metadata,
        first_seen_at=now,
        last_seen_at=now,
    )
    session.add(asset)
    session.flush()
    return asset


def _persist_report_findings(session, scan: Scan, report: dict, scan_results: dict[str, Any] | None = None) -> None:
    """Create/update triageable findings and evidence from the final report."""
    if not scan.user_id:
        return

    findings = report.get("findings") if isinstance(report.get("findings"), list) else []
    if not findings:
        return

    now = datetime.now(timezone.utc)
    seen_keys: set[str] = set()
    for item in findings:
        if not isinstance(item, dict):
            continue
        dedupe_key = _finding_dedupe_key(scan.user_id, item)
        if dedupe_key in seen_keys:
            continue
        seen_keys.add(dedupe_key)

        asset = _upsert_asset_for_finding(session, scan, item)
        severity = _normalize_finding_severity(item.get("severity"))
        finding = (
            session.query(Finding)
            .filter(Finding.user_id == scan.user_id, Finding.dedupe_key == dedupe_key)
            .first()
        )
        if finding:
            finding.last_seen_at = now
            finding.scan_id = scan.id
            finding.asset_id = asset.id if asset else finding.asset_id
            finding.program_id = scan.program_id or finding.program_id
            finding.title = str(item.get("title") or finding.title)[:255]
            finding.category = str(item.get("category") or finding.category or "other")[:80]
            finding.severity = severity
            finding.affected = str(item.get("affected") or finding.affected or scan.url)[:2048]
            finding.evidence_summary = item.get("evidence") or finding.evidence_summary
            finding.what_it_means = item.get("what_it_means") or finding.what_it_means
            finding.remediation = item.get("how_to_fix") if isinstance(item.get("how_to_fix"), list) else finding.remediation
            finding.fix_prompt = item.get("fix_prompt") or finding.fix_prompt
        else:
            finding = Finding(
                user_id=scan.user_id,
                program_id=scan.program_id,
                scan_id=scan.id,
                asset_id=asset.id if asset else None,
                title=str(item.get("title") or "Untitled finding")[:255],
                category=str(item.get("category") or "other")[:80],
                severity=severity,
                affected=str(item.get("affected") or scan.url)[:2048],
                evidence_summary=item.get("evidence"),
                what_it_means=item.get("what_it_means"),
                remediation=item.get("how_to_fix") if isinstance(item.get("how_to_fix"), list) else [],
                fix_prompt=item.get("fix_prompt"),
                source="ai_report",
                dedupe_key=dedupe_key,
                first_seen_at=now,
                last_seen_at=now,
            )
            session.add(finding)
            session.flush()

        evidence_payload = {
            "finding": item,
            "scan_id": str(scan.id),
            "url": scan.url,
        }
        if scan_results:
            evidence_payload["scan_overview"] = {
                key: len(value) if isinstance(value, list) else bool(value)
                for key, value in scan_results.items()
                if key in {
                    "subdomains",
                    "dns_records",
                    "live_hosts",
                    "open_ports",
                    "crawled_endpoints",
                    "api_discovered_routes",
                    "vulnerabilities",
                    "api_vulnerabilities",
                    "xss_findings",
                }
            }
        session.add(
            Evidence(
                finding_id=finding.id,
                evidence_type=EvidenceType.SCANNER_JSON,
                title=f"Scan evidence for {str(item.get('title') or 'finding')[:120]}",
                content=item.get("evidence"),
                raw_json=evidence_payload,
            )
        )


def _set_scan_complete(scan_id: str, report: dict, scan_results: dict[str, Any] | None = None) -> None:
    """Mark a scan as complete and save the report and token usage."""
    with get_db_session() as session:
        scan = session.query(Scan).filter(Scan.id == scan_id).first()
        if scan:
            scan.status = ScanStatus.COMPLETE
            scan.progress_step = 7
            scan.report = report
            # Ensure all sub-tasks are marked complete
            if scan.sub_tasks:
                scan.sub_tasks = {k: "complete" for k in scan.sub_tasks}
            scan.updated_at = datetime.now(timezone.utc)

            # Save token usage if available
            token_usage = report.get("_token_usage")
            if token_usage:
                model_used = report.get("_model_used")
                prompt_tokens = token_usage.get("prompt_tokens", 0)
                completion_tokens = token_usage.get("completion_tokens", 0)
                token_record = TokenUsage(
                    scan_id=scan.id,
                    user_id=scan.user_id,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    total_tokens=token_usage.get("total_tokens", 0),
                    model=model_used,
                    estimated_cost=format_usd(estimate_ai_cost_usd(model_used, prompt_tokens, completion_tokens)),
                )
                session.add(token_record)
                logger.info(
                    f"Token usage recorded for scan {scan_id}: "
                    f"{token_usage.get('total_tokens', 0)} tokens"
                )

            _persist_discovered_surface(session, scan, scan_results)
            _persist_report_findings(session, scan, report, scan_results)
            session.commit()
            publish_scan_event(scan, "scan.completed")
            try:
                from pdf_storage import generate_and_store_pdf

                stored_pdf_ref = generate_and_store_pdf(
                    scan_id=str(scan.id),
                    url=scan.url,
                    report_data=report,
                )
                if stored_pdf_ref:
                    scan.pdf_url = stored_pdf_ref
                    scan.updated_at = datetime.now(timezone.utc)
                    _queue_completion_email(session, scan)
                    session.commit()
                    publish_scan_event(scan, "scan.completed")
                    logger.info(f"PDF generated automatically for scan {scan_id}")
                else:
                    logger.warning(f"PDF auto-generation returned no object reference for scan {scan_id}")
            except Exception as pdf_error:
                logger.warning(f"PDF auto-generation failed for scan {scan_id}: {pdf_error}")
            logger.info(f"Scan {scan_id} completed successfully")


def _load_scan_auth_headers(scan_id: str) -> tuple[dict[str, str], dict[str, Any] | None]:
    """Load decrypted auth headers for a scan, returning only safe metadata too."""
    with get_db_session() as session:
        scan = session.query(Scan).filter(Scan.id == scan_id).first()
        if not scan or not scan.auth_profile_id:
            return {}, None
        profile = (
            session.query(AuthProfile)
            .filter(AuthProfile.id == scan.auth_profile_id, AuthProfile.is_active == True)
            .first()
        )
        if not profile:
            logger.warning("Scan %s references a missing or inactive auth profile", scan_id)
            return {}, None
        try:
            headers = decrypt_auth_headers(profile.encrypted_headers)
        except AuthProfileError as e:
            logger.warning("Scan %s auth profile could not be decrypted: %s", scan_id, e)
            return {}, None
        return headers, {
            "auth_profile_id": str(profile.id),
            "auth_profile_name": profile.name,
            "header_names": profile.header_names or list(headers.keys()),
        }


def _redact_auth_values(value: Any, secrets: list[str]) -> Any:
    if not secrets:
        return value
    if isinstance(value, str):
        redacted = value
        for secret in secrets:
            if secret:
                redacted = redacted.replace(secret, "[redacted-auth]")
        return redacted
    if isinstance(value, list):
        return [_redact_auth_values(item, secrets) for item in value]
    if isinstance(value, dict):
        return {key: _redact_auth_values(item, secrets) for key, item in value.items()}
    return value


async def _run_pipeline(scan_id: str, url: str) -> None:
    """
    Execute the full 7-step scanning pipeline asynchronously with parallel execution.

    Pipeline phases:
    1. subfinder (sequential - must complete first)
    2. httpx + naabu (parallel - httpx needs subfinder results, naabu is independent)
    3. katana + nuclei + testssl (parallel - all independent)
    4. AI report generation (sequential - needs all results)
    """
    domain = extract_domain(url)
    scan_results = {}
    scan_id_str = str(scan_id)
    auth_headers, auth_context = _load_scan_auth_headers(scan_id_str)
    if auth_context:
        scan_results["auth_context"] = auth_context
    pipeline_slots = asyncio.Semaphore(max(1, settings.SCAN_PIPELINE_PARALLELISM))

    async def limited(task_name: str, task_coro):
        async with pipeline_slots:
            logger.info(f"Scan {scan_id_str}: acquired pipeline slot for {task_name}")
            return await task_coro()

    try:
        # Phase 1 — Subdomain discovery (sequential, must complete first)
        _update_scan_progress(scan_id_str, 1)
        _update_subtask(scan_id_str, "subfinder", "running")
        try:
            subdomains = await run_subfinder(domain, scan_id_str)
            scan_results["subdomains"] = subdomains
            _update_subtask(scan_id_str, "subfinder", "complete")
        except Exception as e:
            logger.warning(f"subfinder failed (non-fatal): {e}")
            scan_results["subdomains"] = []
            _update_subtask(scan_id_str, "subfinder", "failed")

        # Phase 2 — DNS resolution + port scanning + HTTP probing.
        # Port scanning is independent, so it starts while DNS data is prepared
        # for httpx. This keeps the pipeline moving without increasing scan count.
        _update_scan_progress(scan_id_str, 2)

        async def run_dnsx_task():
            """DNS resolution task."""
            _update_subtask(scan_id_str, "dnsx", "running")
            try:
                domains_to_resolve = [domain]
                for sub in scan_results.get("subdomains", []):
                    if isinstance(sub, dict) and "host" in sub:
                        domains_to_resolve.append(str(sub["host"]))
                    elif isinstance(sub, str):
                        domains_to_resolve.append(sub)
                dns_records = await run_dnsx(scan_id_str, domains_to_resolve)
                scan_results["dns_records"] = dns_records
                _update_subtask(scan_id_str, "dnsx", "complete")
                return "success"
            except Exception as e:
                logger.warning(f"dnsx failed (non-fatal): {e}")
                scan_results["dns_records"] = []
                _update_subtask(scan_id_str, "dnsx", "failed")
                return "failed"

        async def run_httpx_task():
            """HTTP probing task."""
            _update_subtask(scan_id_str, "httpx", "running")
            try:
                # Build list of domains to probe: original + discovered subdomains
                domains_to_probe = []
                for item in scan_results.get("dns_records", []):
                    if isinstance(item, dict):
                        host = item.get("host") or item.get("input")
                        if host:
                            domains_to_probe.append(str(host))
                if not domains_to_probe:
                    domains_to_probe = [domain]
                    for sub in scan_results.get("subdomains", []):
                        if isinstance(sub, dict) and "host" in sub:
                            domains_to_probe.append(sub["host"])

                live_hosts = await run_httpx(
                    scan_id_str,
                    domains=domains_to_probe[:100],  # Cap at 100 to avoid timeouts
                )
                scan_results["live_hosts"] = live_hosts
                _update_subtask(scan_id_str, "httpx", "complete")
                return "success"
            except Exception as e:
                logger.warning(f"httpx failed (non-fatal): {e}")
                scan_results["live_hosts"] = []
                _update_subtask(scan_id_str, "httpx", "failed")
                return "failed"

        async def run_naabu_task():
            """Port scanning task."""
            _update_subtask(scan_id_str, "naabu", "running")
            try:
                open_ports = await run_naabu(domain, scan_id_str)
                scan_results["open_ports"] = open_ports
                _update_subtask(scan_id_str, "naabu", "complete")
                return "success"
            except Exception as e:
                logger.warning(f"naabu failed (non-fatal): {e}")
                scan_results["open_ports"] = []
                _update_subtask(scan_id_str, "naabu", "failed")
                return "failed"

        logger.info(f"Scan {scan_id_str}: Starting parallel phase 2 (dnsx + naabu, then httpx)")
        naabu_future = asyncio.create_task(limited("naabu", run_naabu_task))
        await limited("dnsx", run_dnsx_task)
        await limited("httpx", run_httpx_task)
        await naabu_future
        logger.info(f"Scan {scan_id_str}: Phase 2 complete")

        # Phase 3 — Crawl first, then run active checks.
        _update_scan_progress(scan_id_str, 4)

        async def run_katana_task():
            """Web crawling task."""
            _update_subtask(scan_id_str, "katana", "running")
            try:
                crawled = await run_katana(url, scan_id_str, auth_headers=auth_headers)
                scan_results["crawled_endpoints"] = crawled
                _update_subtask(scan_id_str, "katana", "complete")
                return "success"
            except Exception as e:
                logger.warning(f"katana failed (non-fatal): {e}")
                scan_results["crawled_endpoints"] = []
                _update_subtask(scan_id_str, "katana", "failed")
                return "failed"

        async def run_webcheck_task():
            """Fast passive website intelligence task."""
            _update_subtask(scan_id_str, "webcheck", "running")
            try:
                enrichment = await run_webcheck_enrichment(
                    url,
                    scan_id_str,
                    open_ports=scan_results.get("open_ports", []),
                    auth_headers=auth_headers,
                )
                scan_results["webcheck"] = enrichment
                _update_subtask(scan_id_str, "webcheck", "complete")
                return "success"
            except Exception as e:
                logger.warning(f"webcheck enrichment failed (non-fatal): {e}")
                scan_results["webcheck"] = {}
                _update_subtask(scan_id_str, "webcheck", "failed")
                return "failed"

        async def run_nuclei_task():
            """Vulnerability scanning task."""
            _update_subtask(scan_id_str, "nuclei", "running")
            try:
                vulns = await run_nuclei(url, scan_id_str, auth_headers=auth_headers)
                scan_results["vulnerabilities"] = vulns
                _update_subtask(scan_id_str, "nuclei", "complete")
                return "success"
            except Exception as e:
                logger.warning(f"nuclei failed (non-fatal): {e}")
                scan_results["vulnerabilities"] = []
                _update_subtask(scan_id_str, "nuclei", "failed")
                return "failed"

        async def run_webanalyze_task():
            """Broad technology fingerprinting task."""
            _update_subtask(scan_id_str, "webanalyze", "running")
            try:
                technologies = await run_webanalyze(url, scan_id_str)
                scan_results["technology_fingerprints"] = technologies
                _update_subtask(scan_id_str, "webanalyze", "complete")
                return "success"
            except Exception as e:
                logger.warning(f"webanalyze failed (non-fatal): {e}")
                scan_results["technology_fingerprints"] = []
                _update_subtask(scan_id_str, "webanalyze", "failed")
                return "failed"

        async def run_wafw00f_task():
            """WAF and security-edge fingerprinting task."""
            _update_subtask(scan_id_str, "wafw00f", "running")
            try:
                waf = await run_wafw00f(url, scan_id_str)
                scan_results["waf_detection"] = waf
                _update_subtask(scan_id_str, "wafw00f", "complete")
                return "success"
            except Exception as e:
                logger.warning(f"wafw00f failed (non-fatal): {e}")
                scan_results["waf_detection"] = {}
                _update_subtask(scan_id_str, "wafw00f", "failed")
                return "failed"

        async def run_ffuf_api_task():
            """Hidden API route discovery."""
            _update_subtask(scan_id_str, "ffuf_api", "running")
            try:
                routes = await run_ffuf_api_discovery(url, scan_id_str, auth_headers=auth_headers)
                scan_results["api_discovered_routes"] = routes
                _update_subtask(scan_id_str, "ffuf_api", "complete")
                return "success"
            except Exception as e:
                logger.warning(f"ffuf api discovery failed (non-fatal): {e}")
                scan_results["api_discovered_routes"] = []
                _update_subtask(scan_id_str, "ffuf_api", "failed")
                return "failed"

        async def run_nuclei_api_task():
            """API-focused vulnerability and exposure checks."""
            _update_subtask(scan_id_str, "nuclei_api", "running")
            try:
                api_vulns = await run_nuclei_api_checks(url, scan_id_str, auth_headers=auth_headers)
                scan_results["api_vulnerabilities"] = api_vulns
                _update_subtask(scan_id_str, "nuclei_api", "complete")
                return "success"
            except Exception as e:
                logger.warning(f"nuclei api checks failed (non-fatal): {e}")
                scan_results["api_vulnerabilities"] = []
                _update_subtask(scan_id_str, "nuclei_api", "failed")
                return "failed"

        async def run_arjun_task():
            """API parameter discovery task."""
            _update_subtask(scan_id_str, "arjun", "running")
            try:
                params = await run_arjun_parameter_discovery(
                    url,
                    scan_id_str,
                    crawled_endpoints=scan_results.get("crawled_endpoints", []),
                    ffuf_routes=scan_results.get("api_discovered_routes", []),
                )
                scan_results["api_parameters"] = params
                _update_subtask(scan_id_str, "arjun", "complete")
                return "success"
            except Exception as e:
                logger.warning(f"arjun parameter discovery failed (non-fatal): {e}")
                scan_results["api_parameters"] = []
                _update_subtask(scan_id_str, "arjun", "failed")
                return "failed"

        async def run_openapi_task():
            """OpenAPI/Swagger schema discovery task."""
            _update_subtask(scan_id_str, "openapi", "running")
            try:
                schemas = await run_openapi_schema_discovery(
                    url,
                    scan_id_str,
                    crawled_endpoints=scan_results.get("crawled_endpoints", []),
                    ffuf_routes=scan_results.get("api_discovered_routes", []),
                    auth_headers=auth_headers,
                )
                scan_results["api_schemas"] = schemas
                _update_subtask(scan_id_str, "openapi", "complete")
                return "success"
            except Exception as e:
                logger.warning(f"openapi schema discovery failed (non-fatal): {e}")
                scan_results["api_schemas"] = []
                _update_subtask(scan_id_str, "openapi", "failed")
                return "failed"

        async def run_testssl_task():
            """TLS/SSL analysis task."""
            _update_scan_progress(scan_id_str, 6)
            _update_subtask(scan_id_str, "testssl", "running")
            try:
                tls = await run_testssl(url, scan_id_str)
                scan_results["tls_analysis"] = tls
                _update_subtask(scan_id_str, "testssl", "complete")
                return "success"
            except Exception as e:
                logger.warning(f"testssl failed (non-fatal): {e}")
                scan_results["tls_analysis"] = []
                _update_subtask(scan_id_str, "testssl", "failed")
                return "failed"

        async def run_tlsx_task():
            """Broad TLS inventory task."""
            _update_subtask(scan_id_str, "tlsx", "running")
            try:
                targets = []
                for item in scan_results.get("live_hosts", []):
                    if isinstance(item, dict):
                        value = item.get("url") or item.get("host") or item.get("input")
                        if value:
                            targets.append(str(value))
                if not targets:
                    targets = [url]
                tls_inventory = await run_tlsx(scan_id_str, targets)
                scan_results["tls_inventory"] = tls_inventory
                _update_subtask(scan_id_str, "tlsx", "complete")
                return "success"
            except Exception as e:
                logger.warning(f"tlsx failed (non-fatal): {e}")
                scan_results["tls_inventory"] = []
                _update_subtask(scan_id_str, "tlsx", "failed")
                return "failed"

        async def run_dalfox_task():
            """Active XSS scanning task (best-effort)."""
            _update_subtask(scan_id_str, "dalfox", "running")
            try:
                xss = await run_dalfox(
                    url,
                    scan_id_str,
                    crawled_endpoints=scan_results.get("crawled_endpoints", []),
                    auth_headers=auth_headers,
                )
                scan_results["xss_findings"] = xss
                _update_subtask(scan_id_str, "dalfox", "complete")
                return "success"
            except Exception as e:
                logger.warning(f"dalfox failed (non-fatal): {e}")
                scan_results["xss_findings"] = []
                _update_subtask(scan_id_str, "dalfox", "failed")
                return "failed"

        # Crawl, passive enrichment, and API wordlist discovery can run together;
        # active checks wait for crawl/API route candidates.
        logger.info(f"Scan {scan_id_str}: Starting phase 3a (katana + webcheck + fingerprinting + ffuf)")
        await asyncio.gather(
            limited("katana", run_katana_task),
            limited("webcheck", run_webcheck_task),
            limited("webanalyze", run_webanalyze_task),
            limited("wafw00f", run_wafw00f_task),
            limited("ffuf_api", run_ffuf_api_task),
        )
        logger.info(f"Scan {scan_id_str}: Starting phase 3c (nuclei + api checks + schema + testssl + dalfox + arjun)")
        await asyncio.gather(
            limited("nuclei", run_nuclei_task),
            limited("nuclei_api", run_nuclei_api_task),
            limited("openapi", run_openapi_task),
            limited("testssl", run_testssl_task),
            limited("tlsx", run_tlsx_task),
            limited("dalfox", run_dalfox_task),
            limited("arjun", run_arjun_task),
        )
        logger.info(f"Scan {scan_id_str}: Phase 3 complete")

        # Step 7 — AI report generation
        _update_scan_progress(scan_id_str, 7)
        _update_subtask(scan_id_str, "ai", "running")
        scan_results = _redact_auth_values(scan_results, list(auth_headers.values()))
        report = generate_report(url, scan_results)
        _update_subtask(scan_id_str, "ai", "complete")

        # Save report and mark complete
        _set_scan_complete(scan_id_str, report, scan_results)

    except Exception as e:
        logger.exception(f"Pipeline failed for scan {scan_id_str}")
        _set_scan_failed(scan_id_str, str(e))
        raise

    finally:
        # Clean up temporary files
        try:
            cleanup_scan_files(scan_id_str)
        except Exception as e:
            logger.warning(f"Cleanup failed for {scan_id_str}: {e}")


@celery_app.task(
    name="run_scan",
    bind=True,
    max_retries=0,
    acks_late=True,
    reject_on_worker_lost=True,
)
def run_scan(self, scan_id: str, url: str) -> dict:
    """
    Celery task entry point for running a full security scan.

    Executes the async pipeline in a new event loop (Celery workers are sync).
    Updates scan status and progress throughout.

    Args:
        scan_id: UUID of the scan record
        url: Target URL to scan

    Returns:
        Dict with scan_id and final status
    """
    logger.info(f"Starting scan task: scan_id={scan_id}, url={url}")

    try:
        # Update status to running
        _update_scan_progress(scan_id, 0, ScanStatus.RUNNING)

        # Run the async pipeline in a new event loop
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(_run_pipeline(scan_id, url))
        finally:
            loop.close()

        return {"scan_id": scan_id, "status": "complete"}

    except SoftTimeLimitExceeded:
        _set_scan_failed(scan_id, "Scan timed out — exceeded maximum allowed time.")
        return {"scan_id": scan_id, "status": "failed"}

    except Exception as e:
        _set_scan_failed(scan_id, str(e))
        return {"scan_id": scan_id, "status": "failed"}
