"""Точка входа FastAPI. Логику из stamina/ подключаем по мере фаз (см. docs/web/WEB_PLAN.md)."""

from __future__ import annotations

import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings

_repo = settings.repo_root()
if str(_repo) not in sys.path:
    sys.path.insert(0, str(_repo))

app = FastAPI(title="Star Typing Web", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.get("/api/meta")
def meta() -> dict[str, str]:
    """Проверка связи с монорепо (пакет stamina)."""
    try:
        from stamina import APP_NAME, __version__  # noqa: WPS433

        return {"app": APP_NAME, "desktop_version": __version__, "repo": str(_repo)}
    except ImportError:
        return {"app": "Star Typing Web", "desktop_version": "unknown", "repo": str(_repo)}
