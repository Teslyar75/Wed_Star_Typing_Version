"""Слайдшоу простоя (S8 E2): картинки по теме скина.

Провайдеры:
- wikimedia — по умолчанию, без ключа (категории Commons из темы `slideshow.wikimedia`);
- unsplash — если в окружении есть UNSPLASH_ACCESS_KEY; запросы через сервер, кэш (лимит 50 запросов/ч),
  ссылки с utm и атрибуцией «Photo by X on Unsplash» по правилам Unsplash API;
- pexels — поле есть, но выдача ключей Pexels сейчас приостановлена (только если ключ задан);
- платные — заглушка `PAID_PROVIDERS` (ссылки), подключаются позже.
Ключи никогда не отдаются клиенту.
"""

from __future__ import annotations

import json
import random
import re
import threading
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.config import settings

router = APIRouter(prefix="/api/slideshow", tags=["slideshow"])

UA = "StarTypingWeb/0.9 (idle-slideshow; https://github.com/Teslyar75/Wed_Star_Typing_Version)"
TIMEOUT = 12.0
TTL = 6 * 3600
UTM = "utm_source=star_typing&utm_medium=referral"
THEMES_DIR = Path(__file__).resolve().parents[2] / "packages" / "themes"

PAID_PROVIDERS = [
    {"id": "shutterstock", "name": "Shutterstock", "url": "https://www.shutterstock.com/developers"},
    {"id": "getty", "name": "Getty Images", "url": "https://developers.gettyimages.com/"},
    {"id": "adobe_stock", "name": "Adobe Stock", "url": "https://developer.adobe.com/stock/"},
]

_FALLBACK: dict[str, dict[str, Any]] = {
    "old_england": {
        "wikimedia": ["Category:K6 telephone kiosks", "Category:AEC Routemaster", "Category:Elizabeth Tower",
                      "Category:London in fog"],
        "queries": ["red telephone box london", "routemaster bus", "big ben fog", "victorian london street"],
    },
    "spaceship": {
        "wikimedia": [
            "Category:Hubble Space Telescope images",
            "Category:James Webb Space Telescope images",
            "Category:Spiral galaxies",
            "Category:Nebulae",
            "Category:Earth from space",
        ],
        "topics": [
            "Hubble nebula",
            "James Webb Space Telescope image",
            "spiral galaxy Hubble",
            "Earth from ISS",
            "rocket launch night",
            "Milky Way night sky",
        ],
        "queries": [
            "hubble nebula",
            "james webb telescope",
            "spiral galaxy",
            "earth from iss",
            "rocket launch night",
        ],
        "per_topic": 3,
    },
}

_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_lock = threading.Lock()


def _get_json(url: str, headers: dict[str, str] | None = None) -> Any:
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:  # noqa: S310 (фиксированные https-хосты)
        return json.loads(r.read().decode("utf-8"))


def theme_slideshow(skin: str) -> dict[str, Any]:
    if not re.fullmatch(r"[a-z_]{2,32}", skin):
        raise HTTPException(400, "bad skin")
    p = THEMES_DIR / f"{skin}.json"
    if not p.is_file():  # Docker-образ backend без packages/ — встроенный минимум
        return _FALLBACK.get(skin, {})
    try:
        return json.loads(p.read_text(encoding="utf-8")).get("slideshow") or {}
    except (OSError, ValueError):
        return {}


def _strip_html(s: str) -> str:
    return re.sub(r"<[^>]+>", "", s or "").strip()


def fetch_topics(topics: list[str], per_topic: int = 3) -> list[dict[str, Any]]:
    """Поиск bitmap по Commons (как desktop idle.images.fetch_topic)."""
    out: list[dict[str, Any]] = []
    for topic in topics[:12]:
        offset = random.choice((0, 0, 10, 20))
        q = urllib.parse.urlencode({
            "action": "query", "format": "json", "generator": "search",
            "gsrsearch": f"filetype:bitmap {topic}", "gsrnamespace": "6",
            "gsrlimit": "30", "gsroffset": str(offset),
            "prop": "imageinfo", "iiprop": "url|size|extmetadata|mime", "iiurlwidth": "1920",
        })
        try:
            data = _get_json(f"https://commons.wikimedia.org/w/api.php?{q}")
        except Exception:  # noqa: BLE001
            continue
        pages = (data.get("query") or {}).get("pages") or {}
        n = 0
        batch: list[dict[str, Any]] = []
        for pg in pages.values():
            info = (pg.get("imageinfo") or [{}])[0]
            if info.get("mime") not in ("image/jpeg", "image/png"):
                continue
            if (info.get("width") or 0) < 1200 or (info.get("width") or 0) < (info.get("height") or 0):
                continue
            meta = info.get("extmetadata") or {}
            lic = _strip_html((meta.get("LicenseShortName") or {}).get("value", ""))
            if not lic:
                continue
            batch.append({
                "provider": "wikimedia",
                "url": info.get("thumburl") or info.get("url"),
                "author": _strip_html((meta.get("Artist") or {}).get("value", ""))[:80] or "Wikimedia Commons",
                "author_url": info.get("descriptionurl"),
                "license": lic,
                "source": "Wikimedia Commons",
                "source_url": info.get("descriptionurl"),
                "title": str(pg.get("title", "")).removeprefix("File:"),
                "topic": topic,
            })
            n += 1
            if n >= per_topic * 3:
                break
        random.shuffle(batch)
        out.extend(batch[:per_topic])
    return out


