"""Полка пилота: тексты + позиция sentence_id / mode."""

from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, Session

from app.auth_deps import get_current_pilot, get_optional_pilot
from app.db import Base, get_db
from app.models import Segment, TextDoc
from app.pilots import Pilot
from app.text_processing import DEFAULT_PREP_OPTS, norm_opts
from app.texts_service import ensure_prepared

router = APIRouter(prefix="/api/library", tags=["library"])


class PilotText(Base):
    __tablename__ = "pilot_texts"
    __table_args__ = (UniqueConstraint("pilot_id", "text_id", name="uq_pilot_text"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pilot_id: Mapped[int] = mapped_column(Integer, index=True)
    text_id: Mapped[int] = mapped_column(Integer, index=True)
    sentence_id: Mapped[int] = mapped_column(Integer, default=0)
    mode: Mapped[str] = mapped_column(String(32), default="reader")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class LibraryItem(BaseModel):
    text_id: int
    title: str
    lang: str
    source: str
    sentence_id: int
    mode: str
    segments: int
    progress_pct: float = 0.0
    chars: int = 0
    words: int = 0
    prepared_chars: int = 0
    prep_lower: bool = True
    bilingual: bool = False
    print_allowed: bool = True
    author: str = ""


class RenameIn(BaseModel):
    title: str = Field(default="", max_length=512)
    author: str = Field(default="", max_length=256)


def _stats(db: Session, text_id: int) -> tuple[int, int, int]:
    """chars, words, segments — по сегментам (оригинал)."""
    segs = db.query(Segment).filter_by(text_id=text_id).order_by(Segment.idx).all()
    if not segs:
        return 0, 0, 0
    body = " ".join((s.original or "").strip() for s in segs if (s.original or "").strip())
    words = len(body.split()) if body else 0
    return len(body), words, len(segs)


def _prep_meta(db: Session, doc: TextDoc, *, bilingual: bool) -> tuple[int, bool]:
    """prepared_chars, prep_lower — для паспорта (чтение ≠ печать)."""
    if bilingual:
        return 0, True
    if not (doc.prepared or "").strip():
        ensure_prepared(db, doc)
    opts = dict(DEFAULT_PREP_OPTS)
    if (doc.prep_opts or "").strip():
        try:
            opts = norm_opts(json.loads(doc.prep_opts))
        except json.JSONDecodeError:
            pass
    prepared = (doc.prepared or "").strip()
    return len(prepared), bool(opts.get("lower", True))


def _item(
    db: Session,
    doc: TextDoc,
    *,
    sentence_id: int,
    mode: str,
    chars: int,
    words: int,
    segments: int,
) -> LibraryItem:
    bilingual = (doc.source or "").startswith("bilingu") or "-" in (doc.lang or "")
    author = ""
    title = doc.title or f"#{doc.id}"
    if " · " in title:
        # частый формат «Title · Author»
        parts = title.split(" · ", 1)
        if len(parts) == 2 and len(parts[1]) < 80:
            title, author = parts[0], parts[1]
    prep_chars, prep_lower = _prep_meta(db, doc, bilingual=bilingual)
    return LibraryItem(
        text_id=doc.id,
        title=title,
        author=author,
        lang=doc.lang or "und",
        source=doc.source or "upload",
        sentence_id=sentence_id,
        mode=mode,
        segments=segments,
        progress_pct=_pct(sentence_id, segments),
        chars=chars,
        words=words,
        prepared_chars=prep_chars,
        prep_lower=prep_lower,
        bilingual=bilingual,
        print_allowed=not bilingual,
    )


def _pct(sentence_id: int, segments: int) -> float:
    if segments <= 1:
        return 100.0 if sentence_id > 0 else 0.0
    return round(min(100.0, max(0.0, 100.0 * sentence_id / (segments - 1))), 1)


class PositionIn(BaseModel):
    sentence_id: int = 0
    mode: str = Field(default="reader", max_length=32)


class ShelfAddIn(BaseModel):
    text_id: int


@router.get("", response_model=list[LibraryItem])
def list_shelf(
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> list[LibraryItem]:
    if pilot is None:
        # гости — все тексты без персональной позиции
        docs = db.query(TextDoc).order_by(TextDoc.id.desc()).limit(50).all()
        out: list[LibraryItem] = []
        for d in docs:
            chars, words, n = _stats(db, d.id)
            out.append(
                _item(db, d, sentence_id=0, mode="reader", chars=chars, words=words, segments=n)
            )
        return out

    rows = db.query(PilotText).filter_by(pilot_id=pilot.id).order_by(PilotText.updated_at.desc()).all()
    out = []
    for row in rows:
        doc = db.get(TextDoc, row.text_id)
        if doc is None:
            continue
        chars, words, n = _stats(db, doc.id)
        out.append(
            _item(
                db,
                doc,
                sentence_id=row.sentence_id,
                mode=row.mode,
                chars=chars,
                words=words,
                segments=n,
            )
        )
    return out


@router.post("/shelf", response_model=LibraryItem)
def add_to_shelf(
    body: ShelfAddIn,
    db: Session = Depends(get_db),
    pilot: Pilot = Depends(get_current_pilot),
) -> LibraryItem:
    doc = db.get(TextDoc, body.text_id)
    if doc is None:
        raise HTTPException(404, "text not found")
    row = db.query(PilotText).filter_by(pilot_id=pilot.id, text_id=body.text_id).first()
    if row is None:
        row = PilotText(pilot_id=pilot.id, text_id=body.text_id)
        db.add(row)
        db.commit()
        db.refresh(row)
    chars, words, n = _stats(db, doc.id)
    return _item(
        db,
        doc,
        sentence_id=row.sentence_id,
        mode=row.mode,
        chars=chars,
        words=words,
        segments=n,
    )


@router.patch("/{text_id}", response_model=LibraryItem)
def rename_shelf_item(
    text_id: int,
    body: RenameIn,
    db: Session = Depends(get_db),
    pilot: Pilot = Depends(get_current_pilot),
) -> LibraryItem:
    """Порт LibraryPage.rename — название (+ автор в title через · )."""
    doc = db.get(TextDoc, text_id)
    if doc is None:
        raise HTTPException(404, "text not found")
    row = db.query(PilotText).filter_by(pilot_id=pilot.id, text_id=text_id).first()
    if row is None and pilot is not None:
        # гостевая полка / чужой текст — всё равно даём переименовать документ
        pass
    title = (body.title or "").strip() or doc.title
    author = (body.author or "").strip()
    doc.title = f"{title} · {author}" if author else title
    db.commit()
    db.refresh(doc)
    chars, words, n = _stats(db, doc.id)
    sid = row.sentence_id if row else 0
    mode = row.mode if row else "reader"
    return _item(db, doc, sentence_id=sid, mode=mode, chars=chars, words=words, segments=n)


@router.delete("/{text_id}")
def remove_from_shelf(
    text_id: int,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    """Убрать с полки (как desktop delete) — у пилота soft-remove, иначе удалить TextDoc."""
    if pilot is not None:
        row = db.query(PilotText).filter_by(pilot_id=pilot.id, text_id=text_id).first()
        if row is not None:
            db.delete(row)
            db.commit()
            return {"ok": True, "removed": "shelf"}
    doc = db.get(TextDoc, text_id)
    if doc is None:
        raise HTTPException(404, "text not found")
    # сегменты/абзацы каскадом или вручную
    from app.models import Paragraph, Sentence

    db.query(Segment).filter_by(text_id=text_id).delete()
    db.query(Sentence).filter_by(text_id=text_id).delete(synchronize_session=False)
    db.query(Paragraph).filter_by(text_id=text_id).delete(synchronize_session=False)
    db.query(PilotText).filter_by(text_id=text_id).delete(synchronize_session=False)
    db.delete(doc)
    db.commit()
    return {"ok": True, "removed": "text"}


@router.put("/{text_id}/position", response_model=LibraryItem)
def put_position(
    text_id: int,
    body: PositionIn,
    db: Session = Depends(get_db),
    pilot: Pilot = Depends(get_current_pilot),
) -> LibraryItem:
    doc = db.get(TextDoc, text_id)
    if doc is None:
        raise HTTPException(404, "text not found")
    row = db.query(PilotText).filter_by(pilot_id=pilot.id, text_id=text_id).first()
    if row is None:
        row = PilotText(pilot_id=pilot.id, text_id=text_id)
        db.add(row)
    row.sentence_id = max(0, body.sentence_id)
    row.mode = body.mode[:32]
    db.commit()
    db.refresh(row)
    chars, words, n = _stats(db, doc.id)
    return _item(
        db,
        doc,
        sentence_id=row.sentence_id,
        mode=row.mode,
        chars=chars,
        words=words,
        segments=n,
    )


@router.get("/{text_id}/position")
def get_position(
    text_id: int,
    db: Session = Depends(get_db),
    pilot: Pilot = Depends(get_current_pilot),
) -> dict:
    row = db.query(PilotText).filter_by(pilot_id=pilot.id, text_id=text_id).first()
    if row is None:
        return {"text_id": text_id, "sentence_id": 0, "mode": "reader"}
    return {"text_id": text_id, "sentence_id": row.sentence_id, "mode": row.mode}
