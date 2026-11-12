"""Эфир — общая лента экипажа (смысл stamina/comm.py, 3.8.3).

Не ИИ и не радио. Автор только из cookie; поля author/pilot_id/callsign в теле игнор.
Лента одна на инстанс (как comm.json на одном компьютере).
Вложения — картинки (data URL), лимиты как у web-Ориона для чата пилотов.
"""

from __future__ import annotations

import base64
import json
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import DateTime, Float, Integer, String, Text, func, text
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.auth_deps import get_current_pilot
from app.db import Base, get_db
from app.pilots import Pilot

router = APIRouter(prefix="/api/comm", tags=["comm"])

MAX_TEXT = 500
MAX_MESSAGES = 500
MAX_IMAGES = 3
MAX_IMAGE_BYTES = 2_000_000
_DATA_URL = re.compile(r"^data:(image/(?:png|jpeg|jpg|gif|webp));base64,([A-Za-z0-9+/=\s]+)$", re.I)


class CommMessage(Base):
    __tablename__ = "comm_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    author_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    callsign: Mapped[str] = mapped_column(String(64), default="")
    accent: Mapped[str] = mapped_column(String(32), default="cyan")
    text: Mapped[str] = mapped_column(Text, default="")
    images_json: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CommRead(Base):
    __tablename__ = "comm_read"

    pilot_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    last_ts: Mapped[float] = mapped_column(Float, default=0.0)


class CommIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text: str = Field(default="", max_length=MAX_TEXT * 4)
    images: list[str] = Field(default_factory=list, max_length=MAX_IMAGES)

    @field_validator("images")
    @classmethod
    def _imgs(cls, v: list[str]) -> list[str]:
        if len(v) > MAX_IMAGES:
            raise ValueError("too many images")
        out: list[str] = []
        for raw in v:
            s = (raw or "").strip()
            m = _DATA_URL.match(s)
            if not m:
                raise ValueError("bad image")
            b64 = re.sub(r"\s+", "", m.group(2))
            try:
                raw_bytes = base64.b64decode(b64, validate=False)
            except Exception as e:  # noqa: BLE001
                raise ValueError("bad image") from e
            if len(raw_bytes) > MAX_IMAGE_BYTES:
                raise ValueError("image too large")
            mime = m.group(1).lower().replace("image/jpg", "image/jpeg")
            out.append(f"data:{mime};base64,{b64}")
        return out


def _ts(row: CommMessage) -> float:
    at = row.created_at
    if at is None:
        return 0.0
    if at.tzinfo is None:
        at = at.replace(tzinfo=timezone.utc)
    return at.timestamp()


def _clean(text: str) -> str:
    return " ".join((text or "").split())[:MAX_TEXT]


def _images(row: CommMessage) -> list[str]:
    raw = getattr(row, "images_json", None) or "[]"
    try:
        data = json.loads(raw)
    except Exception:  # noqa: BLE001
        return []
    if not isinstance(data, list):
        return []
    return [str(x) for x in data if isinstance(x, str)][:MAX_IMAGES]


def _out(row: CommMessage, pid: int) -> dict:
    return {
        "id": row.id,
        "callsign": row.callsign,
        "accent": row.accent or "cyan",
        "text": row.text,
        "images": _images(row),
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
        "limits": {
            "max_text": MAX_TEXT,
            "max_messages": MAX_MESSAGES,
            "max_images": MAX_IMAGES,
            "max_image_bytes": MAX_IMAGE_BYTES,
        },
    }


@router.get("/unread")
def unread(pilot: Pilot = Depends(get_current_pilot), db: Session = Depends(get_db)) -> dict:
    _crew(pilot)
    return {"unread": _unread_count(db, pilot.id)}


@router.post("")
def send(body: CommIn, pilot: Pilot = Depends(get_current_pilot), db: Session = Depends(get_db)) -> dict:
    _crew(pilot)
    text = _clean(body.text)
    images = list(body.images or [])
    if not text and not images:
        raise HTTPException(400, "empty")
    row = CommMessage(
        author_id=pilot.id,
        callsign=pilot.callsign or "",
        accent=getattr(pilot, "accent", None) or "cyan",
        text=text,
        images_json=json.dumps(images, ensure_ascii=False),
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
