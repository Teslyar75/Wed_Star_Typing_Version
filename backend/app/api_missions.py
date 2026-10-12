"""Миссии пилота (упрощённый порт stamina/missions)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth_deps import get_optional_pilot
from app.db import get_db
from app.pilots import Pilot
from app.sessions import TypingSession

router = APIRouter(prefix="/api/missions", tags=["missions"])


class MissionOut(BaseModel):
    id: str
    title: str
    done: bool
    progress: int
    target: int
    reward_xp: int


@router.get("", response_model=list[MissionOut])
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

    defs = [
        ("m_first", "Первый полёт", sessions, 1, 10),
        ("m_five", "5 сессий набора", sessions, 5, 25),
        ("m_cpm150", "CPM ≥ 150", int(best >= 150), 1, 20),
        ("m_xp100", "Набрать 100 XP", min(xp, 100), 100, 30),
    ]
    return [
        MissionOut(
            id=i,
            title=title,
            done=progress >= target,
            progress=min(progress, target),
            target=target,
            reward_xp=reward,
        )
        for i, title, progress, target, reward in defs
    ]
