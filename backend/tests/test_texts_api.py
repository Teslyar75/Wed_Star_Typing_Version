"""API текстов / сегментов."""

from __future__ import annotations

import os

# изолированная БД для тестов
os.environ["DATABASE_URL"] = "sqlite:///./test_star_typing.db"

from fastapi.testclient import TestClient

from app.db import Base, engine, init_db
from app.main import app

Base.metadata.drop_all(bind=engine)
init_db()
client = TestClient(app)


def test_health() -> None:
    assert client.get("/api/health").json() == {"ok": True}


def test_create_and_list_segments() -> None:
    r = client.post(
        "/api/texts",
        json={"title": "Demo", "lang": "en", "content": "Hello world. Second sentence.\n\nNew para!"},
    )
    assert r.status_code == 200, r.text
    tid = r.json()["id"]
    segs = client.get(f"/api/texts/{tid}/segments").json()
    assert len(segs) >= 3
    assert segs[0]["original"]
    assert segs[0]["status"] == "aligned"


def test_bilingual_align() -> None:
    r = client.post(
        "/api/texts/bilingual",
        json={
            "title": "Pair",
            "lang_src": "en",
            "lang_tgt": "ru",
            "original": "The cat sat. The dog ran.",
            "translation": "Кошка села. Собака бежала.",
        },
    )
    assert r.status_code == 200, r.text
    tid = r.json()["id"]
    segs = client.get(f"/api/texts/{tid}/segments").json()
    aligned = [s for s in segs if s["status"] == "aligned" and s["translation"]]
    assert len(aligned) / max(len(segs), 1) >= 0.9
