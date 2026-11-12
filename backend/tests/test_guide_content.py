"""Порт desktop guide_content: counts, lazy categories, remember(kind)."""

from __future__ import annotations

import json
import uuid
from pathlib import Path

from fastapi.testclient import TestClient

from app import guide_content as gc
from app.db import init_db
from app.main import app

init_db()

DESKTOP_COUNTS = {
    "jokes": 60,
    "facts": 60,
    "intros_joke": 24,
    "intros_fact": 16,
    "intros_any": 10,
    "system": 3,
}


def test_parity_counts_match_desktop_ru() -> None:
    assert gc.meta("ru")["counts"] == DESKTOP_COUNTS
    for lang in gc.LANGS:
        assert gc.meta(lang)["counts"] == DESKTOP_COUNTS


def test_lazy_categories() -> None:
    jokes = gc.category("ru", "jokes")
    assert len(jokes["items"]) == 60
    assert jokes["items"][0]["id"] == "joke_001"
    facts = gc.category("en", "facts")
    assert len(facts["items"]) == 60
    assert facts["items"][0]["id"] == "fact_001"
    intros = gc.category("uk", "intros")
    assert len(intros["intros"]["joke"]) == 24


def test_ru_texts_match_bundled_file() -> None:
    path = Path(__file__).resolve().parents[1] / "app" / "data" / "guide_content" / "ru.json"
    disk = json.loads(path.read_text(encoding="utf-8"))
    full = gc.load_full("ru")
    assert [x["text"] for x in disk["jokes"]] == [x["text"] for x in full["jokes"]]
    assert [x["text"] for x in disk["facts"]] == [x["text"] for x in full["facts"]]


def test_api_guide_and_remember() -> None:
    c = TestClient(app)
    meta = c.get("/api/guide/content?lang=ru").json()
    assert meta["counts"]["jokes"] == 60
    assert meta["parity"]["ru"]["facts"] == 60
    cat = c.get("/api/guide/content/jokes?lang=de").json()
    assert len(cat["items"]) == 60

    cs = f"GJ-{uuid.uuid4().hex[:6]}"
    r = c.post("/api/pilots/register", json={"callsign": cs, "pin": "4321"})
    c.cookies.set("st_token", r.cookies["st_token"])
    joke = cat["items"][0]
    saved = c.post(
        "/api/orion/remember",
        json={"role": "orion", "text": joke["text"], "kind": "joke", "clip_id": joke["id"]},
    ).json()
    assert saved["kind"] == "joke" and saved["clip_id"] == joke["id"]
    assert joke["text"][:40] in saved["text"]

    fact = c.get("/api/guide/content/facts?lang=ru").json()["items"][0]
    saved2 = c.post(
        "/api/orion/remember",
        json={"role": "orion", "text": fact["text"], "kind": "fact", "clip_id": fact["id"]},
    ).json()
    assert saved2["kind"] == "fact"

    msgs = c.get("/api/orion/messages").json()["items"]
    kinds = {m["kind"] for m in msgs}
    assert "joke" in kinds and "fact" in kinds

    # ambient не уходит в LLM-историю: шлём chat в guide и проверяем, что ответ гида не цитирует шутку
    chat = c.post("/api/orion/chat", json={"text": "где радио?"}).json()
    assert chat["mode_used"] == "guide"
    assert joke["text"][:20] not in chat["reply"]
