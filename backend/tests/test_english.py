from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_seed_words_and_review() -> None:
    seed = client.post("/api/english/seed?limit=50")
    assert seed.status_code == 200
    assert seed.json()["total"] >= 5

    words = client.get("/api/english/words?limit=10").json()
    assert len(words) >= 3
    wid = words[0]["id"]

    wh = client.get("/api/english/warehouse?limit=5").json()
    assert len(wh) >= 1

    rev = client.post("/api/english/review", json={"word_id": wid, "grade": 3})
    assert rev.status_code == 200
    assert rev.json()["reps"] >= 1
    assert rev.json()["pilot_id"] == 0
