"""Точка входа FastAPI. Фаза 1: тексты / сегменты (docs/web/WEB_PLAN.md)."""

from __future__ import annotations

import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api_texts import router as texts_router
from app.config import settings
from app.db import init_db

_repo = settings.repo_root()
if str(_repo) not in sys.path:
    sys.path.insert(0, str(_repo))


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Star Typing Web", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(texts_router)


@app.get("/api/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.get("/api/meta")
def meta() -> dict[str, str]:
    try:
        from stamina import APP_NAME, __version__

        return {"app": APP_NAME, "desktop_version": __version__, "repo": str(_repo)}
    except ImportError:
        return {"app": "Star Typing Web", "desktop_version": "unknown", "repo": str(_repo)}
