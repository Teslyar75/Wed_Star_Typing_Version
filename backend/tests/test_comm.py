"""Эфир: два изолированных тестовых пилота, не продакшен-аккаунты."""

import uuid

from fastapi.testclient import TestClient

from app.db import init_db
from app.main import app

init_db()


def _pilot(tag: str) -> tuple[TestClient, str]:
    c = TestClient(app)
    cs = f"{tag}{uuid.uuid4().hex[:6]}"
    r = c.post("/api/pilots/register", json={"callsign": cs, "pin": "4242"})
    assert r.status_code == 200
    c.cookies.set("st_token", r.cookies["st_token"])
    return c, cs


def test_comm_requires_login() -> None:
    c = TestClient(app)
    assert c.get("/api/comm").status_code == 401
    assert c.post("/api/comm", json={"text": "hi"}).status_code == 401


def test_two_pilots_send_receive_reply() -> None:
    a, cs_a = _pilot("Ca")
    b, cs_b = _pilot("Cb")
    ping_text = f"ping-{uuid.uuid4().hex[:8]}"
    pong_text = f"pong-{uuid.uuid4().hex[:8]}"
    ping = a.post("/api/comm", json={"text": ping_text, "author": "Сергей", "pilot_id": 1, "callsign": "Fake"})
    assert ping.status_code == 200
    body = ping.json()
    assert body["text"] == ping_text
    assert body["mine"] is True
    assert body["callsign"] == cs_a
    assert body["callsign"] != "Fake"

    feed_b = b.get("/api/comm").json()
    texts = [m["text"] for m in feed_b["items"]]
    assert ping_text in texts
    assert feed_b["unread"] >= 1
    theirs = next(m for m in feed_b["items"] if m["text"] == ping_text)
    assert theirs["mine"] is False
    assert theirs["callsign"] == cs_a

    pong = b.post("/api/comm", json={"text": pong_text})
    assert pong.status_code == 200
    assert pong.json()["mine"] is True

    feed_a = a.get("/api/comm").json()
    texts_a = [m["text"] for m in feed_a["items"]]
    assert ping_text in texts_a
    assert pong_text in texts_a
    reply = next(m for m in feed_a["items"] if m["text"] == pong_text)
    assert reply["mine"] is False
    assert reply["callsign"] == cs_b
    assert feed_a["unread"] >= 1

    assert a.post("/api/comm/read").json()["unread"] == 0
    assert a.get("/api/comm/unread").json()["unread"] == 0


def test_empty_and_trim() -> None:
    a, _ = _pilot("Ce")
    assert a.post("/api/comm", json={"text": "   "}).status_code == 400
    long = "я" * 600
    r = a.post("/api/comm", json={"text": long})
    assert r.status_code == 200
    assert len(r.json()["text"]) == 500


def test_comm_image_attachment_and_legacy_text() -> None:
    a, _ = _pilot("Ci")
    # text-only по-прежнему ок; images по умолчанию []
    r0 = a.post("/api/comm", json={"text": "plain-only"})
    assert r0.status_code == 200
    assert r0.json()["images"] == []

    tiny = (
        "data:image/png;base64,"
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )
    r = a.post("/api/comm", json={"text": "", "images": [tiny]})
    assert r.status_code == 200
    body = r.json()
    assert body["text"] == ""
    assert len(body["images"]) == 1
    assert body["images"][0].startswith("data:image/png;base64,")

    feed = a.get("/api/comm").json()
    assert "limits" in feed
    assert feed["limits"]["max_images"] == 3
    got = next(m for m in feed["items"] if m["id"] == body["id"])
    assert got["images"]
    # старые текстовые сообщения на месте
    assert any(m["text"] == "plain-only" for m in feed["items"])
