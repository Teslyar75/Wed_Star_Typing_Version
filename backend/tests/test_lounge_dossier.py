import uuid

from fastapi.testclient import TestClient

from app.db import init_db
from app.main import app

init_db()
client = TestClient(app)


def test_lounge_scores() -> None:
    r = client.post("/api/lounge/scores", json={"game": "tetris", "score": 120})
    assert r.status_code == 200
    top = client.get("/api/lounge/scores", params={"game": "tetris"}).json()
    assert any(x["score"] == 120 for x in top)


def test_dossier_and_guest() -> None:
    cs = f"DS-{uuid.uuid4().hex[:6]}"
    reg = client.post("/api/pilots/register", json={"callsign": cs, "pin": "9999"})
    client.cookies.set("st_token", reg.cookies["st_token"])
    d = client.get("/api/pilots/dossier")
    assert d.status_code == 200
    assert "sessions" in d.json()
    g = client.post("/api/pilots/guest")
    assert g.status_code == 200
    assert g.json()["is_guest"] is True


def test_radio_favs_empty_guest() -> None:
    assert client.get("/api/radio/favs").status_code == 200
