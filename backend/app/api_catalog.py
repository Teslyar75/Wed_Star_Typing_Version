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


class CatalogPage(BaseModel):
    results: list[CatalogBook]
    count: int
    query: str = ""


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
        if "text/plain" in key:
            return url
    return None


def _normalize(item: dict) -> CatalogBook | None:
    gid = item.get("id")
    if gid is None:
        return None
    formats = item.get("formats") or {}
    return CatalogBook(
        id=int(gid),
        title=(item.get("title") or "").strip(),
        authors=_authors(item),
        languages=list(item.get("languages") or []),
        text_url=_plain_url(formats),
    )


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
    results = [b for b in (_normalize(x) for x in data.get("results") or []) if b]
    return CatalogPage(results=results, count=int(data.get("count") or len(results)), query=q)


@router.get("/gutenberg/popular", response_model=CatalogPage)
def popular_gutenberg(page: int = 1, languages: str | None = "en") -> CatalogPage:
    params: dict[str, str] = {"sort": "popular"}
    if languages:
        params["languages"] = languages
    if page > 1:
        params["page"] = str(page)
    data = _get_json(GUTENDEX + "?" + urllib.parse.urlencode(params))
    results = [b for b in (_normalize(x) for x in data.get("results") or []) if b]
    return CatalogPage(results=results, count=int(data.get("count") or len(results)), query="popular")


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
