"""Чтение ICY-метаданных потока (StreamTitle) для радиорубки."""

from __future__ import annotations

import ipaddress
import re
import socket
import urllib.error
import urllib.request
from urllib.parse import urlparse

_TITLE_RE = re.compile(rb"StreamTitle='([^']*)';", re.I)


def _host_ok(host: str) -> bool:
    if not host or host.lower() in {"localhost", "metadata.google.internal"}:
        return False
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    for info in infos:
        ip = info[4][0]
        try:
            addr = ipaddress.ip_address(ip)
        except ValueError:
            continue
        if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved:
            return False
    return True


def fetch_icy_title(url: str, *, timeout: float = 4.0, max_bytes: int = 64_000) -> str | None:
    """Подключается к потоку с Icy-MetaData:1, возвращает StreamTitle или None."""
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        return None
    if not _host_ok(parsed.hostname or ""):
        return None

    req = urllib.request.Request(
        url,
        headers={
            "Icy-MetaData": "1",
            "User-Agent": "StarTypingWeb/1.0",
            "Accept": "*/*",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            meta_int = int(resp.headers.get("icy-metaint") or resp.headers.get("Icy-MetaInt") or 0)
            if meta_int <= 0 or meta_int > 1_000_000:
                # иногда title в заголовках icy-name
                name = resp.headers.get("icy-name") or resp.headers.get("ice-name")
                return name.strip() if name else None
            buf = b""
            while len(buf) < meta_int + 1 + 4096 and len(buf) < max_bytes:
                chunk = resp.read(min(8192, max_bytes - len(buf)))
                if not chunk:
                    break
                buf += chunk
                if len(buf) >= meta_int + 1:
                    break
            if len(buf) < meta_int + 1:
                return None
            meta_len = buf[meta_int] * 16
            start = meta_int + 1
            end = start + meta_len
            if end > len(buf):
                return None
            block = buf[start:end]
            m = _TITLE_RE.search(block)
            if not m:
                return None
            title = m.group(1).decode("utf-8", errors="replace").strip()
            return title or None
    except (urllib.error.URLError, TimeoutError, ValueError, OSError):
        return None
