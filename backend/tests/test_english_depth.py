"""Глубина EN: sets, lookup, warehouse shelf, missions, lists, journal."""

from __future__ import annotations

import os
import uuid

os.environ["DATABASE_URL"] = "sqlite:///./test_english_depth.db"

from fastapi.testclient import TestClient

from app.db import Base, engine, init_db
from app.main import app

Base.metadata.drop_all(bind=engine)
init_db()
client = TestClient(app)


def test_sets_lookup_mission_lists() -> None:
    seed = client.post("/api/english/seed?limit=80&batch=80")
    assert seed.status_code == 200
    assert seed.json()["total"] >= 5

    sets = client.get("/api/english/sets").json()
    assert any(s["code"] == "S-1000" for s in sets)
    assert any(s["code"] == "S-DEV" for s in sets)

    words = client.get("/api/english/words?limit=5").json()
    w = words[0]["word"]
    hit = client.get(f"/api/english/lookup?q={w}")
    assert hit.status_code == 200
    assert hit.json()["word"].lower() == w.lower()

    known = client.post("/api/english/known", json={"word_id": words[0]["id"], "known": True})
    assert known.status_code == 200

    mission = client.post(
        "/api/english/missions/start",
        json={"mode": "questions", "set_id": "top-1000", "length": 5, "source": "set"},
    )
    assert mission.status_code == 200
    assert len(mission.json()["tasks"]) >= 1

    lists = client.get("/api/english/lists").json()
    assert any(x["kind"] == "favorite" for x in lists)
    fav = next(x for x in lists if x["kind"] == "favorite")
    add = client.post(f"/api/english/lists/{fav['id']}/words", json={"word_id": words[0]["id"]})
    assert add.status_code == 200

    journal = client.get("/api/english/journal").json()
    assert "badges" in journal
    assert "weeks" in journal

    settings = client.put("/api/english/settings", json={"mission_len": 5, "warehouse_passes": 1})
    assert settings.status_code == 200
    assert settings.json()["mission_len"] == 5


def test_set_page_limit_in_sql() -> None:
    """Страница набора режется в SQL: ответ короче полного фильтра, порядок по rank."""
    import json

    from sqlalchemy import event

    from app.api_english import VocabWord
    from app.db import SessionLocal, engine

    prefix = f"zzp{uuid.uuid4().hex[:6]}"
    db = SessionLocal()
    try:
        for i in range(12):
            db.add(
                VocabWord(
                    word=f"{prefix}{i:02d}w",
                    translation="t",
                    slug=f"{prefix}-{i}",
                    rank=i + 1,
                    meta=json.dumps({"pos": "noun", "difficulty": "easy"}),
                )
            )
        db.commit()
    finally:
        db.close()

    seen: list[str] = []

    def catch(_conn, _cursor, statement, _params, _context, _executemany) -> None:
        if "vocab_words" in statement.lower():
            seen.append(statement)

    event.listen(engine, "before_cursor_execute", catch)
    try:
        res = client.get(
            f"/api/english/set/top-1000?q={prefix}&limit=2&offset=0&sort=freq&length=all&status=all"
        )
    finally:
        event.remove(engine, "before_cursor_execute", catch)

    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 12
    assert [item["word"] for item in body["items"]] == [f"{prefix}00w", f"{prefix}01w"]
    assert any("LIMIT" in statement.upper() for statement in seen)

    page2 = client.get(
        f"/api/english/set/top-1000?q={prefix}&limit=2&offset=2&sort=freq"
    )
    assert [item["word"] for item in page2.json()["items"]] == [f"{prefix}02w", f"{prefix}03w"]

    short = client.get(
        f"/api/english/set/top-1000?q={prefix}&limit=20&sort=alpha&length=short"
    )
    assert short.json()["total"] == 0


def test_warehouse_run_flow() -> None:
    cs = f"W-{uuid.uuid4().hex[:8]}"
    reg = client.post("/api/pilots/register", json={"callsign": cs, "pin": "1234"})
    assert reg.status_code == 200
    client.cookies.set("st_token", reg.cookies["st_token"])

    client.post("/api/english/seed?limit=40&batch=40")
    words = client.get("/api/english/words?limit=3").json()
    wid = words[0]["id"]
    assert client.post("/api/english/known", json={"word_id": wid, "known": True}).status_code == 200
    assert client.post("/api/english/warehouse/move", json={"word_id": wid, "state": "shelf"}).status_code == 200

    shelf = client.get("/api/english/warehouse/cards?state=shelf").json()
    # может быть пусто если у слова нет example/sentences в seed — тогда forced move всё равно ok
    run = client.post("/api/english/warehouse/run", json={"word_id": wid, "avg": 90, "goal": 1})
    assert run.status_code == 200
    body = run.json()
    assert body["accepted"] is True
    assert body["done"] is True
