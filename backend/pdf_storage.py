"""
ScanAI — HTML-to-PDF report generation and MinIO storage.

This module renders an internal HTML report from normalized scan results,
prints it to a 9:16 PDF using a local Chromium-compatible browser, and
uploads the final PDF to MinIO.
"""

from __future__ import annotations

import io
import logging
import shutil
import subprocess
import tempfile
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse
from xml.sax.saxutils import escape

from minio import Minio
from minio.error import S3Error

from config import settings
from security_memo_pdf import generate_security_memo

logger = logging.getLogger(__name__)

SEVERITY_ORDER = {
    "critical": 0,
    "high": 1,
    "medium": 2,
    "low": 3,
    "info": 4,
}

SEVERITY_META = {
    "critical": {
        "label": "Critical",
        "chip_class": "critical",
        "accent": "#EB001B",
        "soft": "#FFF0F0",
    },
    "high": {
        "label": "High",
        "chip_class": "high",
        "accent": "#CF4500",
        "soft": "#FFF4ED",
    },
    "medium": {
        "label": "Medium",
        "chip_class": "medium",
        "accent": "#F79E1B",
        "soft": "#FFF9EA",
    },
    "low": {
        "label": "Low",
        "chip_class": "low",
        "accent": "#3860BE",
        "soft": "#EFF4FF",
    },
    "info": {
        "label": "Info",
        "chip_class": "info",
        "accent": "#696969",
        "soft": "#F5F5F4",
    },
}

CATEGORY_COLORS = ["#CF4500", "#F79E1B", "#3860BE", "#141413", "#F37338"]

DEFAULT_PRIORITY_ACTIONS = [
    "Review the findings with your engineering or IT owner.",
    "Fix the highest-severity internet-facing issue first.",
    "Re-run the scan after remediation to confirm closure.",
]


def _safe_text(value: object) -> str:
    """Escape untrusted text for HTML output."""
    if value is None:
        return ""
    return escape(str(value))


def _safe_multiline(value: object) -> str:
    """Escape and preserve line breaks."""
    return _safe_text(value).replace("\n", "<br/>")


def _truncate(value: object, limit: int) -> str:
    """Trim long strings while preserving a clean visual layout."""
    text = str(value or "").strip()
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 1)].rstrip() + "…"


def _normalize_steps(value: object) -> list[str]:
    """Normalize remediation steps into a compact list."""
    if not value:
        return []

    if isinstance(value, list):
        return [str(step).strip() for step in value if str(step).strip()]

    text = str(value).strip()
    if not text:
        return []

    if "\n" in text:
        parts = [part.strip("-• \t") for part in text.splitlines()]
        return [part for part in parts if part]

    if "; " in text:
        parts = [part.strip() for part in text.split(";")]
        return [part for part in parts if part]

    return [text]


def _fallback_fix_steps(category: str, affected: str) -> list[str]:
    """Return reliable fallback remediation guidance when the model omits it."""
    target = affected or "the affected system"
    category = (category or "other").lower()

    if category == "tls":
        return [
            f"Review the TLS configuration on {target} and disable legacy protocols such as TLS 1.0 and TLS 1.1.",
            "Restrict the service to modern cipher suites and current HTTPS best practices.",
            "Re-run a TLS scan against the same host to confirm the transport settings are clean.",
        ]

    if category == "headers":
        return [
            f"Add missing security headers on {target}, especially HSTS and Content-Security-Policy where appropriate.",
            "Validate the headers on the main routes and on any authenticated areas of the application.",
            "Re-test the public pages to confirm the new headers are consistently returned.",
        ]

    if category in {"network", "exposure", "misconfiguration"}:
        return [
            f"Review why {target} is publicly reachable and reduce exposure where possible.",
            "Tighten the relevant service or infrastructure configuration and remove unnecessary access paths.",
            "Repeat the scan to verify the exposed signal no longer appears.",
        ]

    if category in {"authentication", "injection", "xss", "information_disclosure"}:
        return [
            f"Patch the application logic behind {target} and add the relevant validation or access control improvements.",
            "Test the fix in staging before promoting it to production.",
            "Re-run the affected checks to confirm the issue is resolved.",
        ]

    return [
        f"Review the issue affecting {target} and identify the responsible service or owner.",
        "Apply the recommended hardening or code fix and validate it in a safe environment first.",
        "Run the scan again to verify the finding is no longer present.",
    ]


def _normalize_priority_actions(report_data: dict[str, Any], findings: list[dict[str, Any]]) -> list[str]:
    """Return concise top-level owner actions."""
    actions = report_data.get("priority_actions")
    normalized: list[str] = []

    if isinstance(actions, list):
        for action in actions:
            text = str(action).strip()
            if text and text not in normalized:
                normalized.append(_truncate(text, 120))

    if not normalized:
        for finding in findings:
            steps = finding["steps"]
            if steps:
                candidate = _truncate(steps[0], 120)
                if candidate not in normalized:
                    normalized.append(candidate)
            if len(normalized) >= 4:
                break

    if not normalized:
        normalized = DEFAULT_PRIORITY_ACTIONS[:]

    return normalized[:5]


def _normalize_findings(report_data: dict[str, Any]) -> list[dict[str, Any]]:
    """Normalize arbitrary report findings into a safe, renderable format."""
    raw_findings = report_data.get("findings") or []
    normalized: list[dict[str, Any]] = []

    for index, raw in enumerate(raw_findings, 1):
        if not isinstance(raw, dict):
            raw = {"title": str(raw)}

        severity = str(raw.get("severity") or "info").strip().lower()
        if severity not in SEVERITY_META:
            severity = "info"

        category = str(raw.get("category") or "other").strip().lower() or "other"
        title = str(raw.get("title") or "Unnamed finding").strip() or "Unnamed finding"
        description = str(
            raw.get("what_it_means")
            or raw.get("description")
            or "No explanation was provided for this issue."
        ).strip()
        evidence = str(raw.get("evidence") or "No concise evidence was provided.").strip()
        affected = str(raw.get("affected") or raw.get("affected_assets") or "Unknown").strip()
        finding_id = str(raw.get("id") or f"finding_{index}").strip()

        steps = _normalize_steps(raw.get("how_to_fix"))
        if not steps:
            steps = _fallback_fix_steps(category, affected)

        normalized.append(
            {
                "id": finding_id,
                "index": index,
                "title": title,
                "severity": severity,
                "severity_label": SEVERITY_META[severity]["label"],
                "severity_class": SEVERITY_META[severity]["chip_class"],
                "category": category,
                "category_label": category.replace("_", " ").title(),
                "description": description,
                "evidence": evidence,
                "affected": affected,
                "steps": steps,
            }
        )

    normalized.sort(
        key=lambda finding: (
            SEVERITY_ORDER.get(finding["severity"], 99),
            finding["title"].lower(),
        )
    )
    return normalized


