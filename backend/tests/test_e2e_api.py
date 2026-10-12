"""API-уровень e2e: регистрация → сессия → доска почёта (критерий фазы 3)."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_register_session_honor_flow() -> None:
    import uuid

    cs = f"E2E-{uuid.uuid4().hex[:8]}"
    reg = client.post("/api/pilots/register", json={"callsign": cs, "pin": "9999", "display_name": cs})
    assert reg.status_code == 200
    client.cookies.set("st_token", reg.cookies["st_token"])

    sess = client.post(
        "/api/sessions",
        json={"chars": 80, "typed": 82, "errors": 2, "elapsed": 20, "cpm": 240, "acc": 97.5},
    )
    assert sess.status_code == 200
    assert sess.json()["pilot_id"] == reg.json()["id"]

    me = client.get("/api/pilots/me").json()
    assert me["callsign"] == cs
    assert me["xp"] > 0

    honor = client.get("/api/pilots/honor").json()
    row = next(h for h in honor if h["callsign"] == cs)
    assert row["sessions"] >= 1
    assert row["best_cpm"] >= 240
    assert row["xp"] == me["xp"]
