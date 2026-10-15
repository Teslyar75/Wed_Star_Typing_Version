"""Star Typing Web API."""

from __future__ import annotations

import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api_catalog import router as catalog_router
from app.api_english import router as english_router
from app.api_library import router as library_router
from app.api_migrate import router as migrate_router
from app.api_missions import router as missions_router
from app.api_pilots import router as pilots_router
from app.api_lounge import router as lounge_router
from app.api_radio import router as radio_router
from app.api_reader import router as reader_router
from app.api_sessions import router as sessions_router
from app.api_speedread import router as speedread_router
from app.api_texts import router as texts_router
from app.api_tts import router as tts_router
from app.config import settings
from app.db import init_db

_repo = settings.repo_root()
if str(_repo) not in sys.path:
    sys.path.insert(0, str(_repo))


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    from app.translate_jobs import ensure_worker

    ensure_worker()
    yield


app = FastAPI(title="Star Typing Web", version="0.9.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost",
        "http://127.0.0.1",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(texts_router)
app.include_router(library_router)
app.include_router(catalog_router)
app.include_router(sessions_router)
app.include_router(pilots_router)
app.include_router(reader_router)
app.include_router(english_router)
app.include_router(speedread_router)
app.include_router(missions_router)
app.include_router(migrate_router)
app.include_router(radio_router)
app.include_router(lounge_router)
app.include_router(tts_router)


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
