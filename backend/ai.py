"""
ScanAI — Gemini AI integration for security report generation.
Takes raw scanner output and produces structured, plain-English reports.
"""

import json
import logging
import re
from collections import Counter
from typing import Any
from urllib.parse import urlparse

import google.generativeai as genai

from config import settings

logger = logging.getLogger(__name__)

# Model settings
MAX_OUTPUT_TOKENS = 4096

# Structured Outputs schema for the final security report.
REPORT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["summary", "risk_score", "priority_actions", "findings"],
    "properties": {
        "summary": {
            "type": "string",
            "description": "2-4 sentence overall assessment written for a non-technical owner",
        },
        "risk_score": {
            "type": "integer",
            "minimum": 0,
            "maximum": 100,
        },
        "priority_actions": {
            "type": "array",
            "minItems": 3,
            "maxItems": 5,
            "items": {
                "type": "string",
                "description": "Short imperative action for the owner to prioritize",
            },
        },
        "findings": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "id",
                    "title",
                    "category",
                    "severity",
                    "evidence",
                    "what_it_means",
                    "how_to_fix",
                    "fix_prompt",
                    "affected",
                ],
                "properties": {
                    "id": {
                        "type": "string",
                        "description": "Unique snake_case identifier",
                    },
                    "title": {
                        "type": "string",
                        "description": "Short descriptive title",
                    },
                    "category": {
                        "type": "string",
                        "enum": [
                            "exposure",
                            "tls",
                            "headers",
                            "authentication",
                            "injection",
                            "xss",
                            "misconfiguration",
                            "information_disclosure",
                            "technology",
                            "network",
                            "other",
                        ],
                    },
                    "severity": {
                        "type": "string",
                        "enum": ["critical", "high", "medium", "low", "info"],
                    },
                    "evidence": {
                        "type": "string",
                        "description": "Short factual evidence grounded in the scanner output",
                    },
                    "what_it_means": {
                        "type": "string",
                        "description": "Plain English explanation",
                    },
                    "how_to_fix": {
                        "type": "array",
                        "items": {"type": "string"},
                        "minItems": 2,
                        "maxItems": 4,
                    },
                    "fix_prompt": {
                        "type": "string",
                        "description": "Ready-to-copy prompt for a local coding agent to fix this exact finding in the user's codebase",
                    },
                    "affected": {
                        "type": "string",
                        "description": "Affected URL, host, or port",
                    },
                },
            },
        },
    },
}


def _make_gemini_schema_compatible(value: Any) -> Any:
    """Strip JSON Schema fields that Gemini rejects in response_schema."""
    unsupported_keys = {
        "additionalProperties",
        "additional_properties",
        "minimum",
        "maximum",
        "exclusiveMinimum",
        "exclusiveMaximum",
        "minItems",
        "maxItems",
        "minLength",
        "maxLength",
        "pattern",
    }
    if isinstance(value, dict):
        cleaned: dict[str, Any] = {}
        for key, item in value.items():
            if key in unsupported_keys:
                continue
            cleaned[key] = _make_gemini_schema_compatible(item)
        return cleaned
    if isinstance(value, list):
        return [_make_gemini_schema_compatible(item) for item in value]
    return value


GEMINI_RESPONSE_SCHEMA = _make_gemini_schema_compatible(REPORT_SCHEMA)

