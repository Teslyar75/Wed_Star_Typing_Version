import uuid

from fastapi.testclient import TestClient

from app.db import init_db
from app.main import app
from app.missions_service import generate_mission_text, missions_for, stars_for

init_db()
client = TestClient(app)


def test_stars_for() -> None:
    assert stars_for(90, 200, 100) == 0
    assert stars_for(93, 100, 100) == 1
    assert stars_for(96, 100, 100) == 2
    assert stars_for(99, 130, 100) == 3


def test_generate_mission_text_nonempty() -> None:
    m = missions_for("en")[0]
    text = generate_mission_text(m)
    assert len(text) > 20
    assert all(ch.lower() in set(m["keys"] + " ") or not ch.isalpha() for ch in text)


def test_drills_flow() -> None:
    cs = f"D-{uuid.uuid4().hex[:8]}"
    reg = client.post("/api/pilots/register", json={"callsign": cs, "pin": "2222"})
    assert reg.status_code == 200
    client.cookies.set("st_token", reg.cookies["st_token"])

    drills = client.get("/api/missions/drills", params={"lang": "en"}).json()
    assert drills[0]["unlocked"] is True
    assert drills[1]["unlocked"] is False

    start = client.post(f"/api/missions/drills/{drills[0]['id']}/start")
    assert start.status_code == 200
    assert len(start.json()["text"]) > 10

    done = client.post(
        f"/api/missions/drills/{drills[0]['id']}/complete",
        json={"acc": 99, "cpm": 80, "chars": 100, "key_stats": {"f": [10, 1], "j": [8, 2]}},
    )
    assert done.status_code == 200
    body = done.json()
    assert body["stars"] >= 1
    assert body["passed"] is True

    drills2 = client.get("/api/missions/drills", params={"lang": "en"}).json()
    assert drills2[1]["unlocked"] is True

    keys = client.get("/api/missions/key-errors").json()
    assert any(k["key"] == "j" for k in keys)

    repair = client.post("/api/missions/repair/start", json={"lang": "en"})
    assert repair.status_code == 200
    assert len(repair.json()["text"]) > 10
