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

from config import settings

logger = logging.getLogger(__name__)

# Ensure output directory exists
OUTPUT_DIR = Path(settings.SCAN_OUTPUT_DIR)


def _ensure_output_dir() -> None:
    """Create the scan output directory if it doesn't exist."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def _output_path(scan_id: str, suffix: str) -> str:
    """Generate a unique output file path for a scan tool."""
    return str(OUTPUT_DIR / f"{scan_id}_{suffix}.json")


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
    suffixes = ["subs", "httpx", "ports", "crawl", "nuclei", "tls", "dalfox"]
    for suffix in suffixes:
        filepath = _output_path(scan_id, suffix)
        try:
            if os.path.exists(filepath):
                os.remove(filepath)
        except OSError as e:
            logger.warning(f"Failed to remove {filepath}: {e}")
