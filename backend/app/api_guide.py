"""API бортового гида: ленивая выдача шуток/фактов/заходов по языку и категории."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app import guide_content as gc

router = APIRouter(prefix="/api/guide", tags=["guide"])


@router.get("/content")
def content_meta(lang: str = Query("ru")) -> dict:
    """Счётчики и список категорий (без тел шуток) — для UI и ленивой загрузки."""
    m = gc.meta(lang)
    m["langs"] = list(gc.LANGS)
    m["parity"] = gc.parity_counts()
    return m


@router.get("/content/{category}")
def content_category(category: str, lang: str = Query("ru")) -> dict:
    if category not in gc.CATEGORIES:
        raise HTTPException(404, f"unknown category: {category}")
    try:
        return gc.category(lang, category)
    except KeyError as e:
        raise HTTPException(404, str(e)) from e


@router.get("/parity")
def parity() -> dict:
    """Счётчики desktop-эталона (ru) и web (все языки) — для отчёта."""
    return {
        "desktop_ref": {
            "repo": "Teslyar75/My_Stamina",
            "path": "stamina/guide_content/ru.json",
            "langs": ["ru"],
            "counts": gc.meta("ru")["counts"],
        },
        "web": gc.parity_counts(),
    }
