"""Орион в вебе: чат (4 режима), задачи (порт stamina/task_progress), архив, роли, предложения.

Ключи только из env (settings.orion_*). Ключ BYO приходит заголовком X-Orion-Key на каждый запрос
и нигде не сохраняется и не логируется (см. docs/WEB_PORT_PLAN.md «Орион в вебе»).
"""

from __future__ import annotations

import ipaddress
import json
import socket
import time
from collections import defaultdict, deque
from datetime import datetime
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.auth_deps import get_current_pilot, get_optional_pilot
from app.config import settings
from app.db import Base, get_db
from app.pilots import Pilot

router = APIRouter(prefix="/api/orion", tags=["orion"])

MODES = ("guide", "byo", "hosted", "contributor")
ROLES = ("supporter", "contributor")


# ---------- модели ----------
class OrionMessage(Base):
    __tablename__ = "orion_messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pilot_id: Mapped[int] = mapped_column(Integer, index=True)
    role: Mapped[str] = mapped_column(String(16))  # user | orion
    mode: Mapped[str] = mapped_column(String(16), default="guide")
    text: Mapped[str] = mapped_column(Text, default="")
    images: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OrionTask(Base):
    __tablename__ = "orion_tasks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pilot_id: Mapped[int] = mapped_column(Integer, index=True)
    title: Mapped[str] = mapped_column(String(200))
    state: Mapped[str] = mapped_column(String(16), default="planning")
    steps_json: Mapped[str] = mapped_column(Text, default="[]")
    updated: Mapped[float] = mapped_column(default=0.0)


class OrionRole(Base):
    __tablename__ = "orion_roles"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pilot_id: Mapped[int] = mapped_column(Integer, index=True)
    role: Mapped[str] = mapped_column(String(32))


class OrionPref(Base):
    __tablename__ = "orion_prefs"
    pilot_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mode: Mapped[str] = mapped_column(String(16), default="guide")


class OrionSetting(Base):
    __tablename__ = "orion_settings"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[bool] = mapped_column(Boolean, default=False)


class OrionProposal(Base):
    __tablename__ = "orion_proposals"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pilot_id: Mapped[int] = mapped_column(Integer, index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(16), default="queued")
    branch: Mapped[str] = mapped_column(String(120), default="")
    diff: Mapped[str] = mapped_column(Text, default="")
    tests_run: Mapped[str] = mapped_column(Text, default="[]")
    task_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OrionAudit(Base):
    __tablename__ = "orion_audit"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor: Mapped[str] = mapped_column(String(64))
    action: Mapped[str] = mapped_column(String(64))
    detail: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


def audit(db: Session, actor: str, action: str, detail: str = "") -> None:
    db.add(OrionAudit(actor=actor[:64], action=action[:64], detail=detail[:2000]))


# ---------- task_progress (порт) ----------
STATES = ("planning", "working", "done", "failed", "stopped")
STOPS = ((0, (0xD9, 0x6A, 0x5F)), (25, (0xE3, 0x93, 0x55)), (50, (0xE6, 0xC4, 0x5C)),
         (75, (0xAE, 0xC9, 0x5E)), (100, (0x6F, 0xBF, 0x73)))
STALE_SEC = 120
KEEP_SEC = 900
MAX_TASKS = 8


def color_for(pct: float) -> str:
    try:
        p = float(pct)
    except (TypeError, ValueError):
        p = 0.0
    p = max(0.0, min(100.0, p))
    for (a, ca), (b, cb) in zip(STOPS, STOPS[1:]):
        if p <= b:
            t = (p - a) / (b - a)
            return "#%02x%02x%02x" % tuple(round(x + (y - x) * t) for x, y in zip(ca, cb))
    return "#%02x%02x%02x" % STOPS[-1][1]


def percent(steps: list[dict]) -> float:
    total = sum(max(0.0, float(s.get("weight", 1))) for s in steps)
    if total <= 0:
        return 0.0
    done = sum(max(0.0, float(s.get("weight", 1))) for s in steps if s.get("status") == "done")
    return round(100.0 * done / total, 1)


