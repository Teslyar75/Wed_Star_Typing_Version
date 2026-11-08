"""Monkeytype (только чтение) + локальный прогресс дзен-портала."""
from __future__ import annotations

import json
import threading
import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, Session

from app.auth_deps import get_optional_pilot
from app.db import Base, get_db
from app import monkeytype as mt
from app import portal_stats as pstats
from app.pilots import Pilot

router = APIRouter(prefix="/api/portal", tags=["portal"])

SYNC_MIN = 300
SYNC_BACKOFF = 900
_sync: dict[int, dict] = {}
_lock = threading.Lock()


class PilotPortal(Base):
    __tablename__ = "pilot_portal"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pilot_id: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    mt_username: Mapped[str] = mapped_column(String(64), default="")
    mt_apekey: Mapped[str] = mapped_column(String(128), default="")
    mt_cache: Mapped[str] = mapped_column(Text, default="")
    portal_json: Mapped[str] = mapped_column(Text, default="")
    zen_acct_src: Mapped[str] = mapped_column(String(8), default="all")


class CredsIn(BaseModel):
    username: str = ""
    apekey: str | None = None
    src: str | None = Field(default=None, pattern="^(all|st|mt)$")


class ResultIn(BaseModel):
    wpm: float = 0
    raw: float = 0
    acc: float = 0
    consistency: float = 0
    time: float = 0
    mode: str = "time"
    mode2: int | str = 15
    language: str = "english"
    chars: dict | None = None
    words: int = 0


class StartedIn(BaseModel):
    ok: bool = True


def _pid(pilot: Pilot | None) -> int:
    return int(pilot.id) if pilot is not None else 0


def _row(db: Session, pid: int) -> PilotPortal:
    r = db.query(PilotPortal).filter_by(pilot_id=pid).first()
    if r is None:
        r = PilotPortal(pilot_id=pid, mt_username="", mt_apekey="", mt_cache="", portal_json="", zen_acct_src="all")
        db.add(r)
        db.flush()
    return r


def _j(raw: str | None) -> dict:
    if not (raw or "").strip():
        return {}
    try:
        d = json.loads(raw)
        return d if isinstance(d, dict) else {}
    except json.JSONDecodeError:
        return {}


def _st(row: PilotPortal) -> dict:
    return _j(row.portal_json)


def _mt_summary(row: PilotPortal) -> dict | None:
    cache = _j(row.mt_cache)
    s = cache.get("summary")
    return s if isinstance(s, dict) else None


def _pack(row: PilotPortal) -> dict:
    src = row.zen_acct_src if row.zen_acct_src in ("all", "st", "mt") else "all"
    ours = pstats.summarize(_st(row), name=row.mt_username or "")
    site = _mt_summary(row)
    if src == "st":
        summary = ours
    elif src == "mt":
        summary = site
    else:
        summary = pstats.merge(ours, site)
    cache = _j(row.mt_cache)
    return {
        "username": row.mt_username or "",
        "has_key": bool(row.mt_apekey),
        "src": src,
        "fetched_at": cache.get("fetched_at") or 0,
        "warning": cache.get("warning") or "",
        "summary": summary,
        "pace": mt.average_pace(cache) or pstats.average_pace(_st(row)),
    }


def upsert_creds(db: Session, pid: int, username: str, apekey: str | None) -> PilotPortal:
    row = _row(db, pid)
    row.mt_username = (username or "").strip()[:64]
    if apekey is not None:
        row.mt_apekey = (apekey or "").strip()[:128]
    return row


def apply_import(db: Session, pid: int, settings: dict, cache: dict | None, portal: dict | None) -> None:
    row = _row(db, pid)
    user = str(settings.get("mt_username") or "").strip()[:64]
    key = str(settings.get("mt_apekey") or "").strip()[:128]
    if user:
        row.mt_username = user
    if key:
        row.mt_apekey = key
    if isinstance(cache, dict) and cache.get("summary"):
        row.mt_cache = json.dumps(cache, ensure_ascii=False)
    if isinstance(portal, dict) and (portal.get("results") or portal.get("started")):
        row.portal_json = json.dumps(portal, ensure_ascii=False)
    src = settings.get("zen_acct_src")
    if src in ("all", "st", "mt"):
        row.zen_acct_src = src


