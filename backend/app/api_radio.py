"""Прокси ICY + radio-browser + избранное станций на пилота."""

from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, Integer, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, Session

from app.auth_deps import get_current_pilot, get_optional_pilot
from app.db import Base, get_db
from app.icy import fetch_icy_title
from app.pilots import Pilot
from app import radio_browser as rb

router = APIRouter(prefix="/api/radio", tags=["radio"])


class NowPlayingOut(BaseModel):
    title: str | None
    ok: bool


class PilotRadioFav(Base):
    __tablename__ = "pilot_radio_favs"
    __table_args__ = (UniqueConstraint("pilot_id", "station_uuid", name="uq_pilot_radio_fav"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pilot_id: Mapped[int] = mapped_column(Integer, index=True)
    station_uuid: Mapped[str] = mapped_column(Text, default="")
    payload: Mapped[str] = mapped_column(Text, default="{}")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class FavIn(BaseModel):
    stationuuid: str = ""
    name: str = ""
    url_resolved: str = Field(..., min_length=8)
    country: str = ""
    favicon: str = ""
    tags: str = ""
    language: str = ""


@router.get("/nowplaying", response_model=NowPlayingOut)
def nowplaying(url: str = Query(..., min_length=8, max_length=2000)) -> NowPlayingOut:
    if not url.startswith(("http://", "https://")):
        raise HTTPException(400, "url must be http(s)")
    title = fetch_icy_title(url)
    return NowPlayingOut(title=title, ok=title is not None)


@router.get("/stations/top")
def stations_top(limit: int = Query(120, ge=1, le=200)) -> list[dict]:
    try:
        return rb.top_stations(limit)
    except ConnectionError as exc:
        raise HTTPException(503, f"radio-browser unreachable: {exc}") from exc


@router.get("/stations/search")
def stations_search(
    name: str = "",
    country: str = "",
    language: str = "",
    tag: str = "",
    limit: int = Query(120, ge=1, le=200),
) -> list[dict]:
    try:
        return rb.search_stations(
            name=name,
            country=country,
            language=language,
            tag=tag,
            limit=limit,
        )
    except ConnectionError as exc:
        raise HTTPException(503, f"radio-browser unreachable: {exc}") from exc


@router.get("/meta/countries")
def meta_countries() -> list[dict]:
    try:
        return rb.countries()
    except ConnectionError as exc:
        raise HTTPException(503, f"radio-browser unreachable: {exc}") from exc


@router.get("/meta/languages")
def meta_languages() -> list[str]:
    try:
        return rb.languages()
    except ConnectionError as exc:
        raise HTTPException(503, f"radio-browser unreachable: {exc}") from exc


@router.get("/meta/tags")
def meta_tags() -> list[str]:
    try:
        return rb.tags()
    except ConnectionError as exc:
        raise HTTPException(503, f"radio-browser unreachable: {exc}") from exc


@router.get("/favs")
def list_favs(
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> list[dict]:
    if pilot is None:
        return []
    rows = db.query(PilotRadioFav).filter_by(pilot_id=pilot.id).order_by(PilotRadioFav.updated_at.desc()).all()
    out = []
    for r in rows:
        try:
            out.append(json.loads(r.payload))
        except json.JSONDecodeError:
            continue
    return out


@router.put("/favs")
def put_favs(
    body: list[FavIn],
    db: Session = Depends(get_db),
    pilot: Pilot = Depends(get_current_pilot),
) -> dict:
    db.query(PilotRadioFav).filter_by(pilot_id=pilot.id).delete()
    for s in body[:40]:
        uuid = s.stationuuid or s.url_resolved
        db.add(
            PilotRadioFav(
                pilot_id=pilot.id,
                station_uuid=uuid[:200],
                payload=json.dumps(s.model_dump()),
            )
        )
    db.commit()
    return {"ok": True, "count": min(len(body), 40)}
