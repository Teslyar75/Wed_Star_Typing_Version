from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_register_login_honor() -> None:
    import uuid

    cs = f"Cadet-{uuid.uuid4().hex[:8]}"
    reg = client.post("/api/pilots/register", json={"callsign": cs, "pin": "4242", "display_name": "Alpha"})
    assert reg.status_code == 200
    assert reg.json()["callsign"] == cs
    assert "st_token" in reg.cookies

    bad = client.post("/api/pilots/login", json={"callsign": cs, "pin": "0000"})
    assert bad.status_code == 401

    ok = client.post("/api/pilots/login", json={"callsign": cs, "pin": "4242"})
    assert ok.status_code == 200
    assert "st_token" in ok.cookies
    client.cookies.set("st_token", ok.cookies["st_token"])

    me = client.get("/api/pilots/me")
    assert me.status_code == 200
    assert me.json() is not None
    assert me.json()["callsign"] == cs

    # XP>0 — иначе при >50 пилотах с нулём доска (limit 50) может не включить новичка.
    sess = client.post(
        "/api/sessions",
        json={"chars": 40, "typed": 40, "errors": 0, "elapsed": 10, "cpm": 200, "acc": 100.0},
    )
    assert sess.status_code == 200
    assert client.get("/api/pilots/me").json()["xp"] > 0

    honor = client.get("/api/pilots/honor").json()
    assert any(h["callsign"] == cs for h in honor)
