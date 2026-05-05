"""
ScanAI — Google Gemini AI integration for security report generation.
Takes raw scanner output and produces structured, plain-English reports.
"""

import json
import logging
import re
from typing import Any

from google import genai

from config import settings

logger = logging.getLogger(__name__)

# Gemini model for report generation
MODEL = "gemini-2.5-flash"
MAX_TOKENS = 4096

# System prompt — instructs Gemini to act as a cybersecurity expert
SYSTEM_PROMPT = """You are a cybersecurity expert writing for non-technical website owners.
Convert raw scanner output into a structured security report.

Rules:
- Plain English only. Explain any technical term you use.
- Every finding needs: a 1-sentence title, 2-sentence explanation of risk,
  and 2–4 numbered fix steps owners can follow in 30 minutes.
- Severity: critical | high | medium | low | info
- Deduplicate similar findings. Group related issues.
- Never include internal IPs, file paths, or server internals.

Return ONLY valid JSON. No markdown. No preamble. No trailing text:
{
  "summary": "2–3 sentence overall assessment",
  "risk_score": 0-100,
  "findings": [
    {
      "id": "unique_snake_case_id",
      "title": "short descriptive title",
      "severity": "critical|high|medium|low|info",
      "what_it_means": "plain English explanation",
      "how_to_fix": ["step 1", "step 2", "step 3"],
      "affected": "https://example.com/path or port 8080"
    }
  ]
}"""


def _build_user_message(url: str, scan_results: dict[str, Any]) -> str:
    """
    Build the user message for Gemini with all scanner outputs.
    Truncates very large outputs to stay within token limits.
    """
    max_section_chars = 15000  # Truncate individual sections if too large

    def _truncate(data: Any) -> str:
        """Convert data to JSON string, truncating if necessary."""
        if not data:
            return "No results found."
        text = json.dumps(data, indent=2, default=str)
        if len(text) > max_section_chars:
            text = text[:max_section_chars] + "\n... [truncated]"
        return text

    sections = {
        "SUBDOMAINS (subfinder)": scan_results.get("subdomains", []),
        "LIVE HOSTS (httpx)": scan_results.get("live_hosts", []),
        "OPEN PORTS (naabu)": scan_results.get("open_ports", []),
        "CRAWLED ENDPOINTS (katana)": scan_results.get("crawled_endpoints", []),
        "VULNERABILITY SCAN (nuclei)": scan_results.get("vulnerabilities", []),
        "TLS/SSL ANALYSIS (testssl)": scan_results.get("tls_analysis", []),
    }

    message_parts = [f"Raw scan results for {url}:\n"]
    for title, data in sections.items():
        message_parts.append(f"=== {title} ===")
        message_parts.append(_truncate(data))
        message_parts.append("")

    message_parts.append("Generate the security report JSON.")
    return "\n".join(message_parts)


def _strip_json_fences(text: str) -> str:
    """Remove accidental markdown JSON fences from Gemini's response."""
    # Strip ```json ... ``` or ``` ... ```
    text = text.strip()
    pattern = r"^```(?:json)?\s*\n?(.*?)\n?\s*```$"
    match = re.match(pattern, text, re.DOTALL)
    if match:
        return match.group(1).strip()
    return text


def _validate_report(report: dict[str, Any]) -> dict[str, Any]:
    """
    Validate the AI-generated report has the expected structure.
    Fills in defaults for missing fields.
    """
    # Ensure required top-level fields
    if "summary" not in report:
        report["summary"] = "Security assessment completed."

    if "risk_score" not in report:
        report["risk_score"] = 50
    else:
        # Clamp risk_score to 0-100
        report["risk_score"] = max(0, min(100, int(report["risk_score"])))

    if "findings" not in report:
        report["findings"] = []

    # Validate each finding
    valid_severities = {"critical", "high", "medium", "low", "info"}
    for i, finding in enumerate(report["findings"]):
        if "id" not in finding:
            finding["id"] = f"finding_{i + 1}"
        if "title" not in finding:
            finding["title"] = "Unnamed finding"
        if "severity" not in finding or finding["severity"] not in valid_severities:
            finding["severity"] = "info"
        if "what_it_means" not in finding:
            finding["what_it_means"] = "No description available."
        if "how_to_fix" not in finding:
            finding["how_to_fix"] = ["Review this finding with your IT team."]
        if "affected" not in finding:
            finding["affected"] = "Unknown"

    return report


def generate_report(url: str, scan_results: dict[str, Any]) -> dict[str, Any]:
    """
    Generate a structured security report using Google Gemini AI.

    Takes raw scanner output from all 6 tools and returns a validated
    JSON report with summary, risk score, and findings.

    Args:
        url: The scanned target URL
        scan_results: Dict with keys matching scanner output sections

    Returns:
        Validated report dict with summary, risk_score, and findings[]

    Raises:
        Exception: If Gemini API call fails or response cannot be parsed
    """
    client = genai.Client(api_key=settings.GEMINI_API_KEY)

    user_message = _build_user_message(url, scan_results)

    logger.info(f"Calling Gemini API for report generation ({len(user_message)} chars)")

    try:
        response = client.models.generate_content(
            model=MODEL,
            contents=user_message,
            config=genai.types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                max_output_tokens=MAX_TOKENS,
                temperature=0.3,
            ),
        )
    except Exception as e:
        logger.error(f"Gemini API error: {e}")
        raise Exception(f"AI report generation failed: {e}")

    # Extract text from response
    raw_text = response.text or ""

    if not raw_text:
        raise Exception("Gemini returned an empty response.")

    # Clean and parse JSON
    cleaned = _strip_json_fences(raw_text)

    try:
        report = json.loads(cleaned)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse Gemini response as JSON: {e}")
        logger.error(f"Raw response: {raw_text[:1000]}")
        # Attempt to extract JSON from the response
        json_match = re.search(r'\{.*\}', cleaned, re.DOTALL)
        if json_match:
            try:
                report = json.loads(json_match.group())
            except json.JSONDecodeError:
                raise Exception(f"AI response was not valid JSON: {e}")
        else:
            raise Exception(f"AI response was not valid JSON: {e}")

    # Validate and return
    report = _validate_report(report)
    logger.info(
        f"Report generated: risk_score={report['risk_score']}, "
        f"findings={len(report['findings'])}"
    )
    return report
