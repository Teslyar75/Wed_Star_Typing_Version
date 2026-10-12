import uuid

from fastapi.testclient import TestClient

from app.db import init_db
from app.main import app

init_db()
client = TestClient(app)


def test_results_mode_filter() -> None:
    cs = f"S-{uuid.uuid4().hex[:8]}"
    reg = client.post("/api/pilots/register", json={"callsign": cs, "pin": "6666"})
    client.cookies.set("st_token", reg.cookies["st_token"])
    client.post("/api/speedread/results", json={"mode": "tachi", "wpm": 400, "words": 10, "elapsed": 2, "score": 400})
    client.post("/api/speedread/results", json={"mode": "epyr", "wpm": 200, "words": 7, "elapsed": 3, "score": 7})
    only = client.get("/api/speedread/results", params={"mode": "tachi"}).json()
    assert only and all(r["mode"] == "tachi" for r in only)
