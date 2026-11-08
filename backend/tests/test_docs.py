import uuid

from fastapi.testclient import TestClient

from app.db import init_db
from app.main import app

init_db()


def _pilot(pin: str = "4242") -> TestClient:
    c = TestClient(app)
    cs = f"Doc-{uuid.uuid4().hex[:8]}"
    r = c.post("/api/pilots/register", json={"callsign": cs, "pin": pin})
    assert r.status_code == 200
    c.cookies.set("st_token", r.cookies["st_token"])
    return c


def test_docs_require_login() -> None:
    c = TestClient(app)
    assert c.get("/api/docs").status_code == 401
    assert c.post("/api/docs", json={"title": "x"}).status_code == 401


def test_docs_crud_and_autosave_rev() -> None:
    a = _pilot()
    created = a.post("/api/docs", json={"title": "Журнал", "body": "раз два три", "pilot_id": 999}).json()
    assert created["title"] == "Журнал"
    assert created["words"] == 3
    assert created["rev"] == 1
    doc_id = created["id"]

    listed = a.get("/api/docs").json()["items"]
    assert listed[0]["id"] == doc_id

    saved = a.put(f"/api/docs/{doc_id}", json={"title": "Журнал", "body": "раз два три четыре", "rev": 1}).json()
    assert saved["rev"] == 2
    assert saved["words"] == 4

    got = a.get(f"/api/docs/{doc_id}").json()
    assert got["body"].endswith("четыре")
    assert got["rev"] == 2


def test_docs_conflict_stale_rev() -> None:
    a = _pilot()
    doc = a.post("/api/docs", json={"title": "A", "body": "one"}).json()
    a.put(f"/api/docs/{doc['id']}", json={"title": "A", "body": "two", "rev": 1})
    stale = a.put(f"/api/docs/{doc['id']}", json={"title": "A", "body": "lost", "rev": 1})
    assert stale.status_code == 409
    detail = stale.json()["detail"]
    assert detail["code"] == "conflict"
    assert detail["doc"]["body"] == "two"
    assert "lost" not in a.get(f"/api/docs/{doc['id']}").json()["body"]


def test_docs_isolated_by_cookie_pilot() -> None:
    a = _pilot()
    b = _pilot()
    doc = a.post("/api/docs", json={"title": "secret", "body": "only A"}).json()
    assert b.get("/api/docs").json()["items"] == []
    assert b.get(f"/api/docs/{doc['id']}").status_code == 404
    assert (
        b.put(
            f"/api/docs/{doc['id']}",
            json={"title": "hack", "body": "stolen", "rev": 1, "pilot_id": doc["id"]},
        ).status_code
        == 404
    )
    assert a.get(f"/api/docs/{doc['id']}").json()["body"] == "only A"


def test_docs_versions_snapshot_and_restore() -> None:
    a = _pilot()
    doc = a.post("/api/docs", json={"title": "v", "body": "alpha"}).json()
    a.put(f"/api/docs/{doc['id']}", json={"title": "v", "body": "beta", "rev": 1})
    vers = a.get(f"/api/docs/{doc['id']}/versions").json()["items"]
    assert vers
    assert vers[0]["title"] == "v"
    vid = vers[0]["id"]
    restored = a.post(f"/api/docs/{doc['id']}/restore", json={"version_id": vid}).json()
    assert restored["body"] == "alpha"
    assert restored["rev"] >= 3
    foreign = _pilot()
    assert foreign.get(f"/api/docs/{doc['id']}/versions").status_code == 404
    assert foreign.post(f"/api/docs/{doc['id']}/restore", json={"version_id": vid}).status_code == 404
