import io
import uuid

from fastapi.testclient import TestClient

from app.db import init_db
from app.main import app

init_db()
client = TestClient(app)


def test_avatar_and_export() -> None:
    cs = f"A-{uuid.uuid4().hex[:8]}"
    reg = client.post("/api/pilots/register", json={"callsign": cs, "pin": "7777"})
    assert reg.status_code == 200
    client.cookies.set("st_token", reg.cookies["st_token"])

    # минимальный 1×1 PNG
    png = bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
        "0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082"
    )
    up = client.post(
        "/api/pilots/me/avatar",
        files={"file": ("a.png", io.BytesIO(png), "image/png")},
    )
    assert up.status_code == 200
    assert up.json()["avatar_data"].startswith("data:image/")

    exp = client.get("/api/pilots/me/export")
    assert exp.status_code == 200
    body = exp.json()
    assert body["format"] == "stpilot"
    assert body["callsign"] == cs
    assert body["avatar_data"].startswith("data:image/")
