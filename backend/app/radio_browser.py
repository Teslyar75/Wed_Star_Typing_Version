"""Прокси radio-browser.info — порт stamina/radio/browser.py (без UI)."""

from __future__ import annotations

import json
import random
import socket
import urllib.error
import urllib.parse
import urllib.request

UA = "StarTypingWeb/0.9 (radio-cabin)"
TIMEOUT = 12.0
KNOWN = (
    "de1.api.radio-browser.info",
    "de2.api.radio-browser.info",
    "nl1.api.radio-browser.info",
    "at1.api.radio-browser.info",
)


def _servers() -> list[str]:
    hosts: list[str] = []
    try:
        infos = socket.getaddrinfo("all.api.radio-browser.info", 443, type=socket.SOCK_STREAM)
        seen: set[str] = set()
        for info in infos:
            ip = info[4][0]
            if ip in seen:
                continue
            seen.add(ip)
            try:
                name = socket.getnameinfo((ip, 0), 0)[0]
                if name and name not in hosts:
                    hosts.append(name)
            except OSError:
                pass
    except OSError:
        pass
    for h in KNOWN:
        if h not in hosts:
            hosts.append(h)
    random.shuffle(hosts)
    return hosts or list(KNOWN)


def get_json(path: str, params: dict | None = None) -> object:
    clean = {k: v for k, v in (params or {}).items() if v not in (None, "")}
    q = ("?" + urllib.parse.urlencode(clean)) if clean else ""
    last_err: Exception | None = None
    for host in _servers():
        url = f"https://{host}{path}{q}"
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                return json.loads(resp.read().decode("utf-8", errors="replace"))
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
            last_err = e
            continue
    raise ConnectionError(str(last_err or "no radio-browser server"))


def station_card(raw: dict) -> dict:
    tags = (raw.get("tags") or "").replace(",", " · ")
    return {
        "stationuuid": raw.get("stationuuid") or "",
        "name": (raw.get("name") or "—").strip() or "—",
        "url_resolved": raw.get("url_resolved") or raw.get("url") or "",
        "favicon": raw.get("favicon") or "",
        "country": raw.get("country") or raw.get("countrycode") or "",
        "language": raw.get("language") or "",
        "tags": tags[:80],
        "bitrate": int(raw.get("bitrate") or 0),
    }


def top_stations(limit: int = 120) -> list[dict]:
    data = get_json(f"/json/stations/topvote/{int(limit)}")
    if not isinstance(data, list):
        return []
    return [station_card(r) for r in data if r.get("url") or r.get("url_resolved")]


def search_stations(
    *,
    name: str = "",
    country: str = "",
    language: str = "",
    tag: str = "",
    limit: int = 120,
) -> list[dict]:
    c = country.strip()
    params = {
        "name": name.strip(),
        "countrycode": c.upper() if len(c) == 2 else "",
        "country": c if len(c) != 2 else "",
        "language": language.strip(),
        "tag": tag.strip(),
        "order": "clickcount",
        "reverse": "true",
        "limit": str(limit),
        "hidebroken": "true",
    }
    data = get_json("/json/stations/search", params)
    if not isinstance(data, list):
        return []
    return [station_card(r) for r in data if r.get("url") or r.get("url_resolved")]


def countries() -> list[dict]:
    data = get_json("/json/countries", {"order": "stationcount", "reverse": "true"})
    if not isinstance(data, list):
        return []
    out = []
    for d in data:
        name = d.get("name") or ""
        code = d.get("iso_3166_1") or ""
        if name and code:
            out.append({"name": name, "code": code})
        if len(out) >= 120:
            break
    return out


def languages() -> list[str]:
    data = get_json("/json/languages", {"order": "stationcount", "reverse": "true", "limit": "80"})
    if not isinstance(data, list):
        return []
    return [d.get("name") for d in data if d.get("name")]


def tags() -> list[str]:
    data = get_json("/json/tags", {"order": "stationcount", "reverse": "true", "limit": "100"})
    if not isinstance(data, list):
        return []
    return [
        d.get("name")
        for d in data
        if d.get("name") and (d.get("stationcount") or 0) > 5
    ][:100]
