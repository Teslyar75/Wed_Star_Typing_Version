import uuid

from fastapi.testclient import TestClient

from app.db import init_db
from app.main import app

init_db()
client = TestClient(app)


def test_bins_from_book_progress() -> None:
    cs = f"E-{uuid.uuid4().hex[:8]}"
    reg = client.post("/api/pilots/register", json={"callsign": cs, "pin": "5555"})
    client.cookies.set("st_token", reg.cookies["st_token"])

    doc = client.post(
        "/api/texts/bilingual",
        json={
            "title": "Tiny EN",
            "lang_src": "en",
            "lang_tgt": "ru",
            "original": "Hello brave world. Learn English today.",
            "translation": "Привет смелый мир. Учи английский сегодня.",
        },
    )
    assert doc.status_code == 200
    tid = doc.json()["id"]

    fb = client.post(
        "/api/english/from-book",
        json={"text_id": tid, "up_to_sentence_id": 10, "limit": 8},
    )
    assert fb.status_code == 200
    assert fb.json()["cards"] >= 1

    inbox = client.get("/api/english/warehouse", params={"bin": "inbox", "limit": 20}).json()
    assert len(inbox) >= 1
    wid = inbox[0]["id"]

    mv = client.post("/api/english/move", json={"word_id": wid, "bin": "favorite"})
    assert mv.status_code == 200
    fav = client.get("/api/english/warehouse", params={"bin": "favorite"}).json()
    assert any(w["id"] == wid for w in fav)

    client.post("/api/english/review", json={"word_id": wid, "grade": 4})
    prog = client.get("/api/english/progress").json()
    assert prog["xp"] >= 1
    assert "rank" in prog