# System prompt — instructs Gemini to act as a cybersecurity expert.
SYSTEM_PROMPT = """You are a senior application security analyst writing a client-ready security memo for a non-technical website owner.
Turn scanner evidence into a concise, trustworthy report that prioritizes what matters and ignores noise.

How to work:
- Use only the supplied scan evidence. Do not invent CVEs, exploit paths, versions, or technologies that are not present.
- Prefer externally reachable, actionable issues over weak signals or duplicate detections.
- Merge duplicate findings across tools when they describe the same root problem.
- If evidence is too weak for a standalone finding, leave it out instead of speculating.
- Keep the language plain. If you use a technical term, explain it in context.

Severity guidance:
- critical: strong evidence of severe, externally reachable compromise risk or dangerous exposure
- high: clear exploitable weakness or high-impact security gap that should be fixed soon
- medium: real weakness with narrower impact, preconditions, or defense-in-depth value
- low: limited practical impact but still worth cleaning up
- info: useful context, minor hardening note, or technology disclosure with low risk

Output guidance:
- summary: 2-4 sentences, executive tone, grounded in actual exposure and business risk
- priority_actions: 3-5 short imperative actions ordered by urgency
- findings: include only the issues worth a human owner reading about
- title: short and specific
- category: choose the best fitting enum
- evidence: one short factual line from the scan results
- what_it_means: explain the real-world risk in plain English, not scanner jargon
- how_to_fix: 2-4 concrete steps that a small engineering or IT team can follow
- fix_prompt: a self-contained prompt the user can paste into a local coding agent. Include the issue, affected asset, evidence, expected remediation, tests to add, and a request to preserve existing behavior. Do not claim the codebase is known.
- affected: a specific public URL, host, route, or host:port when available

Safety and quality rules:
- Do not say the target is "100% secure", "fully secure", "unhackable", or "safe from attackers".
- If no strong findings are present, say no priority evidence was retained within the unauthenticated automated scan scope.
- Distinguish confirmed evidence from recommended manual validation, especially for authentication, authorization, multi-tenant isolation, and business logic.
- Never mention internal file paths, local paths, private IPs, or implementation trivia unless absolutely required to explain exposure.
- Never output markdown, code fences, prose outside the JSON object, or placeholder text.
- If the target looks broadly healthy, return a low risk_score and an empty or very short findings list rather than padding the report."""


def _truncate_text(text: str, limit: int) -> str:
    """Trim long strings without breaking the prompt structure."""
    text = text.strip()
    if len(text) <= limit:
        return text
    return text[: limit - 16].rstrip() + "... [truncated]"


def _normalize_asset(value: Any) -> str:
    """Convert scanner values into compact human-readable asset labels."""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        for key in ("matched-at", "url", "host", "ip", "endpoint", "path"):
            raw = value.get(key)
            if raw:
                return str(raw).strip()
    return str(value).strip()


