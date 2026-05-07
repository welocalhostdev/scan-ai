from __future__ import annotations

from pathlib import Path

from security_memo_pdf import generate_security_memo


def main() -> None:
    scan_data = {
        "meta": {
            "domain": "example.com",
            "generated_date": "May 05, 2026",
            "exposure_grade": 68,
            "grade_descriptor": "Not catastrophic, but loose enough to deserve prompt cleanup.",
            "primary_threat_path": "Legacy TLS posture and missing browser headers create the clearest opening for low-effort abuse.",
            "verified_count": 2,
            "high_severity_count": 1,
            "signals_reviewed": 5,
            "remediation_window": "72H",
        },
        "executive_summary": {
            "pull_quote": "This is a contained risk profile with one urgent transport issue and one important browser-hardening gap.",
            "body": "The scan did not uncover broad compromise, but it did surface the kind of preventable posture gaps that make opportunistic attacks cheaper and more repeatable.",
            "steps": [
                "Disable TLS 1.0 and TLS 1.1 on the public endpoint and re-check ciphers.",
                "Add HSTS and Content-Security-Policy across primary application responses.",
                "Re-run the exact scan pack after remediation and archive the clean memo for proof.",
            ],
            "risk_index": 68,
            "risk_lens": {
                "exposure_quality": "Signals are clear and externally reachable.",
                "exploit_effort": "Low effort for commodity scanners; steady probing risk.",
                "business_posture": "Owner-visible risk; fix quickly, then verify closure.",
            },
        },
        "visuals": {
            "severity_counts": {"critical": 0, "high": 1, "medium": 1, "low": 0},
            "finding_mix": [
                {"label": "Transport", "pct": 55.0, "color": "#E8521A"},
                {"label": "Headers", "pct": 30.0, "color": "#D4860A"},
                {"label": "Inventory", "pct": 15.0, "color": "#3B6FD4"},
            ],
            "surface_inventory": {"hosts": 1, "ports": 4, "pages": 12, "tls": 6},
            "most_exposed": [
                {"url": "https://example.com", "descriptor": "Primary site", "count": 2},
                {"url": "https://example.com/login", "descriptor": "Login", "count": 1},
                {"url": "https://example.com/api", "descriptor": "API", "count": 1},
            ],
            "owner_note": "Keep the charts, but make each one carry a decision.",
        },
        "findings": [
            {
                "severity": "high",
                "title": "Weak TLS settings remain enabled on the public endpoint.",
                "body": "Legacy TLS protocols and ciphers reduce the effort required for active interception and downgrade-style abuse.",
                "category": "TLS",
                "affected": "example.com:443",
                "confidence": "verified",
                "evidence_text": "TLS 1.0 supported\nTLS 1.1 supported\nweak ciphers present",
                "steps": [
                    "Disable TLS 1.0 and TLS 1.1.",
                    "Restrict to modern cipher suites.",
                    "Re-scan the same host to confirm closure.",
                ],
                "recommended_move": "",
            },
            {
                "severity": "medium",
                "title": "Browser security headers are missing on primary responses.",
                "body": "Missing hardening headers make opportunistic abuse easier and reduce the browser's built-in safety rails.",
                "category": "Headers",
                "affected": "https://example.com",
                "confidence": "verified",
                "evidence_text": "Strict-Transport-Security: missing\nContent-Security-Policy: missing",
                "steps": ["Add HSTS", "Add CSP", "Verify on key routes"],
                "recommended_move": "Treat this as a one-sprint hardening pass, not a never-ending checklist.",
            },
        ],
    }

    out = Path(__file__).resolve().parents[2] / "sample-security-memo-390x844.pdf"
    generate_security_memo(scan_data, str(out))
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()

