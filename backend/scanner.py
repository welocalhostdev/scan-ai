"""
ScanAI — Subprocess wrappers for security scanning tools.
Each function runs a tool as a subprocess, captures JSON output, and returns parsed results.
All tools are expected to be installed in the Docker worker container.
"""

import asyncio
import json
import os
import logging
import re
import time
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx as httpx_client
import yaml

from config import settings

logger = logging.getLogger(__name__)

# Ensure output directory exists
OUTPUT_DIR = Path(settings.SCAN_OUTPUT_DIR)

API_DISCOVERY_WORDS = [
    "api",
    "api/v1",
    "api/v2",
    "v1",
    "v2",
    "v3",
    "rest",
    "graphql",
    "gql",
    "swagger",
    "swagger-ui",
    "swagger.json",
    "api-docs",
    "openapi.json",
    "openapi.yaml",
    "redoc",
    "docs",
    "health",
    "status",
    "metrics",
    "admin",
    "internal",
    "auth",
    "login",
    "logout",
    "users",
    "user",
    "accounts",
    "organizations",
    "orgs",
    "projects",
    "webhooks",
    "tokens",
    "keys",
    "settings",
    "config",
    "search",
    "upload",
    "files",
    "billing",
    "payments",
    "reports",
]

OPENAPI_CANDIDATE_PATHS = [
    "openapi.json",
    "openapi.yaml",
    "openapi.yml",
    "swagger.json",
    "swagger.yaml",
    "swagger.yml",
    "api-docs",
    "api/docs",
    "api/swagger.json",
    "api/openapi.json",
    "v1/openapi.json",
    "v2/openapi.json",
    "docs/openapi.json",
]

HTTP_METHODS = {"get", "post", "put", "patch", "delete", "options", "head", "trace"}
SECURITY_HEADERS = {
    "strict-transport-security": "HTTP Strict Transport Security",
    "content-security-policy": "Content Security Policy",
    "x-frame-options": "Clickjacking protection",
    "x-content-type-options": "MIME sniffing protection",
    "referrer-policy": "Referrer policy",
    "permissions-policy": "Browser permissions policy",
    "cross-origin-opener-policy": "Cross-origin opener isolation",
    "cross-origin-embedder-policy": "Cross-origin embedder isolation",
    "cross-origin-resource-policy": "Cross-origin resource policy",
}

FINGERPRINT_HEADERS = {
    "server",
    "x-powered-by",
    "x-aspnet-version",
    "x-aspnetmvc-version",
    "x-generator",
    "via",
    "x-cache",
    "cf-cache-status",
    "cf-ray",
    "x-vercel-id",
    "x-served-by",
}

COMMON_SERVICE_PORTS = {
    20: "ftp-data",
    21: "ftp",
    22: "ssh",
    23: "telnet",
    25: "smtp",
    53: "dns",
    80: "http",
    110: "pop3",
    143: "imap",
    443: "https",
    445: "smb",
    465: "smtps",
    587: "submission",
    993: "imaps",
    995: "pop3s",
    1433: "mssql",
    1521: "oracle",
    2049: "nfs",
    2375: "docker",
    2376: "docker-tls",
    3000: "node-dev",
    3306: "mysql",
    3389: "rdp",
    5432: "postgresql",
    5601: "kibana",
    5900: "vnc",
    6379: "redis",
    8080: "http-alt",
    8443: "https-alt",
    9200: "elasticsearch",
    9300: "elasticsearch-transport",
    11211: "memcached",
    27017: "mongodb",
}

COMMON_TLS_PORTS = {443, 4443, 8443, 9443}


