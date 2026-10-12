"""Импорт прогресса пилота из JSON десктопа (pilot_migrate / pilots profile)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.pilots import Pilot, hash_pin
from app.sessions import TypingSession

router = APIRouter(prefix="/api/migrate", tags=["migrate"])


class PilotMigrateIn(BaseModel):
    callsign: str
    pin: str = ""
    display_name: str = ""
    name: str = ""  # алиас десктопа
    xp: int = 0
    skin: str = "spaceship"
    accent: str = "cyan"
    sessions: list[dict[str, Any]] = Field(default_factory=list)


@router.post("/pilot")
def import_pilot(body: PilotMigrateIn, db: Session = Depends(get_db)) -> dict:
    cs = body.callsign.strip()
    if not cs:
        raise HTTPException(400, "callsign required")
    display = body.display_name or body.name or cs
    existing = db.query(Pilot).filter(Pilot.callsign == cs).first()
    if existing:
        existing.xp = max(existing.xp, body.xp)
        existing.skin = body.skin or existing.skin
        existing.accent = body.accent or existing.accent
        if display:
            existing.display_name = display
        if body.pin:
            existing.pin_hash = hash_pin(body.pin)
        pilot = existing
        updated = True
    else:
        pilot = Pilot(
            callsign=cs,
            display_name=display,
            pin_hash=hash_pin(body.pin) if body.pin else "",
            skin=body.skin,
            accent=body.accent,
            xp=body.xp,
        )
        db.add(pilot)
        db.flush()
        updated = False

    imported = 0
    for s in body.sessions[:200]:
        row = TypingSession(
            pilot_id=pilot.id,
            text_id=s.get("text_id"),
            mode=str(s.get("mode") or "cargo"),
            lang=str(s.get("lang") or "en"),
            chars=int(s.get("chars") or 0),
            typed=int(s.get("typed") or 0),
            errors=int(s.get("errors") or 0),
            elapsed=float(s.get("elapsed") or 0),
            cpm=float(s.get("cpm") or 0),
            acc=float(s.get("acc") or 0),
            rhythm=float(s.get("rhythm") or 0),
            best_streak=int(s.get("best_streak") or 0),
        )
        db.add(row)
        imported += 1

    db.commit()
    db.refresh(pilot)
    return {"id": pilot.id, "updated": updated, "sessions_imported": imported, "xp": pilot.xp}


@router.post("/bundle")
def import_bundle(payload: dict[str, Any], db: Session = Depends(get_db)) -> dict:
    """Принимает профиль десктопа: {pilots:[{callsign,name,xp,...}], ...} или один пилот."""
    pilots = payload.get("pilots")
    if isinstance(pilots, list):
        out = []
        for p in pilots:
            if not isinstance(p, dict):
                continue
            body = PilotMigrateIn(
                callsign=str(p.get("callsign") or ""),
                pin=str(p.get("pin") or ""),
                display_name=str(p.get("display_name") or p.get("name") or ""),
                name=str(p.get("name") or ""),
                xp=int(p.get("xp") or 0),
                skin=str(p.get("skin") or "spaceship"),
                accent=str(p.get("accent") or "cyan"),
                sessions=list(p.get("sessions") or []),
            )
            if body.callsign:
                out.append(import_pilot(body, db))
        return {"imported": len(out), "pilots": out}
    # один объект
    body = PilotMigrateIn(
        callsign=str(payload.get("callsign") or ""),
        pin=str(payload.get("pin") or ""),
        display_name=str(payload.get("display_name") or payload.get("name") or ""),
        name=str(payload.get("name") or ""),
        xp=int(payload.get("xp") or 0),
        skin=str(payload.get("skin") or "spaceship"),
        accent=str(payload.get("accent") or "cyan"),
        sessions=list(payload.get("sessions") or []),
    )
    return import_pilot(body, db)
