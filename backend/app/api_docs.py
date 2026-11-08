"""Документы пилота: список, CRUD, автосохранение с rev, снимки версий.

Изоляция только по cookie-пилоту (get_current_pilot). Поля pilot_id из тела не читаем.
Смысл десктопа stamina/docs.py (v3.8.3): saved_ns, snapshot раз в 10 мин, последние 20.
Формат .stdoc/zip и картинки — не в этом MVP.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, Session

from app.auth_deps import get_current_pilot
from app.db import Base, get_db
from app.pilots import Pilot

router = APIRouter(prefix="/api/docs", tags=["docs"])

VERSION_EVERY = timedelta(minutes=10)
VERSION_KEEP = 20
TITLE_MAX = 512
BODY_MAX = 200_000


class PilotDoc(Base):
    __tablename__ = "pilot_docs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pilot_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(TITLE_MAX), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    rev: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class PilotDocVersion(Base):
    __tablename__ = "pilot_doc_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    doc_id: Mapped[int] = mapped_column(ForeignKey("pilot_docs.id", ondelete="CASCADE"), index=True)
    pilot_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    rev: Mapped[int] = mapped_column(Integer, default=1)
    title: Mapped[str] = mapped_column(String(TITLE_MAX), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DocIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str = Field(default="", max_length=TITLE_MAX)
    body: str = Field(default="", max_length=BODY_MAX)


class DocSaveIn(DocIn):
    rev: int = Field(ge=1)


class RestoreIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    version_id: int


def _words(body: str) -> int:
    return len(body.split()) if body.strip() else 0


def _out(row: PilotDoc) -> dict:
    return {
        "id": row.id,
        "title": row.title,
        "body": row.body,
        "rev": row.rev,
        "words": _words(row.body),
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _owned(db: Session, pilot: Pilot, doc_id: int) -> PilotDoc:
    row = db.get(PilotDoc, doc_id)
    if row is None or row.pilot_id != pilot.id:
        raise HTTPException(404, "document not found")
    return row


def _snapshot(db: Session, row: PilotDoc, *, force: bool = False) -> None:
    last = (
        db.query(PilotDocVersion)
        .filter(PilotDocVersion.doc_id == row.id, PilotDocVersion.pilot_id == row.pilot_id)
        .order_by(PilotDocVersion.created_at.desc(), PilotDocVersion.id.desc())
        .first()
    )
    now = datetime.now(timezone.utc)
    if last and not force:
        at = last.created_at
        if at.tzinfo is None:
            at = at.replace(tzinfo=timezone.utc)
        if now - at < VERSION_EVERY:
            return
    db.add(
        PilotDocVersion(
            doc_id=row.id,
            pilot_id=row.pilot_id,
            rev=row.rev,
            title=row.title,
            body=row.body,
        )
    )
    db.flush()
    extra = (
        db.query(PilotDocVersion)
        .filter(PilotDocVersion.doc_id == row.id, PilotDocVersion.pilot_id == row.pilot_id)
        .order_by(PilotDocVersion.created_at.desc(), PilotDocVersion.id.desc())
        .offset(VERSION_KEEP)
        .all()
    )
    for old in extra:
        db.delete(old)


@router.get("")
def list_docs(db: Session = Depends(get_db), pilot: Pilot = Depends(get_current_pilot)) -> dict:
    rows = (
        db.query(PilotDoc)
        .filter(PilotDoc.pilot_id == pilot.id)
        .order_by(PilotDoc.updated_at.desc(), PilotDoc.id.desc())
        .all()
    )
    return {
        "items": [
            {
                "id": r.id,
                "title": r.title,
                "rev": r.rev,
                "words": _words(r.body),
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in rows
        ]
    }


@router.post("")
def create_doc(
    body: DocIn,
    db: Session = Depends(get_db),
    pilot: Pilot = Depends(get_current_pilot),
) -> dict:
    row = PilotDoc(pilot_id=pilot.id, title=body.title.strip(), body=body.body, rev=1)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _out(row)


@router.get("/{doc_id}")
def get_doc(doc_id: int, db: Session = Depends(get_db), pilot: Pilot = Depends(get_current_pilot)) -> dict:
    return _out(_owned(db, pilot, doc_id))


@router.put("/{doc_id}")
def save_doc(
    doc_id: int,
    body: DocSaveIn,
    db: Session = Depends(get_db),
    pilot: Pilot = Depends(get_current_pilot),
) -> dict:
    row = _owned(db, pilot, doc_id)
    if body.rev != row.rev:
        raise HTTPException(status_code=409, detail={"code": "conflict", "doc": _out(row)})
    _snapshot(db, row, force=False)
    row.title = body.title.strip()
    row.body = body.body
    row.rev = row.rev + 1
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _out(row)


@router.get("/{doc_id}/versions")
def list_versions(
    doc_id: int, db: Session = Depends(get_db), pilot: Pilot = Depends(get_current_pilot)
) -> dict:
    row = _owned(db, pilot, doc_id)
    vers = (
        db.query(PilotDocVersion)
        .filter(PilotDocVersion.doc_id == row.id, PilotDocVersion.pilot_id == pilot.id)
        .order_by(PilotDocVersion.created_at.desc(), PilotDocVersion.id.desc())
        .limit(VERSION_KEEP)
        .all()
    )
    return {
        "items": [
            {
                "id": v.id,
                "rev": v.rev,
                "title": v.title,
                "words": _words(v.body),
                "created_at": v.created_at.isoformat() if v.created_at else None,
            }
            for v in vers
        ]
    }


@router.post("/{doc_id}/restore")
def restore_version(
    doc_id: int,
    body: RestoreIn,
    db: Session = Depends(get_db),
    pilot: Pilot = Depends(get_current_pilot),
) -> dict:
    row = _owned(db, pilot, doc_id)
    ver = db.get(PilotDocVersion, body.version_id)
    if ver is None or ver.doc_id != row.id or ver.pilot_id != pilot.id:
        raise HTTPException(404, "version not found")
    _snapshot(db, row, force=True)
    row.title = ver.title
    row.body = ver.body
    row.rev = row.rev + 1
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _out(row)