def _compact_scan_results(scan_results: dict[str, Any]) -> dict[str, Any]:
    """Build a smaller, higher-signal evidence packet for the model."""
    subdomains = scan_results.get("subdomains", []) or []
    dns_records = scan_results.get("dns_records", []) or []
    live_hosts = scan_results.get("live_hosts", []) or []
    open_ports = scan_results.get("open_ports", []) or []
    crawled_endpoints = scan_results.get("crawled_endpoints", []) or []
    api_discovered_routes = scan_results.get("api_discovered_routes", []) or []
    api_parameters = scan_results.get("api_parameters", []) or []
    api_schemas = scan_results.get("api_schemas", []) or []
    vulnerabilities = scan_results.get("vulnerabilities", []) or []
    api_vulnerabilities = scan_results.get("api_vulnerabilities", []) or []
    tls_analysis = scan_results.get("tls_analysis", []) or []
    tls_inventory = scan_results.get("tls_inventory", []) or []
    xss_findings = scan_results.get("xss_findings", []) or []
    webcheck = scan_results.get("webcheck", {}) if isinstance(scan_results.get("webcheck"), dict) else {}
    technology_fingerprints = scan_results.get("technology_fingerprints", []) or []
    waf_detection = scan_results.get("waf_detection", {}) if isinstance(scan_results.get("waf_detection"), dict) else {}

    host_ports: dict[str, list[int]] = {}
    for item in open_ports:
        if not isinstance(item, dict):
            continue
        host = str(item.get("host") or item.get("ip") or "unknown").strip()
        port = item.get("port")
        if host and isinstance(port, int):
            host_ports.setdefault(host, []).append(port)

    compact_vulns = []
    seen_vuln_keys: set[tuple[str, str]] = set()
    for item in vulnerabilities + api_vulnerabilities:
        if not isinstance(item, dict):
            compact_vulns.append(_truncate_text(str(item), 240))
            if len(compact_vulns) >= 60:
                break
            continue
        info = item.get("info", {}) if isinstance(item.get("info"), dict) else {}
        key = (
            str(item.get("template-id") or info.get("name") or "unknown"),
            str(item.get("matched-at") or item.get("host") or item.get("url") or "unknown"),
        )
        if key in seen_vuln_keys:
            continue
        seen_vuln_keys.add(key)
        compact_vulns.append(
            {
                "title": info.get("name") or item.get("template-id") or "Unnamed finding",
                "severity": str(info.get("severity") or item.get("severity") or "unknown").lower(),
                "matched": item.get("matched-at") or item.get("host") or item.get("url"),
                "template": item.get("template-id"),
                "tags": info.get("tags", [])[:6] if isinstance(info.get("tags"), list) else [],
                "description": _truncate_text(str(info.get("description") or ""), 220),
            }
        )
        if len(compact_vulns) >= 60:
            break

    compact_tls = []
    tls_items = tls_analysis if isinstance(tls_analysis, list) else [tls_analysis]
    for item in tls_items[:50]:
        if not isinstance(item, dict):
            compact_tls.append(_truncate_text(str(item), 220))
            continue
        severity = str(item.get("severity") or item.get("finding") or "").strip()
        finding = str(item.get("finding") or item.get("id") or item.get("test") or "").strip()
        if not severity and not finding:
            continue
        compact_tls.append(
            {
                "id": item.get("id") or item.get("test"),
                "severity": severity,
                "finding": _truncate_text(finding, 220),
                "target": item.get("ip") or item.get("fqdn") or item.get("host"),
            }
        )

    live_host_samples = []
    for item in live_hosts[:25]:
        if not isinstance(item, dict):
            live_host_samples.append(_truncate_text(str(item), 180))
            continue
        live_host_samples.append(
            {
                "url": item.get("url") or item.get("input"),
                "status": item.get("status-code"),
                "title": _truncate_text(str(item.get("title") or ""), 90),
                "tech": (item.get("tech") or [])[:6] if isinstance(item.get("tech"), list) else [],
            }
        )

    dns_samples = []
    for item in dns_records[:30]:
        if not isinstance(item, dict):
            dns_samples.append(_truncate_text(str(item), 180))
            continue
        dns_samples.append(
            {
                "host": item.get("host") or item.get("input"),
                "a": item.get("a") or item.get("A"),
                "aaaa": item.get("aaaa") or item.get("AAAA"),
                "cname": item.get("cname") or item.get("CNAME"),
                "mx": item.get("mx") or item.get("MX"),
            }
        )

    crawl_samples = []
    for item in crawled_endpoints[:40]:
        if isinstance(item, dict):
            crawl_samples.append(
                item.get("request", {}).get("endpoint")
                or item.get("url")
                or item.get("path")
                or _truncate_text(str(item), 180)
            )
        else:
            crawl_samples.append(_truncate_text(str(item), 180))

    route_samples = []
    for item in api_discovered_routes[:30]:
        if not isinstance(item, dict):
            route_samples.append(_truncate_text(str(item), 180))
            continue
        route_samples.append(
            {
                "url": item.get("url"),
                "path": item.get("path"),
                "status": item.get("status"),
                "source": item.get("source") or "ffuf",
            }
        )

    parameter_samples = []
    for item in api_parameters[:20]:
        if not isinstance(item, dict):
            parameter_samples.append(_truncate_text(str(item), 180))
            continue
        params = item.get("parameters") if isinstance(item.get("parameters"), list) else []
        parameter_samples.append(
            {
                "url": item.get("url"),
                "parameters": [str(param) for param in params[:20]],
                "source": item.get("source") or "arjun",
            }
        )

    schema_samples = []
    for item in api_schemas[:4]:
        if not isinstance(item, dict):
            schema_samples.append(_truncate_text(str(item), 220))
            continue
        schema_samples.append(
            {
                "url": item.get("url"),
                "title": item.get("title"),
                "version": item.get("version"),
                "schema_version": item.get("schema_version"),
                "path_count": item.get("path_count"),
                "operation_count": item.get("operation_count"),
                "methods": item.get("methods", [])[:10] if isinstance(item.get("methods"), list) else [],
                "auth_schemes": item.get("auth_schemes", [])[:10] if isinstance(item.get("auth_schemes"), list) else [],
                "sample_operations": item.get("sample_operations", [])[:12] if isinstance(item.get("sample_operations"), list) else [],
            }
        )

    tls_inventory_samples = []
    for item in tls_inventory[:30]:
        if not isinstance(item, dict):
            tls_inventory_samples.append(_truncate_text(str(item), 180))
            continue
        tls_inventory_samples.append(
            {
                "host": item.get("host") or item.get("ip"),
                "tls_version": item.get("tls_version") or item.get("version"),
                "cipher": item.get("cipher"),
                "cn": item.get("cn") or item.get("common_name"),
                "issuer": item.get("issuer_cn") or item.get("issuer"),
                "expired": item.get("expired"),
                "self_signed": item.get("self_signed"),
            }
        )

    compact_xss = []
    for item in xss_findings[:30]:
        if not isinstance(item, dict):
            compact_xss.append(_truncate_text(str(item), 220))
            continue
        compact_xss.append(
            {
                "type": item.get("type") or item.get("vuln") or item.get("severity"),
                "target": item.get("target") or item.get("url") or item.get("path"),
                "param": item.get("param") or item.get("parameter"),
                "evidence": _truncate_text(str(item.get("evidence") or item.get("message") or ""), 220),
            }
        )

    return {
        "overview": {
            "subdomains_found": len(subdomains),
            "dns_records_found": len(dns_records),
            "live_hosts_found": len(live_hosts),
            "open_ports_found": len(open_ports),
            "crawled_endpoints_found": len(crawled_endpoints),
            "api_routes_discovered": len(api_discovered_routes),
            "api_parameterized_endpoints": len(api_parameters),
            "api_schemas_found": len(api_schemas),
            "scanner_findings_found": len(vulnerabilities),
            "api_signals_found": len(api_vulnerabilities),
            "tls_signals_found": len(tls_items),
            "tls_inventory_found": len(tls_inventory),
            "xss_signals_found": len(xss_findings),
            "web_enrichment_elapsed_ms": webcheck.get("elapsed_ms"),
            "technology_fingerprints_found": len(technology_fingerprints),
            "waf_detected": waf_detection.get("detected"),
        },
        "webcheck": {
            "http": webcheck.get("http", {}),
            "page": {
                "title": (webcheck.get("page") or {}).get("title"),
                "social_tags": (webcheck.get("page") or {}).get("social_tags", {}),
                "same_origin_links": (webcheck.get("page") or {}).get("same_origin_links", [])[:20],
                "external_hosts": (webcheck.get("page") or {}).get("external_hosts", [])[:20],
                "forms": (webcheck.get("page") or {}).get("forms", [])[:10],
                "features": (webcheck.get("page") or {}).get("features", {}),
            },
            "crawl_rules": webcheck.get("crawl_rules", {}),
            "dnssec": webcheck.get("dnssec", {}),
            "mail_security": webcheck.get("mail_security", {}),
            "port_profile": webcheck.get("port_profile", {}),
        },
        "technology_fingerprints": technology_fingerprints[:40],
        "waf_detection": waf_detection,
        "subdomain_samples": [_normalize_asset(item.get("host") if isinstance(item, dict) else item) for item in subdomains[:20]],
        "dns_samples": dns_samples,
        "live_host_samples": live_host_samples,
        "open_port_map": [
            {"host": host, "ports": sorted(set(ports))[:12]}
            for host, ports in list(host_ports.items())[:12]
        ],
        "crawled_endpoint_samples": crawl_samples,
        "api_route_samples": route_samples,
        "api_parameter_samples": parameter_samples,
        "api_schema_samples": schema_samples,
        "vulnerability_samples": compact_vulns,
        "tls_samples": compact_tls,
        "tls_inventory_samples": tls_inventory_samples,
        "xss_samples": compact_xss,
    }


