from __future__ import annotations

import base64
import io
import re
import time
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth_deps import COOKIE, get_current_pilot, get_optional_pilot
from app.db import get_db
from app.pilots import Pilot, hash_pin, is_desktop_hash, make_token, rank_for, verify_pin
from app.sessions import TypingSession

router = APIRouter(prefix="/api/pilots", tags=["pilots"])

ACCENTS = ("cyan", "amber", "green", "purple", "red", "magenta")


CALLSIGN_RE = re.compile(r"^[0-9A-Za-zА-Яа-яЁёІіЇїЄєҐґ][0-9A-Za-zА-Яа-яЁёІіЇїЄєҐґ \-]{1,15}$")
SKINS = ("spaceship", "bathyscaphe", "steampunk", "scriptorium", "neon_city", "zen_garden")
# 16 эмблем как в десктопе (stamina/avatars.GLYPHS): ключ → символ
GLYPHS = {
    "star": "★", "comet": "☄", "plane": "✈", "trident": "♆", "bolt": "⚡", "eye": "◉", "delta": "▲",
    "crown": "♛", "anchor": "⚓", "moon": "☾", "badge": "✪", "atom": "☢", "spark": "✦", "hex": "⬡",
    "knight": "♞", "orbit": "⊕",
}
AVATAR_PRESETS = tuple(GLYPHS.values())

# Ограничение попыток PIN: позывной → (подряд неверных, заблокирован до)
_PIN_FAILS: dict[str, tuple[int, float]] = {}
PIN_FREE_TRIES = 3


def _pin_key(callsign: str) -> str:
    return callsign.strip().casefold()


def _pin_locked(callsign: str) -> float:
    n, until = _PIN_FAILS.get(_pin_key(callsign), (0, 0.0))
    return max(0.0, until - time.monotonic())


def _pin_fail(callsign: str) -> tuple[int, float]:
    k = _pin_key(callsign)
    n, _until = _PIN_FAILS.get(k, (0, 0.0))
    n += 1
    wait = 0.0
    if n >= PIN_FREE_TRIES:
        wait = min(300.0, 30.0 * (2 ** (n - PIN_FREE_TRIES)))
    _PIN_FAILS[k] = (n, time.monotonic() + wait)
    return n, wait


def _pin_ok(callsign: str) -> None:
    _PIN_FAILS.pop(_pin_key(callsign), None)


def validate_callsign(cs: str) -> str:
    cs = (cs or "").strip()
    if len(cs) < 2:
        return "callsign_short"
    if len(cs) > 16:
        return "callsign_long"
    if not CALLSIGN_RE.match(cs):
        return "callsign_chars"
    return ""


class RegisterIn(BaseModel):
    callsign: str = Field(min_length=2, max_length=32)
    pin: str = Field(default="", max_length=32)
    display_name: str = Field(default="", max_length=64)
    skin: str = "spaceship"
    accent: str = ""
    avatar: str = Field(default="", max_length=8)  # эмблема-эмодзи (пресет)


class LoginIn(BaseModel):
    callsign: str
    pin: str = ""


class PilotOut(BaseModel):
    id: int
    callsign: str
    display_name: str
    skin: str
    xp: int
    accent: str = "cyan"
    avatar_data: str = ""
    is_guest: bool = False

    model_config = {"from_attributes": True}


class HonorRow(BaseModel):
    callsign: str
    xp: int
    best_cpm: float
    sessions: int


class RosterCard(BaseModel):
    id: int
    callsign: str
    display_name: str
    accent: str
    skin: str
    xp: int
    xp_lo: int
    xp_hi: int | None
    rank: str
    avatar_data: str = ""
    is_guest: bool = False
    has_pin: bool = False
    best_cpm: float = 0.0
    sessions: int = 0
    last_at: str | None = None


def _set_cookie(resp: Response, token: str) -> None:
    resp.set_cookie(COOKIE, token, httponly=True, samesite="lax", max_age=72 * 3600)


