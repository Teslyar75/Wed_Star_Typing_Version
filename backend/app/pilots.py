"""Пилоты: регистрация, PIN/пароль (bcrypt), JWT cookie."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.config import settings
from app.db import Base

JWT_ALG = "HS256"
JWT_TTL_H = 72


class Pilot(Base):
    __tablename__ = "pilots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    callsign: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(128), default="")
    pin_hash: Mapped[str] = mapped_column(String(128), default="")
    accent: Mapped[str] = mapped_column(String(32), default="cyan")
    skin: Mapped[str] = mapped_column(String(32), default="spaceship")
    xp: Mapped[int] = mapped_column(Integer, default=0)
    avatar_data: Mapped[str] = mapped_column(Text, default="")  # data:image/...;base64,...
    is_guest: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


def hash_pin(pin: str) -> str:
    return bcrypt.hashpw(pin.encode(), bcrypt.gensalt(rounds=10)).decode()


def verify_pin(pin: str, hashed: str) -> bool:
    if not hashed:
        return not pin
    try:
        return bcrypt.checkpw(pin.encode(), hashed.encode())
    except ValueError:
        return False


def make_token(pilot_id: int) -> str:
    payload = {
        "sub": str(pilot_id),
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_TTL_H),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=JWT_ALG)


def decode_token(token: str) -> int | None:
    try:
        data = jwt.decode(token, settings.secret_key, algorithms=[JWT_ALG])
        return int(data["sub"])
    except (jwt.PyJWTError, KeyError, TypeError, ValueError):
        return None


# Звания как stamina/missions.RANKS (порог XP → имя)
RANKS: list[tuple[int, str]] = [
    (0, "Кадет"),
    (100, "Пилот-стажёр"),
    (300, "Мичман"),
    (700, "Лейтенант"),
    (1500, "Капитан-лейтенант"),
    (3000, "Капитан"),
    (6000, "Коммодор"),
    (12000, "Адмирал флота"),
]


def rank_for(xp: int) -> tuple[str, int, int | None]:
    """(звание, порог текущего, порог следующего или None)."""
    current = RANKS[0]
    nxt: int | None = None
    for i, (threshold, name) in enumerate(RANKS):
        if xp >= threshold:
            current = (threshold, name)
            nxt = RANKS[i + 1][0] if i + 1 < len(RANKS) else None
    return current[1], current[0], nxt
