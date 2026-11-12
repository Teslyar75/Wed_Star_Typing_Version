"""Прокси автообновления с хоста (tools/web_updater.py :8766)."""
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.auth_deps import get_current_pilot
from app.config import settings
from app.pilots import Pilot

router = APIRouter(prefix="/api/updates", tags=["updates"])


def _headers() -> dict[str, str]:
    token = settings.web_update_token
    return {"X-Web-Update": token} if token else {}


def _base() -> str:
    return (settings.web_update_url or "http://host.docker.internal:8766").rstrip("/")


@router.get("/status")
def update_status() -> dict:
    try:
        with httpx.Client(timeout=settings.web_update_timeout) as client:
            r = client.get(f"{_base()}/status", headers=_headers())
    except httpx.HTTPError:
        return {"ok": False, "available": False, "reason": "bridge_down"}
    if r.status_code >= 400:
        return {"ok": False, "available": False, "reason": f"http_{r.status_code}"}
    data = r.json()
    data["available"] = bool(data.get("can_apply"))
    return data


@router.post("/apply")
def update_apply(_pilot: Pilot = Depends(get_current_pilot)) -> dict:
    try:
        with httpx.Client(timeout=max(settings.web_update_timeout, 600.0)) as client:
            r = client.post(f"{_base()}/apply", headers=_headers(), json={})
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="update_bridge_down") from exc
    if r.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"update_http_{r.status_code}")
    return r.json()
