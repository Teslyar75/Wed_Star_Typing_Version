"""Перенос пилотов с десктопа: превью (ничего не пишет) → подтверждение.

POST /api/import/preview   multipart: files[] (+ paths[] для выбранной папки) → {token, pilots:[…]}
POST /api/import/commit    {token, source_id, mode: new|merge, callsign?} → отчёт + client-часть
GET  /api/import/export    .stpilot текущего пилота (формат десктопа)
"""

from __future__ import annotations

import secrets
import time
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.auth_deps import get_optional_pilot
from app.db import Base, get_db
from app.pilots import Pilot, make_token
from app.stpilot import MAX_FILES, MAX_TOTAL, ImportError_, Package, export_stpilot, files_from_zip, split_packages

router = APIRouter(prefix="/api/import", tags=["import"])

PREVIEW_TTL = 30 * 60
_PREVIEWS: dict[str, tuple[float, list[Package]]] = {}


class ImportLog(Base):
    """Какой пакет уже перенесён в какого пилота — повторный импорт без дублей."""

    __tablename__ = "pilot_import_log"
    __table_args__ = (UniqueConstraint("pilot_id", "sha", name="uq_import_sha"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pilot_id: Mapped[int] = mapped_column(Integer, index=True)
    sha: Mapped[str] = mapped_column(String(64))
    source_id: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


def _gc() -> None:
    now = time.monotonic()
    for k in [k for k, (t, _) in _PREVIEWS.items() if now - t > PREVIEW_TTL]:
        _PREVIEWS.pop(k, None)


@router.post("/preview")
async def preview(
    files: list[UploadFile] = File(...),
    paths: list[str] = Form(default=[]),
    db: Session = Depends(get_db),
    me: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    _gc()
    if len(files) > MAX_FILES:
        raise HTTPException(413, {"code": "too_many_files"})
    collected: dict[str, bytes] = {}
    total = 0
    try:
        for i, f in enumerate(files):
            raw = await f.read()
            total += len(raw)
            if total > MAX_TOTAL:
                raise ImportError_("too_large")
            name = (paths[i] if i < len(paths) and paths[i] else f.filename) or f"file{i}"
            low = name.lower()
            if len(files) == 1 and (low.endswith(".zip") or low.endswith(".stpilot")):
                collected.update(files_from_zip(raw))
            else:
                collected[name] = raw
        pkgs = split_packages(collected)
    except ImportError_ as e:
        raise HTTPException(400, {"code": e.code, "detail": e.detail}) from e
    token = secrets.token_urlsafe(18)
    _PREVIEWS[token] = (time.monotonic(), pkgs)
    taken = {p.callsign.casefold(): p.id for p in db.query(Pilot).all()}
    done = {(r.pilot_id, r.sha) for r in db.query(ImportLog).all()}
    out = []
    for p in pkgs:
        s = p.summary()
        s["callsign_taken"] = s["callsign"].casefold() in taken
        s["already_imported_into"] = [pid for (pid, sha) in done if sha == p.sha]
        s["can_merge"] = me is not None and not me.is_guest
        out.append(s)
    return {"token": token, "pilots": out, "me": me.callsign if me else None}


class CommitIn(BaseModel):
    token: str
    source_id: str
    mode: str = Field(default="new", pattern="^(new|merge)$")
    callsign: str = ""
    force: bool = False


def _free_callsign(db: Session, base: str) -> str:
    taken = {p.callsign.casefold() for p in db.query(Pilot).all()}
    base = base.strip()[:16] or "Pilot"
    if base.casefold() not in taken:
        return base
    for i in range(2, 100):
        c = f"{base[:13]}-{i}"
        if c.casefold() not in taken:
            return c
    return f"P-{secrets.token_hex(3)}"


@router.post("/commit")
def commit(
    body: CommitIn,
    response: Response,
    db: Session = Depends(get_db),
    me: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    from app.api_pilots import _set_cookie, validate_callsign
    from app.stpilot import apply_package, import_library

    _gc()
    got = _PREVIEWS.get(body.token)
    if not got:
        raise HTTPException(410, {"code": "preview_expired"})
    pkg = next((p for p in got[1] if p.source_id == body.source_id), None)
    if pkg is None:
        raise HTTPException(404, {"code": "pilot_not_in_package"})

    if body.mode == "merge":
        if me is None or me.is_guest:
            raise HTTPException(401, {"code": "login_to_merge"})
        pilot = me
        if not body.force and db.query(ImportLog).filter_by(pilot_id=me.id, sha=pkg.sha).first():
            raise HTTPException(409, {"code": "already_imported"})
    else:
        summ = pkg.summary()
        cs = (body.callsign or "").strip() or _free_callsign(db, summ["callsign"])
        err = validate_callsign(cs)
        if err:
            raise HTTPException(400, {"code": err})
        if any(p.callsign.casefold() == cs.casefold() for p in db.query(Pilot).all()):
            raise HTTPException(400, {"code": "callsign taken"})
        pilot = Pilot(callsign=cs, display_name=cs, pin_hash="", skin="spaceship", accent="cyan", xp=0)
        db.add(pilot)
        db.flush()
    try:
        res = apply_package(db, pkg, pilot, merge=body.mode == "merge")
        db.add(ImportLog(pilot_id=pilot.id, sha=pkg.sha, source_id=pkg.source_id[:64]))
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(pilot)
    try:
        import_library(db, pkg, pilot, res["report"])
    except Exception as e:  # noqa: BLE001 — тексты не должны ронять уже сохранённый прогресс
        db.rollback()
        res["report"]["skipped"].append(f"library: {type(e).__name__}")
    res["report"].pop("_library", None)
    if body.mode == "new":
        _set_cookie(response, make_token(pilot.id))
        if len(_PREVIEWS.get(body.token, (0, []))[1]) <= 1:
            _PREVIEWS.pop(body.token, None)
    return {"pilot": {"id": pilot.id, "callsign": pilot.callsign, "xp": pilot.xp, "skin": pilot.skin,
                      "has_pin": bool(pilot.pin_hash)}, **res}


@router.get("/export")
def export(db: Session = Depends(get_db), me: Pilot | None = Depends(get_optional_pilot)) -> Response:
    if me is None:
        raise HTTPException(401, "login required")
    data = export_stpilot(db, me)
    safe = "".join(ch for ch in me.callsign if ch.isascii() and (ch.isalnum() or ch in "-_")) or "pilot"
    return Response(data, media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{safe}.stpilot"'})