def task_view(t: OrionTask, now: float | None = None) -> dict:
    now = now or time.time()
    steps = json.loads(t.steps_json or "[]")
    pct = 100.0 if t.state == "done" else percent(steps)
    return {
        "id": t.id, "title": t.title, "state": t.state, "steps": steps, "percent": pct,
        "color": color_for(pct),
        "stale": t.state in ("planning", "working") and now - (t.updated or now) > STALE_SEC,
    }


# ---------- лимиты ----------
_hits: dict[str, deque] = defaultdict(deque)


def rate_ok(key: str, limit: int, window: float) -> bool:
    now = time.time()
    q = _hits[key]
    while q and now - q[0] > window:
        q.popleft()
    if len(q) >= max(1, limit):
        return False
    q.append(now)
    return True


# ---------- роли, флаги ----------
def roles_of(db: Session, pilot: Pilot | None) -> set[str]:
    if pilot is None:
        return set()
    return {r.role for r in db.query(OrionRole).filter(OrionRole.pilot_id == pilot.id)}


def flag(db: Session, key: str, env_default: bool) -> bool:
    """Тумблер = env И админ-настройка (если админ её задал). Env — общий kill switch."""
    if not env_default:
        return False
    row = db.get(OrionSetting, key)
    return True if row is None else bool(row.value)


def hosted_configured() -> bool:
    return bool(settings.orion_llm_base_url and settings.orion_llm_model and settings.orion_llm_api_key)


def mode_status(db: Session, pilot: Pilot | None) -> list[dict]:
    roles = roles_of(db, pilot)
    hosted_on = flag(db, "hosted_enabled", settings.orion_hosted_enabled)
    contrib_on = flag(db, "contrib_enabled", settings.orion_contrib_enabled)
    out = [{"id": "guide", "available": True, "reason": "", "capabilities": {"text": True, "images": False}}]
    out.append({"id": "byo", "available": pilot is not None,
                "reason": "" if pilot else "login", "capabilities": {"text": True, "images": True}})
    if not hosted_on or not hosted_configured():
        r = "disabled"
    elif "supporter" not in roles:
        r = "supporter_only"
    else:
        r = ""
    out.append({"id": "hosted", "available": r == "", "reason": r,
                "capabilities": {"text": True, "images": bool(settings.orion_llm_vision)}})
    if not contrib_on:
        r = "disabled"
    elif "contributor" not in roles:
        r = "contributor_only"
    else:
        r = ""
    out.append({"id": "contributor", "available": r == "", "reason": r,
                "capabilities": {"text": True, "images": False, "proposals": True}})
    return out


def current_mode(db: Session, pilot: Pilot | None) -> str:
    if pilot is None:
        return "guide"
    p = db.get(OrionPref, pilot.id)
    return p.mode if p and p.mode in MODES else "guide"


# ---------- режим 1: бортовой гид ----------
GUIDE = (
    (("скорочт", "speed", "книг"), "Скорочтение: ОБЗОР → «Книга» или «Тренажёр»; темп меняй стрелками ↑/↓."),
    (("англ", "english", "слов", "карт"), "Английский: ОБЗОР → «Звёздные карты» — наборы слов страницами; повтор — «Повторение»."),
    (("радио", "radio"), "Радиорубка: ОБЗОР → станции и избранное; громкость — колесо или ←/→."),
    (("отдых", "игр", "lounge"), "Кают-компания: Snake, Tetris, Breakout — рекорды сохраняются."),
    (("настрой", "скин", "тем", "setting"), "Настройки: ОБЗОР → «Скины», «Вариант интерфейса», «Звук»."),
    (("задач", "task", "прогресс"), "Задачи Ориона: ОБЗОР → «Задачи» — шкалы от красного к зелёному по весу шагов."),
    (("ключ", "ии", "ai", "агент", "режим"), "Режим ИИ: ОБЗОР → «Настройки» Ориона — гид, свой агент (ключ хранится только в браузере) или агент сервиса."),
    (("печат", "мостик", "typing", "клав"), "Мостик: печатай текст миссии; Esc — пауза, F5 — заново, «Тепловая карта» — ошибки по клавишам."),
)