def _derive_visuals(scan_results: dict[str, Any], report: dict[str, Any]) -> dict[str, Any]:
    """Compute reliable visual summary data from the scan and final findings."""
    findings = report.get("findings", []) or []
    webcheck = scan_results.get("webcheck", {}) if isinstance(scan_results.get("webcheck"), dict) else {}
    waf_detection = scan_results.get("waf_detection", {}) if isinstance(scan_results.get("waf_detection"), dict) else {}
    page = webcheck.get("page", {}) if isinstance(webcheck.get("page"), dict) else {}
    http = webcheck.get("http", {}) if isinstance(webcheck.get("http"), dict) else {}
    security_headers = http.get("security_headers", {}) if isinstance(http.get("security_headers"), dict) else {}
    crawl_rules = webcheck.get("crawl_rules", {}) if isinstance(webcheck.get("crawl_rules"), dict) else {}
    severity_counts = Counter(str(item.get("severity", "info")).lower() for item in findings)
    category_counts = Counter(str(item.get("category", "other")).lower() for item in findings)
    affected_counts = Counter()
    api_paths: list[dict[str, str]] = []
    api_docs: list[dict[str, str]] = []
    parameterized_routes: list[dict[str, Any]] = []
    schema_routes: list[dict[str, Any]] = []

    for item in findings:
        affected = str(item.get("affected") or "").strip()
        if affected:
            affected_counts[affected] += 1

    attack_surface = {
        "subdomains": len(scan_results.get("subdomains", []) or []),
        "dns_records": len(scan_results.get("dns_records", []) or []),
        "live_hosts": len(scan_results.get("live_hosts", []) or []),
        "open_ports": len(scan_results.get("open_ports", []) or []),
        "crawled_endpoints": len(scan_results.get("crawled_endpoints", []) or []),
        "api_routes": len(scan_results.get("api_discovered_routes", []) or []),
        "parameterized_endpoints": len(scan_results.get("api_parameters", []) or []),
        "api_schemas": len(scan_results.get("api_schemas", []) or []),
        "scanner_findings": len(scan_results.get("vulnerabilities", []) or []),
        "api_signals": len(scan_results.get("api_vulnerabilities", []) or []),
        "tls_signals": len(scan_results.get("tls_analysis", []) or []),
        "tls_inventory": len(scan_results.get("tls_inventory", []) or []),
        "xss_signals": len(scan_results.get("xss_findings", []) or []),
        "same_origin_links": len(page.get("same_origin_links", []) or []),
        "external_hosts": len(page.get("external_hosts", []) or []),
        "technology_fingerprints": len(scan_results.get("technology_fingerprints", []) or []),
    }

    api_markers = (
        "/api",
        "/graphql",
        "/gql",
        "/rest",
        "/v1",
        "/v2",
        "/v3",
        "swagger",
        "openapi",
        "api-docs",
        "redoc",
    )
    doc_markers = ("swagger", "openapi", "api-docs", "redoc", "graphql")
    seen_paths: set[str] = set()
    api_source_items: list[dict[str, Any]] = []
    api_source_items.extend([item for item in scan_results.get("crawled_endpoints", []) or [] if isinstance(item, dict)])
    api_source_items.extend([item for item in scan_results.get("api_discovered_routes", []) or [] if isinstance(item, dict)])

    for item in api_source_items:
        if not isinstance(item, dict):
            continue
        raw_url = (
            item.get("request", {}).get("endpoint")
            or item.get("url")
            or item.get("endpoint")
            or item.get("path")
        )
        if not raw_url:
            continue
        parsed = urlparse(str(raw_url))
        path = parsed.path or str(raw_url)
        if not path or path in seen_paths:
            continue
        lowered = path.lower()
        if not any(marker in lowered for marker in api_markers):
            continue
        seen_paths.add(path)
        entry = {"path": path, "url": str(raw_url)}
        if any(marker in lowered for marker in doc_markers):
            api_docs.append(entry)
        else:
            api_paths.append(entry)

    for item in scan_results.get("api_parameters", []) or []:
        if not isinstance(item, dict):
            continue
        params = item.get("parameters") if isinstance(item.get("parameters"), list) else []
        if not params:
            continue
        parameterized_routes.append(
            {
                "url": str(item.get("url") or ""),
                "parameters": [str(param) for param in params[:20]],
                "parameter_count": len(params),
            }
        )

    for schema in scan_results.get("api_schemas", []) or []:
        if not isinstance(schema, dict):
            continue
        schema_routes.append(
            {
                "url": str(schema.get("url") or ""),
                "title": str(schema.get("title") or "Untitled API"),
                "version": schema.get("version"),
                "schema_version": schema.get("schema_version"),
                "path_count": int(schema.get("path_count") or 0),
                "operation_count": int(schema.get("operation_count") or 0),
                "methods": schema.get("methods", [])[:10] if isinstance(schema.get("methods"), list) else [],
                "auth_schemes": schema.get("auth_schemes", [])[:10] if isinstance(schema.get("auth_schemes"), list) else [],
                "sample_operations": schema.get("sample_operations", [])[:12] if isinstance(schema.get("sample_operations"), list) else [],
            }
        )

    return {
        "attack_surface": attack_surface,
        "api_surface": {
            "candidate_routes": api_paths[:12],
            "documentation_endpoints": api_docs[:8],
            "parameterized_routes": parameterized_routes[:8],
            "schemas": schema_routes[:4],
            "candidate_route_count": len(api_paths),
            "documentation_endpoint_count": len(api_docs),
            "parameterized_route_count": len(parameterized_routes),
            "schema_count": len(schema_routes),
        },
        "web_intelligence": {
            "final_url": http.get("final_url"),
            "status": http.get("status"),
            "response_time_ms": http.get("response_time_ms"),
            "security_header_score": security_headers.get("score"),
            "missing_security_headers": security_headers.get("missing", [])[:12],
            "hsts": security_headers.get("hsts", {}),
            "cookie_summary": http.get("cookie_summary", {}),
            "server_fingerprints": http.get("server_fingerprints", {}),
            "dnssec": webcheck.get("dnssec", {}),
            "mail_security": webcheck.get("mail_security", {}),
            "robots": crawl_rules.get("robots", {}),
            "sitemap": crawl_rules.get("sitemap", {}),
            "security_txt": crawl_rules.get("security_txt", {}),
            "port_profile": webcheck.get("port_profile", {}),
            "waf_detection": waf_detection,
            "technology_fingerprints": scan_results.get("technology_fingerprints", [])[:30],
        },
        "assurance": {
            "mode": "unauthenticated_external_scan",
            "coverage_notes": [
                "Tests are limited to externally reachable assets and responses available without customer credentials.",
                "Authorization, tenant isolation, and business-logic abuse require authenticated API schemas, tokens, and approved test accounts.",
                "Findings are retained only when scanner evidence is strong enough to support remediation.",
            ],
        },
        "severity_breakdown": {
            level: int(severity_counts.get(level, 0))
            for level in ("critical", "high", "medium", "low", "info")
        },
        "category_breakdown": dict(sorted(category_counts.items())),
        "top_affected_assets": [
            {"asset": asset, "count": count}
            for asset, count in affected_counts.most_common(6)
        ],
    }


