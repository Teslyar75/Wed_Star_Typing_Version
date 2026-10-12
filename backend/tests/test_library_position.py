import uuid

from fastapi.testclient import TestClient

from app.db import init_db
from app.main import app

init_db()
client = TestClient(app)


def test_shelf_and_position() -> None:
    cs = f"L-{uuid.uuid4().hex[:8]}"
    reg = client.post("/api/pilots/register", json={"callsign": cs, "pin": "3333"})
    assert reg.status_code == 200
    client.cookies.set("st_token", reg.cookies["st_token"])

    doc = client.post("/api/texts", json={"title": "Shelf tale", "lang": "en", "content": "Hello. World."}).json()
    add = client.post("/api/library/shelf", json={"text_id": doc["id"]})
    assert add.status_code == 200

    pos = client.put(f"/api/library/{doc['id']}/position", json={"sentence_id": 1, "mode": "bridge"})
    assert pos.status_code == 200
    assert pos.json()["sentence_id"] == 1
    assert pos.json()["mode"] == "bridge"

    shelf = client.get("/api/library").json()
    assert any(x["text_id"] == doc["id"] and x["sentence_id"] == 1 for x in shelf)

    got = client.get(f"/api/library/{doc['id']}/position").json()
    assert got["sentence_id"] == 1