def guide_reply(text: str) -> str:
    low = (text or "").lower()
    for keys, ans in GUIDE:
        if any(k in low for k in keys):
            return ans
    return "Я бортовой гид Ориона (без ИИ). Спроси про мостик, английский, скорочтение, радио, отдых, задачи или настройки."


# ---------- адаптеры провайдеров ----------
class ProviderError(Exception):
    pass


def _safe_url(url: str) -> str:
    u = urlparse(url or "")
    if u.scheme not in ("https", "http") or not u.hostname:
        raise ProviderError("bad_url")
    if u.scheme == "http" and not settings.orion_byo_allow_http:
        raise ProviderError("https_required")
    if not settings.orion_byo_allow_private:
        try:
            for info in socket.getaddrinfo(u.hostname, None):
                ip = ipaddress.ip_address(info[4][0])
                if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                    raise ProviderError("private_host")
        except socket.gaierror as e:
            raise ProviderError("dns") from e
    return url.rstrip("/")


def _content(text: str, images: list[str], vision: bool, provider: str):
    if not (vision and images):
        return text
    if provider == "anthropic":
        parts: list[dict] = []
        for d in images:
            head, _, b64 = d.partition(",")
            mt = head[5:].split(";")[0] or "image/png"
            parts.append({"type": "image", "source": {"type": "base64", "media_type": mt, "data": b64}})
        return parts + [{"type": "text", "text": text}]
    return [{"type": "text", "text": text}] + [{"type": "image_url", "image_url": {"url": d}} for d in images]


SYSTEM = "Ты — Орион, бортовой помощник тренажёра Star Typing. Отвечай кратко, по-русски, если пилот пишет по-русски."


def call_provider(provider: str, base_url: str, model: str, key: str, history: list[dict],
                  text: str, images: list[str], vision: bool, check_url: bool) -> str:
    base = _safe_url(base_url) if check_url else base_url.rstrip("/")
    msgs = [{"role": "assistant" if m["role"] == "orion" else "user", "content": m["text"]} for m in history]
    msgs.append({"role": "user", "content": _content(text, images, vision, provider)})
    try:
        with httpx.Client(timeout=settings.orion_llm_timeout) as c:
            if provider == "anthropic":
                r = c.post(f"{base}/v1/messages", headers={"x-api-key": key, "anthropic-version": "2023-06-01"},
                           json={"model": model, "max_tokens": 1024, "system": SYSTEM, "messages": msgs})
                r.raise_for_status()
                return "".join(p.get("text", "") for p in r.json().get("content", [])).strip()
            r = c.post(f"{base}/chat/completions", headers={"Authorization": f"Bearer {key}"},
                       json={"model": model, "messages": [{"role": "system", "content": SYSTEM}] + msgs})
            r.raise_for_status()
            return (r.json()["choices"][0]["message"]["content"] or "").strip()
    except httpx.HTTPStatusError as e:
        raise ProviderError(f"http_{e.response.status_code}") from None
    except (httpx.HTTPError, KeyError, ValueError, IndexError):
        raise ProviderError("provider_error") from None


# ---------- схемы ----------
class ByoCfg(BaseModel):
    base_url: str = Field(default="", max_length=300)
    model: str = Field(default="", max_length=120)
    provider: str = Field(default="openai", pattern="^(openai|anthropic)$")
    vision: bool = False


class ChatIn(BaseModel):
    text: str = Field(default="", max_length=8000)
    images: list[str] = Field(default_factory=list, max_length=3)
    byo: ByoCfg | None = None


class ModeIn(BaseModel):
    mode: str = Field(pattern="^(guide|byo|hosted|contributor)$")


class TaskIn(BaseModel):
    title: str = Field(max_length=200)
    steps: list[dict] = Field(default_factory=list, max_length=50)


class StepIn(BaseModel):
    index: int = Field(ge=0)
    status: str = Field(default="done", pattern="^(pending|working|done|failed)$")


class FinishIn(BaseModel):
    state: str = Field(default="done", pattern="^(done|failed|stopped)$")


class ProposalIn(BaseModel):
    title: str = Field(max_length=200)
    description: str = Field(default="", max_length=8000)