def _build_user_message(url: str, scan_results: dict[str, Any]) -> str:
    """
    Build the user message for Gemini with all scanner outputs.
    Truncates very large outputs to stay within token limits.
    """
    compact_results = _compact_scan_results(scan_results)
    message_parts = [
        f"Target scanned: {url}",
        "",
        "Normalized evidence packet:",
        json.dumps(compact_results, indent=2, default=str),
        "",
        "Generate the security report JSON from this evidence.",
    ]
    return "\n".join(message_parts)


def _strip_json_fences(text: str) -> str:
    """Remove accidental markdown JSON fences from Gemini's response."""
    text = text.strip()
    pattern = r"^```(?:json)?\s*\n?(.*?)\n?\s*```$"
    match = re.match(pattern, text, re.DOTALL)
    if match:
        return match.group(1).strip()
    return text


def _build_fix_prompt(finding: dict[str, Any]) -> str:
    """Create a safe remediation prompt when the model omitted one."""
    title = str(finding.get("title") or "Security finding").strip()
    severity = str(finding.get("severity") or "unknown").strip()
    category = str(finding.get("category") or "other").strip()
    affected = str(finding.get("affected") or "Unknown").strip()
    evidence = str(finding.get("evidence") or "No concise evidence provided.").strip()
    meaning = str(finding.get("what_it_means") or "").strip()
    steps = finding.get("how_to_fix") or []
    if isinstance(steps, list):
        remediation = "\n".join(f"- {str(step).strip()}" for step in steps if str(step).strip())
    else:
        remediation = f"- {str(steps).strip()}"

    return (
        "You are working in my local codebase as a senior application security engineer. "
        "Please inspect the implementation that serves the affected asset, fix the security issue, "
        "and add focused regression tests without changing unrelated behavior.\n\n"
        f"Finding: {title}\n"
        f"Severity: {severity}\n"
        f"Category: {category}\n"
        f"Affected asset: {affected}\n"
        f"Evidence from scanner: {evidence}\n"
        f"Risk explanation: {meaning or 'Review the scanner evidence and verify impact in the codebase.'}\n\n"
        "Expected remediation:\n"
        f"{remediation or '- Implement the safest fix that removes the vulnerable behavior.'}\n\n"
        "Acceptance criteria:\n"
        "- Identify the exact route, handler, middleware, config, or dependency responsible.\n"
        "- Implement the smallest durable fix.\n"
        "- Add or update tests that would have failed before the fix.\n"
        "- Run the relevant lint/test/build commands and summarize the changed files."
    )