def fetch_wikimedia(categories: list[str], per_cat: int = 12) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for cat in categories:
        q = urllib.parse.urlencode({
            "action": "query", "format": "json", "generator": "categorymembers",
            "gcmtitle": cat, "gcmtype": "file", "gcmlimit": str(per_cat * 2),
            "prop": "imageinfo", "iiprop": "url|size|extmetadata|mime", "iiurlwidth": "1920",
        })
        try:
            data = _get_json(f"https://commons.wikimedia.org/w/api.php?{q}")
        except Exception:  # noqa: BLE001 — сеть/таймаут: просто пропускаем категорию
            continue
        pages = (data.get("query") or {}).get("pages") or {}
        n = 0
        for pg in pages.values():
            info = (pg.get("imageinfo") or [{}])[0]
            if info.get("mime") not in ("image/jpeg", "image/png"):
                continue
            if (info.get("width") or 0) < 1200 or (info.get("width") or 0) < (info.get("height") or 0):
                continue
            meta = info.get("extmetadata") or {}
            lic = _strip_html((meta.get("LicenseShortName") or {}).get("value", ""))
            if not lic:
                continue
            out.append({
                "provider": "wikimedia",
                "url": info.get("thumburl") or info.get("url"),
                "author": _strip_html((meta.get("Artist") or {}).get("value", ""))[:80] or "Wikimedia Commons",
                "author_url": info.get("descriptionurl"),
                "license": lic,
                "source": "Wikimedia Commons",
                "source_url": info.get("descriptionurl"),
                "title": str(pg.get("title", "")).removeprefix("File:"),
            })
            n += 1
            if n >= per_cat:
                break
    return out


def fetch_unsplash(queries: list[str], key: str, per_q: int = 10) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for qs in queries[:4]:  # бережём лимит 50/ч: максимум 4 запроса на прогрев кэша
        q = urllib.parse.urlencode({"query": qs, "per_page": str(per_q), "orientation": "landscape", "content_filter": "high"})
        try:
            data = _get_json(f"https://api.unsplash.com/search/photos?{q}",
                             {"Authorization": f"Client-ID {key}", "Accept-Version": "v1"})
        except Exception:  # noqa: BLE001
            continue
        for ph in data.get("results") or []:
            user = ph.get("user") or {}
            links = ph.get("links") or {}
            out.append({
                "provider": "unsplash",
                "url": (ph.get("urls") or {}).get("regular"),
                "author": user.get("name") or "Unsplash",
                "author_url": f"{(user.get('links') or {}).get('html', 'https://unsplash.com')}?{UTM}",
                "license": "Unsplash License",
                "source": "Unsplash",
                "source_url": f"https://unsplash.com/?{UTM}",
                "title": ph.get("alt_description") or qs,
                "download_location": links.get("download_location"),
            })
    return out


def providers() -> dict[str, Any]:
    return {
        "default": "unsplash" if settings.unsplash_access_key else "wikimedia",
        "wikimedia": True,
        "unsplash": bool(settings.unsplash_access_key),
        "pexels": bool(settings.pexels_api_key),
        "pexels_note": "paused",
        "links": {
            "unsplash": "https://unsplash.com/developers",
            "pexels": "https://www.pexels.com/api/",
        },
        "paid": PAID_PROVIDERS,
    }


@router.get("/providers")
def get_providers() -> dict[str, Any]:
    return providers()


@router.get("/images")
def get_images(
    skin: str = Query(..., min_length=2, max_length=32),
    provider: str = Query("auto"),
) -> dict[str, Any]:
    conf = theme_slideshow(skin)
    prov = provider
    if prov == "auto":
        prov = providers()["default"]
    if prov == "unsplash" and not settings.unsplash_access_key:
        prov = "wikimedia"
    if prov not in ("wikimedia", "unsplash"):
        prov = "wikimedia"
    ck = f"{prov}:{skin}"
    now = time.time()
    with _lock:
        hit = _cache.get(ck)
    if hit and now - hit[0] < TTL and hit[1]:
        items = hit[1]
    else:
        queries = list(conf.get("queries") or conf.get("topics") or [])
        cats = list(conf.get("wikimedia") or [])
        topics = list(conf.get("topics") or [])
        per_topic = int(conf.get("per_topic") or 3)
        if prov == "unsplash":
            items = fetch_unsplash(queries, settings.unsplash_access_key)
            if not items:  # ключ/лимит — тихо на Wikimedia
                prov, ck = "wikimedia", f"wikimedia:{skin}"
                items = fetch_wikimedia(cats) if cats else []
                if topics:
                    items = items + fetch_topics(topics, per_topic)
        else:
            items = fetch_wikimedia(cats) if cats else []
            if topics:
                items = items + fetch_topics(topics, per_topic)
            if not items and queries:
                # topics/queries без категорий — всё равно ищем на Commons
                items = fetch_topics(queries, per_topic)
        items = [i for i in items if i.get("url")]
        if items:
            with _lock:
                _cache[ck] = (now, items)
    items = list(items)
    random.shuffle(items)
    return {"provider": prov, "items": items[:40]}


@router.post("/unsplash/track")
def unsplash_track(download_location: str = Query(..., max_length=500)) -> dict[str, bool]:
    """Правило Unsplash API: отметить «использование» фото (без выдачи ключа клиенту)."""
    if not settings.unsplash_access_key:
        return {"ok": False}
    if not download_location.startswith("https://api.unsplash.com/photos/"):
        raise HTTPException(400, "bad location")
    try:
        _get_json(download_location, {"Authorization": f"Client-ID {settings.unsplash_access_key}"})
    except Exception:  # noqa: BLE001
        return {"ok": False}
    return {"ok": True}


def _clear_cache() -> None:
    with _lock:
        _cache.clear()