# ---------- эндпоинты ----------
@router.get("/config")
def get_config(db: Session = Depends(get_db), pilot: Pilot | None = Depends(get_optional_pilot)) -> dict:
    return {"mode": current_mode(db, pilot), "modes": mode_status(db, pilot),
            "roles": sorted(roles_of(db, pilot)), "logged_in": pilot is not None,
            "pilot": pilot.callsign if pilot else "",
            "byo_storage": "client", "max_images": 3, "max_image_bytes": 2_000_000}


@router.put("/mode")
def put_mode(body: ModeIn, db: Session = Depends(get_db), pilot: Pilot = Depends(get_current_pilot)) -> dict:
    st = {m["id"]: m for m in mode_status(db, pilot)}[body.mode]
    if not st["available"]:
        raise HTTPException(403, st["reason"] or "locked")
    p = db.get(OrionPref, pilot.id) or OrionPref(pilot_id=pilot.id)
    p.mode = body.mode
    db.add(p)
    db.commit()
    return {"mode": body.mode}


@router.post("/chat")
def chat(body: ChatIn, db: Session = Depends(get_db), pilot: Pilot | None = Depends(get_optional_pilot),
         x_orion_key: str | None = Header(default=None)) -> dict:
    who = f"p{pilot.id}" if pilot else "anon"
    if not rate_ok(f"chat:{who}", settings.orion_chat_rate_per_min, 60):
        raise HTTPException(429, "rate_limited")
    for d in body.images:
        if not d.startswith("data:image/") or len(d) > 2_800_000:
            raise HTTPException(400, "bad_image")
    mode = current_mode(db, pilot)
    st = {m["id"]: m for m in mode_status(db, pilot)}
    if not st.get(mode, {}).get("available"):
        mode = "guide"
    history: list[dict] = []
    if pilot:
        rows = (db.query(OrionMessage).filter(OrionMessage.pilot_id == pilot.id)
                .order_by(OrionMessage.id.desc()).limit(10).all())
        history = [{"role": r.role, "text": r.text} for r in reversed(rows)]
    reply, used, reason = "", mode, ""
    try:
        if mode == "byo":
            cfg = body.byo
            if not (cfg and cfg.base_url and cfg.model and x_orion_key):
                raise ProviderError("byo_not_configured")
            reply = call_provider(cfg.provider, cfg.base_url, cfg.model, x_orion_key, history,
                                  body.text, body.images, cfg.vision, check_url=True)
        elif mode == "hosted":
            reply = call_provider(settings.orion_llm_provider, settings.orion_llm_base_url,
                                  settings.orion_llm_model, settings.orion_llm_api_key, history,
                                  body.text, body.images, bool(settings.orion_llm_vision), check_url=False)
        elif mode == "contributor":
            reply = ("Режим «Участник разработки»: опиши изменение — я оформлю предложение (ветка/PR, "
                     "мерж только мейнтейнер). Экран «Предложения» в Настройках Ориона.")
        if not reply and mode != "guide":
            raise ProviderError("empty")
    except ProviderError as e:
        reason, used = str(e), "guide"
    if used == "guide":
        reply = guide_reply(body.text)
    if pilot:
        db.add(OrionMessage(pilot_id=pilot.id, role="user", mode=used, text=body.text, images=len(body.images)))
        db.add(OrionMessage(pilot_id=pilot.id, role="orion", mode=used, text=reply))
        db.commit()
    return {"reply": reply, "mode_used": used, "fallback": used != mode, "reason": reason,
            "capabilities": st.get(used, st["guide"])["capabilities"]}


@router.get("/messages")
def messages(offset: int = 0, limit: int = 20, db: Session = Depends(get_db),
             pilot: Pilot = Depends(get_current_pilot)) -> dict:
    q = db.query(OrionMessage).filter(OrionMessage.pilot_id == pilot.id)
    total = q.count()
    rows = q.order_by(OrionMessage.id.desc()).offset(max(0, offset)).limit(max(1, min(limit, 50))).all()
    return {"total": total, "items": [{"id": r.id, "role": r.role, "mode": r.mode, "text": r.text,
                                       "images": r.images} for r in reversed(rows)]}


