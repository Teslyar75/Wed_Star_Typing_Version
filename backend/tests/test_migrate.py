"""Старый JSON-импорт /api/migrate: теперь только в вошедшего пилота."""

import uuid

from fastapi.testclient import TestClient

from app.main import app


def _client() -> TestClient:
    return TestClient(app)


def test_migrate_requires_login() -> None:
    c = _client()
    r = c.post("/api/migrate/pilot", json={"callsign": "Nobody", "pin": "1111"})
    assert r.status_code == 401


def test_migrate_cannot_hijack_other_pilot() -> None:
    victim, attacker = _client(), _client()
    vcs = f"V-{uuid.uuid4().hex[:6]}"
    assert victim.post("/api/pilots/register", json={"callsign": vcs, "pin": "4321"}).status_code == 200
    acs = f"A-{uuid.uuid4().hex[:6]}"
    assert attacker.post("/api/pilots/register", json={"callsign": acs}).status_code == 200
    r = attacker.post("/api/migrate/pilot", json={"callsign": vcs, "pin": "0000"})
    assert r.status_code == 403
    assert _client().post("/api/pilots/login", json={"callsign": vcs, "pin": "4321"}).status_code == 200


def test_migrate_into_self() -> None:
    c = _client()
    cs = f"Mig-{uuid.uuid4().hex[:6]}"
    c.post("/api/pilots/register", json={"callsign": cs})
    r = c.post("/api/migrate/pilot", json={"callsign": cs, "xp": 120, "sessions": [
        {"mode": "cargo", "lang": "en", "chars": 40, "typed": 40, "errors": 1, "elapsed": 12, "cpm": 200, "acc": 0.97}]})
    assert r.status_code == 200
    assert r.json()["updated"] is True
    assert r.json()["sessions_imported"] == 1
    assert r.json()["xp"] == 120
