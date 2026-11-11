"""Эфир — общая лента экипажа (смысл stamina/comm.py, 3.8.3).

Не ИИ и не радио. Автор только из cookie; поля author/pilot_id/callsign в теле игнор.
Лента одна на инстанс (как comm.json на одном компьютере).

Roadmap (не реализовывать здесь): рост в полный чат со скриншотами/картинками
и другими типами сообщений. Схему держать расширяемой (kind / attachments),
не ломая текущий text-only контракт. См. docs/web/WEB_PARITY_STAGES.md.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import DateTime, Float, Integer, String, Text, func, text
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.auth_deps import get_current_pilot
from app.db import Base, get_db
from app.pilots import Pilot

router = APIRouter(prefix="/api/comm", tags=["comm"])

MAX_TEXT = 500
MAX_MESSAGES = 500


class CommMessage(Base):
    __tablename__ = "comm_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    author_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    callsign: Mapped[str] = mapped_column(String(64), default="")
    accent: Mapped[str] = mapped_column(String(32), default="cyan")
    text: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CommRead(Base):
    __tablename__ = "comm_read"

    pilot_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    last_ts: Mapped[float] = mapped_column(Float, default=0.0)


class CommIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text: str = Field(default="", max_length=MAX_TEXT * 4)


def _ts(row: CommMessage) -> float:
    at = row.created_at
    if at is None:
        return 0.0
    if at.tzinfo is None:
        at = at.replace(tzinfo=timezone.utc)
    return at.timestamp()


def _clean(text: str) -> str:
    return " ".join((text or "").split())[:MAX_TEXT]


def _out(row: CommMessage, pid: int) -> dict:
    return {
        "id": row.id,
        "callsign": row.callsign,
        "accent": row.accent or "cyan",
        "text": row.text,
        "ts": _ts(row),
        "mine": row.author_id == pid,
    }


def _crew(pilot: Pilot) -> Pilot:
    if getattr(pilot, "is_guest", False):
        raise HTTPException(401, "login required")
    return pilot


def _last_read(db: Session, pid: int) -> float:
    row = db.get(CommRead, pid)
    return float(row.last_ts) if row else 0.0


def _unread_count(db: Session, pid: int) -> int:
    last = _last_read(db, pid)
    n = 0
    for row in db.query(CommMessage).all():
        if row.author_id != pid and _ts(row) > last:
            n += 1
    return n


def _mark_read(db: Session, pid: int, ts: float) -> None:
    db.execute(
        text(
            "INSERT INTO comm_read (pilot_id, last_ts) VALUES (:p, :t) "
            "ON CONFLICT(pilot_id) DO UPDATE SET last_ts = CASE "
            "WHEN comm_read.last_ts < excluded.last_ts THEN excluded.last_ts "
            "ELSE comm_read.last_ts END"
        ),
        {"p": pid, "t": ts},
    )


@router.get("")
def list_messages(pilot: Pilot = Depends(get_current_pilot), db: Session = Depends(get_db)) -> dict:
    _crew(pilot)
    rows = db.query(CommMessage).order_by(CommMessage.id.asc()).all()
    return {
        "items": [_out(r, pilot.id) for r in rows],
        "total": len(rows),
        "unread": _unread_count(db, pilot.id),
    }


@router.get("/unread")
def unread(pilot: Pilot = Depends(get_current_pilot), db: Session = Depends(get_db)) -> dict:
    _crew(pilot)
    return {"unread": _unread_count(db, pilot.id)}


@router.post("")
def send(body: CommIn, pilot: Pilot = Depends(get_current_pilot), db: Session = Depends(get_db)) -> dict:
    _crew(pilot)
    text = _clean(body.text)
    if not text:
        raise HTTPException(400, "empty")
    row = CommMessage(
        author_id=pilot.id,
        callsign=pilot.callsign or "",
        accent=getattr(pilot, "accent", None) or "cyan",
        text=text,
        created_at=datetime.now(timezone.utc),
    )
    db.add(row)
    db.flush()
    extra = (
        db.query(CommMessage)
        .order_by(CommMessage.id.desc())
        .offset(MAX_MESSAGES)
        .all()
    )
    for old in extra:
        db.delete(old)
    _mark_read(db, pilot.id, _ts(row))
    db.commit()
    db.refresh(row)
    return _out(row, pilot.id)


@router.post("/read")
def mark_read(pilot: Pilot = Depends(get_current_pilot), db: Session = Depends(get_db)) -> dict:
    _crew(pilot)
    rows = db.query(CommMessage).order_by(CommMessage.id.desc()).limit(1).all()
    ts = _ts(rows[0]) if rows else 0.0
    _mark_read(db, pilot.id, ts)
    db.commit()
    return {"unread": 0}
