"""
ScanAI — Celery task pipeline for security scanning.
Orchestrates the 7-step scan process: subfinder → httpx → naabu → katana → nuclei → testssl → Claude AI.
"""

import asyncio
import logging
from datetime import datetime, timezone

from celery import Celery
from celery.exceptions import SoftTimeLimitExceeded

from config import settings
from database import get_db_session
from models import Scan, ScanStatus
from validators import extract_domain

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
            scan.updated_at = datetime.now(timezone.utc)
            session.commit()
            logger.info(f"Scan {scan_id}: step {step} — {STEP_LABELS.get(step, 'Unknown')}")


def _set_scan_failed(scan_id: str, error: str) -> None:
    """Mark a scan as failed with error message."""
    with get_db_session() as session:
        scan = session.query(Scan).filter(Scan.id == scan_id).first()
        if scan:
            scan.status = ScanStatus.FAILED
            scan.error = error[:2000]  # Truncate long errors
            scan.updated_at = datetime.now(timezone.utc)
            session.commit()
            logger.error(f"Scan {scan_id} failed: {error[:200]}")


def _set_scan_complete(scan_id: str, report: dict) -> None:
    """Mark a scan as complete and save the report."""
    with get_db_session() as session:
        scan = session.query(Scan).filter(Scan.id == scan_id).first()
        if scan:
            scan.status = ScanStatus.COMPLETE
            scan.progress_step = 7
            scan.report = report
            scan.updated_at = datetime.now(timezone.utc)
            session.commit()
            logger.info(f"Scan {scan_id} completed successfully")


async def _run_pipeline(scan_id: str, url: str) -> None:
    """
    Execute the full 7-step scanning pipeline asynchronously.
    Each step updates progress in the database.
    """
    # Import scanner and ai modules here to avoid circular imports
    from scanner import (
        run_subfinder,
        run_httpx,
        run_naabu,
        run_katana,
        run_nuclei,
        run_testssl,
        cleanup_scan_files,
    )
    from ai import generate_report

    domain = extract_domain(url)
    scan_results = {}
    scan_id_str = str(scan_id)

    try:
        # Step 1 — Subdomain discovery
        _update_scan_progress(scan_id_str, 1)
        try:
            subdomains = await run_subfinder(domain, scan_id_str)
            scan_results["subdomains"] = subdomains
        except Exception as e:
            logger.warning(f"subfinder failed (non-fatal): {e}")
            scan_results["subdomains"] = []

        # Step 2 — HTTP probing
        _update_scan_progress(scan_id_str, 2)
        try:
            # Build list of domains to probe: original + discovered subdomains
            domains_to_probe = [domain]
            for sub in scan_results["subdomains"]:
                if isinstance(sub, dict) and "host" in sub:
                    domains_to_probe.append(sub["host"])

            live_hosts = await run_httpx(
                scan_id_str,
                domains=domains_to_probe[:100],  # Cap at 100 to avoid timeouts
            )
            scan_results["live_hosts"] = live_hosts
        except Exception as e:
            logger.warning(f"httpx failed (non-fatal): {e}")
            scan_results["live_hosts"] = []

        # Step 3 — Port scanning
        _update_scan_progress(scan_id_str, 3)
        try:
            open_ports = await run_naabu(domain, scan_id_str)
            scan_results["open_ports"] = open_ports
        except Exception as e:
            logger.warning(f"naabu failed (non-fatal): {e}")
            scan_results["open_ports"] = []

        # Step 4 — Web crawling
        _update_scan_progress(scan_id_str, 4)
        try:
            crawled = await run_katana(url, scan_id_str)
            scan_results["crawled_endpoints"] = crawled
        except Exception as e:
            logger.warning(f"katana failed (non-fatal): {e}")
            scan_results["crawled_endpoints"] = []

        # Step 5 — Vulnerability scanning
        _update_scan_progress(scan_id_str, 5)
        try:
            vulns = await run_nuclei(url, scan_id_str)
            scan_results["vulnerabilities"] = vulns
        except Exception as e:
            logger.warning(f"nuclei failed (non-fatal): {e}")
            scan_results["vulnerabilities"] = []

        # Step 6 — TLS/SSL analysis
        _update_scan_progress(scan_id_str, 6)
        try:
            tls = await run_testssl(url, scan_id_str)
            scan_results["tls_analysis"] = tls
        except Exception as e:
            logger.warning(f"testssl failed (non-fatal): {e}")
            scan_results["tls_analysis"] = []

        # Step 7 — AI report generation
        _update_scan_progress(scan_id_str, 7)
        report = generate_report(url, scan_results)

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
