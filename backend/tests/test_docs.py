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


def test_docs_templates() -> None:
    a = _pilot()
    r = a.get("/api/docs/templates?lang=ru")
    assert r.status_code == 200
    ids = {x["id"] for x in r.json()["items"]}
    assert ids == {"meeting", "todo", "book", "diary", "table"}


def test_docs_trash_restore_purge() -> None:
    a = _pilot()
    doc = a.post("/api/docs", json={"title": "gone", "body": "x"}).json()
    assert a.delete(f"/api/docs/{doc['id']}").status_code == 200
    assert a.get("/api/docs").json()["items"] == []
    trash = a.get("/api/docs?trash=true").json()["items"]
    assert trash[0]["id"] == doc["id"]
    assert a.get(f"/api/docs/{doc['id']}").status_code == 404
    restored = a.post(f"/api/docs/{doc['id']}/restore-trash").json()
    assert restored["deleted_at"] is None
    assert a.get("/api/docs").json()["items"][0]["id"] == doc["id"]
    a.delete(f"/api/docs/{doc['id']}")
    assert a.delete(f"/api/docs/{doc['id']}/purge").status_code == 200
    assert a.get("/api/docs?trash=true").json()["items"] == []


def test_docs_sort_and_search() -> None:
    a = _pilot()
    a.post("/api/docs", json={"title": "Alpha", "body": "cat dog"})
    a.post("/api/docs", json={"title": "Beta", "body": "bird"})
    titles = [x["title"] for x in a.get("/api/docs?sort=title").json()["items"]]
    assert titles == sorted(titles, key=str.casefold)
    found = a.get("/api/docs?q=cat").json()["items"]
    assert len(found) == 1
    assert found[0]["title"] == "Alpha"


def test_docs_export_and_import(tmp_path=None) -> None:
    a = _pilot()
    doc = a.post("/api/docs", json={"title": "Expo", "body": "## Hi\n\n**bold**"}).json()
    for fmt in ("txt", "md", "html", "docx", "stdoc", "pdf"):
        r = a.get(f"/api/docs/{doc['id']}/export?fmt={fmt}")
        assert r.status_code == 200, fmt
        assert len(r.content) > 0
    md = a.get(f"/api/docs/{doc['id']}/export?fmt=md").content
    up = a.post("/api/docs/import", files={"file": ("note.md", md, "text/markdown")})
    assert up.status_code == 200
    assert up.json()["title"] == "Expo"
    foreign = _pilot()
    assert foreign.get(f"/api/docs/{doc['id']}/export?fmt=md").status_code == 404
