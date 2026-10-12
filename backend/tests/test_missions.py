import uuid

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_missions_list() -> None:
    r = client.get("/api/missions")
    assert r.status_code == 200
    body = r.json()
    assert len(body) >= 3
    assert {"id", "title", "done", "progress", "target", "claimed"} <= set(body[0].keys())


def test_claim_reward_once() -> None:
    cs = f"M-{uuid.uuid4().hex[:8]}"
    reg = client.post("/api/pilots/register", json={"callsign": cs, "pin": "1111"})
    assert reg.status_code == 200
    client.cookies.set("st_token", reg.cookies["st_token"])
    # сессия → миссия m_first
    client.post("/api/sessions", json={"chars": 40, "typed": 40, "errors": 0, "cpm": 160, "acc": 100})
    missions = client.get("/api/missions").json()
    first = next(m for m in missions if m["id"] == "m_first")
    assert first["done"] is True
    claim = client.post("/api/missions/m_first/claim")
    assert claim.status_code == 200
    assert claim.json()["reward_xp"] == 10
    again = client.post("/api/missions/m_first/claim")
    assert again.status_code == 400
