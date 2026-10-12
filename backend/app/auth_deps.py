"""JWT cookie → текущий пилот."""

from __future__ import annotations

from fastapi import Cookie, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.pilots import Pilot, decode_token

COOKIE = "st_token"


def get_optional_pilot(
    db: Session = Depends(get_db),
    st_token: str | None = Cookie(default=None),
) -> Pilot | None:
    if not st_token:
        return None
    pid = decode_token(st_token)
    if pid is None:
        return None
    return db.get(Pilot, pid)


def get_current_pilot(pilot: Pilot | None = Depends(get_optional_pilot)) -> Pilot:
    if pilot is None:
        raise HTTPException(401, "login required")
    return pilot
