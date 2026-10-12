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

    listed = client.get("/api/sessions").json()
    assert any(s["id"] == body["id"] for s in listed)
