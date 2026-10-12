"""Прокси ICY now-playing для радиорубки (браузер не читает icy из-за CORS)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.icy import fetch_icy_title

router = APIRouter(prefix="/api/radio", tags=["radio"])


class NowPlayingOut(BaseModel):
    title: str | None
    ok: bool


@router.get("/nowplaying", response_model=NowPlayingOut)
def nowplaying(url: str = Query(..., min_length=8, max_length=2000)) -> NowPlayingOut:
    if not url.startswith(("http://", "https://")):
        raise HTTPException(400, "url must be http(s)")
    title = fetch_icy_title(url)
    return NowPlayingOut(title=title, ok=title is not None)
