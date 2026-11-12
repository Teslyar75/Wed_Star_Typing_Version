"""Общая SSRF-защита для исходящих HTTP(S) (радио ICY, Gutenberg, BYO LLM)."""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

# Метаданные облаков / link-local имена
_BLOCKED_HOSTS = frozenset(
    {
        "localhost",
        "metadata.google.internal",
        "metadata",
        "metadata.azure.com",
        "169.254.169.254",
    }
)


def host_is_public(host: str) -> bool:
    """False для localhost, приватных, link-local, reserved и metadata-адресов."""
    h = (host or "").strip().lower().rstrip(".")
    if not h or h in _BLOCKED_HOSTS:
        return False
    # IPv4/IPv6 литерал
    try:
        addr = ipaddress.ip_address(h.strip("[]"))
        return not _ip_blocked(addr)
    except ValueError:
        pass
    try:
        infos = socket.getaddrinfo(h, None)
    except socket.gaierror:
        return False
    if not infos:
        return False
    for info in infos:
        ip = info[4][0]
        try:
            addr = ipaddress.ip_address(ip)
        except ValueError:
            continue
        if _ip_blocked(addr):
            return False
    return True


def _ip_blocked(addr: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved:
        return True
    if addr.is_multicast or addr.is_unspecified:
        return True
    # AWS/GCP/Azure metadata
    if addr == ipaddress.ip_address("169.254.169.254"):
        return True
    return False


def assert_safe_url(
    url: str,
    *,
    allow_http: bool = True,
    schemes: tuple[str, ...] = ("https", "http"),
) -> str:
    """Проверить URL до исходящего запроса. ValueError при отказе."""
    parsed = urlparse((url or "").strip())
    if parsed.scheme not in schemes:
        raise ValueError("bad_scheme")
    if parsed.scheme == "http" and not allow_http:
        raise ValueError("https_required")
    host = parsed.hostname or ""
    if not host_is_public(host):
        raise ValueError("private_host")
    return url
