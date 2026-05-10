"""
ScanAI — Celery task pipeline for security scanning.
Orchestrates the 7-step scan process: subfinder → httpx → naabu → katana → nuclei → testssl → Gemini.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from celery import Celery
from celery.exceptions import SoftTimeLimitExceeded

from config import settings
from database import get_db_session
from models import Scan, ScanStatus, TokenUsage
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
    run_testssl,
    run_dalfox,
    cleanup_scan_files,
)
from ai import generate_report
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


def _set_scan_complete(scan_id: str, report: dict) -> None:
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
                token_record = TokenUsage(
                    scan_id=scan.id,
                    user_id=scan.user_id,
                    prompt_tokens=token_usage.get("prompt_tokens", 0),
                    completion_tokens=token_usage.get("completion_tokens", 0),
                    total_tokens=token_usage.get("total_tokens", 0),
                    model=report.get("_model_used"),
                    estimated_cost=None,  # Can be calculated based on model pricing
                )
                session.add(token_record)
                logger.info(
                    f"Token usage recorded for scan {scan_id}: "
                    f"{token_usage.get('total_tokens', 0)} tokens"
                )

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
                    session.commit()
                    publish_scan_event(scan, "scan.completed")
                    logger.info(f"PDF generated automatically for scan {scan_id}")
                else:
                    logger.warning(f"PDF auto-generation returned no object reference for scan {scan_id}")
            except Exception as pdf_error:
                logger.warning(f"PDF auto-generation failed for scan {scan_id}: {pdf_error}")
            logger.info(f"Scan {scan_id} completed successfully")


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
        except Exception as e:
            logger.warning(f"dnsx failed (non-fatal): {e}")
            scan_results["dns_records"] = []
            _update_subtask(scan_id_str, "dnsx", "failed")

        # Phase 2 — HTTP probing + Port scanning (parallel execution)
        _update_scan_progress(scan_id_str, 2)

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

        # Run httpx and naabu in parallel
        logger.info(f"Scan {scan_id_str}: Starting parallel phase 2 (httpx + naabu)")
        await asyncio.gather(run_httpx_task(), run_naabu_task())
        logger.info(f"Scan {scan_id_str}: Phase 2 complete")

        # Phase 3 — Crawl first, then run active checks.
        _update_scan_progress(scan_id_str, 4)

        async def run_katana_task():
            """Web crawling task."""
            _update_subtask(scan_id_str, "katana", "running")
            try:
                crawled = await run_katana(url, scan_id_str)
                scan_results["crawled_endpoints"] = crawled
                _update_subtask(scan_id_str, "katana", "complete")
                return "success"
            except Exception as e:
                logger.warning(f"katana failed (non-fatal): {e}")
                scan_results["crawled_endpoints"] = []
                _update_subtask(scan_id_str, "katana", "failed")
                return "failed"

        async def run_nuclei_task():
            """Vulnerability scanning task."""
            _update_subtask(scan_id_str, "nuclei", "running")
            try:
                vulns = await run_nuclei(url, scan_id_str)
                scan_results["vulnerabilities"] = vulns
                _update_subtask(scan_id_str, "nuclei", "complete")
                return "success"
            except Exception as e:
                logger.warning(f"nuclei failed (non-fatal): {e}")
                scan_results["vulnerabilities"] = []
                _update_subtask(scan_id_str, "nuclei", "failed")
                return "failed"

        async def run_ffuf_api_task():
            """Hidden API route discovery."""
            _update_subtask(scan_id_str, "ffuf_api", "running")
            try:
                routes = await run_ffuf_api_discovery(url, scan_id_str)
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
                api_vulns = await run_nuclei_api_checks(url, scan_id_str)
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
                )
                scan_results["xss_findings"] = xss
                _update_subtask(scan_id_str, "dalfox", "complete")
                return "success"
            except Exception as e:
                logger.warning(f"dalfox failed (non-fatal): {e}")
                scan_results["xss_findings"] = []
                _update_subtask(scan_id_str, "dalfox", "failed")
                return "failed"

        # Crawl first (to feed active checks), then run vuln/TLS/XSS in parallel.
        logger.info(f"Scan {scan_id_str}: Starting phase 3a (katana)")
        await run_katana_task()
        logger.info(f"Scan {scan_id_str}: Starting phase 3b (ffuf api discovery)")
        await run_ffuf_api_task()
        logger.info(f"Scan {scan_id_str}: Starting phase 3c (nuclei + api checks + schema + testssl + dalfox + arjun)")
        await asyncio.gather(
            run_nuclei_task(),
            run_nuclei_api_task(),
            run_openapi_task(),
            run_testssl_task(),
            run_tlsx_task(),
            run_dalfox_task(),
            run_arjun_task(),
        )
        logger.info(f"Scan {scan_id_str}: Phase 3 complete")

        # Step 7 — AI report generation
        _update_scan_progress(scan_id_str, 7)
        _update_subtask(scan_id_str, "ai", "running")
        report = generate_report(url, scan_results)
        _update_subtask(scan_id_str, "ai", "complete")

        # Save report and mark complete
        _set_scan_complete(scan_id_str, report)

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
