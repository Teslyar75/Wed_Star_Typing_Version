"""Кэш переводов + простой фоновый перевод сегментов (фаза 4)."""

from __future__ import annotations

import hashlib
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, Session

from app.db import Base
from app.models import Segment


class TranslationCache(Base):
    __tablename__ = "translations"
    __table_args__ = (UniqueConstraint("digest", "src_lang", "dst_lang", name="uq_tr"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    digest: Mapped[str] = mapped_column(String(64), index=True)
    src_lang: Mapped[str] = mapped_column(String(16))
    dst_lang: Mapped[str] = mapped_column(String(16))
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


def _digest(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def cache_get(db: Session, text: str, src: str, dst: str) -> str | None:
    row = (
        db.query(TranslationCache)
        .filter_by(digest=_digest(text), src_lang=src, dst_lang=dst)
        .first()
    )
    return row.text if row else None


def cache_put(db: Session, source: str, src: str, dst: str, translated: str) -> None:
    dig = _digest(source)
    existing = db.query(TranslationCache).filter_by(digest=dig, src_lang=src, dst_lang=dst).first()
    if existing:
        existing.text = translated
    else:
        db.add(TranslationCache(digest=dig, src_lang=src, dst_lang=dst, text=translated))
    db.commit()


def stub_translate(text: str, src: str, dst: str) -> str:
    """Заглушка без сети: помечает язык; реальный UPLINK — позже через HTTP-провайдер."""
    if not text.strip():
        return ""
    return f"[{dst}] {text}"


def fill_missing_translations(db: Session, text_id: int, src: str, dst: str, limit: int = 50) -> int:
    segs = (
        db.query(Segment)
        .filter(Segment.text_id == text_id, Segment.translation == "")
        .order_by(Segment.idx)
        .limit(limit)
        .all()
    )
    n = 0
    for s in segs:
        cached = cache_get(db, s.original, src, dst)
        tr = cached or stub_translate(s.original, src, dst)
        if not cached:
            cache_put(db, s.original, src, dst, tr)
        s.translation = tr
        s.status = "aligned" if tr else "unaligned"
        n += 1
    db.commit()
    return n
