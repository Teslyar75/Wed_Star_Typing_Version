from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_speedread_save_and_list() -> None:
    r = client.post("/api/speedread/results", json={"mode": "rsvp", "wpm": 320, "words": 12, "elapsed": 2.2, "score": 320})
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "rsvp"
    listed = client.get("/api/speedread/results").json()
    assert any(x["id"] == body["id"] for x in listed)
