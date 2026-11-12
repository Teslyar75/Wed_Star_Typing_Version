"""Доступ к TextDoc: cookie-пилот + pilot_texts / is_public."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import TextDoc
from app.pilots import Pilot


def _pilot_text_row(db: Session, pilot_id: int, text_id: int):
    from app.api_library import PilotText

    return db.query(PilotText).filter_by(pilot_id=pilot_id, text_id=text_id).first()


def get_text_or_404(db: Session, text_id: int) -> TextDoc:
    doc = db.get(TextDoc, text_id)
    if doc is None:
        raise HTTPException(404, "text not found")
    return doc


def can_read_text(db: Session, pilot: Pilot, doc: TextDoc) -> bool:
    if bool(getattr(doc, "is_public", False)):
        return True
    return _pilot_text_row(db, pilot.id, doc.id) is not None


def can_write_text(db: Session, pilot: Pilot, doc: TextDoc) -> bool:
    """Мутации тела/prepared — только при связи pilot_texts (не «просто public»)."""
    return _pilot_text_row(db, pilot.id, doc.id) is not None


def require_read(db: Session, pilot: Pilot, text_id: int) -> TextDoc:
    doc = get_text_or_404(db, text_id)
    if not can_read_text(db, pilot, doc):
        raise HTTPException(404, "text not found")
    return doc


def require_write(db: Session, pilot: Pilot, text_id: int) -> TextDoc:
    doc = get_text_or_404(db, text_id)
    if not can_write_text(db, pilot, doc):
        raise HTTPException(404, "text not found")
    return doc


def link_pilot_text(db: Session, pilot: Pilot, text_id: int) -> None:
    from app.api_library import PilotText

    if _pilot_text_row(db, pilot.id, text_id) is None:
        db.add(PilotText(pilot_id=pilot.id, text_id=text_id))
        db.commit()