def _ensure_output_dir() -> None:
    """Create the scan output directory if it doesn't exist."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def _output_path(scan_id: str, suffix: str) -> str:
    """Generate a unique output file path for a scan tool."""
    return str(OUTPUT_DIR / f"{scan_id}_{suffix}.json")


def _text_output_path(scan_id: str, suffix: str) -> str:
    """Generate a unique text output path for helper inputs."""
    return str(OUTPUT_DIR / f"{scan_id}_{suffix}.txt")


def _auth_header_args(auth_headers: dict[str, str] | None) -> list[str]:
    args: list[str] = []
    for name, value in (auth_headers or {}).items():
        if name and value:
            args.extend(["-H", f"{name}: {value}"])
    return args


def _merge_headers(base: dict[str, str], auth_headers: dict[str, str] | None) -> dict[str, str]:
    merged = dict(base)
    for name, value in (auth_headers or {}).items():
        if name and value:
            merged[name] = value
    return merged


def _redact_command(cmd: list[str]) -> str:
    redacted_cmd = []
    redact_next = False
    for part in cmd:
        if redact_next:
            redacted_cmd.append("[redacted-header]")
            redact_next = False
            continue
        redacted_cmd.append(part)
        if part in {"-H", "--header", "-header"}:
            redact_next = True
    return " ".join(redacted_cmd)


async def _run_subprocess(
    cmd: list[str],
    timeout: int | None = None,
    stdin_data: str | None = None,
) -> tuple[str, str, int]:
    """
    Run a subprocess command with optional timeout and stdin piping.

    Returns: (stdout, stderr, returncode)
    Raises: asyncio.TimeoutError if timeout exceeded.
    """
    effective_timeout = timeout or settings.TOOL_TIMEOUT_SECONDS

    logger.info(f"Running command: {_redact_command(cmd)}")

    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        stdin=asyncio.subprocess.PIPE if stdin_data else None,
    )

    try:
        stdout, stderr = await asyncio.wait_for(
            process.communicate(
                input=stdin_data.encode() if stdin_data else None
            ),
            timeout=effective_timeout,
        )
    except asyncio.TimeoutError:
        process.kill()
        await process.wait()
        raise asyncio.TimeoutError(
            f"Command timed out after {effective_timeout}s: {_redact_command(cmd)}"
        )

    return (
        stdout.decode(errors="replace"),
        stderr.decode(errors="replace"),
        process.returncode or 0,
    )


def _parse_jsonl_file(filepath: str) -> list[dict[str, Any]]:
    """
    Parse a JSON Lines file (one JSON object per line).
    Most ProjectDiscovery tools output JSONL format.
    Skips empty lines and lines that aren't valid JSON.
    """
    results = []
    try:
        with open(filepath, "r") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    results.append(json.loads(line))
                except json.JSONDecodeError:
                    logger.warning(f"Skipping invalid JSON line: {line[:100]}")
    except FileNotFoundError:
        logger.warning(f"Output file not found: {filepath}")
    return results


def _parse_json_file(filepath: str) -> Any:
    """Parse a standard JSON file (single JSON object/array)."""
    try:
        with open(filepath, "r") as f:
            return json.load(f)
    except FileNotFoundError:
        logger.warning(f"Output file not found: {filepath}")
        return []
    except json.JSONDecodeError as e:
        logger.warning(f"Invalid JSON in {filepath}: {e}")
        return []


def _target_base_url(url: str) -> str:
    parsed = urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        return url.rstrip("/") + "/"
    return f"{parsed.scheme}://{parsed.netloc}/"


def _write_api_wordlist(scan_id: str) -> str:
    _ensure_output_dir()
    filepath = _text_output_path(scan_id, "api_words")
    with open(filepath, "w") as f:
        f.write("\n".join(API_DISCOVERY_WORDS))
    return filepath


def _normalize_url(value: str) -> str:
    value = value.strip()
    if not value:
        return value
    parsed = urlparse(value)
    if not parsed.scheme:
        return value
    return parsed._replace(fragment="").geturl().rstrip("/")


def _collect_parameter_names(value: Any) -> list[str]:
    """Extract likely parameter names from Arjun JSON shapes."""
    params: list[str] = []
    if isinstance(value, str):
        if value.strip():
            params.append(value.strip())
    elif isinstance(value, list):
        for item in value:
            params.extend(_collect_parameter_names(item))
    elif isinstance(value, dict):
        for key, item in value.items():
            if key in {"params", "parameters", "get", "post", "json", "xml"}:
                params.extend(_collect_parameter_names(item))
            elif isinstance(item, (list, dict)):
                params.extend(_collect_parameter_names(item))
    return params


def _safe_yaml_load(text: str) -> Any:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return yaml.safe_load(text)


class _WebMetadataParser(HTMLParser):
    """Small HTML metadata/link parser for fast passive enrichment."""

    def __init__(self, base_url: str):
        super().__init__(convert_charrefs=True)
        self.base_url = base_url
        self.title_parts: list[str] = []
        self._in_title = False
        self.meta: dict[str, str] = {}
        self.links: list[str] = []
        self.scripts: list[str] = []
        self.forms: list[dict[str, Any]] = []
        self.features = {
            "password_inputs": 0,
            "external_scripts": 0,
            "inline_scripts": 0,
            "forms": 0,
        }

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = {key.lower(): (value or "") for key, value in attrs}
        tag = tag.lower()
        if tag == "title":
            self._in_title = True
            return

        if tag == "meta":
            key = attr.get("property") or attr.get("name")
            content = attr.get("content")
            if key and content:
                normalized_key = key.strip().lower()
                if normalized_key.startswith(("og:", "twitter:", "description")):
                    self.meta[normalized_key] = content.strip()[:300]
            return

        if tag == "a" and attr.get("href"):
            self.links.append(urljoin(self.base_url, attr["href"]))
            return

        if tag == "script":
            src = attr.get("src")
            if src:
                absolute = urljoin(self.base_url, src)
                self.scripts.append(absolute)
                base_host = urlparse(self.base_url).hostname
                script_host = urlparse(absolute).hostname
                if base_host and script_host and base_host != script_host:
                    self.features["external_scripts"] += 1
            else:
                self.features["inline_scripts"] += 1
            return

        if tag == "form":
            self.features["forms"] += 1
            self.forms.append(
                {
                    "method": (attr.get("method") or "get").upper(),
                    "action": urljoin(self.base_url, attr.get("action") or ""),
                }
            )
            return

        if tag == "input" and attr.get("type", "").lower() == "password":
            self.features["password_inputs"] += 1

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            value = data.strip()
            if value:
                self.title_parts.append(value)

    @property
    def title(self) -> str:
        return " ".join(self.title_parts).strip()[:180]


def _header_value(headers: httpx_client.Headers | dict[str, str], name: str) -> str | None:
    try:
        value = headers.get(name)
    except AttributeError:
        value = None
    return value.strip() if isinstance(value, str) and value.strip() else None


def _analyze_security_headers(url: str, headers: httpx_client.Headers) -> dict[str, Any]:
    present: dict[str, str] = {}
    missing: list[dict[str, str]] = []
    for header, label in SECURITY_HEADERS.items():
        value = _header_value(headers, header)
        if value:
            present[header] = value[:500]
        elif header != "strict-transport-security" or urlparse(url).scheme == "https":
            missing.append({"header": header, "purpose": label})

    hsts = present.get("strict-transport-security", "")
    hsts_directives = {part.strip().lower() for part in hsts.split(";") if part.strip()}
    max_age = 0
    for directive in hsts_directives:
        if directive.startswith("max-age="):
            try:
                max_age = int(directive.split("=", 1)[1])
            except ValueError:
                max_age = 0
            break

    score = max(0, 100 - (len(missing) * 10))
    if hsts and max_age < 15_552_000:
        score = max(0, score - 10)
    if _header_value(headers, "content-security-policy") and "unsafe-inline" in present.get("content-security-policy", ""):
        score = max(0, score - 5)

    return {
        "score": score,
        "present": present,
        "missing": missing,
        "hsts": {
            "enabled": bool(hsts),
            "max_age": max_age,
            "include_subdomains": "includesubdomains" in hsts_directives,
            "preload": "preload" in hsts_directives,
        },
    }


async def _dig_short(name: str, record_type: str, timeout: int = 8) -> list[str]:
    try:
        stdout, stderr, returncode = await _run_subprocess(
            ["dig", "+short", name, record_type],
            timeout=timeout,
        )
    except Exception as e:
        logger.debug(f"dig failed for {name} {record_type}: {e}")
        return []

    if returncode != 0:
        logger.debug(f"dig returned code {returncode} for {name} {record_type}: {stderr[:200]}")
        return []
    return [line.strip().strip('"') for line in stdout.splitlines() if line.strip()]


async def _dnssec_status(domain: str) -> dict[str, Any]:
    ds_records, dnskey_records = await asyncio.gather(
        _dig_short(domain, "DS"),
        _dig_short(domain, "DNSKEY"),
    )
    return {
        "enabled": bool(ds_records or dnskey_records),
        "ds_records": ds_records[:6],
        "dnskey_records": dnskey_records[:4],
    }


async def _mail_policy_status(domain: str) -> dict[str, Any]:
    mx_records, txt_records, dmarc_records = await asyncio.gather(
        _dig_short(domain, "MX"),
        _dig_short(domain, "TXT"),
        _dig_short(f"_dmarc.{domain}", "TXT"),
    )
    spf_records = [record for record in txt_records if record.lower().startswith("v=spf1")]
    dmarc_policy = None
    if dmarc_records:
        policy_match = re.search(r"\bp=([a-zA-Z0-9_-]+)", " ".join(dmarc_records))
        dmarc_policy = policy_match.group(1).lower() if policy_match else None
    return {
        "mx_records": mx_records[:12],
        "spf_records": spf_records[:4],
        "dmarc_records": dmarc_records[:4],
        "has_mx": bool(mx_records),
        "has_spf": bool(spf_records),
        "has_dmarc": bool(dmarc_records),
        "dmarc_policy": dmarc_policy,
    }


async def _fetch_text_resource(
    client: httpx_client.AsyncClient,
    url: str,
    max_bytes: int = 250_000,
) -> dict[str, Any]:
    try:
        response = await client.get(url)
    except httpx_client.HTTPError as e:
        return {"url": url, "available": False, "error": str(e)[:160]}
    text = response.text[:max_bytes] if response.status_code < 500 else ""
    return {
        "url": str(response.url),
        "available": response.status_code in {200, 201, 202},
        "status": response.status_code,
        "content_type": response.headers.get("content-type"),
        "bytes": len(response.content),
        "body": text,
    }


def _summarize_robots(resource: dict[str, Any]) -> dict[str, Any]:
    body = str(resource.pop("body", "") or "")
    disallows = []
    sitemaps = []
    for raw_line in body.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        key, _, value = line.partition(":")
        key = key.strip().lower()
        value = value.strip()
        if key == "disallow" and value:
            disallows.append(value)
        elif key == "sitemap" and value:
            sitemaps.append(value)
    return {**resource, "disallow_count": len(disallows), "sample_disallows": disallows[:20], "sitemaps": sitemaps[:10]}


def _summarize_sitemap(resource: dict[str, Any]) -> dict[str, Any]:
    body = str(resource.pop("body", "") or "")
    urls = re.findall(r"<loc>\s*([^<]+?)\s*</loc>", body, flags=re.IGNORECASE)
    return {**resource, "url_count": len(urls), "sample_urls": urls[:20]}


def _summarize_security_txt(resource: dict[str, Any]) -> dict[str, Any]:
    body = str(resource.pop("body", "") or "")
    fields: dict[str, list[str]] = {}
    for raw_line in body.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        key, _, value = line.partition(":")
        if key and value:
            fields.setdefault(key.strip().lower(), []).append(value.strip()[:240])
    return {**resource, "fields": fields, "contact_count": len(fields.get("contact", []))}


def _summarize_ports(open_ports: list[dict[str, Any]] | None) -> dict[str, Any]:
    exposed = []
    risky = []
    for item in open_ports or []:
        if not isinstance(item, dict):
            continue
        port = item.get("port")
        try:
            port_number = int(port)
        except (TypeError, ValueError):
            continue
        service = COMMON_SERVICE_PORTS.get(port_number, "unknown")
        host = str(item.get("host") or item.get("ip") or item.get("url") or "").strip()
        entry = {"host": host, "port": port_number, "service": service}
        exposed.append(entry)
        if port_number not in {80, 443}:
            risky.append(entry)
    return {
        "open_port_count": len(exposed),
        "exposed_services": exposed[:60],
        "non_web_services": risky[:30],
    }


def _normalize_technology_items(data: Any) -> list[dict[str, Any]]:
    """Normalize webanalyze-style technology fingerprints."""
    raw_matches: list[Any] = []
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict) and isinstance(item.get("matches"), list):
                raw_matches.extend(item["matches"])
            elif isinstance(item, dict):
                raw_matches.append(item)
    elif isinstance(data, dict):
        if isinstance(data.get("matches"), list):
            raw_matches.extend(data["matches"])
        elif isinstance(data.get("technologies"), list):
            raw_matches.extend(data["technologies"])

    technologies: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in raw_matches:
        if not isinstance(item, dict):
            continue
        name = str(item.get("app_name") or item.get("name") or item.get("technology") or "").strip()
        if not name or name.lower() in seen:
            continue
        seen.add(name.lower())
        technologies.append(
            {
                "name": name,
                "version": item.get("version"),
                "categories": item.get("categories") if isinstance(item.get("categories"), list) else [],
                "confidence": item.get("confidence"),
                "website": item.get("website"),
            }
        )
    return technologies[:80]


def _parse_wafw00f_output(stdout: str, data: Any) -> dict[str, Any]:
    """Normalize WAFW00F JSON when available, with stdout parsing fallback."""
    if isinstance(data, list) and data:
        first = data[0] if isinstance(data[0], dict) else {}
    elif isinstance(data, dict):
        first = data
    else:
        first = {}

    detected = bool(first.get("detected") or first.get("firewall") or first.get("waf"))
    waf_name = first.get("firewall") or first.get("waf") or first.get("name")
    manufacturer = first.get("manufacturer") or first.get("company")

    if not waf_name:
        match = re.search(r"is behind\s+(.+?)\s+WAF", stdout, flags=re.IGNORECASE)
        if match:
            waf_name = match.group(1).strip()
            detected = True
    if "No WAF detected" in stdout or "seems to be behind a WAF or some sort of security solution" in stdout:
        detected = detected or "security solution" in stdout

    request_match = re.search(r"Number of requests:\s*(\d+)", stdout, flags=re.IGNORECASE)
    return {
        "detected": detected,
        "name": waf_name,
        "manufacturer": manufacturer,
        "requests": int(request_match.group(1)) if request_match else first.get("requests"),
        "raw": first or _truncate_text_for_record(stdout, 1200),
    }


def _truncate_text_for_record(text: str, limit: int) -> str:
    text = text.strip()
    if len(text) <= limit:
        return text
    return text[: limit - 16].rstrip() + "... [truncated]"


def _looks_like_openapi_schema(value: Any) -> bool:
    return isinstance(value, dict) and isinstance(value.get("paths"), dict) and (
        "openapi" in value or "swagger" in value
    )


def _schema_candidate_urls(url: str, crawled_endpoints: list[dict[str, Any]] | None, ffuf_routes: list[dict[str, Any]] | None) -> list[str]:
    base_url = _target_base_url(url)
    candidates = [urljoin(base_url, path) for path in OPENAPI_CANDIDATE_PATHS]

    for item in ffuf_routes or []:
        if not isinstance(item, dict) or not item.get("url"):
            continue
        value = str(item["url"])
        lowered = value.lower()
        if any(marker in lowered for marker in ("swagger", "openapi", "api-docs", "redoc", "docs")):
            candidates.append(value)

    for endpoint in _extract_urls_from_katana(crawled_endpoints or []):
        lowered = endpoint.lower()
        if any(marker in lowered for marker in ("swagger", "openapi", "api-docs", "redoc")):
            candidates.append(endpoint)

    deduped: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        normalized = _normalize_url(candidate)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(normalized)
    return deduped[:24]


def _summarize_openapi_schema(schema_url: str, schema: dict[str, Any]) -> dict[str, Any]:
    info = schema.get("info") if isinstance(schema.get("info"), dict) else {}
    paths = schema.get("paths") if isinstance(schema.get("paths"), dict) else {}
    components = schema.get("components") if isinstance(schema.get("components"), dict) else {}
    security_schemes = components.get("securitySchemes") if isinstance(components.get("securitySchemes"), dict) else {}
    legacy_security = schema.get("securityDefinitions") if isinstance(schema.get("securityDefinitions"), dict) else {}
    auth_schemes = sorted(set(list(security_schemes.keys()) + list(legacy_security.keys())))[:20]

    operations: list[dict[str, Any]] = []
    methods_seen: set[str] = set()
    for path, path_item in paths.items():
        if not isinstance(path_item, dict):
            continue
        for method, operation in path_item.items():
            method_lower = str(method).lower()
            if method_lower not in HTTP_METHODS:
                continue
            methods_seen.add(method_upper := method_lower.upper())
            operation = operation if isinstance(operation, dict) else {}
            parameters = operation.get("parameters") if isinstance(operation.get("parameters"), list) else []
            operations.append(
                {
                    "method": method_upper,
                    "path": str(path),
                    "operation_id": operation.get("operationId"),
                    "summary": operation.get("summary"),
                    "parameters": [
                        str(param.get("name"))
                        for param in parameters
                        if isinstance(param, dict) and param.get("name")
                    ][:12],
                    "has_request_body": isinstance(operation.get("requestBody"), dict),
                    "requires_security": bool(operation.get("security") or path_item.get("security") or schema.get("security")),
                }
            )

    return {
        "url": schema_url,
        "title": info.get("title") or "Untitled API",
        "version": info.get("version"),
        "schema_version": schema.get("openapi") or schema.get("swagger"),
        "path_count": len(paths),
        "operation_count": len(operations),
        "methods": sorted(methods_seen),
        "auth_schemes": auth_schemes,
        "sample_operations": operations[:25],
    }


async def run_subfinder(domain: str, scan_id: str) -> list[dict[str, Any]]:
    """
    Step 1: Passive subdomain discovery.

    Runs subfinder to enumerate subdomains from 50+ passive sources.
    Output: list of JSON objects with subdomain info.
    """
    _ensure_output_dir()
    output_file = _output_path(scan_id, "subs")

    cmd = [
        "subfinder",
        "-d", domain,
        "-silent",
        "-json",
        "-o", output_file,
    ]

    stdout, stderr, returncode = await _run_subprocess(cmd)

    if returncode != 0:
        logger.warning(f"subfinder returned code {returncode}: {stderr[:500]}")

    results = _parse_jsonl_file(output_file)
    logger.info(f"subfinder found {len(results)} subdomains for {domain}")
    return results


async def run_dnsx(scan_id: str, domains: list[str]) -> list[dict[str, Any]]:
    """
    DNS validation and record enrichment.

    Filters unresolved hosts before expensive probing and captures A/AAAA/CNAME/MX/TXT
    context for the report.
    """
    _ensure_output_dir()
    output_file = _output_path(scan_id, "dnsx")

    unique_domains = []
    seen: set[str] = set()
    for domain in domains:
        normalized = domain.strip().lower().rstrip(".")
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        unique_domains.append(normalized)

    if not unique_domains:
        logger.info("dnsx: no domains available")
        return []

    cmd = [
        "dnsx",
        "-silent",
        "-json",
        "-a",
        "-aaaa",
        "-cname",
        "-mx",
        "-txt",
        "-resp",
        "-o", output_file,
    ]

    stdout, stderr, returncode = await _run_subprocess(
        cmd,
        timeout=settings.TOOL_TIMEOUT_SECONDS,
        stdin_data="\n".join(unique_domains[:250]),
    )

    if returncode != 0:
        logger.warning(f"dnsx returned code {returncode}: {stderr[:500]}")

    results = _parse_jsonl_file(output_file)
    logger.info(f"dnsx resolved {len(results)} hosts")
    return results


async def run_httpx(scan_id: str, input_file: str | None = None, domains: list[str] | None = None) -> list[dict[str, Any]]:
    """
    Step 2: HTTP probing — status codes, tech stack, headers, titles.

    Accepts either a file of domains/subdomains or a list of domains.
    Output: list of JSON objects with HTTP probe results.
    """
    _ensure_output_dir()
    output_file = _output_path(scan_id, "httpx")

    cmd = [
        "httpx",
        "-silent",
        "-json",
        "-tech-detect",
        "-status-code",
        "-title",
        "-content-length",
        "-content-type",
        "-location",
        "-response-time",
        "-favicon",
        "-jarm",
        "-cname",
        "-cdn",
        "-threads", "50",
        "-retries", "1",
        "-timeout", "8",
        "-o", output_file,
    ]

    stdin_data = None
    if input_file and os.path.exists(input_file):
        cmd.extend(["-l", input_file])
    elif domains:
        stdin_data = "\n".join(domains)
    else:
        logger.warning("httpx: no input provided")
        return []

    stdout, stderr, returncode = await _run_subprocess(
        cmd, stdin_data=stdin_data
    )

    if returncode != 0:
        logger.warning(f"httpx returned code {returncode}: {stderr[:500]}")

    results = _parse_jsonl_file(output_file)
    logger.info(f"httpx found {len(results)} live hosts")
    return results


async def run_tlsx(scan_id: str, targets: list[str]) -> list[dict[str, Any]]:
    """
    Fast TLS/certificate inventory across live hosts.

    Complements testssl.sh: tlsx is broad and fast, testssl is deeper for the
    submitted target.
    """
    _ensure_output_dir()
    output_file = _output_path(scan_id, "tlsx")

    normalized_targets: list[str] = []
    seen: set[str] = set()
    for target in targets:
        parsed = urlparse(target)
        host = parsed.hostname or target
        if not host:
            continue
        value = host.strip().lower()
        if value and value not in seen:
            seen.add(value)
            normalized_targets.append(value)

    if not normalized_targets:
        logger.info("tlsx: no targets available")
        return []

    cmd = [
        "tlsx",
        "-silent",
        "-json",
        "-tls-version",
        "-cipher",
        "-san",
        "-cn",
        "-issuer",
        "-expired",
        "-self-signed",
        "-o", output_file,
    ]

    stdout, stderr, returncode = await _run_subprocess(
        cmd,
        timeout=max(20, min(settings.TOOL_TIMEOUT_SECONDS, 45)),
        stdin_data="\n".join(normalized_targets[:150]),
    )

    if returncode != 0:
        logger.warning(f"tlsx returned code {returncode}: {stderr[:500]}")

    results = _parse_jsonl_file(output_file)
    logger.info(f"tlsx collected TLS metadata for {len(results)} hosts")
    return results


async def run_naabu(domain: str, scan_id: str) -> list[dict[str, Any]]:
    """
    Step 3: Ultra-fast SYN port scanning.

    Scans top 1000 ports for open services.
    Output: list of JSON objects with port/host info.
    """
    _ensure_output_dir()
    output_file = _output_path(scan_id, "ports")

    cmd = [
        "naabu",
        "-host", domain,
        "-top-ports", "1000",
        "-silent",
        "-json",
        "-o", output_file,
    ]

    stdout, stderr, returncode = await _run_subprocess(cmd)

    if returncode != 0:
        logger.warning(f"naabu returned code {returncode}: {stderr[:500]}")

    results = _parse_jsonl_file(output_file)
    logger.info(f"naabu found {len(results)} open ports for {domain}")
    return results


async def run_katana(url: str, scan_id: str, auth_headers: dict[str, str] | None = None) -> list[dict[str, Any]]:
    """
    Step 4: Web crawling — finds endpoints, JS files, forms.

    Crawls up to depth 3 to discover attack surface.
    Output: list of JSON objects with endpoint info.
    """
    _ensure_output_dir()
    output_file = _output_path(scan_id, "crawl")

    cmd = [
        "katana",
        "-u", url,
        "-depth", "3",
        "-silent",
        "-json",
        "-o", output_file,
    ]
    cmd.extend(_auth_header_args(auth_headers))

    stdout, stderr, returncode = await _run_subprocess(cmd)

    if returncode != 0:
        logger.warning(f"katana returned code {returncode}: {stderr[:500]}")

    results = _parse_jsonl_file(output_file)
    logger.info(f"katana crawled {len(results)} endpoints for {url}")
    return results


async def run_nuclei(url: str, scan_id: str, auth_headers: dict[str, str] | None = None) -> list[dict[str, Any]]:
    """
    Step 5: Vulnerability scanning with 10,000+ community templates.

    Scans for CVEs, misconfigs, XSS, SQLi, and more.
    Output: list of JSON objects with vulnerability findings.
    """
    _ensure_output_dir()
    output_file = _output_path(scan_id, "nuclei")

    cmd = [
        "nuclei",
        "-u", url,
        "-severity", "low,medium,high,critical",
        "-as",
        "-rate-limit", "120",
        "-retries", "1",
        "-json",
        "-o", output_file,
    ]
    cmd.extend(_auth_header_args(auth_headers))

    # nuclei can take longer — give it extra time
    stdout, stderr, returncode = await _run_subprocess(
        cmd, timeout=settings.TOOL_TIMEOUT_SECONDS * 2
    )

    if returncode != 0:
        logger.warning(f"nuclei returned code {returncode}: {stderr[:500]}")

    results = _parse_jsonl_file(output_file)
    logger.info(f"nuclei found {len(results)} vulnerabilities for {url}")
    return results


async def run_nuclei_api_checks(url: str, scan_id: str, auth_headers: dict[str, str] | None = None) -> list[dict[str, Any]]:
    """
    API-focused Nuclei pass.

    Keeps the main vulnerability scan broad, while adding targeted coverage for
    API documentation exposure, GraphQL signals, CORS, and common API
    misconfiguration templates where the installed template set supports tags.
    """
    _ensure_output_dir()
    output_file = _output_path(scan_id, "nuclei_api")

    cmd = [
        "nuclei",
        "-u", url,
        "-tags", "api,swagger,openapi,graphql,cors,exposure,misconfig",
        "-severity", "info,low,medium,high,critical",
        "-rate-limit", "80",
        "-retries", "1",
        "-json",
        "-o", output_file,
    ]
    cmd.extend(_auth_header_args(auth_headers))

    stdout, stderr, returncode = await _run_subprocess(
        cmd, timeout=settings.TOOL_TIMEOUT_SECONDS * 2
    )

    if returncode != 0:
        logger.warning(f"nuclei api checks returned code {returncode}: {stderr[:500]}")

    results = _parse_jsonl_file(output_file)
    logger.info(f"nuclei api checks found {len(results)} signals for {url}")
    return results


async def run_ffuf_api_discovery(url: str, scan_id: str, auth_headers: dict[str, str] | None = None) -> list[dict[str, Any]]:
    """
    Bounded hidden API route discovery with ffuf.

    Uses a curated, small wordlist to find common API roots and schema/docs
    endpoints without turning every scan into an aggressive brute-force job.
    """
    _ensure_output_dir()
    output_file = _output_path(scan_id, "ffuf_api")
    wordlist_file = _write_api_wordlist(scan_id)
    base_url = _target_base_url(url)

    cmd = [
        "ffuf",
        "-u", urljoin(base_url, "FUZZ"),
        "-w", wordlist_file,
        "-of", "json",
        "-o", output_file,
        "-t", "20",
        "-rate", "60",
        "-timeout", "8",
        "-mc", "200,201,202,204,301,302,307,308,401,403,405",
        "-s",
    ]
    cmd.extend(_auth_header_args(auth_headers))

    stdout, stderr, returncode = await _run_subprocess(cmd)
    if returncode != 0:
        logger.warning(f"ffuf api discovery returned code {returncode}: {stderr[:500]}")

    data = _parse_json_file(output_file)
    raw_results = data.get("results", []) if isinstance(data, dict) else []
    results: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in raw_results:
        if not isinstance(item, dict):
            continue
        found_url = _normalize_url(str(item.get("url") or ""))
        if not found_url or found_url in seen:
            continue
        seen.add(found_url)
        results.append(
            {
                "url": found_url,
                "path": urlparse(found_url).path or "/",
                "status": item.get("status"),
                "length": item.get("length"),
                "words": item.get("words"),
                "source": "ffuf",
            }
        )

    logger.info(f"ffuf discovered {len(results)} API candidates for {url}")
    return results


def _candidate_urls_for_arjun(url: str, crawled_endpoints: list[dict[str, Any]] | None, ffuf_routes: list[dict[str, Any]] | None) -> list[str]:
    candidates: list[str] = []

    for item in ffuf_routes or []:
        if isinstance(item, dict) and item.get("url"):
            candidates.append(str(item["url"]))

    for endpoint in _extract_urls_from_katana(crawled_endpoints or []):
        lowered = endpoint.lower()
        if any(marker in lowered for marker in ("/api", "/v1", "/v2", "/v3", "/graphql", "/rest")):
            candidates.append(endpoint)

    candidates.append(url)

    deduped: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        normalized = _normalize_url(candidate)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(normalized)

    return deduped[:8]


async def run_arjun_parameter_discovery(
    url: str,
    scan_id: str,
    crawled_endpoints: list[dict[str, Any]] | None = None,
    ffuf_routes: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """
    Bounded HTTP parameter discovery with Arjun.

    Runs on a capped set of likely API endpoints. This is best-effort because
    some APIs need authentication, schemas, or request bodies to expose useful
    parameters.
    """
    _ensure_output_dir()
    candidates = _candidate_urls_for_arjun(url, crawled_endpoints, ffuf_routes)
    if not candidates:
        logger.info("arjun: no candidate URLs available")
        return []

    findings: list[dict[str, Any]] = []
    for index, candidate in enumerate(candidates):
        output_file = _output_path(scan_id, f"arjun_{index}")
        cmd = [
            "arjun",
            "-u", candidate,
            "-oJ", output_file,
            "-t", "10",
            "-T", "10",
            "-w", "small",
            "--ratelimit", "2",
        ]

        try:
            stdout, stderr, returncode = await _run_subprocess(
                cmd, timeout=max(20, min(settings.TOOL_TIMEOUT_SECONDS, 45))
            )
        except asyncio.TimeoutError as e:
            logger.warning(f"arjun timed out for {candidate}: {e}")
            continue

        if returncode != 0:
            logger.warning(f"arjun returned code {returncode} for {candidate}: {stderr[:500]}")

        data = _parse_json_file(output_file)
        params = _collect_parameter_names(data)

        if params:
            findings.append(
                {
                    "url": candidate,
                    "parameters": sorted(set(params))[:30],
                    "source": "arjun",
                }
            )

    logger.info(f"arjun discovered parameters on {len(findings)} endpoints")
    return findings


async def run_openapi_schema_discovery(
    url: str,
    scan_id: str,
    crawled_endpoints: list[dict[str, Any]] | None = None,
    ffuf_routes: list[dict[str, Any]] | None = None,
    auth_headers: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """
    Discover and summarize exposed OpenAPI/Swagger schemas.

    This is a low-impact fetch-only stage. It never sends generated API calls;
    it only retrieves likely schema URLs and extracts endpoint inventory.
    """
    candidates = _schema_candidate_urls(url, crawled_endpoints, ffuf_routes)
    if not candidates:
        return []

    schemas: list[dict[str, Any]] = []
    seen_schema_urls: set[str] = set()
    max_schema_bytes = 2_000_000

    async with httpx_client.AsyncClient(
        timeout=httpx_client.Timeout(8.0),
        follow_redirects=True,
        headers=_merge_headers({"User-Agent": "ScanAI schema discovery"}, auth_headers),
    ) as client:
        for candidate in candidates:
            try:
                response = await client.get(candidate)
            except httpx_client.HTTPError as e:
                logger.debug(f"schema discovery fetch failed for {candidate}: {e}")
                continue

            if response.status_code not in {200, 201, 202}:
                continue

            content_type = response.headers.get("content-type", "").lower()
            text = response.text[:max_schema_bytes]
            if not any(marker in content_type for marker in ("json", "yaml", "yml", "text")) and not any(
                marker in text[:500].lower() for marker in ("openapi", "swagger", '"paths"', "paths:")
            ):
                continue

            try:
                parsed = _safe_yaml_load(text)
            except (json.JSONDecodeError, yaml.YAMLError, TypeError, ValueError) as e:
                logger.debug(f"schema discovery parse failed for {candidate}: {e}")
                continue

            if not _looks_like_openapi_schema(parsed):
                continue

            normalized = _normalize_url(str(response.url))
            if normalized in seen_schema_urls:
                continue
            seen_schema_urls.add(normalized)
            schemas.append(_summarize_openapi_schema(normalized, parsed))

            if len(schemas) >= 4:
                break

    logger.info(f"discovered {len(schemas)} OpenAPI/Swagger schemas for {url}")
    return schemas


async def run_webcheck_enrichment(
    url: str,
    scan_id: str,
    open_ports: list[dict[str, Any]] | None = None,
    auth_headers: dict[str, str] | None = None,
) -> dict[str, Any]:
    """
    Fast Web-Check style passive enrichment.

    Fetches only the submitted site and well-known text resources, then combines
    that with DNSSEC/mail policy probes and a readable port profile.
    """
    del scan_id  # kept for a stable scanner function signature
    parsed = urlparse(url)
    domain = parsed.hostname or parsed.netloc or parsed.path
    base_url = _target_base_url(url)
    timeout = httpx_client.Timeout(10.0, connect=5.0)
    started = time.perf_counter()

    result: dict[str, Any] = {
        "target": url,
        "base_url": base_url,
        "domain": domain,
        "port_profile": _summarize_ports(open_ports),
    }

    async with httpx_client.AsyncClient(
        timeout=timeout,
        follow_redirects=True,
        headers=_merge_headers({"User-Agent": "ScanAI web intelligence"}, auth_headers),
    ) as client:
        main_response = None
        main_error = None
        try:
            main_response = await client.get(url)
        except httpx_client.HTTPError as e:
            main_error = str(e)[:240]

        if main_response is not None:
            headers = main_response.headers
            parser = _WebMetadataParser(str(main_response.url))
            content_type = headers.get("content-type", "").lower()
            if "html" in content_type or "<html" in main_response.text[:500].lower():
                try:
                    parser.feed(main_response.text[:600_000])
                except Exception as e:
                    logger.debug(f"HTML metadata parsing failed for {url}: {e}")

            origin_host = urlparse(str(main_response.url)).hostname
            same_origin_links: list[str] = []
            external_hosts: set[str] = set()
            seen_links: set[str] = set()
            for link in parser.links:
                link_parsed = urlparse(link)
                normalized = link_parsed._replace(fragment="").geturl()
                if not normalized or normalized in seen_links or link_parsed.scheme not in {"http", "https"}:
                    continue
                seen_links.add(normalized)
                if origin_host and link_parsed.hostname == origin_host:
                    same_origin_links.append(normalized)
                elif link_parsed.hostname:
                    external_hosts.add(link_parsed.hostname)

            fingerprint_headers = {
                name: value[:300]
                for name in FINGERPRINT_HEADERS
                if (value := _header_value(headers, name))
            }
            cookies = []
            for cookie in main_response.cookies.jar:
                cookies.append(
                    {
                        "name": cookie.name,
                        "domain": cookie.domain,
                        "secure": bool(cookie.secure),
                        "http_only": bool(cookie.has_nonstandard_attr("HttpOnly") or cookie.has_nonstandard_attr("httponly")),
                        "same_site": cookie.get_nonstandard_attr("SameSite") or cookie.get_nonstandard_attr("samesite"),
                    }
                )

            result["http"] = {
                "final_url": str(main_response.url),
                "status": main_response.status_code,
                "method": main_response.request.method,
                "redirect_chain": [
                    {
                        "status": response.status_code,
                        "url": str(response.url),
                        "location": response.headers.get("location"),
                    }
                    for response in main_response.history
                ],
                "response_time_ms": round((time.perf_counter() - started) * 1000),
                "content_type": headers.get("content-type"),
                "content_length": headers.get("content-length"),
                "server_fingerprints": fingerprint_headers,
                "cookies": cookies[:30],
                "cookie_summary": {
                    "count": len(cookies),
                    "missing_secure": [cookie["name"] for cookie in cookies if not cookie["secure"]][:20],
                    "missing_http_only": [cookie["name"] for cookie in cookies if not cookie["http_only"]][:20],
                },
                "security_headers": _analyze_security_headers(str(main_response.url), headers),
            }
            result["page"] = {
                "title": parser.title,
                "social_tags": parser.meta,
                "same_origin_links": same_origin_links[:40],
                "external_hosts": sorted(external_hosts)[:40],
                "scripts": parser.scripts[:30],
                "forms": parser.forms[:20],
                "features": parser.features,
            }
        else:
            result["http"] = {"error": main_error or "Unable to fetch target"}

        robots_url = urljoin(base_url, "robots.txt")
        sitemap_url = urljoin(base_url, "sitemap.xml")
        security_txt_urls = [
            urljoin(base_url, ".well-known/security.txt"),
            urljoin(base_url, "security.txt"),
        ]
        robots, sitemap, security_well_known, security_root, dnssec, mail = await asyncio.gather(
            _fetch_text_resource(client, robots_url),
            _fetch_text_resource(client, sitemap_url),
            _fetch_text_resource(client, security_txt_urls[0]),
            _fetch_text_resource(client, security_txt_urls[1]),
            _dnssec_status(domain),
            _mail_policy_status(domain),
        )

    result["crawl_rules"] = {
        "robots": _summarize_robots(robots),
        "sitemap": _summarize_sitemap(sitemap),
        "security_txt": _summarize_security_txt(security_well_known if security_well_known.get("available") else security_root),
    }
    result["dnssec"] = dnssec
    result["mail_security"] = mail
    result["elapsed_ms"] = round((time.perf_counter() - started) * 1000)
    logger.info(f"web enrichment completed for {url} in {result['elapsed_ms']}ms")
    return result


async def run_webanalyze(url: str, scan_id: str) -> list[dict[str, Any]]:
    """
    Wappalyzer-style technology fingerprinting with webanalyze.

    httpx already performs lightweight tech detection. webanalyze adds a broader
    app-definition database, so the AI report can correlate findings with exposed
    frameworks/CMS/CDN/client libraries.
    """
    _ensure_output_dir()
    output_file = _output_path(scan_id, "webanalyze")
    apps_file = "/opt/webanalyze/technologies.json"
    cmd = [
        "webanalyze",
        "-host", url,
        "-output", "json",
        "-silent",
        "-worker", "2",
    ]
    if os.path.exists(apps_file):
        cmd.extend(["-apps", apps_file])

    try:
        stdout, stderr, returncode = await _run_subprocess(
            cmd,
            timeout=max(20, min(settings.TOOL_TIMEOUT_SECONDS, 60)),
        )
    except FileNotFoundError:
        logger.info("webanalyze is not installed; skipping technology fingerprinting")
        return []

    if returncode != 0:
        logger.warning(f"webanalyze returned code {returncode}: {stderr[:500]}")

    data: Any
    try:
        data = json.loads(stdout) if stdout.strip() else []
    except json.JSONDecodeError:
        logger.warning(f"webanalyze returned invalid JSON: {stdout[:300]}")
        data = []

    with open(output_file, "w") as f:
        json.dump(data, f)

    technologies = _normalize_technology_items(data)
    logger.info(f"webanalyze identified {len(technologies)} technologies for {url}")
    return technologies


async def run_wafw00f(url: str, scan_id: str) -> dict[str, Any]:
    """
    WAF/security edge fingerprinting with WAFW00F.

    Runs as a bounded best-effort probe. If the binary is not installed, the
    pipeline skips it without failing the scan.
    """
    _ensure_output_dir()
    output_file = _output_path(scan_id, "wafw00f")
    cmd = [
        "wafw00f",
        url,
        "-o", output_file,
        "-f", "json",
    ]

    try:
        stdout, stderr, returncode = await _run_subprocess(
            cmd,
            timeout=max(20, min(settings.TOOL_TIMEOUT_SECONDS, 45)),
        )
    except FileNotFoundError:
        logger.info("wafw00f is not installed; skipping WAF fingerprinting")
        return {"detected": False, "skipped": True, "reason": "wafw00f not installed"}

    if returncode != 0:
        logger.warning(f"wafw00f returned code {returncode}: {stderr[:500]}")
        if not os.path.exists(output_file):
            fallback_cmd = ["wafw00f", url, "-o", output_file]
            try:
                stdout, stderr, returncode = await _run_subprocess(
                    fallback_cmd,
                    timeout=max(20, min(settings.TOOL_TIMEOUT_SECONDS, 45)),
                )
            except FileNotFoundError:
                return {"detected": False, "skipped": True, "reason": "wafw00f not installed"}
            if returncode != 0:
                logger.warning(f"wafw00f fallback returned code {returncode}: {stderr[:500]}")

    data = _parse_json_file(output_file)
    result = _parse_wafw00f_output(stdout, data)
    logger.info(f"wafw00f completed for {url}: detected={result.get('detected')}")
    return result


async def run_testssl(url: str, scan_id: str) -> Any:
    """
    Step 6: Focused TLS/SSL analysis.

    Checks certificate/defaults, protocol support, server preference, HTTP TLS
    headers, and known TLS vulnerabilities without doing exhaustive cipher
    enumeration. Broad certificate inventory is handled by tlsx.
    Output: JSON array with TLS analysis results.
    """
    if not settings.TLS_DEEP_SCAN_ENABLED:
        logger.info("testssl skipped because TLS_DEEP_SCAN_ENABLED=false")
        return {"skipped": True, "reason": "TLS deep scan disabled"}

    _ensure_output_dir()
    output_file = _output_path(scan_id, "tls")

    # Extract host:port from URL for testssl
    from urllib.parse import urlparse
    parsed = urlparse(url)
    host = parsed.hostname or ""
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    if parsed.scheme != "https" and port not in COMMON_TLS_PORTS:
        logger.info(f"testssl skipped for non-TLS target {url}")
        return {"skipped": True, "reason": "Target URL is not HTTPS or a known TLS port"}

    target = f"{host}:{port}"

    cmd = [
        "testssl.sh",
        "--jsonfile", output_file,
        "--quiet",
        "--fast",
        "--parallel",
        "--ip", "one",
        "--warnings", "off",
        "-S",
        "-p",
        "-P",
        "-U",
        "-H",
        target,
    ]

    stdout, stderr, returncode = await _run_subprocess(
        cmd,
        timeout=max(20, min(settings.TLS_DEEP_SCAN_TIMEOUT_SECONDS, settings.TOOL_TIMEOUT_SECONDS)),
    )

    if returncode != 0:
        logger.warning(f"testssl returned code {returncode}: {stderr[:500]}")

    results = _parse_json_file(output_file)
    logger.info(f"testssl completed TLS analysis for {target}")
    return results


def _extract_urls_from_katana(items: list[dict[str, Any]]) -> list[str]:
    urls: list[str] = []
    for item in items or []:
        if not isinstance(item, dict):
            continue
        url = (
            item.get("url")
            or item.get("endpoint")
            or item.get("request", {}).get("endpoint")
            or item.get("matched-at")
        )
        if not url:
            continue
        url = str(url).strip()
        if url and url not in urls:
            urls.append(url)
    return urls


async def run_dalfox(
    url: str,
    scan_id: str,
    crawled_endpoints: list[dict[str, Any]] | None = None,
    auth_headers: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """
    Active XSS scanning (specialist).

    Uses Dalfox in 'pipe' mode: we feed it a set of discovered URLs (from Katana).
    Dalfox focuses on reflection/DOM sinks and is a good complement to Nuclei templates.

    Output: JSON Lines (one object per line).
    """
    _ensure_output_dir()
    output_file = _output_path(scan_id, "dalfox")

    endpoints = _extract_urls_from_katana(crawled_endpoints or [])
    # Dalfox is most useful on parameterized endpoints.
    candidates = [e for e in endpoints if "?" in e]
    if not candidates:
        candidates = endpoints[:50]

    if not candidates:
        logger.info("dalfox: no endpoints available to scan")
        return []

    # Limit to avoid runaway time on large sites.
    candidates = candidates[:120]
    stdin_data = "\n".join(candidates)

    cmd = [
        "dalfox",
        "pipe",
        "--format", "jsonl",
        "--silence",
        "--timeout", "8",
        "-o", output_file,
    ]
    cmd.extend(_auth_header_args(auth_headers))

    # Dalfox can take longer; give it extra time.
    stdout, stderr, returncode = await _run_subprocess(
        cmd, timeout=settings.TOOL_TIMEOUT_SECONDS * 2, stdin_data=stdin_data
    )

    if returncode != 0:
        logger.warning(f"dalfox returned code {returncode}: {stderr[:500]}")

    results = _parse_jsonl_file(output_file)
    logger.info(f"dalfox produced {len(results)} potential XSS signals")
    return results


def cleanup_scan_files(scan_id: str) -> None:
    """Remove temporary output files for a completed scan."""
    suffixes = ["subs", "dnsx", "httpx", "ports", "crawl", "nuclei", "nuclei_api", "ffuf_api", "tls", "tlsx", "dalfox", "webanalyze", "wafw00f", "api_words"]
    for suffix in suffixes:
        filepath = _text_output_path(scan_id, suffix) if suffix == "api_words" else _output_path(scan_id, suffix)
        try:
            if os.path.exists(filepath):
                os.remove(filepath)
        except OSError as e:
            logger.warning(f"Failed to remove {filepath}: {e}")

    for filepath in OUTPUT_DIR.glob(f"{scan_id}_arjun_*.json"):
        try:
            filepath.unlink()
        except OSError as e:
            logger.warning(f"Failed to remove {filepath}: {e}")
