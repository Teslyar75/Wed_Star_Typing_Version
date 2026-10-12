from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_seed_words_and_review() -> None:
    seed = client.post("/api/english/seed")
    assert seed.status_code == 200

    words = client.get("/api/english/words").json()
    assert len(words) >= 3
    wid = words[0]["id"]

    rev = client.post("/api/english/review", json={"word_id": wid, "grade": 3, "pilot_id": 1})
    assert rev.status_code == 200
    assert rev.json()["reps"] >= 1