def _validate_report(report: dict[str, Any]) -> dict[str, Any]:
    """
    Validate the AI-generated report has the expected structure.
    Fills in defaults for missing fields.
    """
    if "summary" not in report:
        report["summary"] = "Security assessment completed."

    if "risk_score" not in report:
        report["risk_score"] = 50
    else:
        report["risk_score"] = max(0, min(100, int(report["risk_score"])))

    if "priority_actions" not in report or not isinstance(report["priority_actions"], list):
        report["priority_actions"] = []

    if "findings" not in report:
        report["findings"] = []

    valid_severities = {"critical", "high", "medium", "low", "info"}
    valid_categories = {
        "exposure",
        "tls",
        "headers",
        "authentication",
        "injection",
        "xss",
        "misconfiguration",
        "information_disclosure",
        "technology",
        "network",
        "other",
    }
    for i, finding in enumerate(report["findings"]):
        if "id" not in finding:
            finding["id"] = f"finding_{i + 1}"
        if "title" not in finding:
            finding["title"] = "Unnamed finding"
        if "category" not in finding or finding["category"] not in valid_categories:
            finding["category"] = "other"
        if "severity" not in finding or finding["severity"] not in valid_severities:
            finding["severity"] = "info"
        if "evidence" not in finding:
            finding["evidence"] = "No concise evidence provided."
        if "what_it_means" not in finding:
            finding["what_it_means"] = "No description available."
        if "how_to_fix" not in finding:
            finding["how_to_fix"] = ["Review this finding with your IT team."]
        if not isinstance(finding.get("how_to_fix"), list):
            finding["how_to_fix"] = [str(finding.get("how_to_fix"))]
        if "affected" not in finding:
            finding["affected"] = "Unknown"
        if "fix_prompt" not in finding or not str(finding["fix_prompt"]).strip():
            finding["fix_prompt"] = _build_fix_prompt(finding)

    if not report["priority_actions"]:
        fallback_actions = []
        for finding in report["findings"][:5]:
            steps = finding.get("how_to_fix") or []
            if steps:
                fallback_actions.append(str(steps[0]))
        report["priority_actions"] = fallback_actions[:4] or [
            "Review the report with your engineering or IT owner.",
            "Address the highest-severity exposed issue first.",
            "Re-run the scan after remediation to confirm closure.",
        ]

    return report


