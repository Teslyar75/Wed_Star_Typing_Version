from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.pilots import Pilot, decode_token, hash_pin, make_token, verify_pin
from app.sessions import TypingSession
from fastapi import Cookie

router = APIRouter(prefix="/api/pilots", tags=["pilots"])
COOKIE = "st_token"


class RegisterIn(BaseModel):
    callsign: str = Field(min_length=2, max_length=32)
    pin: str = Field(default="", max_length=32)
    display_name: str = ""
    skin: str = "spaceship"


class LoginIn(BaseModel):
    callsign: str
    pin: str = ""


class PilotOut(BaseModel):
    id: int
    callsign: str
    display_name: str
    skin: str
    xp: int

    model_config = {"from_attributes": True}


class HonorRow(BaseModel):
    callsign: str
    xp: int
    best_cpm: float
    sessions: int


def _set_cookie(resp: Response, token: str) -> None:
    resp.set_cookie(COOKIE, token, httponly=True, samesite="lax", max_age=72 * 3600)


@router.post("/register", response_model=PilotOut)
def register(body: RegisterIn, response: Response, db: Session = Depends(get_db)) -> Pilot:
    cs = body.callsign.strip()
    if db.query(Pilot).filter(Pilot.callsign == cs).first():
        raise HTTPException(400, "callsign taken")
    p = Pilot(
        callsign=cs,
        display_name=body.display_name or cs,
        pin_hash=hash_pin(body.pin) if body.pin else "",
        skin=body.skin,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    _set_cookie(response, make_token(p.id))
    return p


@router.post("/login", response_model=PilotOut)
def login(body: LoginIn, response: Response, db: Session = Depends(get_db)) -> Pilot:
    p = db.query(Pilot).filter(Pilot.callsign == body.callsign.strip()).first()
    if p is None or not verify_pin(body.pin, p.pin_hash):
        raise HTTPException(401, "bad credentials")
    _set_cookie(response, make_token(p.id))
    return p


@router.post("/logout")
def logout(response: Response) -> dict[str, bool]:
    response.delete_cookie(COOKIE)
    return {"ok": True}


@router.get("/me", response_model=PilotOut | None)
def me(db: Session = Depends(get_db), st_token: str | None = Cookie(default=None)) -> Pilot | None:
    if not st_token:
        return None
    pid = decode_token(st_token)
    if pid is None:
        return None
    return db.get(Pilot, pid)


@router.get("/honor", response_model=list[HonorRow])
def honor_board(db: Session = Depends(get_db)) -> list[HonorRow]:
    pilots = db.query(Pilot).order_by(Pilot.xp.desc()).limit(50).all()
    rows: list[HonorRow] = []
    for p in pilots:
        sess = db.query(TypingSession).filter(TypingSession.pilot_id == p.id).all()
        best = max((s.cpm for s in sess), default=0.0)
        rows.append(HonorRow(callsign=p.callsign, xp=p.xp, best_cpm=best, sessions=len(sess)))
    return rows
