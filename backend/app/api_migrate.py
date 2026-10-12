"""Импорт прогресса пилота из JSON десктопа (фаза 8, заготовка)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.pilots import Pilot, hash_pin

router = APIRouter(prefix="/api/migrate", tags=["migrate"])


class PilotMigrateIn(BaseModel):
    callsign: str
    pin: str = ""
    display_name: str = ""
    xp: int = 0
    skin: str = "spaceship"


@router.post("/pilot")
def import_pilot(body: PilotMigrateIn, db: Session = Depends(get_db)) -> dict:
    cs = body.callsign.strip()
    if not cs:
        raise HTTPException(400, "callsign required")
    existing = db.query(Pilot).filter(Pilot.callsign == cs).first()
    if existing:
        existing.xp = max(existing.xp, body.xp)
        existing.skin = body.skin or existing.skin
        if body.display_name:
            existing.display_name = body.display_name
        db.commit()
        return {"id": existing.id, "updated": True}
    p = Pilot(
        callsign=cs,
        display_name=body.display_name or cs,
        pin_hash=hash_pin(body.pin) if body.pin else "",
        skin=body.skin,
        xp=body.xp,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return {"id": p.id, "updated": False}
