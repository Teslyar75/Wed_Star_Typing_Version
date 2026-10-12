import uuid

from fastapi.testclient import TestClient

from app.db import init_db
from app.main import app

init_db()
client = TestClient(app)


def test_english_log_after_review() -> None:
    cs = f"EL-{uuid.uuid4().hex[:8]}"
    reg = client.post("/api/pilots/register", json={"callsign": cs, "pin": "1212"})
    client.cookies.set("st_token", reg.cookies["st_token"])
    client.post("/api/english/seed", params={"limit": 50})
    words = client.get("/api/english/warehouse", params={"bin": "inbox", "limit": 5}).json()
    assert words
    wid = words[0]["id"]
    assert client.post("/api/english/review", json={"word_id": wid, "grade": 3}).status_code == 200
    log = client.get("/api/english/log").json()
    assert any(r["word_id"] == wid for r in log)
    prog = client.get("/api/english/progress").json()
    assert "streak_days" in prog
