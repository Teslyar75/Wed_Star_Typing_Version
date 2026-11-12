import uuid

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app

ADMIN_TOKEN = "test-orion-admin-token"


def _client() -> TestClient:
    return TestClient(app)


def _register(client: TestClient, pin: str = "4242", prefix: str = "Anon") -> tuple[int, str]:
    cs = f"{prefix}-{uuid.uuid4().hex[:8]}"
    r = client.post("/api/pilots/register", json={"callsign": cs, "pin": pin})
    assert r.status_code == 200, r.text
    return int(r.json()["id"]), cs


def test_anon_cannot_delete_guest() -> None:
    owner = _client()
    g = owner.post("/api/pilots/guest")
    assert g.status_code == 200
    gid = int(g.json()["id"])

    anon = _client()
    r = anon.delete(f"/api/pilots/{gid}")
    assert r.status_code == 403


def test_anon_cannot_delete_pilot() -> None:
    owner = _client()
    pid, _cs = _register(owner)

    anon = _client()
    r = anon.delete(f"/api/pilots/{pid}")
    assert r.status_code == 403


def test_self_delete_ok_and_cookie_cleared() -> None:
    client = _client()
    pid, _cs = _register(client)
    assert client.cookies.get("st_token")

    r = client.delete(f"/api/pilots/{pid}")
    assert r.status_code == 200
    assert r.json()["ok"] is True
    assert not client.cookies.get("st_token")
    assert client.get("/api/pilots/me").json() is None


def test_other_pilot_cannot_delete() -> None:
    owner = _client()
    pid, _cs = _register(owner, prefix="Owner")

    stranger = _client()
    _register(stranger, prefix="Strn")
    r = stranger.delete(f"/api/pilots/{pid}")
    assert r.status_code == 403


def test_admin_header_deletes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "orion_admin_token", ADMIN_TOKEN)
    owner = _client()
    pid, _cs = _register(owner)

    admin = _client()
    r = admin.delete(f"/api/pilots/{pid}", headers={"X-Orion-Admin": ADMIN_TOKEN})
    assert r.status_code == 200

    wrong = admin.delete(f"/api/pilots/{pid}", headers={"X-Orion-Admin": "wrong"})
    assert wrong.status_code == 404


def test_updates_apply_requires_login() -> None:
    r = _client().post("/api/updates/apply")
    assert r.status_code == 401
