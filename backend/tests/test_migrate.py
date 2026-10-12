from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_pilot_migrate_create_and_update() -> None:
    import uuid

    cs = f"Mig-{uuid.uuid4().hex[:8]}"
    r = client.post(
        "/api/migrate/pilot",
        json={
            "callsign": cs,
            "pin": "1111",
            "name": "FromDesktop",
            "xp": 120,
            "skin": "spaceship",
            "sessions": [
                {"mode": "cargo", "lang": "en", "chars": 40, "typed": 40, "errors": 1, "elapsed": 12, "cpm": 200, "acc": 0.97}
            ],
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["updated"] is False
    assert body["sessions_imported"] == 1
    assert body["xp"] == 120

    r2 = client.post(
        "/api/migrate/pilot",
        json={"callsign": cs, "xp": 50, "sessions": []},
    )
    assert r2.status_code == 200
    assert r2.json()["updated"] is True
    assert r2.json()["xp"] == 120  # max


def test_migrate_bundle() -> None:
    import uuid

    cs = f"Bundle-{uuid.uuid4().hex[:8]}"
    r = client.post(
        "/api/migrate/bundle",
        json={"pilots": [{"callsign": cs, "name": "B", "xp": 10, "sessions": []}]},
    )
    assert r.status_code == 200
    assert r.json()["imported"] == 1
