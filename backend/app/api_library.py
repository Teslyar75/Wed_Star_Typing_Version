"""Полка пилота: тексты + позиция sentence_id / mode."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, Session

from app.auth_deps import get_current_pilot, get_optional_pilot
from app.db import Base, get_db
from app.models import Segment, TextDoc
from app.pilots import Pilot

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
            n = db.query(Segment).filter_by(text_id=d.id).count()
            out.append(
                LibraryItem(
                    text_id=d.id,
                    title=d.title,
                    lang=d.lang,
                    source=d.source,
                    sentence_id=0,
                    mode="reader",
                    segments=n,
                )
            )
        return out

    rows = db.query(PilotText).filter_by(pilot_id=pilot.id).order_by(PilotText.updated_at.desc()).all()
    out = []
    for row in rows:
        doc = db.get(TextDoc, row.text_id)
        if doc is None:
            continue
        n = db.query(Segment).filter_by(text_id=doc.id).count()
        out.append(
            LibraryItem(
                text_id=doc.id,
                title=doc.title,
                lang=doc.lang,
                source=doc.source,
                sentence_id=row.sentence_id,
                mode=row.mode,
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
    n = db.query(Segment).filter_by(text_id=doc.id).count()
    return LibraryItem(
        text_id=doc.id,
        title=doc.title,
        lang=doc.lang,
        source=doc.source,
        sentence_id=row.sentence_id,
        mode=row.mode,
        segments=n,
    )


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
    n = db.query(Segment).filter_by(text_id=doc.id).count()
    return LibraryItem(
        text_id=doc.id,
        title=doc.title,
        lang=doc.lang,
        source=doc.source,
        sentence_id=row.sentence_id,
        mode=row.mode,
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