@router.get("/archive")
def archive(q: str = "", limit: int = 20, ctx: int = 40, db: Session = Depends(get_db),
            pilot: Pilot = Depends(get_current_pilot)) -> dict:
    needle = q.strip().lower()
    if not needle:
        return {"q": q, "items": []}
    ctx = max(10, min(ctx, 120))
    out = []
    rows = (db.query(OrionMessage).filter(OrionMessage.pilot_id == pilot.id)
            .order_by(OrionMessage.id.desc()).limit(2000))
    for r in rows:
        i = r.text.lower().find(needle)
        if i < 0:
            continue
        a, b = max(0, i - ctx), min(len(r.text), i + len(needle) + ctx)
        out.append({"id": r.id, "role": r.role, "before": ("…" if a else "") + r.text[a:i],
                    "match": r.text[i:i + len(needle)],
                    "after": r.text[i + len(needle):b] + ("…" if b < len(r.text) else ""),
                    "at": r.created_at.isoformat() if r.created_at else ""})
        if len(out) >= max(1, min(limit, 50)):
            break
    return {"q": q, "items": out}


@router.get("/tasks")
def tasks(db: Session = Depends(get_db), pilot: Pilot = Depends(get_current_pilot)) -> dict:
    now = time.time()
    rows = db.query(OrionTask).filter(OrionTask.pilot_id == pilot.id).order_by(OrionTask.id.desc()).all()
    vis = [task_view(t, now) for t in rows
           if t.state in ("planning", "working") or now - (t.updated or 0) <= KEEP_SEC]
    return {"items": vis[:MAX_TASKS]}


def _own_task(db: Session, pilot: Pilot, tid: int) -> OrionTask:
    t = db.get(OrionTask, tid)
    if t is None or t.pilot_id != pilot.id:
        raise HTTPException(404, "task")
    return t


@router.post("/tasks")
def task_plan(body: TaskIn, db: Session = Depends(get_db), pilot: Pilot = Depends(get_current_pilot)) -> dict:
    active = db.query(OrionTask).filter(OrionTask.pilot_id == pilot.id,
                                        OrionTask.state.in_(("planning", "working"))).count()
    if active >= MAX_TASKS:
        raise HTTPException(429, "too_many_tasks")
    steps = [{"title": str(s.get("title", ""))[:120], "weight": max(0.0, float(s.get("weight", 1) or 0)),
              "status": "pending"} for s in body.steps]
    t = OrionTask(pilot_id=pilot.id, title=body.title, state="planning",
                  steps_json=json.dumps(steps, ensure_ascii=False), updated=time.time())
    db.add(t)
    db.commit()
    return task_view(t)


@router.post("/tasks/{tid}/step")
def task_step(tid: int, body: StepIn, db: Session = Depends(get_db),
              pilot: Pilot = Depends(get_current_pilot)) -> dict:
    t = _own_task(db, pilot, tid)
    steps = json.loads(t.steps_json)
    if body.index >= len(steps):
        raise HTTPException(400, "index")
    steps[body.index]["status"] = body.status
    t.steps_json = json.dumps(steps, ensure_ascii=False)
    if t.state == "planning":
        t.state = "working"
    t.updated = time.time()
    db.commit()
    return task_view(t)


@router.post("/tasks/{tid}/finish")
def task_finish(tid: int, body: FinishIn, db: Session = Depends(get_db),
                pilot: Pilot = Depends(get_current_pilot)) -> dict:
    t = _own_task(db, pilot, tid)
    t.state = body.state
    t.updated = time.time()
    db.commit()
    return task_view(t)


def _proposal_view(p: OrionProposal) -> dict:
    return {"id": p.id, "title": p.title, "description": p.description, "status": p.status,
            "branch": p.branch, "diff": p.diff, "tests_run": json.loads(p.tests_run or "[]"),
            "task_id": p.task_id}


@router.get("/proposals")
def proposals(db: Session = Depends(get_db), pilot: Pilot = Depends(get_current_pilot)) -> dict:
    rows = db.query(OrionProposal).filter(OrionProposal.pilot_id == pilot.id).order_by(OrionProposal.id.desc())
    return {"items": [_proposal_view(p) for p in rows.limit(20)]}


