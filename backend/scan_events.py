"""
ScanAI scan event publishing.
Small Redis pub/sub bridge used by API routes and Celery workers.
"""

import json
import logging
from typing import Any

import redis

from config import settings

logger = logging.getLogger(__name__)

SCAN_EVENTS_CHANNEL = "scanai:scan-events"


def _status_value(status: Any) -> str:
    return getattr(status, "value", str(status))


def scan_event_payload(scan: Any, event_type: str) -> dict[str, Any]:
    report = scan.report if isinstance(scan.report, dict) else {}
    findings = report.get("findings") if isinstance(report.get("findings"), list) else []

    return {
        "type": event_type,
        "scan": {
            "id": str(scan.id),
            "url": scan.url,
            "status": _status_value(scan.status),
            "progress_step": scan.progress_step,
            "findings_count": len(findings),
            "pdf_url": f"/api/scans/{scan.id}/pdf" if getattr(scan, "pdf_url", None) else None,
            "created_at": scan.created_at.isoformat() if getattr(scan, "created_at", None) else None,
        },
        "user_id": str(scan.user_id) if getattr(scan, "user_id", None) else None,
    }


def publish_scan_event(scan: Any, event_type: str = "scan.updated") -> None:
    """Publish a scan lifecycle event for WebSocket relays."""
    try:
        client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
        client.publish(SCAN_EVENTS_CHANNEL, json.dumps(scan_event_payload(scan, event_type)))
    except Exception as exc:
        logger.warning("Unable to publish scan event %s: %s", event_type, exc)
