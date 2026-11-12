import os
import uuid

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
os.environ["TRANSLATE_OFFLINE"] = "1"


def test_async_translate_queue() -> None:
    cs = f"Tr{uuid.uuid4().hex[:6]}"
    reg = client.post("/api/pilots/register", json={"callsign": cs, "pin": "1212"})
    assert reg.status_code == 200
    client.cookies.set("st_token", reg.cookies["st_token"])
    doc = client.post("/api/texts", json={"title": "t", "lang": "en", "content": "Hello world. Second line."}).json()
    r = client.post(
        "/api/reader/translate",
        json={"text_id": doc["id"], "src_lang": "en", "dst_lang": "ru", "async_mode": True, "limit": 10},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "async"
    assert body["queued"] >= 1

    st = client.get("/api/reader/translate/status").json()
    assert "pending" in st
