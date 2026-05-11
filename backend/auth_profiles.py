"""Helpers for encrypted authenticated-scanning profiles."""

import base64
import hashlib
import json
import re
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from config import settings


BLOCKED_HEADERS = {
    "connection",
    "content-length",
    "host",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
}
HEADER_NAME_RE = re.compile(r"^[A-Za-z0-9!#$%&'*+.^_`|~-]+$")


class AuthProfileError(ValueError):
    """Raised when an auth profile payload cannot be used safely."""


def _fernet_key() -> bytes:
    configured = settings.AUTH_PROFILE_ENCRYPTION_KEY.strip()
    if configured:
        try:
            decoded = base64.urlsafe_b64decode(configured)
            if len(decoded) == 32:
                return configured.encode("utf-8")
        except Exception:
            pass
        source = configured
    else:
        source = settings.SECRET_KEY
    digest = hashlib.sha256(source.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def _cipher() -> Fernet:
    return Fernet(_fernet_key())


def sanitize_auth_headers(headers: dict[str, Any]) -> dict[str, str]:
    if not isinstance(headers, dict):
        raise AuthProfileError("Headers must be a JSON object.")
    if not headers:
        raise AuthProfileError("Add at least one auth header.")
    if len(headers) > 20:
        raise AuthProfileError("Use 20 or fewer auth headers.")

    sanitized: dict[str, str] = {}
    for raw_name, raw_value in headers.items():
        name = str(raw_name or "").strip()
        value = str(raw_value or "").strip()
        normalized = name.lower()
        if not name or not HEADER_NAME_RE.fullmatch(name):
            raise AuthProfileError(f"Invalid header name: {name or '(blank)'}")
        if normalized in BLOCKED_HEADERS:
            raise AuthProfileError(f"{name} cannot be stored in an auth profile.")
        if "\r" in value or "\n" in value:
            raise AuthProfileError(f"{name} contains invalid newline characters.")
        if len(value) > 8192:
            raise AuthProfileError(f"{name} is too large.")
        if value:
            sanitized[name] = value

    if not sanitized:
        raise AuthProfileError("Add at least one non-empty auth header.")
    return sanitized


def auth_header_names(headers: dict[str, str]) -> list[str]:
    return sorted(headers.keys(), key=str.lower)


def encrypt_auth_headers(headers: dict[str, str]) -> str:
    payload = json.dumps(headers, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return _cipher().encrypt(payload).decode("utf-8")


def decrypt_auth_headers(encrypted_headers: str) -> dict[str, str]:
    try:
        raw = _cipher().decrypt(encrypted_headers.encode("utf-8"))
        parsed = json.loads(raw.decode("utf-8"))
    except (InvalidToken, json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise AuthProfileError("Auth profile could not be decrypted.") from exc
    return sanitize_auth_headers(parsed)
