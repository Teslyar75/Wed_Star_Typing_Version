"""Миссии пилота + одноразовые награды XP."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import DateTime, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, Session

from app.auth_deps import get_current_pilot, get_optional_pilot
from app.db import Base, get_db
from app.pilots import Pilot
from app.sessions import TypingSession

router = APIRouter(prefix="/api/missions", tags=["missions"])


class MissionClaim(Base):
    __tablename__ = "mission_claims"
    __table_args__ = (UniqueConstraint("pilot_id", "mission_id", name="uq_mission_claim"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pilot_id: Mapped[int] = mapped_column(Integer, index=True)
    mission_id: Mapped[str] = mapped_column(String(64))
    claimed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MissionOut(BaseModel):
    id: str
    title: str
    done: bool
    claimed: bool
    progress: int
    target: int
    reward_xp: int


def _defs(sessions: int, best: float, xp: int) -> list[tuple[str, str, int, int, int]]:
    return [
        ("m_first", "Первый полёт", sessions, 1, 10),
        ("m_five", "5 сессий набора", sessions, 5, 25),
        ("m_cpm150", "CPM ≥ 150", int(best >= 150), 1, 20),
        ("m_xp100", "Набрать 100 XP", min(xp, 100), 100, 30),
        ("m_twenty", "20 сессий", sessions, 20, 50),
    ]


@router.get("", response_model=list[MissionOut])
@router.get("/", response_model=list[MissionOut], include_in_schema=False)
def list_missions(
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> list[MissionOut]:
    pid = pilot.id if pilot else None
    sess_q = db.query(TypingSession)
    if pid is not None:
        sess_q = sess_q.filter(TypingSession.pilot_id == pid)
    else:
        sess_q = sess_q.filter(TypingSession.pilot_id.is_(None))
    sessions = sess_q.count()
    best = max((s.cpm for s in sess_q.all()), default=0.0)
    xp = pilot.xp if pilot else 0
    claimed = set()
    if pid is not None:
        claimed = {c.mission_id for c in db.query(MissionClaim).filter_by(pilot_id=pid).all()}

    return [
        MissionOut(
            id=i,
            title=title,
            done=progress >= target,
            claimed=i in claimed,
            progress=min(progress, target),
            target=target,
            reward_xp=reward,
        )
        for i, title, progress, target, reward in _defs(sessions, best, xp)
    ]


@router.post("/{mission_id}/claim")
def claim_mission(
    mission_id: str,
    db: Session = Depends(get_db),
    pilot: Pilot = Depends(get_current_pilot),
) -> dict:
    missions = {m.id: m for m in list_missions(db, pilot)}
    m = missions.get(mission_id)
    if m is None:
        raise HTTPException(404, "unknown mission")
    if not m.done:
        raise HTTPException(400, "mission not complete")
    if m.claimed:
        raise HTTPException(400, "already claimed")
    db.add(MissionClaim(pilot_id=pilot.id, mission_id=mission_id))
    pilot.xp += m.reward_xp
    db.commit()
    return {"ok": True, "reward_xp": m.reward_xp, "xp": pilot.xp}
