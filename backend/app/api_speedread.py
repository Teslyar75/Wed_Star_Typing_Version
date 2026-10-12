"""Результаты скорочтения (RSVP / Шульте)."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, Float, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, Session

from app.auth_deps import get_optional_pilot
from app.db import Base, get_db
from app.pilots import Pilot

router = APIRouter(prefix="/api/speedread", tags=["speedread"])


class SpeedResult(Base):
    __tablename__ = "speed_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pilot_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    mode: Mapped[str] = mapped_column(String(32), default="rsvp")
    wpm: Mapped[float] = mapped_column(Float, default=0.0)
    words: Mapped[int] = mapped_column(Integer, default=0)
    elapsed: Mapped[float] = mapped_column(Float, default=0.0)
    score: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ResultIn(BaseModel):
    mode: str = "rsvp"
    wpm: float = 0.0
    words: int = 0
    elapsed: float = 0.0
    score: float = Field(0.0, description="для Шульте — время или очки")


class ResultOut(BaseModel):
    id: int
    mode: str
    wpm: float
    words: int
    elapsed: float
    score: float

    model_config = {"from_attributes": True}


@router.post("/results", response_model=ResultOut)
def save_result(
    body: ResultIn,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> SpeedResult:
    row = SpeedResult(
        pilot_id=pilot.id if pilot else None,
        mode=body.mode,
        wpm=body.wpm,
        words=body.words,
        elapsed=body.elapsed,
        score=body.score,
    )
    db.add(row)
    if pilot is not None:
        pilot.xp += 3 if body.mode == "rsvp" else 2
    db.commit()
    db.refresh(row)
    return row


@router.get("/results", response_model=list[ResultOut])
def list_results(
    limit: int = 30,
    mode: str | None = None,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> list[SpeedResult]:
    q = db.query(SpeedResult)
    if pilot is None:
        q = q.filter(SpeedResult.pilot_id.is_(None))
    else:
        q = q.filter(SpeedResult.pilot_id == pilot.id)
    if mode:
        q = q.filter(SpeedResult.mode == mode)
    return q.order_by(SpeedResult.id.desc()).limit(max(1, min(limit, 100))).all()
