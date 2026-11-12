"""Орион в вебе: чат (4 режима), задачи (порт stamina/task_progress), архив, роли, предложения.

Ключи только из env (settings.orion_*). Ключ BYO приходит заголовком X-Orion-Key на каждый запрос
и нигде не сохраняется и не логируется (см. docs/WEB_PORT_PLAN.md «Орион в вебе»).
"""

from __future__ import annotations

import json
import socket
import time
from collections import defaultdict, deque
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse, urlunparse

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import Boolean, DateTime, Integer, String, Text, UniqueConstraint, func
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
    active_agent: Mapped[str] = mapped_column(String(40), default="")


class OrionAgent(Base):
    """Заселённый на борт агент пилота (десктоп: stamina/orion.py agents.json)."""
    __tablename__ = "orion_agents"
    __table_args__ = (UniqueConstraint("pilot_id", "agent_id", name="uq_orion_agent"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pilot_id: Mapped[int] = mapped_column(Integer, index=True)
    agent_id: Mapped[str] = mapped_column(String(40))
    name: Mapped[str] = mapped_column(String(40), default="")
    kind: Mapped[str] = mapped_column(String(24), default="openai_compat")
    access: Mapped[str] = mapped_column(String(16), default="crew")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    provider: Mapped[str] = mapped_column(String(16), default="openai")
    base_url: Mapped[str] = mapped_column(String(300), default="")
    model: Mapped[str] = mapped_column(String(120), default="")
    vision: Mapped[bool] = mapped_column(Boolean, default=False)
    manners: Mapped[str] = mapped_column(Text, default="")
    note: Mapped[str] = mapped_column(String(200), default="")
    voice: Mapped[str] = mapped_column(String(16), default="ship")


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
    from app.ssrf import assert_safe_url

    u = urlparse(url or "")
    if u.scheme not in ("https", "http") or not u.hostname:
        raise ProviderError("bad_url")
    if settings.orion_byo_allow_private:
        if u.scheme == "http" and not settings.orion_byo_allow_http:
            raise ProviderError("https_required")
        return url.rstrip("/")
    try:
        assert_safe_url(url, allow_http=settings.orion_byo_allow_http)
    except ValueError as e:
        code = str(e) or "private_host"
        if code == "bad_scheme":
            raise ProviderError("bad_url") from e
        if code == "https_required":
            raise ProviderError("https_required") from e
        if code == "private_host":
            # dns fail тоже даёт private_host через host_is_public False —
            # отличим: если hostname не резолвится — dns
            try:
                socket.getaddrinfo(u.hostname, None)
            except socket.gaierror as ge:
                raise ProviderError("dns") from ge
            raise ProviderError("private_host") from e
        raise ProviderError(code) from e
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



def _prompt(body: ChatIn, boarded: OrionAgent | None) -> str:
    """Манеры, архив и отметка корабля — как на десктопе, до реплики пилота."""
    parts: list[str] = []
    ctx = (body.context or "").strip()
    if ctx:
        parts.append(ctx if ctx.startswith("[") else "[КОРАБЛЬ] " + ctx)
    if boarded is not None and (boarded.manners or "").strip():
        parts.append("[МАНЕРЫ АГЕНТА]\n" + boarded.manners.strip()[:4000])
    quotes = [q.strip() for q in (body.quotes or []) if str(q).strip()]
    if quotes:
        parts.append("ИЗ АРХИВА — прошлые сообщения борта:\n" + "\n".join(quotes[:12]))
    parts.append((body.text or "").strip())
    return "\n\n".join(p for p in parts if p)

class ChatIn(BaseModel):
    text: str = Field(default="", max_length=8000)
    images: list[str] = Field(default_factory=list, max_length=3)
    byo: ByoCfg | None = None
    agent_id: str = Field(default="", max_length=40)
    quotes: list[str] = Field(default_factory=list, max_length=20)
    context: str = Field(default="", max_length=2000)


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



def read_opencode_runtime_port(path: str | Path | None = None) -> int | None:
    """Порт из runtime-файла моста; None если файла нет или он битый."""
    raw = path if path is not None else settings.orion_opencode_runtime
    if not raw:
        return None
    try:
        data = json.loads(Path(raw).read_text(encoding="utf-8"))
        port = int(data.get("port") or 0)
        return port if 1 <= port <= 65535 else None
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return None


def opencode_base_url() -> str:
    """URL моста: runtime-порт подменяет порт в ORION_OPENCODE_URL (хост тот же)."""
    fallback = (settings.orion_opencode_url or "http://host.docker.internal:8765").rstrip("/")
    port = read_opencode_runtime_port()
    if port is None:
        return fallback
    parsed = urlparse(fallback)
    host = parsed.hostname or "host.docker.internal"
    scheme = parsed.scheme or "http"
    # IPv6 в netloc нужен в скобках
    netloc = f"[{host}]:{port}" if ":" in host and not host.startswith("[") else f"{host}:{port}"
    return urlunparse((scheme, netloc, "", "", "", "")).rstrip("/")


def call_opencode(prompt: str, model: str, profile: str) -> str:
    """Спросить OpenCode CLI на хосте через tools/opencode_bridge.py."""
    base = opencode_base_url()
    headers = {}
    if settings.orion_opencode_token:
        headers["X-Orion-OpenCode"] = settings.orion_opencode_token
    try:
        with httpx.Client(timeout=settings.orion_opencode_timeout) as client:
            r = client.post(f"{base}/run", headers=headers, json={
                "prompt": prompt, "model": model, "agent": profile,
                "timeout": settings.orion_opencode_timeout,
            })
    except httpx.HTTPError as exc:
        raise ProviderError("opencode_bridge_down") from exc
    try:
        data = r.json()
    except ValueError as exc:
        raise ProviderError("opencode_bad_reply") from exc
    if r.status_code >= 400 or data.get("error"):
        raise ProviderError(str(data.get("error") or f"opencode_http_{r.status_code}"))
    reply = str(data.get("reply") or "").strip()
    if not reply:
        raise ProviderError("empty")
    return reply


def opencode_status() -> dict:
    base = opencode_base_url()
    port = read_opencode_runtime_port()
    try:
        with httpx.Client(timeout=2.0) as client:
            r = client.get(f"{base}/health")
        data = r.json() if r.status_code == 200 else {}
        cli = str(data.get("cli") or "")
        actual_port = int(data.get("port") or port or 0) or None
        return {
            "available": bool(cli),
            "cli": cli,
            "model": data.get("model") or settings.orion_opencode_model,
            "reason": "" if cli else "no_cli",
            "url": base,
            "port": actual_port,
        }
    except (httpx.HTTPError, ValueError):
        return {
            "available": False,
            "cli": "",
            "model": settings.orion_opencode_model,
            "reason": "bridge_down",
            "url": base,
            "port": port,
        }


# ---------- эндпоинты ----------
@router.get("/config")
def get_config(db: Session = Depends(get_db), pilot: Pilot | None = Depends(get_optional_pilot)) -> dict:
    return {"mode": current_mode(db, pilot), "modes": mode_status(db, pilot),
            "roles": sorted(roles_of(db, pilot)), "logged_in": pilot is not None,
            "pilot": pilot.callsign if pilot else "",
            "byo_storage": "client", "max_images": 3, "max_image_bytes": 2_000_000,
            "opencode": opencode_status()}


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
    agent_tag = ""
    boarded = None
    if pilot:
        _ensure_default_agent(db, pilot)
        aid = (body.agent_id or "").strip()
        if not aid and mode not in ("byo", "hosted", "contributor"):
            aid = _pref(db, pilot).active_agent
        if aid:
            boarded = (db.query(OrionAgent)
                       .filter(OrionAgent.pilot_id == pilot.id, OrionAgent.agent_id == aid,
                               OrionAgent.enabled.is_(True))
                       .first())
    prompt = _prompt(body, boarded)
    try:
        if boarded is not None:
            if boarded.kind == "opencode":
                profile = OPENCODE_PROFILES.get(boarded.access or "crew", "orion-chat")
                model = boarded.model or settings.orion_opencode_model or DEFAULT_AGENT["model"]
                reply = call_opencode(prompt, model, profile)
                used, agent_tag = "byo", boarded.name or boarded.agent_id
            elif boarded.kind == "github_bridge":
                raise ProviderError("github_bridge_later")
            else:
                key = x_orion_key or ""
                if not (boarded.base_url and boarded.model and key):
                    raise ProviderError("agent_not_configured")
                reply = call_provider(boarded.provider or "openai", boarded.base_url, boarded.model,
                                      key, history, prompt, body.images, bool(boarded.vision),
                                      check_url=True)
                used, agent_tag = "byo", boarded.name or boarded.agent_id
        elif mode == "byo":
            cfg = body.byo
            if not (cfg and cfg.base_url and cfg.model and x_orion_key):
                raise ProviderError("byo_not_configured")
            reply = call_provider(cfg.provider, cfg.base_url, cfg.model, x_orion_key, history,
                                  prompt, body.images, cfg.vision, check_url=True)
        elif mode == "hosted":
            reply = call_provider(settings.orion_llm_provider, settings.orion_llm_base_url,
                                  settings.orion_llm_model, settings.orion_llm_api_key, history,
                                  prompt, body.images, bool(settings.orion_llm_vision), check_url=False)
        elif mode == "contributor":
            reply = ("Режим «Участник разработки»: опиши изменение — я оформлю предложение (ветка/PR, "
                     "мерж только мейнтейнер). Экран «Предложения» в Настройках Ориона.")
        if not reply and mode != "guide":
            raise ProviderError("empty")
    except ProviderError as e:
        reason, used = str(e), "guide"
    if used == "guide":
        reply = guide_reply(body.text or prompt)
    if pilot:
        db.add(OrionMessage(pilot_id=pilot.id, role="user", mode=used, text=body.text, images=len(body.images)))
        db.add(OrionMessage(pilot_id=pilot.id, role="orion", mode=used, text=reply))
        db.commit()
    return {"reply": reply, "mode_used": used, "fallback": used != mode, "reason": reason,
            "agent": agent_tag, "agent_id": (boarded.agent_id if boarded else ""),
            "capabilities": st.get(used, st["guide"])["capabilities"]}


@router.get("/messages")
def messages(offset: int = 0, limit: int = 20, db: Session = Depends(get_db),
             pilot: Pilot = Depends(get_current_pilot)) -> dict:
    q = db.query(OrionMessage).filter(OrionMessage.pilot_id == pilot.id)
    total = q.count()
    rows = q.order_by(OrionMessage.id.desc()).offset(max(0, offset)).limit(max(1, min(limit, 50))).all()
    return {"total": total, "items": [{"id": r.id, "role": r.role, "mode": r.mode, "text": r.text,
                                       "images": r.images,
                                       "at": r.created_at.isoformat() if r.created_at else ""} for r in reversed(rows)]}


@router.delete("/messages")
def clear_messages(db: Session = Depends(get_db), pilot: Pilot = Depends(get_current_pilot)) -> dict:
    n = db.query(OrionMessage).filter(OrionMessage.pilot_id == pilot.id).delete()
    db.commit()
    return {"ok": True, "deleted": n}


@router.get("/archive")
def archive(q: str = "", limit: int = 20, ctx: int = 40, db: Session = Depends(get_db),
            pilot: Pilot = Depends(get_current_pilot)) -> dict:
    needle = q.strip().lower()
    ctx = max(10, min(ctx, 120))
    cap = max(1, min(limit, 400))
    out = []
    rows = (db.query(OrionMessage).filter(OrionMessage.pilot_id == pilot.id)
            .order_by(OrionMessage.id.desc()).limit(2000))
    for r in rows:
        text = r.text or ""
        at = r.created_at.isoformat() if r.created_at else ""
        if needle:
            i = text.lower().find(needle)
            if i < 0:
                continue
            a, b = max(0, i - ctx), min(len(text), i + len(needle) + ctx)
            item = {"id": r.id, "role": r.role,
                    "before": ("…" if a else "") + text[a:i],
                    "match": text[i:i + len(needle)],
                    "after": text[i + len(needle):b] + ("…" if b < len(text) else ""),
                    "at": at, "text": text}
        else:
            item = {"id": r.id, "role": r.role, "before": text[:ctx], "match": "",
                    "after": text[ctx:ctx * 2], "at": at, "text": text}
        out.append(item)
        if len(out) >= cap:
            break
    return {"q": q, "items": out, "found": len(out)}


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


class AgentIn(BaseModel):
    agent_id: str = Field(default="", max_length=40)
    name: str = Field(default="", max_length=40)
    kind: str = Field(default="openai_compat", pattern="^(opencode|openai_compat|github_bridge)$")
    access: str = Field(default="crew", pattern="^(commander|observer|crew)$")
    enabled: bool = True
    provider: str = Field(default="openai", pattern="^(openai|anthropic)$")
    base_url: str = Field(default="", max_length=300)
    model: str = Field(default="", max_length=120)
    vision: bool = False
    manners: str = Field(default="", max_length=8000)
    note: str = Field(default="", max_length=200)
    voice: str = Field(default="ship", pattern="^(ship|agent|off)$")


def _agent_out(a: OrionAgent) -> dict:
    return {
        "id": a.id, "agent_id": a.agent_id, "name": a.name, "kind": a.kind, "access": a.access,
        "enabled": a.enabled, "provider": a.provider, "base_url": a.base_url, "model": a.model,
        "vision": a.vision, "manners": a.manners, "note": getattr(a, "note", "") or "",
        "voice": getattr(a, "voice", "ship") or "ship", "needs_key": a.kind == "openai_compat",
    }


def _pref(db: Session, pilot: Pilot) -> OrionPref:
    row = db.get(OrionPref, pilot.id)
    if row is None:
        row = OrionPref(pilot_id=pilot.id, mode="guide", active_agent="")
        db.add(row)
        db.flush()
    return row


DEFAULT_AGENT = {
    "agent_id": "orion",
    "name": "Орион",
    "kind": "opencode",
    "access": "commander",
    "enabled": True,
    "voice": "ship",
    "model": "opencode/deepseek-v4.1-flash-free",
    "note": "Бортовой разум: доклад отсека, порядок на корабле, новый функционал",
}
OPENCODE_PROFILES = {"commander": "orion-commander", "observer": "orion-recon", "crew": "orion-chat"}


def _ensure_default_agent(db: Session, pilot: Pilot) -> OrionAgent:
    """Орион есть всегда — как stamina/orion.py registry()."""
    row = db.query(OrionAgent).filter_by(pilot_id=pilot.id, agent_id="orion").first()
    if row is None:
        row = OrionAgent(
            pilot_id=pilot.id,
            agent_id=DEFAULT_AGENT["agent_id"],
            name=DEFAULT_AGENT["name"],
            kind=DEFAULT_AGENT["kind"],
            access=DEFAULT_AGENT["access"],
            enabled=DEFAULT_AGENT["enabled"],
            voice=DEFAULT_AGENT["voice"],
            model=DEFAULT_AGENT["model"],
            note=DEFAULT_AGENT["note"],
        )
        db.add(row)
        pref = _pref(db, pilot)
        if not pref.active_agent:
            pref.active_agent = "orion"
        db.commit()
        db.refresh(row)
    changed = False
    if not (row.model or "").strip():
        row.model = DEFAULT_AGENT["model"]
        changed = True
    if row.kind != "opencode":
        row.kind = "opencode"
        changed = True
    if changed:
        db.commit()
        db.refresh(row)
    return row


@router.get("/agents")
def list_agents(db: Session = Depends(get_db), pilot: Pilot = Depends(get_current_pilot)) -> dict:
    _ensure_default_agent(db, pilot)
    rows = db.query(OrionAgent).filter(OrionAgent.pilot_id == pilot.id).order_by(OrionAgent.id).all()
    pref = _pref(db, pilot)
    if not pref.active_agent or not any(a.agent_id == pref.active_agent for a in rows):
        pref.active_agent = "orion"
        db.commit()
    return {"active": pref.active_agent or "orion", "items": [_agent_out(a) for a in rows]}


@router.post("/agents")
def create_agent(body: AgentIn, db: Session = Depends(get_db),
                 pilot: Pilot = Depends(get_current_pilot)) -> dict:
    aid = (body.agent_id or body.name or "agent").strip().lower()
    aid = "".join(ch for ch in aid if ch.isalnum() or ch in "-_")[:40] or "agent"
    others = {a.agent_id for a in db.query(OrionAgent).filter(OrionAgent.pilot_id == pilot.id)}
    base, n = aid, 2
    while aid in others:
        aid = f"{base}{n}"
        n += 1
    presets = {
        "openai": ("https://api.openai.com/v1", "gpt-4o-mini"),
        "anthropic": ("https://api.anthropic.com", "claude-3-5-sonnet-latest"),
    }
    url, model = body.base_url, body.model
    if not url and body.provider in presets:
        url, model = url or presets[body.provider][0], model or presets[body.provider][1]
    row = OrionAgent(
        pilot_id=pilot.id, agent_id=aid, name=(body.name or aid)[:40], kind=body.kind,
        access=body.access, enabled=body.enabled, provider=body.provider,
        base_url=url, model=model, vision=body.vision, manners=body.manners,
        note=(body.note or "")[:200], voice=body.voice or "ship",
    )
    db.add(row)
    pref = _pref(db, pilot)
    if not pref.active_agent:
        pref.active_agent = aid
    db.commit()
    db.refresh(row)
    return _agent_out(row)


@router.put("/agents/{agent_id}")
def update_agent(agent_id: str, body: AgentIn, db: Session = Depends(get_db),
                 pilot: Pilot = Depends(get_current_pilot)) -> dict:
    row = db.query(OrionAgent).filter_by(pilot_id=pilot.id, agent_id=agent_id).first()
    if row is None:
        raise HTTPException(404, "agent")
    row.name = (body.name or row.name)[:40]
    row.kind = body.kind
    row.access = body.access
    row.enabled = body.enabled
    row.provider = body.provider
    row.base_url = body.base_url or row.base_url
    row.model = body.model or row.model
    row.vision = body.vision
    row.manners = body.manners
    row.note = (body.note or "")[:200]
    row.voice = body.voice or row.voice or "ship"
    db.commit()
    return _agent_out(row)


@router.post("/agents/{agent_id}/activate")
def activate_agent(agent_id: str, db: Session = Depends(get_db),
                   pilot: Pilot = Depends(get_current_pilot)) -> dict:
    row = db.query(OrionAgent).filter_by(pilot_id=pilot.id, agent_id=agent_id).first()
    if row is None:
        raise HTTPException(404, "agent")
    pref = _pref(db, pilot)
    pref.active_agent = agent_id
    db.commit()
    return {"active": agent_id}


@router.delete("/agents/{agent_id}")
def delete_agent(agent_id: str, db: Session = Depends(get_db),
                 pilot: Pilot = Depends(get_current_pilot)) -> dict:
    row = db.query(OrionAgent).filter_by(pilot_id=pilot.id, agent_id=agent_id).first()
    if row is None:
        raise HTTPException(404, "agent")
    if row.agent_id == "orion":
        row.enabled = False
        db.commit()
        return {"ok": True, "disabled": True}
    db.delete(row)
    pref = _pref(db, pilot)
    if pref.active_agent == agent_id:
        nxt = db.query(OrionAgent).filter_by(pilot_id=pilot.id).first()
        pref.active_agent = nxt.agent_id if nxt else ""
    db.commit()
    return {"ok": True}


# ---------- health агента (лёгкая проверка без генерации) ----------
_HEALTH_CACHE: dict[str, tuple[float, dict]] = {}
_HEALTH_TTL = 20.0


def _health_cache_get(key: str) -> dict | None:
    row = _HEALTH_CACHE.get(key)
    if not row:
        return None
    ts, data = row
    if time.monotonic() - ts > _HEALTH_TTL:
        _HEALTH_CACHE.pop(key, None)
        return None
    return dict(data)


def _health_cache_put(key: str, data: dict) -> dict:
    out = dict(data)
    _HEALTH_CACHE[key] = (time.monotonic(), out)
    return out


def probe_openai_compat(base_url: str, key: str, provider: str, check_url: bool = True) -> dict:
    """Дешёвый GET /models (или anthropic /v1/models) — без генерации."""
    if not (key or "").strip():
        return {"available": False, "reason": "no_key"}
    if not (base_url or "").strip():
        return {"available": False, "reason": "no_url"}
    try:
        base = _safe_url(base_url) if check_url else base_url.rstrip("/")
    except ProviderError as e:
        return {"available": False, "reason": str(e) or "bad_url"}
    try:
        with httpx.Client(timeout=4.0) as c:
            if provider == "anthropic":
                r = c.get(
                    f"{base}/v1/models",
                    headers={"x-api-key": key, "anthropic-version": "2023-06-01"},
                )
            else:
                r = c.get(f"{base}/models", headers={"Authorization": f"Bearer {key}"})
        if r.status_code in (401, 403):
            return {"available": False, "reason": "bad_key"}
        if r.status_code >= 500:
            return {"available": False, "reason": f"http_{r.status_code}"}
        if r.status_code >= 400:
            # некоторые провайдеры режут /models — считаем «ключ принят», если не auth
            if r.status_code in (404, 405):
                return {"available": True, "reason": ""}
            return {"available": False, "reason": f"http_{r.status_code}"}
        return {"available": True, "reason": ""}
    except httpx.TimeoutException:
        return {"available": False, "reason": "timeout"}
    except httpx.HTTPError:
        return {"available": False, "reason": "provider_error"}


@router.get("/health")
def agent_health(
    agent_id: str = "",
    refresh: bool = False,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
    x_orion_key: str | None = Header(default=None),
) -> dict:
    """Статус связи с выбранным агентом. Для opencode — мост; для openai_compat — /models."""
    if pilot is None:
        return {
            "available": False,
            "reason": "login",
            "state": "off",
            "kind": "",
            "agent_id": "",
            "cached": False,
        }
    _ensure_default_agent(db, pilot)
    pref = _pref(db, pilot)
    aid = (agent_id or pref.active_agent or "orion").strip()
    row = (
        db.query(OrionAgent)
        .filter(OrionAgent.pilot_id == pilot.id, OrionAgent.agent_id == aid)
        .first()
    )
    if row is None:
        return {
            "available": False,
            "reason": "no_agent",
            "state": "off",
            "kind": "",
            "agent_id": aid,
            "cached": False,
        }
    if not row.enabled:
        return {
            "available": False,
            "reason": "agent_off",
            "state": "off",
            "kind": row.kind,
            "agent_id": row.agent_id,
            "cached": False,
        }

    key_fp = (x_orion_key or "")[:8]
    cache_key = f"{pilot.id}:{row.agent_id}:{row.kind}:{key_fp}:{row.base_url}"
    if not refresh:
        hit = _health_cache_get(cache_key)
        if hit is not None:
            hit["cached"] = True
            return hit

    if row.kind == "opencode":
        oc = opencode_status()
        data = {
            "available": bool(oc.get("available")),
            "reason": "" if oc.get("available") else (oc.get("reason") or "bridge_down"),
            "state": "ok" if oc.get("available") else "down",
            "kind": row.kind,
            "agent_id": row.agent_id,
            "model": oc.get("model") or row.model,
            "cached": False,
        }
        return _health_cache_put(cache_key, data)

    if row.kind == "github_bridge":
        data = {
            "available": False,
            "reason": "github_bridge_later",
            "state": "down",
            "kind": row.kind,
            "agent_id": row.agent_id,
            "cached": False,
        }
        return _health_cache_put(cache_key, data)

    # openai_compat / byo
    probe = probe_openai_compat(
        row.base_url or "",
        x_orion_key or "",
        row.provider or "openai",
        check_url=True,
    )
    data = {
        "available": bool(probe.get("available")),
        "reason": "" if probe.get("available") else (probe.get("reason") or "provider_error"),
        "state": "ok" if probe.get("available") else "down",
        "kind": row.kind,
        "agent_id": row.agent_id,
        "cached": False,
    }
    return _health_cache_put(cache_key, data)