def _derive_visuals(report_data: dict[str, Any], findings: list[dict[str, Any]]) -> dict[str, Any]:
    """Build robust visual summary data, even for older reports."""
    report_visuals = report_data.get("_visuals") if isinstance(report_data.get("_visuals"), dict) else {}

    severity_counter = Counter(finding["severity"] for finding in findings)
    category_counter = Counter(finding["category"] for finding in findings)
    asset_counter = Counter()
    for finding in findings:
        if finding["affected"] and finding["affected"] != "Unknown":
            asset_counter[finding["affected"]] += 1

    raw_severity_breakdown = report_visuals.get("severity_breakdown")
    severity_breakdown = {}
    for level in ("critical", "high", "medium", "low", "info"):
        if isinstance(raw_severity_breakdown, dict):
            severity_breakdown[level] = int(raw_severity_breakdown.get(level, severity_counter.get(level, 0)) or 0)
        else:
            severity_breakdown[level] = int(severity_counter.get(level, 0))

    raw_category_breakdown = report_visuals.get("category_breakdown")
    if isinstance(raw_category_breakdown, dict) and raw_category_breakdown:
        category_breakdown = {
            str(name): int(count or 0)
            for name, count in raw_category_breakdown.items()
        }
    else:
        category_breakdown = dict(category_counter)

    raw_assets = report_visuals.get("top_affected_assets")
    assets: list[dict[str, Any]] = []
    if isinstance(raw_assets, list) and raw_assets:
        for item in raw_assets[:4]:
            if not isinstance(item, dict):
                continue
            assets.append(
                {
                    "asset": _truncate(item.get("asset") or "Unknown", 44),
                    "count": int(item.get("count") or 0),
                }
            )
    else:
        assets = [
            {"asset": _truncate(asset, 44), "count": count}
            for asset, count in asset_counter.most_common(4)
        ]

    attack_surface = report_visuals.get("attack_surface") if isinstance(report_visuals.get("attack_surface"), dict) else {}
    metrics = {
        "live_hosts": int(attack_surface.get("live_hosts", 0) or 0),
        "open_ports": int(attack_surface.get("open_ports", 0) or 0),
        "crawled_endpoints": int(attack_surface.get("crawled_endpoints", 0) or 0),
        "scanner_findings": int(attack_surface.get("scanner_findings", len(findings)) or 0),
    }

    total_categories = sum(count for count in category_breakdown.values() if count > 0) or 1
    category_items: list[dict[str, Any]] = []
    for index, (name, count) in enumerate(
        sorted(category_breakdown.items(), key=lambda item: item[1], reverse=True)[:4]
    ):
        if count <= 0:
            continue
        category_items.append(
            {
                "label": name.replace("_", " ").title(),
                "count": count,
                "percent": round((count / total_categories) * 100, 2),
                "color": CATEGORY_COLORS[index % len(CATEGORY_COLORS)],
            }
        )

    return {
        "severity_breakdown": severity_breakdown,
        "category_items": category_items,
        "top_assets": assets,
        "attack_surface": metrics,
    }


def _risk_label(score: int) -> str:
    if score >= 80:
        return "Critical"
    if score >= 60:
        return "High"
    if score >= 40:
        return "Medium"
    if score >= 20:
        return "Low"
    return "Minimal"


def _suggested_window(score: int) -> str:
    if score >= 80:
        return "24h"
    if score >= 60:
        return "72h"
    if score >= 40:
        return "7d"
    return "14d"


def _estimate_finding_units(finding: dict[str, Any]) -> float:
    """Estimate how much vertical space a finding card will consume."""
    total_step_chars = sum(len(step) for step in finding["steps"])
    units = 2.8
    units += len(finding["title"]) / 45
    units += len(finding["description"]) / 170
    units += len(finding["evidence"]) / 160
    units += total_step_chars / 220
    return min(max(units, 3.0), 7.5)


