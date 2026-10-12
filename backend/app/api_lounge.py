"""Рекорды кают-компании (Snake / Tetris / Breakout)."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, Session

from app.auth_deps import get_optional_pilot
from app.db import Base, get_db
from app.pilots import Pilot

router = APIRouter(prefix="/api/lounge", tags=["lounge"])


class LoungeScore(Base):
    __tablename__ = "lounge_scores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pilot_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    callsign: Mapped[str] = mapped_column(String(64), default="guest")
    game: Mapped[str] = mapped_column(String(32), default="snake")
    score: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ScoreIn(BaseModel):
    game: str = Field(default="snake", max_length=32)
    score: int = Field(ge=0, le=1_000_000)


class ScoreOut(BaseModel):
    id: int
    game: str
    score: int
    callsign: str

    model_config = {"from_attributes": True}


@router.post("/scores", response_model=ScoreOut)
def post_score(
    body: ScoreIn,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> LoungeScore:
    row = LoungeScore(
        pilot_id=pilot.id if pilot else None,
        callsign=pilot.callsign if pilot else "guest",
        game=body.game[:32],
        score=body.score,
    )
    db.add(row)
    if pilot is not None and body.score >= 30:
        pilot.xp += max(1, body.score // 25)
    db.commit()
    db.refresh(row)
    return row


@router.get("/scores", response_model=list[ScoreOut])
def top_scores(game: str | None = None, limit: int = 20, db: Session = Depends(get_db)) -> list[LoungeScore]:
    q = db.query(LoungeScore)
    if game:
        q = q.filter(LoungeScore.game == game)
    return q.order_by(LoungeScore.score.desc()).limit(max(1, min(limit, 50))).all()
