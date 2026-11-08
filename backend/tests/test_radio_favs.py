import uuid

from fastapi.testclient import TestClient

from app.db import init_db
from app.main import app

init_db()


def _pilot() -> TestClient:
    c = TestClient(app)
    cs = f"Rx-{uuid.uuid4().hex[:8]}"
    r = c.post("/api/pilots/register", json={"callsign": cs, "pin": "4242"})
    assert r.status_code == 200
    c.cookies.set("st_token", r.cookies["st_token"])
    return c


def test_radio_favs_isolated_by_cookie() -> None:
    a = _pilot()
    b = _pilot()
    body = [
        {
            "stationuuid": "u-a",
            "name": "Secret A",
            "url_resolved": "https://a.example/stream",
            "pilot_id": 999,
        }
    ]
    assert a.put("/api/radio/favs", json=body).status_code == 200
    listed_a = a.get("/api/radio/favs").json()
    assert listed_a[0]["name"] == "Secret A"
    assert "pilot_id" not in listed_a[0]
    assert b.get("/api/radio/favs").json() == []
    steal = b.put(
        "/api/radio/favs",
        json=[{"stationuuid": "u-a", "name": "hack", "url_resolved": "https://b.example/x"}],
    )
    assert steal.status_code == 200
    assert b.get("/api/radio/favs").json()[0]["name"] == "hack"
    assert a.get("/api/radio/favs").json()[0]["name"] == "Secret A"


def test_radio_favs_put_requires_login() -> None:
    c = TestClient(app)
    r = c.put(
        "/api/radio/favs",
        json=[{"stationuuid": "x", "name": "x", "url_resolved": "https://x.example/s"}],
    )
    assert r.status_code == 401
