"""JWT → текущий пилот: cookie st_token или заголовок Authorization: Bearer."""

from __future__ import annotations

from fastapi import Cookie, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.pilots import Pilot, decode_token

COOKIE = "st_token"


def _bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer":
        return None
    token = token.strip()
    return token or None


def get_optional_pilot(
    db: Session = Depends(get_db),
    st_token: str | None = Cookie(default=None),
    authorization: str | None = Header(default=None),
) -> Pilot | None:
    pid = decode_token(st_token) if st_token else None
    if pid is None:
        bearer = _bearer_token(authorization)
        pid = decode_token(bearer) if bearer else None
    if pid is None:
        return None
    return db.get(Pilot, pid)


def get_current_pilot(pilot: Pilot | None = Depends(get_optional_pilot)) -> Pilot:
    if pilot is None:
        raise HTTPException(401, "login required")
    return pilot