def _paginate_findings(findings: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    """Split findings across pages so arbitrary data does not overflow."""
    if not findings:
        return [[]]

    pages: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    current_units = 0.0
    page_budget = 9.7

    for finding in findings:
        units = _estimate_finding_units(finding)
        if current and current_units + units > page_budget:
            pages.append(current)
            current = [finding]
            current_units = units
        else:
            current.append(finding)
            current_units += units

    if current:
        pages.append(current)

    return pages


def _build_report_view_model(scan_id: str, url: str, report_data: dict[str, Any]) -> dict[str, Any]:
    """Normalize all report content into a render-safe view model."""
    score = max(0, min(100, int(report_data.get("risk_score", 0) or 0)))
    findings = _normalize_findings(report_data)
    priority_actions = _normalize_priority_actions(report_data, findings)
    visuals = _derive_visuals(report_data, findings)
    summary = str(report_data.get("summary") or "Security assessment completed.").strip()

    severity_breakdown = visuals["severity_breakdown"]
    urgent_count = severity_breakdown["critical"] + severity_breakdown["high"]
    total_findings = len(findings)
    unique_categories = len({finding["category"] for finding in findings}) if findings else 0
    attack_surface = visuals["attack_surface"]
    exposed_assets = len(visuals["top_assets"])

    return {
        "scan_id": scan_id,
        "url": url,
        "summary": summary,
        "cover_summary": _truncate(summary, 210),
        "risk_score": score,
        "risk_label": _risk_label(score),
        "suggested_window": _suggested_window(score),
        "generated_at": datetime.utcnow().strftime("%b %d, %Y"),
        "priority_actions": priority_actions,
        "findings": findings,
        "finding_pages": _paginate_findings(findings),
        "severity_breakdown": severity_breakdown,
        "category_items": visuals["category_items"],
        "top_assets": visuals["top_assets"],
        "attack_surface": attack_surface,
        "metrics": {
            "total_findings": total_findings,
            "urgent_findings": urgent_count,
            "unique_categories": unique_categories,
            "exposed_assets": exposed_assets,
            "surface_signals": sum(attack_surface.values()),
        },
    }


def _memo_grade_descriptor(score: int) -> str:
    if score >= 80:
        return "Severe exposure profile with urgent externally visible risk."
    if score >= 60:
        return "Elevated exposure profile with concrete issues worth prompt cleanup."
    if score >= 40:
        return "Moderate exposure profile with actionable hardening work."
    if score >= 20:
        return "Limited exposure profile with a few worthwhile defensive improvements."
    return "Contained exposure profile with no major urgent external risk."


def _memo_primary_threat(vm: dict[str, Any]) -> str:
    findings = vm["findings"]
    if findings:
        top = findings[0]
        return (
            f"{top['category_label']} issues affecting {top['affected']} "
            f"create the clearest opening for external abuse."
        )
    return "No single high-confidence threat path stood out in this run."


def _memo_risk_lens(score: int, urgent_count: int) -> dict[str, str]:
    if score >= 80:
        posture = "Immediate owner action is warranted before the next release cycle."
    elif score >= 60:
        posture = "Owner-visible risk is present and should be handled in the next sprint."
    elif score >= 40:
        posture = "This is not catastrophic, but cleanup should be scheduled promptly."
    else:
        posture = "Risk appears contained; maintain routine hardening and verification."

    effort = "Low effort for commodity scanners." if urgent_count else "Higher effort with fewer obvious attack paths."
    quality = "Signals are externally visible and repeatable." if score >= 40 else "Signals are limited and less concentrated."

    return {
        "exposure_quality": quality,
        "exploit_effort": effort,
        "business_posture": posture,
    }


def _build_security_memo_data(scan_id: str, url: str, report_data: dict[str, Any]) -> dict[str, Any]:
    """Adapt the normalized report into the schema expected by the custom memo PDF."""
    vm = _build_report_view_model(scan_id, url, report_data)
    parsed = urlparse(url)
    domain = parsed.netloc or parsed.path or url

    severity_counts = vm["severity_breakdown"]
    urgent_count = severity_counts["critical"] + severity_counts["high"]
    risk_score = vm["risk_score"]
    findings = vm["findings"]

    category_items = vm["category_items"][:3]
    if not category_items:
        category_items = [
            {"label": "General", "percent": 100, "color": "#E8521A"},
        ]

    tls_count = sum(1 for finding in findings if finding["category"] == "tls")

    memo_findings = []
    for finding in findings:
        memo_findings.append(
            {
                "severity": finding["severity"],
                "title": finding["title"],
                "body": finding["description"],
                "category": finding["category_label"],
                "affected": finding["affected"],
                "confidence": "verified",
                "evidence_text": finding["evidence"],
                "steps": finding["steps"][:3],
                "recommended_move": finding["steps"][0] if finding["steps"] else "",
            }
        )

    return {
        "meta": {
            "domain": _truncate(domain, 48),
            "generated_date": vm["generated_at"],
            "exposure_grade": risk_score,
            "grade_descriptor": _memo_grade_descriptor(risk_score),
            "primary_threat_path": _memo_primary_threat(vm),
            "verified_count": vm["metrics"]["total_findings"],
            "high_severity_count": urgent_count,
            "signals_reviewed": vm["metrics"]["surface_signals"],
            "remediation_window": vm["suggested_window"].upper(),
        },
        "executive_summary": {
            "pull_quote": _truncate(vm["summary"], 150),
            "body": vm["summary"],
            "steps": vm["priority_actions"][:3],
            "risk_index": risk_score,
            "risk_lens": _memo_risk_lens(risk_score, urgent_count),
        },
        "visuals": {
            "severity_counts": severity_counts,
            "finding_mix": [
                {
                    "label": item["label"],
                    "pct": item["percent"],
                    "color": item["color"],
                }
                for item in category_items
            ],
            "surface_inventory": {
                "hosts": vm["attack_surface"]["live_hosts"],
                "ports": vm["attack_surface"]["open_ports"],
                "pages": vm["attack_surface"]["crawled_endpoints"],
                "tls": tls_count,
            },
            "most_exposed": [
                {
                    "url": item["asset"],
                    "descriptor": "Observed asset",
                    "count": item["count"],
                }
                for item in vm["top_assets"][:3]
            ],
            "owner_note": _truncate(
                vm["priority_actions"][0] if vm["priority_actions"] else vm["summary"],
                140,
            ),
        },
        "findings": memo_findings,
    }


def _html_list(items: list[str], renderer) -> str:
    return "".join(renderer(item, index) for index, item in enumerate(items, 1))


def _render_priority_item(action: str, index: int) -> str:
    return f"""
      <div class="priority-item">
        <div class="num">{index}</div>
        <p>{_safe_text(action)}</p>
      </div>
    """


def _render_step(step: str, index: int) -> str:
    return f"""
      <div class="step">
        <div class="num">{index}</div>
        <p>{_safe_text(step)}</p>
      </div>
    """


def _render_cover_page(vm: dict[str, Any], page_no: int) -> str:
    metrics = vm["metrics"]
    return f"""
    <section class="page page-a">
      <div class="topbar">
        <div class="brand"><span class="brand-dot"></span><span>scanai</span></div>
        <div class="nav"><span>Summary</span><span>Visuals</span><span>Findings</span></div>
        <div class="meta-pill">Security Memo · {_safe_text(_truncate(vm["url"], 42))}</div>
      </div>

      <div class="hero">
        <div class="hero-copy">
          <div class="eyebrow">Public attack surface memo</div>
          <h1 class="display">
            What an attacker
            <span class="it">would notice</span>
            first.
          </h1>
          <p class="lede">{_safe_text(vm["cover_summary"])}</p>
        </div>

        <div class="hero-support">
          <div class="orbital-stage"></div>
          <div class="risk-orb"></div>

          <div class="floating-card one">
            <h3>Exposure grade</h3>
            <div class="metric-value">{vm["risk_score"]}<span class="it">/100</span></div>
            <p class="metric-copy">{_safe_text(vm["risk_label"])} risk profile based on externally visible scan evidence.</p>
          </div>

          <div class="floating-card two">
            <h3>Primary owner move</h3>
            <p class="metric-copy">{_safe_text(_truncate(vm["priority_actions"][0], 120))}</p>
          </div>

          <div class="floating-card small three">
            <h3>Verification</h3>
            <div class="metric-value">{metrics["total_findings"]} <span class="it">real</span></div>
            <p class="metric-copy">issues survived filtering and deduping.</p>
          </div>
        </div>
      </div>

      <div class="stat-strip">
        <div class="stat-strip-item">
          <strong>{metrics["total_findings"]:02d}</strong>
          <span>Verified findings</span>
        </div>
        <div class="stat-strip-item">
          <strong>{metrics["urgent_findings"]:02d}</strong>
          <span>High-severity items</span>
        </div>
        <div class="stat-strip-item">
          <strong>{metrics["surface_signals"]:02d}</strong>
          <span>Exposure signals reviewed</span>
        </div>
        <div class="stat-strip-item">
          <strong>{_safe_text(vm["suggested_window"])}</strong>
          <span>Suggested remediation window</span>
        </div>
      </div>

      <div class="footer">
        <span>ScanAI · security memo</span>
        <span>{page_no:02d}</span>
      </div>
    </section>
    """


def _render_summary_page(vm: dict[str, Any], page_no: int) -> str:
    actions_html = _html_list(vm["priority_actions"][:5], _render_priority_item)
    urgency_text = (
        "contained risk profile with no urgent issues"
        if vm["metrics"]["urgent_findings"] == 0
        else f"contained risk profile with {vm['metrics']['urgent_findings']} urgent issue{'s' if vm['metrics']['urgent_findings'] != 1 else ''}"
    )
    attack_surface = vm["attack_surface"]

    return f"""
    <section class="page page-b">
      <div class="topbar">
        <div class="brand"><span class="brand-dot"></span><span>scanai</span></div>
        <div class="kicker">01 exposure story</div>
        <div class="meta-pill">Generated · {_safe_text(vm["generated_at"])}</div>
      </div>

      <div class="section-head">
        <div>
          <h2 class="section-title">The report in one <span class="it">page</span>.</h2>
          <p class="section-copy">{_safe_text(_truncate(vm["summary"], 260))}</p>
        </div>
        <div class="tag dark">Owner-facing summary</div>
      </div>

      <div class="split-layout">
        <div class="panel">
          <div class="panel-title">Executive readout</div>
          <div class="quote">
            “This is a {urgency_text} and a plan for what to fix <span class="it">next</span>.”
          </div>
          <p class="body-copy">{_safe_text(_truncate(vm["summary"], 320))}</p>
          <div class="priority-list">{actions_html}</div>
        </div>

        <div class="dark-panel">
          <div class="panel-title">Risk lens</div>
          <div class="score-display">
            <div class="score-wheel">
              <div>
                <strong>{vm["risk_score"]}</strong>
                <span>risk index</span>
              </div>
            </div>
            <div class="lens-grid">
              <div class="lens-row">
                <strong>Exposure quality</strong>
                <p>{_safe_text(_truncate(vm["summary"], 118))}</p>
              </div>
              <div class="lens-row">
                <strong>Attack surface</strong>
                <p>{attack_surface["live_hosts"]} live hosts, {attack_surface["open_ports"]} open ports, {attack_surface["crawled_endpoints"]} crawled endpoints.</p>
              </div>
              <div class="lens-row">
                <strong>Business posture</strong>
                <p>Suggested owner response window: {_safe_text(vm["suggested_window"])}.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="flow-track">
        <div class="flow-node">
          <div class="mini-title">01 discover</div>
          <strong>{attack_surface["live_hosts"]} live hosts</strong>
          <p>Discovery confirmed the reachable public footprint.</p>
        </div>
        <div class="flow-node">
          <div class="mini-title">02 prioritize</div>
          <strong>{vm["metrics"]["urgent_findings"]} urgent items</strong>
          <p>The highest-risk findings should be handled before broader hardening work.</p>
        </div>
        <div class="flow-node">
          <div class="mini-title">03 settle</div>
          <strong>{len(vm["priority_actions"])} owner actions</strong>
          <p>Each action is written as an operational next step rather than scanner jargon.</p>
        </div>
        <div class="flow-node">
          <div class="mini-title">04 verify</div>
          <strong>Re-scan after changes</strong>
          <p>Closure is confirmed only after the same exposure path no longer appears.</p>
        </div>
      </div>

      <div class="footer">
        <span>ScanAI · analysis spread</span>
        <span>{page_no:02d}</span>
      </div>
    </section>
    """


def _render_severity_bars(vm: dict[str, Any]) -> str:
    breakdown = vm["severity_breakdown"]
    max_value = max(max(breakdown.values()), 1)
    bars = []
    labels = [
        ("critical", "Critical"),
        ("high", "High"),
        ("medium", "Medium"),
        ("low", "Low"),
        ("info", "Info"),
    ]
    for key, label in labels:
        count = breakdown.get(key, 0)
        height = max(28, round((count / max_value) * 190)) if count > 0 else 28
        extra_class = " low" if key in {"medium", "low"} else (" info" if key == "info" else "")
        bars.append(
            f"""
            <div class="severity-col">
              <div class="severity-bar{extra_class}" data-count="{count}" style="height:{height}px;"></div>
              <div class="bar-label">{label}</div>
            </div>
            """
        )
    return "".join(bars)


def _render_category_legend(vm: dict[str, Any]) -> str:
    if not vm["category_items"]:
        return """
          <div class="legend-row">
            <div class="legend-label"><span class="swatch" style="background:#696969;"></span><span>No categorized findings</span></div>
            <strong>0%</strong>
          </div>
        """
    rows = []
    for item in vm["category_items"]:
        rows.append(
            f"""
            <div class="legend-row">
              <div class="legend-label"><span class="swatch" style="background:{item['color']};"></span><span>{_safe_text(item['label'])}</span></div>
              <strong>{round(item['percent']):d}%</strong>
            </div>
            """
        )
    return "".join(rows)


def _render_donut_style(vm: dict[str, Any]) -> str:
    items = vm["category_items"]
    if not items:
        return "background: conic-gradient(#D1CDC7 0 100%);"

    start = 0.0
    segments: list[str] = []
    for item in items:
        end = min(100.0, start + float(item["percent"]))
        segments.append(f"{item['color']} {start:.2f}% {end:.2f}%")
        start = end

    if start < 100.0:
        segments.append(f"#E8E2DA {start:.2f}% 100%")

    return "background: radial-gradient(circle at center, rgba(255,255,255,0.96) 0 64px, transparent 65px), conic-gradient(" + ", ".join(segments) + ");"


def _render_assets(vm: dict[str, Any]) -> str:
    items = vm["top_assets"]
    if not items:
        return """
          <div class="asset-row">
            <div>
              <strong>No repeated asset clusters</strong>
              <span>No single target dominated the final findings.</span>
            </div>
            <b>0</b>
          </div>
        """

    rows = []
    for item in items[:4]:
        rows.append(
            f"""
            <div class="asset-row">
              <div>
                <strong>{_safe_text(item['asset'])}</strong>
                <span>{int(item['count'])} finding hit{'s' if int(item['count']) != 1 else ''} tied to this asset.</span>
              </div>
              <b>{int(item['count'])}</b>
            </div>
            """
        )
    return "".join(rows)


def _render_visuals_page(vm: dict[str, Any], page_no: int) -> str:
    attack_surface = vm["attack_surface"]
    surface_max = max(
        attack_surface["live_hosts"],
        attack_surface["open_ports"],
        attack_surface["crawled_endpoints"],
        attack_surface["scanner_findings"],
        1,
    )

    def surface_height(value: int) -> int:
        return max(58, round((value / surface_max) * 138)) if value > 0 else 58

    return f"""
    <section class="page page-c">
      <div class="topbar">
        <div class="brand"><span class="brand-dot"></span><span>scanai</span></div>
        <div class="kicker">02 evidence visuals</div>
        <div class="meta-pill">Charts built from completed scan</div>
      </div>

      <div class="section-head">
        <div>
          <h2 class="section-title">Security picture at a <span class="it">glance</span>.</h2>
          <p class="section-copy">
            The report stays visual even with changing scan data, so owners can see distribution, concentration, and exposure at once.
          </p>
        </div>
        <div class="tag blue">Graph-first layout</div>
      </div>

      <div class="visual-grid">
        <div class="visual-stack">
          <div class="severity-board">
            <div class="panel-title">Findings by severity</div>
            <div class="severity-stage">{_render_severity_bars(vm)}</div>
            <div class="annotation">
              The final report keeps only grounded findings and then shows how they cluster by severity.
            </div>
          </div>

          <div class="visual-card">
            <div class="panel-title">Attack surface inventory</div>
            <div class="inventory">
              <div class="inventory-col">
                <div class="inventory-bar" style="height:{surface_height(attack_surface['live_hosts'])}px;"></div>
                <div class="bar-label">Hosts</div>
              </div>
              <div class="inventory-col">
                <div class="inventory-bar" style="height:{surface_height(attack_surface['open_ports'])}px;"></div>
                <div class="bar-label">Ports</div>
              </div>
              <div class="inventory-col">
                <div class="inventory-bar" style="height:{surface_height(attack_surface['crawled_endpoints'])}px;"></div>
                <div class="bar-label">Pages</div>
              </div>
              <div class="inventory-col">
                <div class="inventory-bar" style="height:{surface_height(attack_surface['scanner_findings'])}px;"></div>
                <div class="bar-label">Signals</div>
              </div>
            </div>
            <p class="print-note">
              This panel adapts to the actual surface counts instead of relying on fixed sample values.
            </p>
          </div>
        </div>

        <div class="visual-stack">
          <div class="visual-card">
            <div class="panel-title">Finding mix</div>
            <div class="donut-wrap">
              <div class="donut" style="{_render_donut_style(vm)}"></div>
              <div class="legend">{_render_category_legend(vm)}</div>
            </div>
          </div>

          <div class="dark-panel">
            <div class="panel-title">Most exposed assets</div>
            <div class="asset-list">{_render_assets(vm)}</div>
          </div>

          <div class="visual-card">
            <div class="panel-title">Owner note</div>
            <div class="quote" style="font-size:24px; max-width:none;">
              “Keep the charts, but make each one carry a <span class="it">decision</span>.”
            </div>
            <p class="body-copy">
              The visuals should always answer what is exposed, where it is concentrated, and what deserves attention first.
            </p>
          </div>
        </div>
      </div>

      <div class="footer">
        <span>ScanAI · visual spread</span>
        <span>{page_no:02d}</span>
      </div>
    </section>
    """


def _render_finding_card(finding: dict[str, Any]) -> str:
    steps_html = _html_list(finding["steps"], _render_step)
    return f"""
      <article class="finding-card severity-{finding['severity_class']}">
        <div class="finding-head">
          <div class="severity-pill {finding['severity_class']}">{_safe_text(finding['severity_label'])} severity</div>
          <div class="finding-meta-badges">
            <span class="meta-chip">{_safe_text(finding['category_label'])}</span>
            <span class="meta-chip">{_safe_text(finding['affected'])}</span>
          </div>
        </div>
        <h3 class="finding-title">{_safe_multiline(finding['title'])}</h3>
        <p class="finding-copy">{_safe_multiline(finding['description'])}</p>
        <div class="evidence-box">
          <h4>Observed evidence</h4>
          <p class="evidence-copy">{_safe_multiline(finding['evidence'])}</p>
        </div>
        <div class="settlement-box">
          <h4>How to settle it</h4>
          <div class="step-list">{steps_html}</div>
        </div>
      </article>
    """


def _render_findings_page(vm: dict[str, Any], chunk: list[dict[str, Any]], page_no: int, first_chunk: bool) -> str:
    if not chunk:
        content = """
          <div class="empty-state">
            <div class="severity-pill info">Healthy result</div>
            <h3>No priority findings were retained in the final report.</h3>
            <p>The target appears broadly healthy from this scan. Keep the site monitored, review patch cadence, and re-scan after notable changes.</p>
          </div>
        """
    else:
        content = "".join(_render_finding_card(finding) for finding in chunk)

    title = "Findings should read like <span class=\"it\">evidence</span>, not filler." if first_chunk else "More findings and owner <span class=\"it\">settlement plans</span>."
    description = (
        "Each finding includes the issue, why it matters, the observed evidence, and concrete remediation steps."
        if first_chunk
        else "Additional validated findings continue here with the same owner-friendly remediation structure."
    )

    return f"""
    <section class="page page-d">
      <div class="topbar">
        <div class="brand"><span class="brand-dot"></span><span>scanai</span></div>
        <div class="kicker">03 detailed findings</div>
        <div class="meta-pill">{len(vm['findings'])} issue{'s' if len(vm['findings']) != 1 else ''} worth owner attention</div>
      </div>

      <div class="section-head">
        <div>
          <h2 class="section-title">{title}</h2>
          <p class="section-copy">{description}</p>
        </div>
        <div class="tag signal">High-confidence narrative</div>
      </div>

      <div class="findings-layout">{content}</div>

      <div class="footer">
        <span>ScanAI · findings spread</span>
        <span>{page_no:02d}</span>
      </div>
    </section>
    """


def _build_styles() -> str:
    return """
    :root {
      --canvas: #f3f0ee;
      --paper: #ffffff;
      --paper-soft: #fcfbfa;
      --ink: #141413;
      --ink-soft: #262627;
      --muted: #696969;
      --line: rgba(20, 20, 19, 0.09);
      --signal: #cf4500;
      --signal-bright: #f37338;
      --signal-soft: #f8ece4;
      --amber: #f79e1b;
      --blue: #3860be;
      --shadow-premium:
        0 0 0 0.5px rgba(20, 20, 19, 0.05),
        0 1px 2px rgba(20, 20, 19, 0.04),
        0 8px 24px rgba(20, 20, 19, 0.06),
        0 24px 48px rgba(20, 20, 19, 0.05);
      --shadow-soft: 0 16px 40px rgba(20, 20, 19, 0.08);
      --radius-pill: 999px;
    }

    * { box-sizing: border-box; }

    @page {
      size: 720px 1280px;
      margin: 0;
    }

    html, body {
      margin: 0;
      padding: 0;
      background: var(--canvas);
      color: var(--ink);
      font-family: "Helvetica Neue", Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }

    body {
      background: var(--canvas);
    }

    h1, h2, h3, h4, p { margin: 0; }

    .page {
      position: relative;
      width: 720px;
      min-height: 1280px;
      overflow: visible;
      background: var(--canvas);
      padding: 42px 42px 84px;
      break-after: page;
      page-break-after: always;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    .page:last-child {
      break-after: auto;
      page-break-after: auto;
    }

    .page::before,
    .page::after {
      content: "";
      position: absolute;
      border-radius: 50%;
      pointer-events: none;
      z-index: 0;
    }

    .page-a::before {
      width: 470px;
      height: 470px;
      right: -140px;
      top: -110px;
      background:
        radial-gradient(circle at 35% 35%, rgba(243, 115, 56, 0.98) 0 23%, transparent 24%),
        radial-gradient(circle at 52% 52%, rgba(207, 69, 0, 0.95) 0 34%, transparent 35%),
        radial-gradient(circle at 72% 68%, rgba(244, 190, 140, 0.92) 0 16%, transparent 17%);
      filter: blur(10px);
    }

    .page-a::after {
      width: 580px;
      height: 580px;
      right: -265px;
      top: 168px;
      border: 1px solid rgba(207, 69, 0, 0.24);
    }

    .page-b::before,
    .page-c::before,
    .page-d::before {
      width: 320px;
      height: 320px;
      left: -140px;
      bottom: 60px;
      border: 1px solid rgba(207, 69, 0, 0.12);
    }

    .page-b::after {
      width: 280px;
      height: 280px;
      right: -110px;
      top: 180px;
      background: radial-gradient(circle, rgba(243, 115, 56, 0.18) 0 36%, transparent 62%);
    }

    .page-c::after {
      width: 360px;
      height: 360px;
      right: -180px;
      top: 120px;
      background: radial-gradient(circle, rgba(56, 96, 190, 0.13) 0 38%, transparent 66%);
    }

    .page-d::after {
      width: 420px;
      height: 420px;
      right: -220px;
      bottom: -140px;
      border: 1px solid rgba(56, 96, 190, 0.12);
    }

    .topbar,
    .footer {
      position: relative;
      z-index: 3;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .topbar {
      font-size: 12px;
      color: var(--muted);
    }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-weight: 800;
      color: var(--ink);
      letter-spacing: -0.02em;
      min-width: 0;
    }

    .brand-dot {
      width: 11px;
      height: 11px;
      border-radius: 50%;
      background: var(--signal);
      box-shadow: 0 0 0 4px rgba(207, 69, 0, 0.12);
      flex: 0 0 auto;
    }

    .nav,
    .meta-pill,
    .eyebrow,
    .kicker,
    .tag,
    .severity-pill,
    .meta-chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border-radius: var(--radius-pill);
      min-width: 0;
    }

    .nav {
      gap: 18px;
      padding: 8px 16px;
      border: 1px solid rgba(20, 20, 19, 0.08);
      background: rgba(255, 255, 255, 0.76);
      font-weight: 500;
    }

    .nav span,
    .meta-pill {
      white-space: nowrap;
    }

    .meta-pill {
      padding: 10px 14px;
      background: rgba(255, 255, 255, 0.78);
      border: 1px solid rgba(20, 20, 19, 0.08);
      font-weight: 600;
      color: var(--ink);
      max-width: 250px;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .eyebrow {
      width: fit-content;
      padding: 7px 12px;
      background: var(--signal-soft);
      color: var(--signal);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }

    .eyebrow::before,
    .kicker::before {
      content: "";
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
      opacity: 0.9;
      flex: 0 0 auto;
    }

    .kicker {
      width: fit-content;
      color: var(--signal);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
    }

    .tag {
      padding: 8px 12px;
      background: rgba(255, 255, 255, 0.78);
      border: 1px solid rgba(20, 20, 19, 0.08);
      font-size: 12px;
      font-weight: 600;
      color: var(--ink-soft);
    }

    .tag.dark,
    .severity-pill.high {
      background: var(--ink);
      color: #fff;
      border-color: var(--ink);
    }

    .tag.blue {
      background: rgba(56, 96, 190, 0.1);
      color: var(--blue);
      border-color: rgba(56, 96, 190, 0.18);
    }

    .tag.signal {
      background: var(--signal-soft);
      color: var(--signal);
      border-color: rgba(207, 69, 0, 0.16);
    }

    .hero {
      position: relative;
      z-index: 2;
      display: grid;
      grid-template-columns: 1.08fr 0.92fr;
      gap: 28px;
      margin-top: 42px;
      align-items: start;
    }

    .hero-copy { padding-top: 20px; }

    .display {
      max-width: 420px;
      font-size: 78px;
      line-height: 0.94;
      letter-spacing: -0.05em;
      font-weight: 800;
    }

    .display .it,
    .section-title .it,
    .metric-value .it,
    .quote .it {
      font-family: Georgia, "Times New Roman", serif;
      font-style: italic;
      font-weight: 400;
      letter-spacing: -0.02em;
    }

    .lede {
      max-width: 370px;
      margin-top: 24px;
      font-size: 19px;
      line-height: 1.55;
      color: rgba(20, 20, 19, 0.72);
    }

    .hero-support {
      position: relative;
      min-height: 670px;
    }

    .orbital-stage {
      position: absolute;
      inset: 0;
    }

    .orbital-stage::before,
    .orbital-stage::after {
      content: "";
      position: absolute;
      border-radius: 50%;
    }

    .orbital-stage::before {
      width: 470px;
      height: 470px;
      right: -70px;
      top: 18px;
      border: 1px solid rgba(207, 69, 0, 0.22);
    }

    .orbital-stage::after {
      width: 250px;
      height: 250px;
      right: 36px;
      top: 132px;
      border: 1px solid rgba(56, 96, 190, 0.18);
    }

    .risk-orb {
      position: absolute;
      top: 36px;
      right: 0;
      width: 330px;
      height: 420px;
      border-radius: 46% 54% 56% 44% / 46% 42% 58% 54%;
      background:
        radial-gradient(circle at 34% 28%, rgba(255,255,255,0.96) 0 12%, transparent 13%),
        radial-gradient(circle at 44% 34%, rgba(243,115,56,0.9) 0 18%, rgba(207,69,0,0.94) 19% 36%, rgba(243,190,145,0.9) 37% 45%, transparent 46%),
        radial-gradient(circle at 58% 58%, rgba(20,20,19,0.86) 0 8%, transparent 9%),
        linear-gradient(160deg, rgba(255,255,255,0.98), rgba(248,236,228,0.98));
      box-shadow: 0 40px 80px rgba(207, 69, 0, 0.18);
      overflow: hidden;
    }

    .risk-orb::after {
      content: "";
      position: absolute;
      inset: 16px;
      border-radius: inherit;
      border: 1px solid rgba(255, 255, 255, 0.52);
    }

    .floating-card {
      position: absolute;
      z-index: 3;
      width: 222px;
      border-radius: 26px;
      background: rgba(255, 255, 255, 0.84);
      border: 1px solid rgba(20, 20, 19, 0.08);
      box-shadow: var(--shadow-soft);
      padding: 18px 18px 16px;
    }

    .floating-card.small {
      width: 176px;
      padding: 14px 16px;
    }

    .floating-card.one { top: 10px; left: 4px; }
    .floating-card.two { width: 236px; right: 10px; bottom: 196px; }
    .floating-card.three { left: 14px; bottom: 28px; }

    .floating-card h3,
    .panel-title {
      font-size: 12px;
      line-height: 1.1;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: rgba(20, 20, 19, 0.58);
      font-weight: 700;
    }

    .metric-value {
      margin-top: 12px;
      font-size: 44px;
      line-height: 0.96;
      letter-spacing: -0.04em;
      font-weight: 800;
      color: var(--ink);
    }

    .metric-copy {
      margin-top: 10px;
      font-size: 14px;
      line-height: 1.45;
      color: rgba(20, 20, 19, 0.72);
    }

    .stat-strip {
      position: relative;
      z-index: 2;
      display: grid;
      grid-template-columns: repeat(3, 1fr) 1.15fr;
      gap: 12px;
      margin-top: 44px;
      padding: 20px;
      border-radius: 30px;
      background: rgba(255, 255, 255, 0.84);
      border: 1px solid rgba(20, 20, 19, 0.08);
      box-shadow: var(--shadow-premium);
    }

    .stat-strip-item {
      padding-right: 8px;
      border-right: 1px solid rgba(20, 20, 19, 0.07);
    }

    .stat-strip-item:last-child {
      border-right: 0;
      padding-right: 0;
    }

    .stat-strip strong {
      display: block;
      font-size: 36px;
      line-height: 0.95;
      letter-spacing: -0.04em;
      font-weight: 800;
      color: var(--ink);
      white-space: nowrap;
    }

    .stat-strip span {
      display: block;
      margin-top: 8px;
      font-size: 12px;
      line-height: 1.45;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: rgba(20, 20, 19, 0.56);
      font-weight: 700;
    }

    .section-head {
      position: relative;
      z-index: 2;
      margin-top: 24px;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 16px;
      align-items: end;
    }

    .section-title {
      max-width: 520px;
      font-size: 52px;
      line-height: 0.98;
      letter-spacing: -0.045em;
      font-weight: 800;
    }

    .section-copy {
      margin-top: 12px;
      max-width: 500px;
      font-size: 16px;
      line-height: 1.48;
      color: rgba(20, 20, 19, 0.72);
    }

    .split-layout,
    .visual-grid {
      position: relative;
      z-index: 2;
      display: grid;
      gap: 14px;
      align-items: start;
    }

    .split-layout {
      grid-template-columns: 1.04fr 0.96fr;
      margin-top: 22px;
    }

    .visual-grid {
      grid-template-columns: 1.15fr 0.85fr;
      margin-top: 22px;
    }

    .panel,
    .dark-panel,
    .visual-card,
    .severity-board,
    .finding-card,
    .empty-state {
      position: relative;
      z-index: 2;
      border-radius: 30px;
      overflow: hidden;
      box-shadow: var(--shadow-premium);
    }

    .panel,
    .visual-card,
    .severity-board,
    .finding-card,
    .empty-state {
      background: rgba(255, 255, 255, 0.82);
      border: 1px solid rgba(20, 20, 19, 0.08);
      padding: 20px;
    }

    .dark-panel {
      background: var(--ink);
      color: #fff;
      padding: 20px;
      box-shadow: 0 28px 56px rgba(20, 20, 19, 0.18);
    }

    .quote {
      margin-top: 14px;
      font-size: 30px;
      line-height: 1.08;
      letter-spacing: -0.04em;
      font-weight: 700;
      max-width: 360px;
    }

    .body-copy,
    .priority-item p,
    .lens-row p,
    .finding-copy,
    .evidence-copy,
    .step p,
    .legend-row,
    .asset-row span,
    .print-note,
    .empty-state p {
      font-size: 15px;
      line-height: 1.5;
      color: rgba(20, 20, 19, 0.76);
      overflow-wrap: anywhere;
    }

    .dark-panel .panel-title,
    .dark-panel .lens-row p,
    .dark-panel .asset-row span,
    .dark-panel .asset-row strong,
    .dark-panel .bar-label,
    .dark-panel .step p {
      color: rgba(255, 255, 255, 0.76);
    }

    .dark-panel .panel-title {
      color: rgba(255,255,255,0.62);
    }

    .priority-list,
    .visual-stack,
    .asset-list,
    .step-list,
    .findings-layout {
      display: grid;
      gap: 10px;
    }

    .priority-list { margin-top: 18px; gap: 8px; }
    .visual-stack { gap: 14px; }
    .asset-list { margin-top: 14px; gap: 8px; }
    .step-list { margin-top: 14px; }
    .findings-layout { margin-top: 18px; }

    .priority-item,
    .step {
      display: grid;
      grid-template-columns: 42px 1fr;
      gap: 12px;
      align-items: start;
    }

    .priority-item {
      padding: 12px;
      border-radius: 22px;
      background: rgba(20, 20, 19, 0.04);
      border: 1px solid rgba(20, 20, 19, 0.06);
    }

    .num {
      display: grid;
      place-items: center;
      width: 42px;
      height: 42px;
      border-radius: 50%;
      background: var(--ink);
      color: #fff;
      font-size: 16px;
      font-weight: 800;
      flex: 0 0 auto;
    }

    .score-display {
      margin-top: 18px;
      display: grid;
      grid-template-columns: 170px 1fr;
      gap: 18px;
      align-items: center;
    }

    .score-wheel {
      width: 170px;
      height: 170px;
      border-radius: 50%;
      background:
        radial-gradient(circle at center, #141413 0 45px, transparent 46px),
        conic-gradient(var(--signal-bright) 0 68%, rgba(255,255,255,0.13) 68% 100%);
      display: grid;
      place-items: center;
      box-shadow: inset 0 0 0 12px rgba(255,255,255,0.08);
    }

    .score-wheel strong {
      display: block;
      font-size: 56px;
      line-height: 1;
      font-weight: 800;
      letter-spacing: -0.05em;
      color: #fff;
      text-align: center;
    }

    .score-wheel span {
      display: block;
      margin-top: 6px;
      text-align: center;
      font-size: 12px;
      color: rgba(255,255,255,0.6);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      font-weight: 700;
    }

    .lens-grid { display: grid; gap: 12px; }

    .lens-row {
      padding: 14px 0;
      border-bottom: 1px solid rgba(255,255,255,0.09);
    }

    .lens-row:last-child {
      padding-bottom: 0;
      border-bottom: 0;
    }

    .lens-row strong {
      display: block;
      margin-bottom: 6px;
      font-size: 14px;
      color: #fff;
      letter-spacing: -0.01em;
    }

    .flow-track {
      position: relative;
      z-index: 2;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-top: 14px;
    }

    .flow-node {
      position: relative;
      min-height: 162px;
      padding: 16px;
      border-radius: 24px;
      background: rgba(255, 255, 255, 0.72);
      border: 1px solid rgba(20, 20, 19, 0.08);
      box-shadow: var(--shadow-premium);
      overflow-wrap: anywhere;
    }

    .flow-node::after {
      content: "→";
      position: absolute;
      right: -10px;
      top: 22px;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 28px;
      color: var(--signal);
    }

    .flow-node:last-child::after { display: none; }

    .flow-node strong {
      display: block;
      margin-top: 18px;
      font-size: 22px;
      line-height: 1.08;
      letter-spacing: -0.03em;
    }

    .mini-title,
    .bar-label,
    .finding-head h4,
    .evidence-box h4,
    .settlement-box h4,
    .empty-state h4 {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: rgba(20, 20, 19, 0.56);
      font-weight: 700;
    }

    .severity-board { min-height: 404px; }

    .severity-stage {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      align-items: end;
      gap: 12px;
      height: 270px;
      margin-top: 24px;
    }

    .severity-col {
      display: grid;
      justify-items: center;
      gap: 10px;
    }

    .severity-bar {
      position: relative;
      width: 74px;
      border-radius: 28px 28px 16px 16px;
      background: linear-gradient(180deg, rgba(243,115,56,0.95), rgba(207,69,0,1));
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.24);
    }

    .severity-bar.low {
      background: linear-gradient(180deg, rgba(244,190,140,0.85), rgba(247,158,27,0.95));
    }

    .severity-bar.info {
      background: linear-gradient(180deg, rgba(97,130,204,0.8), rgba(56,96,190,0.95));
    }

    .severity-bar::before {
      content: attr(data-count);
      position: absolute;
      top: -32px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 12px;
      color: rgba(20, 20, 19, 0.58);
      font-weight: 700;
    }

    .annotation {
      margin-top: 16px;
      padding: 12px 14px;
      border-radius: 20px;
      background: rgba(20,20,19,0.05);
      font-size: 13px;
      line-height: 1.45;
      color: rgba(20,20,19,0.72);
    }

    .donut-wrap {
      display: grid;
      justify-items: center;
      gap: 14px;
      margin-top: 8px;
    }

    .donut {
      width: 220px;
      height: 220px;
      border-radius: 50%;
    }

    .legend {
      display: grid;
      gap: 8px;
      width: 100%;
    }

    .legend-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .legend-label {
      display: inline-flex;
      align-items: center;
      gap: 10px;
    }

    .swatch {
      width: 11px;
      height: 11px;
      border-radius: 50%;
      flex: 0 0 auto;
    }

    .inventory {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-top: 16px;
      align-items: end;
      min-height: 144px;
    }

    .inventory-col {
      display: grid;
      justify-items: center;
      gap: 10px;
    }

    .inventory-bar {
      width: 58px;
      border-radius: 20px 20px 12px 12px;
      background: linear-gradient(180deg, rgba(20,20,19,0.86), rgba(20,20,19,1));
    }

    .inventory-col:nth-child(2) .inventory-bar,
    .inventory-col:nth-child(4) .inventory-bar {
      background: linear-gradient(180deg, rgba(243,115,56,0.88), rgba(207,69,0,1));
    }

    .asset-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding: 12px 14px;
      border-radius: 16px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.08);
    }

    .asset-row strong {
      display: block;
      font-size: 12px;
      font-family: "Courier New", monospace;
      font-weight: 700;
      letter-spacing: -0.02em;
      overflow-wrap: anywhere;
      color: #fff;
    }

    .asset-row b {
      min-width: 28px;
      height: 28px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: rgba(243,115,56,0.16);
      color: #fff;
      font-size: 12px;
      flex: 0 0 auto;
    }

    .findings-layout {
      grid-template-columns: 1fr;
    }

    .finding-card {
      display: grid;
      gap: 14px;
      padding: 18px;
    }

    .finding-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }

    .finding-meta-badges {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .severity-pill,
    .meta-chip {
      padding: 8px 12px;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .severity-pill.critical { background: #FFF0F0; color: #EB001B; }
    .severity-pill.high { background: #FFF4ED; color: #CF4500; }
    .severity-pill.medium { background: #FFF9EA; color: #A46106; }
    .severity-pill.low { background: #EFF4FF; color: #3860BE; }
    .severity-pill.info { background: #F5F5F4; color: #696969; }

    .meta-chip {
      background: rgba(20,20,19,0.05);
      color: var(--ink);
      font-weight: 600;
      letter-spacing: 0;
      text-transform: none;
    }

    .finding-title {
      font-size: 28px;
      line-height: 1.02;
      letter-spacing: -0.045em;
      font-weight: 800;
      overflow-wrap: anywhere;
    }

    .evidence-box,
    .settlement-box {
      padding: 14px 16px;
      border-radius: 22px;
      background: rgba(20,20,19,0.05);
      border: 1px solid rgba(20,20,19,0.07);
    }

    .settlement-box {
      background: rgba(255,255,255,0.72);
    }

    .step {
      padding: 10px 0;
      border-bottom: 1px solid rgba(20,20,19,0.08);
    }

    .step:last-child { border-bottom: 0; padding-bottom: 0; }

    .empty-state h3 {
      margin-top: 14px;
      font-size: 28px;
      line-height: 1.05;
      letter-spacing: -0.04em;
      font-weight: 800;
    }

    .footer {
      position: relative;
      left: auto;
      right: auto;
      bottom: auto;
      margin-top: 28px;
      padding-top: 18px;
      border-top: 1px solid rgba(20,20,19,0.08);
      font-size: 12px;
      color: rgba(20,20,19,0.55);
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    """


def render_report_html(scan_id: str, url: str, report_data: dict[str, Any]) -> str:
    """Render the full internal HTML report."""
    vm = _build_report_view_model(scan_id, url, report_data)

    pages = [
        _render_cover_page(vm, 1),
        _render_summary_page(vm, 2),
        _render_visuals_page(vm, 3),
    ]

    finding_pages = vm["finding_pages"]
    for offset, chunk in enumerate(finding_pages, start=4):
        pages.append(_render_findings_page(vm, chunk, offset, first_chunk=(offset == 4)))

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ScanAI Security Memo</title>
  <style>{_build_styles()}</style>
</head>
<body>
  {''.join(pages)}
</body>
</html>
"""


def _find_browser_binary() -> str:
    """Locate a Chromium-compatible browser for PDF rendering."""
    configured = settings.PDF_BROWSER_BIN.strip()
    if configured:
        path = Path(configured)
        if path.exists():
            return str(path)
        found = shutil.which(configured)
        if found:
            return found

    candidates = [
        shutil.which("chromium"),
        shutil.which("chromium-browser"),
        shutil.which("google-chrome"),
        shutil.which("google-chrome-stable"),
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ]

    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return str(candidate)

    raise RuntimeError(
        "No Chromium-compatible browser found for PDF rendering. "
        "Set PDF_BROWSER_BIN or install chromium/google-chrome."
    )


def get_minio_client() -> Minio:
    """Create and return a MinIO client instance."""
    return Minio(
        settings.MINIO_ENDPOINT,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=settings.MINIO_SECURE,
    )


def ensure_bucket_exists(client: Minio) -> bool:
    """Ensure the reports bucket exists, create if not."""
    try:
        if not client.bucket_exists(settings.MINIO_BUCKET):
            client.make_bucket(settings.MINIO_BUCKET)
            logger.info("Created MinIO bucket: %s", settings.MINIO_BUCKET)
        return True
    except S3Error as e:
        logger.error("Failed to ensure bucket exists: %s", e)
        return False


def generate_pdf_report(scan_id: str, url: str, report_data: dict[str, Any]) -> io.BytesIO:
    """Generate the custom schema-based security memo PDF."""
    scan_data = _build_security_memo_data(scan_id, url, report_data)

    with tempfile.TemporaryDirectory(prefix="scanai-report-") as tmpdir:
        pdf_path = Path(tmpdir) / "report.pdf"
        generate_security_memo(scan_data, str(pdf_path))
        buffer = io.BytesIO(pdf_path.read_bytes())
        buffer.seek(0)
        return buffer


def _pdf_object_name(scan_id: str) -> str:
    """Return the canonical MinIO object key for a scan PDF."""
    return f"reports/{scan_id}.pdf"


def upload_pdf_to_minio(scan_id: str, pdf_buffer: io.BytesIO) -> Optional[str]:
    """Upload PDF to MinIO and return the stored object key."""
    try:
        client = get_minio_client()
        if not ensure_bucket_exists(client):
            return None

        object_name = _pdf_object_name(scan_id)
        pdf_buffer.seek(0, io.SEEK_END)
        size = pdf_buffer.tell()
        pdf_buffer.seek(0)

        client.put_object(
            settings.MINIO_BUCKET,
            object_name,
            pdf_buffer,
            size,
            content_type="application/pdf",
        )

        logger.info("Uploaded PDF for scan %s to MinIO: %s", scan_id, object_name)
        return object_name

    except S3Error as e:
        logger.error("MinIO upload failed for scan %s: %s", scan_id, e)
        return None
    except Exception as e:
        logger.error("Unexpected error uploading PDF for scan %s: %s", scan_id, e)
        return None


def fetch_pdf_from_minio(scan_id: str) -> Optional[bytes]:
    """Fetch the stored PDF bytes for a scan from MinIO."""
    response = None
    try:
        client = get_minio_client()
        response = client.get_object(settings.MINIO_BUCKET, _pdf_object_name(scan_id))
        return response.read()
    except S3Error as e:
        logger.error("MinIO fetch failed for scan %s: %s", scan_id, e)
        return None
    except Exception as e:
        logger.error("Unexpected error fetching PDF for scan %s: %s", scan_id, e)
        return None
    finally:
        if response is not None:
            response.close()
            response.release_conn()


def generate_and_store_pdf(scan_id: str, url: str, report_data: dict[str, Any]) -> Optional[str]:
    """Generate a PDF report, store it in MinIO, and return the object key."""
    try:
        pdf_buffer = generate_pdf_report(scan_id, url, report_data)
        return upload_pdf_to_minio(scan_id, pdf_buffer)
    except Exception as e:
        logger.error("Failed to generate and store PDF for scan %s: %s", scan_id, e)
        return None
