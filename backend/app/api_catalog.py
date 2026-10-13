"""Каталог Project Gutenberg через Gutendex + импорт plain text."""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth_deps import get_optional_pilot
from app.bilinguis import BilinguisError, download_pair, list_bilingual_pairs
from app.db import get_db
from app.pilots import Pilot
from app.texts_service import import_bilingual, import_text

router = APIRouter(prefix="/api/catalog", tags=["catalog"])

GUTENDEX = "https://gutendex.com/books/"
UA = "StarTypingWeb/0.9 (educational)"
TIMEOUT = 25
MAX_BYTES = 8 * 1024 * 1024


class CatalogBook(BaseModel):
    id: int
    title: str
    authors: str
    languages: list[str] = []
    text_url: str | None = None
    cover_url: str | None = None
    has_cover: bool = False
    download_count: int = 0
    cefr: str | None = None


class CatalogPage(BaseModel):
    results: list[CatalogBook]
    count: int
    query: str = ""
    next: bool = False


# Как stamina/book_catalog.py — кураторская PD-полка под CEFR
CEFR_LEVELS = ("A1", "A2", "B1", "B2", "C1", "C2")
CEFR_PAGE = 16
CEFR_IDS_EN: dict[str, list[int]] = {
    "A1": [21, 113, 2591, 55, 301, 500, 14838, 1597],
    "A2": [16, 11, 12, 46, 74, 35, 514, 47],
    "B1": [120, 215, 76, 1661, 244, 2852, 308, 42],
    "B2": [84, 1342, 1260, 174, 98, 345, 1400, 25344],
    "C1": [2701, 36, 64317, 766, 730, 996, 4217, 25305],
    "C2": [4300, 1727, 1497, 1232, 2600, 1399, 6130, 28054],
}
CEFR_TOPICS: dict[str, str] = {
    "A1": "children",
    "A2": "juvenile",
    "B1": "adventure",
    "B2": "fiction",
    "C1": "literature",
    "C2": "philosophy",
}


class ImportIn(BaseModel):
    gutenberg_id: int
    title: str = ""
    lang: str = "en"


class BilinguisImportIn(BaseModel):
    slug: str
    lang_a: str = "en"
    lang_b: str = "ru"
    title: str = ""