def _roster_card(db: Session, p: Pilot) -> RosterCard:
    rank, lo, hi = rank_for(int(p.xp or 0))
    sess = db.query(TypingSession).filter(TypingSession.pilot_id == p.id).all()
    best = max((s.cpm for s in sess), default=0.0)
    last = max((s.created_at for s in sess if s.created_at), default=None)
    return RosterCard(
        id=p.id,
        callsign=p.callsign,
        display_name=p.display_name or p.callsign,
        accent=p.accent or "cyan",
        skin=p.skin or "spaceship",
        xp=int(p.xp or 0),
        xp_lo=lo,
        xp_hi=hi,
        rank=rank,
        avatar_data=p.avatar_data or "",
        is_guest=bool(p.is_guest),
        has_pin=bool(p.pin_hash),
        best_cpm=float(best),
        sessions=len(sess),
        last_at=last.isoformat() if last else None,
    )


@router.get("/roster", response_model=list[RosterCard])
def roster(db: Session = Depends(get_db)) -> list[RosterCard]:
    """Карточки экипажа для экрана выбора пилота (без PIN)."""
    pilots = db.query(Pilot).order_by(Pilot.xp.desc(), Pilot.id.asc()).limit(40).all()
    return [_roster_card(db, p) for p in pilots]


@router.post("/register", response_model=PilotOut)
def register(body: RegisterIn, response: Response, db: Session = Depends(get_db)) -> Pilot:
    cs = body.callsign.strip()
    err = validate_callsign(cs)
    if err:
        raise HTTPException(400, err)
    if any(_pin_key(x.callsign) == _pin_key(cs) for x in db.query(Pilot).all()):
        raise HTTPException(400, "callsign taken")
    if body.pin and not (4 <= len(body.pin) <= 32):
        raise HTTPException(400, "pin_length")
    n = db.query(Pilot).count()
    accent = body.accent if body.accent in ACCENTS else ACCENTS[n % len(ACCENTS)]
    p = Pilot(
        callsign=cs,
        display_name=(body.display_name or cs).strip(),
        pin_hash=hash_pin(body.pin) if body.pin else "",
        skin=body.skin if body.skin in SKINS else "spaceship",
        accent=accent,
        avatar_data=f"emoji:{body.avatar}" if body.avatar in AVATAR_PRESETS else "",
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    _set_cookie(response, make_token(p.id))
    return p


@router.post("/login", response_model=PilotOut)
def login(body: LoginIn, response: Response, db: Session = Depends(get_db)) -> Pilot:
    wait = _pin_locked(body.callsign)
    if wait > 0:
        raise HTTPException(429, {"code": "pin_locked", "retry_after": int(wait) + 1})
    p = db.query(Pilot).filter(Pilot.callsign == body.callsign.strip()).first()
    if p is None or not verify_pin(body.pin, p.pin_hash):
        n, wait = _pin_fail(body.callsign)
        raise HTTPException(401, {"code": "bad_pin", "fails": n, "retry_after": int(wait)})
    _pin_ok(body.callsign)
    if body.pin and is_desktop_hash(p.pin_hash):
        # PIN десктопа принят → перехешировать в bcrypt
        p.pin_hash = hash_pin(body.pin)
        db.commit()
    _set_cookie(response, make_token(p.id))
    return p


class ClearPinIn(BaseModel):
    """Сброс кода — как ResetPinDialog: подтверждение позывным (локальный экипаж)."""

    callsign: str = Field(min_length=1, max_length=64)


class PinChangeIn(BaseModel):
    old_pin: str = ""
    new_pin: str = Field(default="", max_length=32)


@router.post("/me/pin")
def change_pin(
    body: PinChangeIn,
    db: Session = Depends(get_db),
    pilot: Pilot = Depends(get_current_pilot),
) -> dict[str, bool]:
    """Сменить / снять PIN — только вошедший пилот и только зная текущий PIN."""
    wait = _pin_locked(pilot.callsign)
    if wait > 0:
        raise HTTPException(429, {"code": "pin_locked", "retry_after": int(wait) + 1})
    if not verify_pin(body.old_pin, pilot.pin_hash):
        n, wait = _pin_fail(pilot.callsign)
        raise HTTPException(403, {"code": "bad_pin", "fails": n, "retry_after": int(wait)})
    _pin_ok(pilot.callsign)
    if body.new_pin and not (4 <= len(body.new_pin) <= 32):
        raise HTTPException(400, "pin_length")
    pilot.pin_hash = hash_pin(body.new_pin) if body.new_pin else ""
    db.commit()
    return {"ok": True, "has_pin": bool(pilot.pin_hash)}


@router.post("/{pilot_id}/clear-pin")
def clear_pin(pilot_id: int, body: ClearPinIn, me: Pilot | None = Depends(get_optional_pilot)) -> dict[str, bool]:
    """Устарело: сброс PIN по одному позывному был дырой. Используйте POST /me/pin."""
    raise HTTPException(410, "use /api/pilots/me/pin")


class ProfilePatch(BaseModel):
    display_name: str | None = Field(default=None, max_length=64)
    skin: str | None = None
    accent: str | None = None
    avatar: str | None = Field(default=None, max_length=8)


@router.patch("/me", response_model=PilotOut)
def patch_me(
    body: ProfilePatch,
    db: Session = Depends(get_db),
    pilot: Pilot = Depends(get_current_pilot),
) -> Pilot:
    """Скин / цвет / эмблема / имя своего пилота (выбор скина иконками на входе)."""
    if body.skin is not None:
        if body.skin not in SKINS:
            raise HTTPException(400, "unknown skin")
        pilot.skin = body.skin
    if body.accent is not None:
        if body.accent not in ACCENTS:
            raise HTTPException(400, "unknown accent")
        pilot.accent = body.accent
    if body.avatar is not None:
        if body.avatar not in AVATAR_PRESETS:
            raise HTTPException(400, "unknown avatar")
        pilot.avatar_data = f"emoji:{body.avatar}"
    if body.display_name is not None and body.display_name.strip():
        pilot.display_name = body.display_name.strip()
    db.commit()
    db.refresh(pilot)
    return pilot


@router.post("/logout")
def logout(response: Response) -> dict[str, bool]:
    response.delete_cookie(COOKIE)
    return {"ok": True}


@router.post("/guest", response_model=PilotOut)
def guest_login(response: Response, db: Session = Depends(get_db)) -> Pilot:
    cs = f"Guest-{uuid.uuid4().hex[:6]}"
    p = Pilot(callsign=cs, display_name=cs, pin_hash="", skin="spaceship", is_guest=True)
    db.add(p)
    db.commit()
    db.refresh(p)
    _set_cookie(response, make_token(p.id))
    return p


@router.get("/me", response_model=PilotOut | None)
def me(pilot: Pilot | None = Depends(get_optional_pilot)) -> Pilot | None:
    return pilot


@router.delete("/{pilot_id}")
def delete_pilot(
    pilot_id: int,
    db: Session = Depends(get_db),
    me: Pilot | None = Depends(get_optional_pilot),
) -> dict[str, bool]:
    """Списать пилота. Гостя можно удалить всегда; остальных — если это текущая сессия или без PIN."""
    p = db.query(Pilot).filter(Pilot.id == pilot_id).first()
    if p is None:
        raise HTTPException(404, "pilot not found")
    if not p.is_guest and p.pin_hash and (me is None or me.id != p.id):
        raise HTTPException(403, "login as this pilot to dismiss")
    db.delete(p)
    db.commit()
    return {"ok": True}


@router.get("/honor", response_model=list[HonorRow])
def honor_board(db: Session = Depends(get_db)) -> list[HonorRow]:
    pilots = db.query(Pilot).order_by(Pilot.xp.desc()).limit(50).all()
    rows: list[HonorRow] = []
    for p in pilots:
        sess = db.query(TypingSession).filter(TypingSession.pilot_id == p.id).all()
        best = max((s.cpm for s in sess), default=0.0)
        rows.append(HonorRow(callsign=p.callsign, xp=p.xp, best_cpm=best, sessions=len(sess)))
    return rows


@router.post("/me/avatar", response_model=PilotOut)
async def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    pilot: Pilot = Depends(get_current_pilot),
) -> Pilot:
    raw = await file.read()
    if len(raw) > 400_000:
        raise HTTPException(400, "avatar too large")
    mime = file.content_type or "image/png"
    if not mime.startswith("image/"):
        raise HTTPException(400, "image required")
    # лёгкая нормализация через Pillow, если есть
    try:
        from PIL import Image

        im = Image.open(io.BytesIO(raw)).convert("RGBA")
        im.thumbnail((256, 256))
        out = io.BytesIO()
        im.save(out, format="PNG")
        raw = out.getvalue()
        mime = "image/png"
    except Exception:  # noqa: BLE001
        pass
    b64 = base64.b64encode(raw).decode("ascii")
    pilot.avatar_data = f"data:{mime};base64,{b64}"
    db.commit()
    db.refresh(pilot)
    return pilot


