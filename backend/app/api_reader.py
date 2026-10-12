"""Читалка / 2 языка / фоновый перевод (фаза 4)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Segment, TextDoc
from app.translate_cache import fill_missing_translations

router = APIRouter(prefix="/api/reader", tags=["reader"])


class TranslateJob(BaseModel):
    text_id: int
    src_lang: str = "en"
    dst_lang: str = "ru"
    limit: int = 50


@router.get("/{text_id}/bilingual")
def bilingual_view(text_id: int, offset: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    if db.get(TextDoc, text_id) is None:
        raise HTTPException(404, "not found")
    segs = (
        db.query(Segment)
        .filter(Segment.text_id == text_id)
        .order_by(Segment.idx)
        .offset(max(0, offset))
        .limit(max(1, min(limit, 300)))
        .all()
    )
    return [
        {
            "idx": s.idx,
            "para_idx": s.para_idx,
            "original": s.original,
            "translation": s.translation or "…",
            "status": s.status,
            "sentence_id": s.idx,
        }
        for s in segs
    ]


@router.post("/translate")
def queue_translate(body: TranslateJob, db: Session = Depends(get_db)) -> dict[str, int]:
    if db.get(TextDoc, body.text_id) is None:
        raise HTTPException(404, "not found")
    n = fill_missing_translations(db, body.text_id, body.src_lang, body.dst_lang, body.limit)
    return {"filled": n}