def _get_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return json.loads(r.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as exc:
        raise HTTPException(400, f"catalog HTTP {exc.code}") from exc
    except urllib.error.URLError as exc:
        raise HTTPException(503, "catalog unreachable") from exc


def _get_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        data = r.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(400, "file too large")
    return data


def _authors(item: dict) -> str:
    names = []
    for a in item.get("authors") or []:
        name = (a.get("name") or "").strip()
        if name:
            names.append(name)
    return ", ".join(names)


def _plain_url(formats: dict) -> str | None:
    for key, url in (formats or {}).items():
        if "text/plain" in key and "charset=utf-8" in key.lower():
            return url
    for key, url in (formats or {}).items():
        if "text/plain" in key and "zip" not in key.lower():
            return url
    return None


def _cover_url(formats: dict) -> str | None:
    if not isinstance(formats, dict):
        return None
    for mime, url in formats.items():
        if not url:
            continue
        ml = str(mime).lower()
        if ml.startswith("image/") or "cover" in ml or str(url).lower().endswith((".jpg", ".jpeg", ".png")):
            return str(url)
    return formats.get("image/jpeg") or formats.get("image/png")


def _normalize(item: dict, *, cefr: str | None = None) -> CatalogBook | None:
    gid = item.get("id")
    if gid is None:
        return None
    formats = item.get("formats") or {}
    cover = _cover_url(formats)
    return CatalogBook(
        id=int(gid),
        title=(item.get("title") or "").strip(),
        authors=_authors(item),
        languages=list(item.get("languages") or []),
        text_url=_plain_url(formats),
        cover_url=cover,
        has_cover=bool(cover),
        download_count=int(item.get("download_count") or 0),
        cefr=cefr,
    )


def _pack(data: dict, *, query: str = "", cefr: str | None = None) -> CatalogPage:
    results = [b for b in (_normalize(x, cefr=cefr) for x in data.get("results") or []) if b]
    return CatalogPage(
        results=results,
        count=int(data.get("count") or len(results)),
        query=query,
        next=bool(data.get("next")),
    )


def _fetch_by_ids(ids: list[int], *, languages: str | None, cefr: str | None = None) -> list[CatalogBook]:
    """Параллельная подгрузка книг по id (CEFR-полка) — иначе UI «висит» 10–20 с."""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    def one(gid: int) -> CatalogBook | None:
        try:
            item = _get_json(f"{GUTENDEX}{gid}")
        except HTTPException:
            return None
        book = _normalize(item, cefr=cefr)
        if not book:
            return None
        if languages and book.languages and languages not in book.languages:
            return None
        return book

    out: list[CatalogBook] = []
    if not ids:
        return out
    with ThreadPoolExecutor(max_workers=min(8, len(ids))) as pool:
        futs = {pool.submit(one, gid): gid for gid in ids}
        by_id: dict[int, CatalogBook] = {}
        for fut in as_completed(futs):
            book = fut.result()
            if book is not None:
                by_id[book.id] = book
    # сохранить порядок кураторской полки
    for gid in ids:
        if gid in by_id:
            out.append(by_id[gid])
    return out


def _strip_boilerplate(text: str) -> str:
    start = re.search(
        r"\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*\n]*\*\*\*",
        text,
        re.I,
    )
    if start:
        text = text[start.end() :]
    end = re.search(r"\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK", text, re.I)
    if end:
        text = text[: end.start()]
    return text.strip()


@router.get("/gutenberg/search", response_model=CatalogPage)
def search_gutenberg(
    q: str = Query(..., min_length=1),
    page: int = 1,
    languages: str | None = "en",
) -> CatalogPage:
    params: dict[str, str] = {"search": q.strip()}
    if languages:
        params["languages"] = languages
    if page > 1:
        params["page"] = str(page)
    data = _get_json(GUTENDEX + "?" + urllib.parse.urlencode(params))
    return _pack(data, query=q)


@router.get("/gutenberg/popular", response_model=CatalogPage)
def popular_gutenberg(page: int = 1, languages: str | None = "en") -> CatalogPage:
    params: dict[str, str] = {"sort": "popular"}
    if languages:
        params["languages"] = languages
    if page > 1:
        params["page"] = str(page)
    data = _get_json(GUTENDEX + "?" + urllib.parse.urlencode(params))
    return _pack(data, query="popular")


@router.get("/gutenberg/cefr", response_model=CatalogPage)
def cefr_gutenberg(
    level: str = Query(..., min_length=2, max_length=2),
    page: int = 1,
    languages: str | None = "en",
) -> CatalogPage:
    """Порт stamina.book_catalog.list_by_cefr — без 500 наружу."""
    lv = level.strip().upper()
    if lv not in CEFR_LEVELS:
        raise HTTPException(400, f"unknown CEFR level: {level}")
    page = max(1, int(page or 1))
    lang = (languages or "").strip().lower() or None
    query = f"cefr {lv}"

    try:
        # Кураторская полка — только EN; для RU/DE/… сразу topic Gutendex
        ids = list(CEFR_IDS_EN.get(lv) or []) if lang in (None, "", "en") else []
        id_pages = max(1, (len(ids) + CEFR_PAGE - 1) // CEFR_PAGE) if ids else 0

        if ids and page <= id_pages:
            chunk = ids[(page - 1) * CEFR_PAGE : page * CEFR_PAGE]
            results = _fetch_by_ids(chunk, languages=lang, cefr=lv)
            has_more = page < id_pages or bool(CEFR_TOPICS.get(lv))
            return CatalogPage(results=results, count=len(ids), query=query, next=has_more)

        topic_page = page - id_pages if ids else page
        topic = CEFR_TOPICS.get(lv) or "fiction"
        params: dict[str, str] = {"topic": topic, "sort": "popular"}
        if lang:
            params["languages"] = lang
        if topic_page > 1:
            params["page"] = str(topic_page)
        data = _get_json(GUTENDEX + "?" + urllib.parse.urlencode(params))
        packed = _pack(data, query=query, cefr=lv)
        return CatalogPage(
            results=packed.results,
            count=int(packed.count) + len(ids),
            query=query,
            next=packed.next,
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        # Не роняем модалку Internal Server Error — пустой результат + сообщение
        raise HTTPException(503, f"cefr catalog unavailable: {exc}") from exc


@router.post("/gutenberg/import")
def import_gutenberg(
    body: ImportIn,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    data = _get_json(f"{GUTENDEX}{body.gutenberg_id}")
    book = _normalize(data)
    if book is None or not book.text_url:
        raise HTTPException(404, "book or text_url not found")
    raw = _get_bytes(book.text_url)
    text = None
    for enc in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        text = raw.decode("utf-8", "replace")
    text = _strip_boilerplate(text.replace("\r\n", "\n").replace("\r", "\n")) + "\n"
    if len(text) < 200:
        raise HTTPException(400, "downloaded text too short")
    if len(text) > 500_000:
        text = text[:500_000]
    title = body.title or book.title or f"Gutenberg {body.gutenberg_id}"
    doc = import_text(db, title=title, lang=body.lang, content=text, source="gutenberg")
    if pilot is not None:
        from app.api_library import PilotText

        if db.query(PilotText).filter_by(pilot_id=pilot.id, text_id=doc.id).first() is None:
            db.add(PilotText(pilot_id=pilot.id, text_id=doc.id))
            db.commit()
    return {"text_id": doc.id, "title": doc.title, "chars": len(text)}


@router.get("/bilinguis/list")
def bilinguis_list(lang_a: str = "en", lang_b: str = "ru") -> dict:
    return list_bilingual_pairs(lang_a=lang_a, lang_b=lang_b)


@router.post("/bilinguis/import")
def bilinguis_import(
    body: BilinguisImportIn,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    book = {
        "slug": body.slug.strip(),
        "lang_a": body.lang_a,
        "lang_b": body.lang_b,
        "title": body.title,
    }
    try:
        text_a, text_b = download_pair(book)
    except BilinguisError as exc:
        raise HTTPException(400, str(exc)) from exc
    if len(text_a) > 400_000:
        text_a = text_a[:400_000]
    if len(text_b) > 400_000:
        text_b = text_b[:400_000]
    title = body.title or f"{body.slug} ({body.lang_a}→{body.lang_b})"
    doc = import_bilingual(
        db,
        title=title,
        lang_src=body.lang_a,
        lang_tgt=body.lang_b,
        original=text_a,
        translation=text_b,
    )
    if pilot is not None:
        from app.api_library import PilotText

        if db.query(PilotText).filter_by(pilot_id=pilot.id, text_id=doc.id).first() is None:
            db.add(PilotText(pilot_id=pilot.id, text_id=doc.id))
            db.commit()
    return {"text_id": doc.id, "title": doc.title, "chars": len(text_a), "source": "bilinguis"}
