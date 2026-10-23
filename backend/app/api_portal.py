"""API портала: наши результаты (по пилоту) + read-only синхронизация с Monkeytype."""
from __future__ import annotations

import json
import time
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, Session, mapped_column

from app import portal
from app.auth_deps import get_optional_pilot
from app.db import Base, get_db
from app.pilots import Pilot

router = APIRouter(prefix="/api/portal", tags=["portal"])
MAX_RESULTS = 5000


class PortalResult(Base):
    __tablename__ = "portal_results"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pilot_id: Mapped[int] = mapped_column(Integer, index=True, default=0)  # 0 — гость без входа
    ts: Mapped[float] = mapped_column(Float, default=0.0)
    mode: Mapped[str] = mapped_column(String(16), default="words")
    mode2: Mapped[int] = mapped_column(Integer, default=0)
    wpm: Mapped[float] = mapped_column(Float, default=0.0)
    raw: Mapped[float] = mapped_column(Float, default=0.0)
    acc: Mapped[float] = mapped_column(Float, default=0.0)
    consistency: Mapped[float] = mapped_column(Float, default=0.0)
    time: Mapped[float] = mapped_column(Float, default=0.0)
    chars: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PortalState(Base):
    __tablename__ = "portal_state"
    pilot_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    started: Mapped[int] = mapped_column(Integer, default=0)
    joined: Mapped[float] = mapped_column(Float, default=0.0)
    mt_username: Mapped[str] = mapped_column(String(64), default="")
    mt_profile: Mapped[str] = mapped_column(Text, default="")
    fetched_at: Mapped[float] = mapped_column(Float, default=0.0)
    backoff_until: Mapped[float] = mapped_column(Float, default=0.0)
    last_attempt: Mapped[float] = mapped_column(Float, default=0.0)


class ResultIn(BaseModel):
    mode: str = "words"
    mode2: int = 0
    wpm: float = Field(0, ge=0, le=500)
    raw: float = Field(0, ge=0, le=600)
    acc: float = Field(0, ge=0, le=100)
    consistency: float = Field(0, ge=0, le=100)
    time: float = Field(0, ge=0, le=7200)
    chars: dict[str, int] = Field(default_factory=dict)
    ts: float | None = None


class UserIn(BaseModel):
    username: str = Field("", max_length=64)


def _pid(p: Pilot | None) -> int:
    return p.id if p else 0


def _state(db: Session, pid: int) -> PortalState:
    st = db.get(PortalState, pid)
    if st is None:
        st = PortalState(pilot_id=pid, started=0, joined=time.time(), mt_username="", mt_profile="",
                         fetched_at=0.0, backoff_until=0.0, last_attempt=0.0)
        db.add(st)
        db.commit()
    return st


def _results(db: Session, pid: int) -> list[dict]:
    rows = db.query(PortalResult).filter(PortalResult.pilot_id == pid).order_by(PortalResult.id.asc()).all()
    return [{"ts": r.ts, "mode": r.mode, "mode2": r.mode2, "wpm": r.wpm, "raw": r.raw, "acc": r.acc,
             "consistency": r.consistency, "time": r.time} for r in rows]


def _stats(db: Session, pilot: Pilot | None, sync: dict | None = None) -> dict:
    st = _state(db, _pid(pilot))
    name = (pilot.display_name or pilot.callsign) if pilot else ""
    res = _results(db, st.pilot_id)
    ours = portal.summarize_ours(res, st.started, name=name, joined=st.joined or None)
    mt = None
    if st.mt_profile:
        try:
            mt = portal.summarize_mt(json.loads(st.mt_profile))
        except ValueError:
            mt = None
    last = [r["wpm"] for r in res[-10:]]
    pace = round(sum(last) / len(last)) if last else None
    if pace is None and mt:
        pb = [p["wpm"] for p in mt["pbs"] if p.get("wpm")]
        pace = round(sum(pb) / len(pb)) if pb else None
    return {"mt_username": st.mt_username, "fetched_at": st.fetched_at or None, "ours": ours, "mt": mt,
            "merged": portal.merge(ours, mt), "average_pace": pace, "sync": sync or {}}


@router.get("/stats")
def get_stats(db: Session = Depends(get_db), pilot: Pilot | None = Depends(get_optional_pilot)) -> dict:
    return _stats(db, pilot)


@router.post("/started")
def mark_started(db: Session = Depends(get_db), pilot: Pilot | None = Depends(get_optional_pilot)) -> dict:
    st = _state(db, _pid(pilot))
    st.started = int(st.started or 0) + 1
    db.commit()
    return {"started": st.started}


@router.post("/results")
def add_result(body: ResultIn, db: Session = Depends(get_db),
               pilot: Pilot | None = Depends(get_optional_pilot)) -> dict:
    pid = _pid(pilot)
    st = _state(db, pid)
    if body.mode not in ("time", "words", "quote", "zen", "custom"):
        body.mode = "custom"
    db.add(PortalResult(pilot_id=pid, ts=body.ts or time.time(), mode=body.mode, mode2=body.mode2,
                        wpm=body.wpm, raw=body.raw, acc=body.acc, consistency=body.consistency,
                        time=body.time, chars=json.dumps(body.chars)))
    n = db.query(PortalResult).filter(PortalResult.pilot_id == pid).count()
    st.started = max(int(st.started or 0), n + 1)
    db.commit()
    if n + 1 > MAX_RESULTS:
        old = (db.query(PortalResult).filter(PortalResult.pilot_id == pid)
               .order_by(PortalResult.id.asc()).limit(n + 1 - MAX_RESULTS).all())
        for r in old:
            db.delete(r)
        db.commit()
    return _stats(db, pilot)


@router.put("/mt-user")
def set_user(body: UserIn, db: Session = Depends(get_db), pilot: Pilot | None = Depends(get_optional_pilot)) -> dict:
    st = _state(db, _pid(pilot))
    name = body.username.strip()
    if name != st.mt_username:
        st.mt_username, st.mt_profile, st.fetched_at, st.last_attempt = name, "", 0.0, 0.0
        db.commit()
    return _stats(db, pilot)


@router.post("/mt-sync")
def sync(db: Session = Depends(get_db), pilot: Pilot | None = Depends(get_optional_pilot)) -> dict:
    """Тихая синхронизация: не чаще раза в 5 минут, после лимита — пауза 15 минут."""
    st = _state(db, _pid(pilot))
    now = time.time()
    if not st.mt_username:
        return _stats(db, pilot, {"status": "no_username"})
    if now < (st.backoff_until or 0):
        return _stats(db, pilot, {"status": "backoff"})
    if now - max(st.fetched_at or 0, st.last_attempt or 0) < portal.SYNC_MIN_INTERVAL:
        return _stats(db, pilot, {"status": "cached"})
    st.last_attempt = now
    db.commit()
    try:
        prof = portal.fetch_profile(st.mt_username, FETCH)
    except portal.MonkeytypeError as e:
        if str(e) == "rate_limit":
            st.backoff_until = now + portal.SYNC_BACKOFF
            db.commit()
        return _stats(db, pilot, {"status": "error", "error": str(e)})
    st.mt_profile = json.dumps(prof)
    st.fetched_at = now
    db.commit()
    return _stats(db, pilot, {"status": "ok"})


FETCH: portal.Fetch | None = None  # тесты подменяют
