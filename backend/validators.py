"""
ScanAI — URL validation and security checks.
Blocks SSRF attempts via RFC1918, loopback, and DNS rebinding protections.
"""

import ipaddress
import socket
from urllib.parse import urlparse

# Maximum allowed URL length
MAX_URL_LENGTH = 2048

# Blocked private/reserved network ranges
BLOCKED_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),  # Link-local
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("::1/128"),  # IPv6 loopback
    ipaddress.ip_network("fc00::/7"),  # IPv6 private
    ipaddress.ip_network("fe80::/10"),  # IPv6 link-local
]

# Blocked hostnames
BLOCKED_HOSTNAMES = {
    "localhost",
    "localhost.localdomain",
    "ip6-localhost",
    "ip6-loopback",
}


class URLValidationError(Exception):
    """Raised when a URL fails security validation."""

    def __init__(self, message: str):
        self.message = message
        super().__init__(self.message)


def validate_url(url: str) -> str:
    """
    Validate and sanitize a target URL for scanning.

    Checks:
    - URL length <= 2048
    - Scheme must be http or https
    - Hostname must not be a private/reserved IP
    - Hostname must not resolve to a private/reserved IP
    - Hostname must not be in the blocklist

    Returns the validated URL string.
    Raises URLValidationError on any check failure.
    """
    # Check length
    if len(url) > MAX_URL_LENGTH:
        raise URLValidationError(
            f"URL exceeds maximum length of {MAX_URL_LENGTH} characters."
        )

    # Parse URL
    try:
        parsed = urlparse(url)
    except Exception:
        raise URLValidationError("Invalid URL format.")

    # Check scheme
    if parsed.scheme not in ("http", "https"):
        raise URLValidationError(
            "URL must use http:// or https:// scheme."
        )

    # Extract hostname
    hostname = parsed.hostname
    if not hostname:
        raise URLValidationError("URL must contain a valid hostname.")

    # Check blocked hostnames
    if hostname.lower() in BLOCKED_HOSTNAMES:
        raise URLValidationError(
            f"Scanning '{hostname}' is not allowed."
        )

    # Check if hostname is a direct IP address
    try:
        ip = ipaddress.ip_address(hostname)
        if _is_blocked_ip(ip):
            raise URLValidationError(
                f"Scanning private/reserved IP addresses is not allowed."
            )
    except ValueError:
        # Not an IP address — it's a hostname, resolve it
        pass

    # DNS resolution check — catch SSRF via DNS rebinding
    try:
        addrinfo = socket.getaddrinfo(hostname, None)
        for family, _, _, _, sockaddr in addrinfo:
            ip_str = sockaddr[0]
            try:
                ip = ipaddress.ip_address(ip_str)
                if _is_blocked_ip(ip):
                    raise URLValidationError(
                        f"URL resolves to a private/reserved IP address. "
                        f"Scanning internal networks is not allowed."
                    )
            except ValueError:
                continue
    except socket.gaierror:
        raise URLValidationError(
            f"Could not resolve hostname '{hostname}'. "
            f"Please check the URL and try again."
        )

    return url


def _is_blocked_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Check if an IP address falls within any blocked network range."""
    for network in BLOCKED_NETWORKS:
        if ip in network:
            return True
    return False


def extract_domain(url: str) -> str:
    """Extract the domain (hostname) from a URL."""
    parsed = urlparse(url)
    return parsed.hostname or ""
