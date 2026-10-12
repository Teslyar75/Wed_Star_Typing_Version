from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_save_and_list_session() -> None:
    r = client.post(
        "/api/sessions",
        json={"chars": 40, "typed": 42, "errors": 2, "elapsed": 12.5, "cpm": 192, "acc": 95.2},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["chars"] == 40
    assert body["id"] > 0
    assert body["pilot_id"] is None

    listed = client.get("/api/sessions").json()
    assert any(s["id"] == body["id"] for s in listed)


def test_pilots_cannot_see_each_other_sessions() -> None:
    a = client.post("/api/pilots/register", json={"callsign": "IsoAlpha", "pin": "1111"})
    assert a.status_code == 200
    client.cookies.set("st_token", a.cookies["st_token"])
    sa = client.post("/api/sessions", json={"chars": 50, "typed": 50, "errors": 0, "cpm": 180, "acc": 100})
    assert sa.status_code == 200
    assert sa.json()["pilot_id"] == a.json()["id"]
    me_a = client.get("/api/pilots/me").json()
    assert me_a["xp"] > 0

    b = client.post("/api/pilots/register", json={"callsign": "IsoBeta", "pin": "2222"})
    assert b.status_code == 200
    client.cookies.set("st_token", b.cookies["st_token"])
    sb = client.post("/api/sessions", json={"chars": 30, "typed": 30, "errors": 0, "cpm": 120, "acc": 90})
    assert sb.status_code == 200

    listed_b = client.get("/api/sessions").json()
    ids_b = {s["id"] for s in listed_b}
    assert sb.json()["id"] in ids_b
    assert sa.json()["id"] not in ids_b

    client.cookies.set("st_token", a.cookies["st_token"])
    listed_a = client.get("/api/sessions").json()
    ids_a = {s["id"] for s in listed_a}
    assert sa.json()["id"] in ids_a
    assert sb.json()["id"] not in ids_a
