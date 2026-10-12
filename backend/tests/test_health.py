from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_ok() -> None:
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True}