def _extract_response_text(response: Any) -> str:
    """Extract text from a Gemini GenerateContentResponse object."""
    text = getattr(response, "text", "") or ""
    if text.strip():
        return text.strip()

    try:
        candidates = getattr(response, "candidates", []) or []
        for candidate in candidates:
            content = getattr(candidate, "content", None)
            parts = getattr(content, "parts", []) if content else []
            for part in parts or []:
                value = getattr(part, "text", "") or ""
                if value.strip():
                    return value.strip()
    except Exception:
        pass

    return ""


def _extract_usage(response: Any) -> dict[str, int]:
    """Return a normalized token usage dict from the Gemini response."""
    usage = getattr(response, "usage_metadata", None)
    if not usage:
        return {}

    prompt_tokens = getattr(usage, "prompt_token_count", None)
    completion_tokens = getattr(usage, "candidates_token_count", None)
    total_tokens = getattr(usage, "total_token_count", None)

    return {
        "prompt_tokens": int(prompt_tokens or 0),
        "completion_tokens": int(completion_tokens or 0),
        "total_tokens": int(total_tokens or 0),
    }


def _extract_parsed_report(response: Any) -> dict[str, Any] | None:
    """Prefer the SDK-parsed structured output over raw text JSON parsing."""
    parsed = getattr(response, "parsed", None)
    if parsed is None:
        return None

    if isinstance(parsed, dict):
        return parsed

    if isinstance(parsed, str):
        try:
            return json.loads(parsed)
        except json.JSONDecodeError:
            return None

    if hasattr(parsed, "model_dump"):
        try:
            dumped = parsed.model_dump()
            if isinstance(dumped, dict):
                return dumped
        except Exception:
            return None

    return None