@router.get("/dossier")
def dossier(
    db: Session = Depends(get_db),
    pilot: Pilot = Depends(get_current_pilot),
) -> dict:
    """Сводка за 7 дней: сессии, книги, english reviews."""
    since = datetime.now(timezone.utc) - timedelta(days=7)
    sessions = (
        db.query(TypingSession)
        .filter(TypingSession.pilot_id == pilot.id, TypingSession.created_at >= since)
        .all()
    )
    from app.api_library import PilotText
    from app.api_english import ReviewLog, CardProgress
    from app.api_speedread import SpeedResult

    books = db.query(PilotText).filter_by(pilot_id=pilot.id).count()
    reviews = (
        db.query(ReviewLog)
        .filter(ReviewLog.pilot_id == pilot.id, ReviewLog.created_at >= since)
        .count()
    )
    cards = db.query(CardProgress).filter_by(pilot_id=pilot.id).count()
    speed = (
        db.query(SpeedResult)
        .filter(SpeedResult.pilot_id == pilot.id, SpeedResult.created_at >= since)
        .count()
    )
    cpm_vals = [s.cpm for s in sessions if s.cpm]
    return {
        "days": 7,
        "sessions": len(sessions),
        "best_cpm": max(cpm_vals) if cpm_vals else 0.0,
        "avg_cpm": (sum(cpm_vals) / len(cpm_vals)) if cpm_vals else 0.0,
        "books_on_shelf": books,
        "english_reviews": reviews,
        "english_cards": cards,
        "speed_runs": speed,
        "xp": pilot.xp,
        "is_guest": bool(pilot.is_guest),
    }


@router.get("/me/export")
def export_stpilot(
    db: Session = Depends(get_db),
    pilot: Pilot = Depends(get_current_pilot),
) -> dict:
    """JSON-профиль совместимый с migrate/import (.stpilot)."""
    sess = (
        db.query(TypingSession)
        .filter(TypingSession.pilot_id == pilot.id)
        .order_by(TypingSession.id.desc())
        .limit(200)
        .all()
    )
    return {
        "format": "stpilot",
        "version": 1,
        "callsign": pilot.callsign,
        "display_name": pilot.display_name,
        "name": pilot.display_name,
        "xp": pilot.xp,
        "skin": pilot.skin,
        "accent": pilot.accent,
        "avatar_data": pilot.avatar_data or "",
        "sessions": [
            {
                "mode": s.mode,
                "lang": s.lang,
                "chars": s.chars,
                "typed": s.typed,
                "errors": s.errors,
                "elapsed": s.elapsed,
                "cpm": s.cpm,
                "acc": s.acc,
                "rhythm": s.rhythm,
                "best_streak": s.best_streak,
            }
            for s in sess
        ],
    }
