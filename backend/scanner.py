"""
ScanAI — Subprocess wrappers for security scanning tools.
Each function runs a tool as a subprocess, captures JSON output, and returns parsed results.
All tools are expected to be installed in the Docker worker container.
"""

import asyncio
import json
import os
import logging
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


def _ensure_output_dir() -> None:
    """Create the scan output directory if it doesn't exist."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def _output_path(scan_id: str, suffix: str) -> str:
    """Generate a unique output file path for a scan tool."""
    return str(OUTPUT_DIR / f"{scan_id}_{suffix}.json")


def _text_output_path(scan_id: str, suffix: str) -> str:
    """Generate a unique text output path for helper inputs."""
    return str(OUTPUT_DIR / f"{scan_id}_{suffix}.txt")


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

    logger.info(f"Running command: {' '.join(cmd)}")

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
            f"Command timed out after {effective_timeout}s: {' '.join(cmd)}"
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
        timeout=settings.TOOL_TIMEOUT_SECONDS,
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


async def run_katana(url: str, scan_id: str) -> list[dict[str, Any]]:
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

    stdout, stderr, returncode = await _run_subprocess(cmd)

    if returncode != 0:
        logger.warning(f"katana returned code {returncode}: {stderr[:500]}")

    results = _parse_jsonl_file(output_file)
    logger.info(f"katana crawled {len(results)} endpoints for {url}")
    return results


async def run_nuclei(url: str, scan_id: str) -> list[dict[str, Any]]:
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
        "-json",
        "-o", output_file,
    ]

    # nuclei can take longer — give it extra time
    stdout, stderr, returncode = await _run_subprocess(
        cmd, timeout=settings.TOOL_TIMEOUT_SECONDS * 2
    )

    if returncode != 0:
        logger.warning(f"nuclei returned code {returncode}: {stderr[:500]}")

    results = _parse_jsonl_file(output_file)
    logger.info(f"nuclei found {len(results)} vulnerabilities for {url}")
    return results


async def run_nuclei_api_checks(url: str, scan_id: str) -> list[dict[str, Any]]:
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
        "-json",
        "-o", output_file,
    ]

    stdout, stderr, returncode = await _run_subprocess(
        cmd, timeout=settings.TOOL_TIMEOUT_SECONDS * 2
    )

    if returncode != 0:
        logger.warning(f"nuclei api checks returned code {returncode}: {stderr[:500]}")

    results = _parse_jsonl_file(output_file)
    logger.info(f"nuclei api checks found {len(results)} signals for {url}")
    return results


async def run_ffuf_api_discovery(url: str, scan_id: str) -> list[dict[str, Any]]:
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
        headers={"User-Agent": "ScanAI schema discovery"},
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


async def run_testssl(url: str, scan_id: str) -> Any:
    """
    Step 6: Deep TLS/SSL analysis.

    Checks for weak ciphers, expired certs, HSTS, HEARTBLEED, etc.
    Output: JSON array with TLS analysis results.
    """
    _ensure_output_dir()
    output_file = _output_path(scan_id, "tls")

    # Extract host:port from URL for testssl
    from urllib.parse import urlparse
    parsed = urlparse(url)
    host = parsed.hostname or ""
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    target = f"{host}:{port}"

    cmd = [
        "testssl.sh",
        "--jsonfile", output_file,
        "--quiet",
        "--fast",
        target,
    ]

    stdout, stderr, returncode = await _run_subprocess(cmd)

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


async def run_dalfox(url: str, scan_id: str, crawled_endpoints: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
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
    suffixes = ["subs", "dnsx", "httpx", "ports", "crawl", "nuclei", "nuclei_api", "ffuf_api", "tls", "tlsx", "dalfox", "api_words"]
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