@router.get("")
@router.get("/")
def get_portal(db: Session = Depends(get_db), pilot: Pilot | None = Depends(get_optional_pilot)) -> dict:
    return _pack(_row(db, _pid(pilot)))


@router.post("/creds")
def save_creds(
    body: CredsIn,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    row = upsert_creds(db, _pid(pilot), body.username, body.apekey)
    if body.src in ("all", "st", "mt"):
        row.zen_acct_src = body.src
    db.commit()
    return _pack(row)


def _do_sync(row: PilotPortal) -> dict:
    data = mt.refresh(row.mt_username, row.mt_apekey, path=None, with_results=bool(row.mt_apekey))
    # refresh writes a dummy file if path is None -> cache_path(); avoid that by not using refresh path
    return data


@router.post("/sync")
def sync_portal(
    force: bool = False,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    pid = _pid(pilot)
    row = _row(db, pid)
    user = (row.mt_username or "").strip()
    if not user:
        raise HTTPException(400, "username required")
    now = time.time()
    with _lock:
        st = _sync.setdefault(pid, {"last": 0.0, "until": 0.0, "busy": False})
        if now < st["until"]:
            left = int(st["until"] - now)
            return {**_pack(row), "status": "backoff", "retry_in": left}
        if st["busy"]:
            return {**_pack(row), "status": "busy"}
        cache = _j(row.mt_cache)
        last = float(cache.get("fetched_at") or 0)
        if not force and last and now - last < SYNC_MIN:
            return {**_pack(row), "status": "fresh"}
        st["busy"] = True
        st["last"] = now
    try:
        data = mt.Client(user, row.mt_apekey).profile()
        results, warning = cache.get("results_raw") or [], ""
        if row.mt_apekey:
            try:
                results = mt.Client(user, row.mt_apekey).results()
            except mt.MonkeytypeError as e:
                warning = str(e)
        payload = {
            "fetched_at": time.time(),
            "username": user,
            "profile": data,
            "results_raw": results,
            "summary": mt.summarize(data, results),
            "warning": warning,
        }
        row.mt_cache = json.dumps(payload, ensure_ascii=False)
        db.commit()
        return {**_pack(row), "status": "ok"}
    except mt.MonkeytypeError as e:
        if str(e) == mt.t("Лимит запросов Monkeytype — попробуйте позже"):
            with _lock:
                _sync[pid]["until"] = time.time() + SYNC_BACKOFF
        db.rollback()
        raise HTTPException(502, str(e))
    except Exception as e:  # noqa: BLE001
        db.rollback()
        raise HTTPException(502, f"Monkeytype: {e}")
    finally:
        with _lock:
            _sync[pid]["busy"] = False


@router.post("/started")
def portal_started(
    _body: StartedIn | None = None,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    row = _row(db, _pid(pilot))
    row.portal_json = json.dumps(pstats.mark_started(_st(row)), ensure_ascii=False)
    db.commit()
    return {"ok": True, "started": _st(row).get("started")}


@router.post("/result")
def portal_result(
    body: ResultIn,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    row = _row(db, _pid(pilot))
    res = {
        "ts": time.time(),
        "wpm": float(body.wpm),
        "raw": float(body.raw),
        "acc": float(body.acc),
        "consistency": float(body.consistency),
        "time": float(body.time),
        "mode": body.mode,
        "mode2": body.mode2,
        "language": body.language,
        "chars": body.chars or {},
        "words": int(body.words or 0),
    }
    row.portal_json = json.dumps(pstats.add_result(_st(row), res), ensure_ascii=False)
    db.commit()
    return _pack(row)
