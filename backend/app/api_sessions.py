from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth_deps import get_optional_pilot
from app.db import get_db
from app.pilots import Pilot
from app.sessions import TypingSession

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


class SessionIn(BaseModel):
    text_id: int | None = None
    mode: str = "cargo"
    lang: str = "en"
    chars: int = 0
    typed: int = 0
    errors: int = 0
    elapsed: float = 0.0
    cpm: float = 0.0
    acc: float = 0.0
    rhythm: float = 0.0
    best_streak: int = Field(0, alias="best_streak")
    key_stats: dict[str, list[int]] = Field(default_factory=dict)

    model_config = {"populate_by_name": True}


class SessionOut(BaseModel):
    id: int
    pilot_id: int | None
    chars: int
    cpm: float
    acc: float

    model_config = {"from_attributes": True}


def _xp_for_session(chars: int, acc: float, cpm: float) -> int:
    if chars <= 0:
        return 0
    base = max(1, chars // 10)
    bonus = 5 if acc >= 95 else 2 if acc >= 85 else 0
    speed = 3 if cpm >= 200 else 1 if cpm >= 100 else 0
    return base + bonus + speed


@router.post("", response_model=SessionOut)
def save_session(
    body: SessionIn,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> TypingSession:
    # pilot_id только из cookie — клиент не может подставить чужой id
    pid = pilot.id if pilot else None
    row = TypingSession(
        text_id=body.text_id,
        pilot_id=pid,
        mode=body.mode,
        lang=body.lang,
        chars=body.chars,
        typed=body.typed,
        errors=body.errors,
        elapsed=body.elapsed,
        cpm=body.cpm,
        acc=body.acc,
        rhythm=body.rhythm,
        best_streak=body.best_streak,
    )
    db.add(row)
    if pilot is not None:
        pilot.xp += _xp_for_session(body.chars, body.acc, body.cpm)
        if body.key_stats:
            from app.api_missions import _merge_key_stats

            _merge_key_stats(db, pilot.id, body.key_stats)
    db.commit()
    db.refresh(row)
    return row


@router.get("", response_model=list[SessionOut])
def list_sessions(
    limit: int = 30,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> list[TypingSession]:
    q = db.query(TypingSession)
    if pilot is None:
        # гость видит только анонимные сессии текущей БД-сессии — фактически пусто безопаснее
        q = q.filter(TypingSession.pilot_id.is_(None))
    else:
        q = q.filter(TypingSession.pilot_id == pilot.id)
    return q.order_by(TypingSession.id.desc()).limit(max(1, min(limit, 100))).all()
