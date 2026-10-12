from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.sessions import TypingSession

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


class SessionIn(BaseModel):
    text_id: int | None = None
    pilot_id: int | None = None
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

    model_config = {"populate_by_name": True}


class SessionOut(BaseModel):
    id: int
    chars: int
    cpm: float
    acc: float

    model_config = {"from_attributes": True}


@router.post("", response_model=SessionOut)
def save_session(body: SessionIn, db: Session = Depends(get_db)) -> TypingSession:
    row = TypingSession(
        text_id=body.text_id,
        pilot_id=body.pilot_id,
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
    db.commit()
    db.refresh(row)
    return row


@router.get("", response_model=list[SessionOut])
def list_sessions(limit: int = 30, db: Session = Depends(get_db)) -> list[TypingSession]:
    return (
        db.query(TypingSession)
        .order_by(TypingSession.id.desc())
        .limit(max(1, min(limit, 100)))
        .all()
    )
