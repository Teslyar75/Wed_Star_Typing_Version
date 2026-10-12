"""Сессии набора — статистика полёта."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class TypingSession(Base):
    __tablename__ = "typing_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pilot_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    text_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("texts.id", ondelete="SET NULL"), nullable=True)
    mode: Mapped[str] = mapped_column(String(32), default="cargo")
    lang: Mapped[str] = mapped_column(String(16), default="en")
    chars: Mapped[int] = mapped_column(Integer, default=0)
    typed: Mapped[int] = mapped_column(Integer, default=0)
    errors: Mapped[int] = mapped_column(Integer, default=0)
    elapsed: Mapped[float] = mapped_column(Float, default=0.0)
    cpm: Mapped[float] = mapped_column(Float, default=0.0)
    acc: Mapped[float] = mapped_column(Float, default=0.0)
    rhythm: Mapped[float] = mapped_column(Float, default=0.0)
    best_streak: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
