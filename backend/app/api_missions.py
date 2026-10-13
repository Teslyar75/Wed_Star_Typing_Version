"""Миссии: достижения XP + учебные drills со звёздами, ремонт, key heatmap."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, Session

from app.auth_deps import get_current_pilot, get_optional_pilot
from app.db import Base, get_db
from app.missions_service import (
    MISSION_BY_ID,
    generate_mission_text,
    generate_repair_text,
    missions_for,
    next_mission,
    stars_for,
    xp_for_stars,
)
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


class DrillProgress(Base):
    __tablename__ = "drill_progress"
    __table_args__ = (UniqueConstraint("pilot_id", "mission_id", name="uq_drill_progress"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pilot_id: Mapped[int] = mapped_column(Integer, index=True)
    mission_id: Mapped[str] = mapped_column(String(64))
    best_stars: Mapped[int] = mapped_column(Integer, default=0)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PilotKeyStat(Base):
    __tablename__ = "pilot_key_stats"
    __table_args__ = (UniqueConstraint("pilot_id", "key", name="uq_pilot_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pilot_id: Mapped[int] = mapped_column(Integer, index=True)
    key: Mapped[str] = mapped_column(String(8))
    hits: Mapped[int] = mapped_column(Integer, default=0)
    errors: Mapped[int] = mapped_column(Integer, default=0)


class MissionOut(BaseModel):
    id: str
    title: str
    done: bool
    claimed: bool
    progress: int
    target: int
    reward_xp: int


class DrillOut(BaseModel):
    id: str
    lang: str
    num: int
    title: str
    sector: str
    keys: str
    new: str
    goal: int
    unlocked: bool
    best_stars: int
    attempts: int


class DrillStartOut(BaseModel):
    mission_id: str
    title: str
    text: str
    goal: int
    keys: str


class DrillCompleteIn(BaseModel):
    acc: float
    cpm: float
    chars: int = 0
    errors: int = 0
    key_stats: dict[str, list[int]] = Field(default_factory=dict)


class KeyErrorOut(BaseModel):
    key: str
    hits: int
    errors: int
    rate: float


def _defs(sessions: int, best: float, xp: int) -> list[tuple[str, str, int, int, int]]:
    return [
        ("m_first", "Первый полёт", sessions, 1, 10),
        ("m_five", "5 сессий набора", sessions, 5, 25),
        ("m_cpm150", "CPM ≥ 150", int(best >= 150), 1, 20),
        ("m_xp100", "Набрать 100 XP", min(xp, 100), 100, 30),
        ("m_twenty", "20 сессий", sessions, 20, 50),
    ]


def _merge_key_stats(db: Session, pilot_id: int, key_stats: dict[str, list[int]]) -> None:
    for key, pair in key_stats.items():
        if not key or len(key) > 4:
            continue
        hits = int(pair[0]) if len(pair) > 0 else 0
        errs = int(pair[1]) if len(pair) > 1 else 0
        if hits <= 0 and errs <= 0:
            continue
        row = db.query(PilotKeyStat).filter_by(pilot_id=pilot_id, key=key).first()
        if row is None:
            db.add(PilotKeyStat(pilot_id=pilot_id, key=key, hits=hits, errors=errs))
        else:
            row.hits += hits
            row.errors += errs


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
    claimed: set[str] = set()
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


@router.get("/drills", response_model=list[DrillOut])
def list_drills(
    lang: str = Query("en"),
    unlock_all: bool = Query(False, description="Открыть все drills без цепочки звёзд"),
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> list[DrillOut]:
    lang = "ru" if lang.startswith("ru") else "en"
    progress: dict[str, DrillProgress] = {}
    if pilot:
        progress = {
            p.mission_id: p
            for p in db.query(DrillProgress).filter_by(pilot_id=pilot.id).all()
            if p.mission_id.startswith(f"{lang}-")
        }
    out: list[DrillOut] = []
    for m in missions_for(lang):
        prev_id = f"{lang}-{m['num'] - 1:02d}" if m["num"] > 1 else None
        unlocked = m["num"] == 1 or (prev_id is not None and progress.get(prev_id) is not None and progress[prev_id].best_stars >= 1)
        # без пилота — только первая открыта для превью
        if pilot is None:
            unlocked = m["num"] == 1
        if unlock_all:
            unlocked = True
        pr = progress.get(m["id"])
        out.append(
            DrillOut(
                id=m["id"],
                lang=m["lang"],
                num=m["num"],
                title=m["title"],
                sector=m["sector"],
                keys=m["keys"],
                new=m["new"],
                goal=m["goal"],
                unlocked=unlocked,
                best_stars=pr.best_stars if pr else 0,
                attempts=pr.attempts if pr else 0,
            )
        )
    return out


@router.post("/drills/{mission_id}/start", response_model=DrillStartOut)
def start_drill(
    mission_id: str,
    unlock_all: bool = Query(False),
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> DrillStartOut:
    m = MISSION_BY_ID.get(mission_id)
    if not m:
        raise HTTPException(404, "unknown drill")
    drills = {d.id: d for d in list_drills(m["lang"], unlock_all, db, pilot)}
    d = drills.get(mission_id)
    if d is None or not d.unlocked:
        raise HTTPException(403, "drill locked")
    text = generate_mission_text(m)
    return DrillStartOut(mission_id=m["id"], title=m["title"], text=text, goal=m["goal"], keys=m["keys"])


@router.post("/drills/{mission_id}/complete")
def complete_drill(
    mission_id: str,
    body: DrillCompleteIn,
    unlock_all: bool = Query(False),
    db: Session = Depends(get_db),
    pilot: Pilot = Depends(get_current_pilot),
) -> dict:
    m = MISSION_BY_ID.get(mission_id)
    if not m:
        raise HTTPException(404, "unknown drill")
    drills = {d.id: d for d in list_drills(m["lang"], unlock_all, db, pilot)}
    d = drills.get(mission_id)
    if d is None or not d.unlocked:
        raise HTTPException(403, "drill locked")

    stars = stars_for(body.acc, body.cpm, float(m["goal"]))
    row = db.query(DrillProgress).filter_by(pilot_id=pilot.id, mission_id=mission_id).first()
    gained = 0
    if row is None:
        row = DrillProgress(pilot_id=pilot.id, mission_id=mission_id, best_stars=stars, attempts=1)
        db.add(row)
        if stars > 0:
            gained = xp_for_stars(stars, body.chars)
    else:
        row.attempts += 1
        if stars > row.best_stars:
            gained = xp_for_stars(stars - row.best_stars, body.chars)
            row.best_stars = stars
        elif stars > 0:
            gained = max(1, xp_for_stars(stars, body.chars) // 4)

    if body.key_stats:
        _merge_key_stats(db, pilot.id, body.key_stats)

    pilot.xp += gained
    db.commit()
    nxt = next_mission(mission_id)
    return {
        "stars": stars,
        "best_stars": row.best_stars,
        "xp_gained": gained,
        "xp": pilot.xp,
        "passed": stars > 0,
        "goal": m["goal"],
        "next_id": nxt["id"] if nxt else None,
        "next_title": nxt["title"] if nxt else None,
    }


@router.get("/key-errors", response_model=list[KeyErrorOut])
def key_errors(
    db: Session = Depends(get_db),
    pilot: Pilot = Depends(get_current_pilot),
    limit: int = 24,
) -> list[KeyErrorOut]:
    rows = db.query(PilotKeyStat).filter_by(pilot_id=pilot.id).all()
    scored: list[KeyErrorOut] = []
    for r in rows:
        total = r.hits + r.errors
        if total < 3:
            continue
        rate = r.errors / total
        scored.append(KeyErrorOut(key=r.key, hits=r.hits, errors=r.errors, rate=round(rate, 4)))
    scored.sort(key=lambda x: (-x.rate, -x.errors))
    return scored[: max(1, min(limit, 48))]


class RepairIn(BaseModel):
    lang: str = "en"
    weak: list[str] = Field(default_factory=list)


@router.post("/repair/start", response_model=DrillStartOut)
def repair_start(
    body: RepairIn,
    db: Session = Depends(get_db),
    pilot: Pilot = Depends(get_current_pilot),
) -> DrillStartOut:
    lang = "ru" if body.lang.startswith("ru") else "en"
    weak = body.weak
    if not weak:
        top = key_errors(db, pilot, limit=6)
        weak = [k.key for k in top[:4]]
    text = generate_repair_text(weak, lang)
    return DrillStartOut(mission_id="repair", title="Repair", text=text, goal=100, keys="".join(weak))


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