def _is_retryable_error(err_msg: str) -> bool:
    """Decide whether an error is safe to retry or fall back from."""
    lowered = err_msg.lower()
    return any(
        token in lowered
        for token in (
            "429",
            "rate limit",
            "quota",
            "resource_exhausted",
            "timeout",
            "temporarily unavailable",
            "service unavailable",
            "model not found",
            "not supported",
            "does not exist",
            "invalid argument",
            "invalid_request_error",
        )
    )


def generate_report(url: str, scan_results: dict[str, Any]) -> dict[str, Any]:
    """
    Generate a structured security report using Google Gemini.
    """
    if not settings.GEMINI_API_KEY:
        raise Exception("GEMINI_API_KEY is not configured.")

    user_message = _build_user_message(url, scan_results)
    return _generate_with_gemini(user_message, scan_results)


def _generate_with_gemini(user_message: str, scan_results: dict[str, Any]) -> dict[str, Any]:
    """Internal helper for Gemini generation using the SDK."""
    genai.configure(api_key=settings.GEMINI_API_KEY)

    models = settings.gemini_model_candidates
    last_error = None

    for model_name in models:
        try:
            logger.info(f"Calling Gemini API ({model_name}) for report generation")

            model = genai.GenerativeModel(
                model_name=model_name,
                system_instruction=SYSTEM_PROMPT,
                generation_config={
                    "temperature": 0.3,
                    "max_output_tokens": MAX_OUTPUT_TOKENS,
                    "response_mime_type": "application/json",
                    "response_schema": GEMINI_RESPONSE_SCHEMA,
                },
            )

            response = model.generate_content(user_message)

            # Extract report
            report = _extract_parsed_report(response)
            if not report:
                raw_text = _extract_response_text(response)
                if raw_text:
                    cleaned = _strip_json_fences(raw_text)
                    report = json.loads(cleaned)

            if not report:
                raise Exception("Gemini returned an empty or unparseable response.")

            report = _validate_report(report)
            report["_visuals"] = _derive_visuals(scan_results, report)
            report["_token_usage"] = _extract_usage(response)
            report["_model_used"] = model_name
            report["_provider"] = "gemini"

            return report

        except Exception as e:
            last_error = e
            logger.warning(f"Gemini model {model_name} failed: {e}")
            continue

    raise Exception(f"All Gemini models failed. Last error: {last_error}")
