from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_missions_list() -> None:
    r = client.get("/api/missions")
    assert r.status_code == 200
    body = r.json()
    assert len(body) >= 3
    assert {"id", "title", "done", "progress", "target"} <= set(body[0].keys())