@router.post("/proposals")
def proposal_create(body: ProposalIn, db: Session = Depends(get_db),
                    pilot: Pilot = Depends(get_current_pilot)) -> dict:
    st = {m["id"]: m for m in mode_status(db, pilot)}["contributor"]
    if not st["available"]:
        raise HTTPException(403, st["reason"])
    if not rate_ok(f"contrib:{pilot.id}", settings.orion_contrib_rate_per_hour, 3600):
        raise HTTPException(429, "rate_limited")
    task = OrionTask(pilot_id=pilot.id, title=f"Предложение: {body.title}"[:200], state="planning", updated=time.time(),
                     steps_json=json.dumps([{"title": t, "weight": w, "status": "pending"} for t, w in
                                            (("песочница", 1), ("изменение", 4), ("тесты", 3), ("PR", 1))],
                                           ensure_ascii=False))
    db.add(task)
    db.flush()
    p = OrionProposal(pilot_id=pilot.id, title=body.title, description=body.description, status="queued",
                      task_id=task.id)
    db.add(p)
    db.flush()
    p.branch = f"orion/proposal-{p.id}"
    audit(db, pilot.callsign, "proposal.create", f"id={p.id} title={body.title[:100]}")
    db.commit()
    return _proposal_view(p)


# ---------- админ ----------
def require_admin(x_orion_admin: str | None = Header(default=None)) -> str:
    tok = settings.orion_admin_token
    if not tok or not x_orion_admin or not _consteq(tok, x_orion_admin):
        raise HTTPException(403, "admin")
    return "admin"


def _consteq(a: str, b: str) -> bool:
    import hmac
    return hmac.compare_digest(a.encode(), b.encode())


class AdminSettingsIn(BaseModel):
    hosted_enabled: bool | None = None
    contrib_enabled: bool | None = None


class RoleIn(BaseModel):
    callsign: str = Field(max_length=64)
    role: str = Field(pattern="^(supporter|contributor)$")
    grant: bool = True


@router.get("/admin/settings")
def admin_get(db: Session = Depends(get_db), _a: str = Depends(require_admin)) -> dict:
    return {"hosted_enabled": flag(db, "hosted_enabled", settings.orion_hosted_enabled),
            "contrib_enabled": flag(db, "contrib_enabled", settings.orion_contrib_enabled),
            "env_hosted_enabled": settings.orion_hosted_enabled,
            "env_contrib_enabled": settings.orion_contrib_enabled,
            "hosted_configured": hosted_configured()}


@router.put("/admin/settings")
def admin_put(body: AdminSettingsIn, db: Session = Depends(get_db), _a: str = Depends(require_admin)) -> dict:
    for k in ("hosted_enabled", "contrib_enabled"):
        v = getattr(body, k)
        if v is not None:
            row = db.get(OrionSetting, k) or OrionSetting(key=k)
            row.value = v
            db.add(row)
            audit(db, "admin", f"settings.{k}", str(v))
    db.commit()
    return admin_get(db, _a)


@router.post("/admin/role")
def admin_role(body: RoleIn, db: Session = Depends(get_db), _a: str = Depends(require_admin)) -> dict:
    p = db.query(Pilot).filter(Pilot.callsign == body.callsign).first()
    if p is None:
        raise HTTPException(404, "pilot")
    q = db.query(OrionRole).filter(OrionRole.pilot_id == p.id, OrionRole.role == body.role)
    if body.grant and q.first() is None:
        db.add(OrionRole(pilot_id=p.id, role=body.role))
    if not body.grant:
        q.delete()
    audit(db, "admin", "role.grant" if body.grant else "role.revoke", f"{body.callsign}:{body.role}")
    db.commit()
    return {"callsign": p.callsign, "roles": sorted(roles_of(db, p))}


@router.get("/admin/audit")
def admin_audit(limit: int = 50, db: Session = Depends(get_db), _a: str = Depends(require_admin)) -> dict:
    rows = db.query(OrionAudit).order_by(OrionAudit.id.desc()).limit(max(1, min(limit, 200)))
    return {"items": [{"actor": r.actor, "action": r.action, "detail": r.detail,
                       "at": r.created_at.isoformat() if r.created_at else ""} for r in rows]}
