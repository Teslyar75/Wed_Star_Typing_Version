from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth_deps import get_current_pilot, get_optional_pilot
from app.db import get_db
from app.missions_service import rank_for
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
    mode: str = "cargo"
    lang: str = "en"
    chars: int
    typed: int = 0
    errors: int = 0
    elapsed: float = 0.0
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


def _pilot_sessions(db: Session, pilot: Pilot | None) -> list[TypingSession]:
    q = db.query(TypingSession)
    if pilot is None:
        q = q.filter(TypingSession.pilot_id.is_(None))
    else:
        q = q.filter(TypingSession.pilot_id == pilot.id)
    return q.order_by(TypingSession.id.asc()).all()


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
        q = q.filter(TypingSession.pilot_id.is_(None))
    else:
        q = q.filter(TypingSession.pilot_id == pilot.id)
    return q.order_by(TypingSession.id.desc()).limit(max(1, min(limit, 100))).all()


@router.get("/summary")
def flight_summary(
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    """Сводка бортжурнала: карточки + последние 30 полётов для графика."""
    rows = _pilot_sessions(db, pilot)
    runs = [r for r in rows if (r.typed or 0) > 0 or (r.chars or 0) > 0]
    last10 = runs[-10:]
    best = max((r.cpm for r in runs), default=0.0)
    avg_acc = sum(r.acc for r in last10) / len(last10) if last10 else 0.0
    avg_cpm = sum(r.cpm for r in last10) / len(last10) if last10 else 0.0
    total_time = sum(r.elapsed or 0.0 for r in runs)
    total_chars = sum(r.chars or 0 for r in runs)
    xp = int(pilot.xp) if pilot else 0
    rank, _lo, hi = rank_for(xp)

    missions_done = 0
    mission_stars = 0
    if pilot is not None:
        from app.api_missions import DrillProgress

        prog = db.query(DrillProgress).filter_by(pilot_id=pilot.id).all()
        missions_done = sum(1 for p in prog if p.best_stars > 0)
        mission_stars = sum(p.best_stars for p in prog)

    chart = [
        {"cpm": round(r.cpm, 1), "acc": round(r.acc, 1), "chars": r.chars, "elapsed": r.elapsed}
        for r in runs[-30:]
    ]
    return {
        "flights": len(runs),
        "total_time": round(total_time, 1),
        "total_chars": total_chars,
        "best_cpm": round(best, 1),
        "avg_cpm_10": round(avg_cpm, 1),
        "avg_acc_10": round(avg_acc, 1),
        "xp": xp,
        "rank": rank,
        "xp_next": hi,
        "xp_to_next": (hi - xp) if hi is not None else None,
        "missions_done": missions_done,
        "missions_total": 20,
        "mission_stars": mission_stars,
        "runs": chart,
    }


@router.post("/reset")
def reset_stats(
    db: Session = Depends(get_db),
    pilot: Pilot = Depends(get_current_pilot),
) -> dict:
    """Сброс полётов, теплокарты, звёзд миссий и XP (как десктоп)."""
    from app.api_missions import DrillProgress, MissionClaim, PilotKeyStat

    db.query(TypingSession).filter_by(pilot_id=pilot.id).delete(synchronize_session=False)
    db.query(PilotKeyStat).filter_by(pilot_id=pilot.id).delete(synchronize_session=False)
    db.query(DrillProgress).filter_by(pilot_id=pilot.id).delete(synchronize_session=False)
    db.query(MissionClaim).filter_by(pilot_id=pilot.id).delete(synchronize_session=False)
    pilot.xp = 0
    db.commit()
    return {"ok": True}
