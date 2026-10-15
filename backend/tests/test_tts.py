from pathlib import Path

from fastapi.testclient import TestClient

from app import api_tts
from app.main import app


def test_rate_str():
    assert api_tts.rate_str(1.0) == "+0%"
    assert api_tts.rate_str(0.8) == "-20%"
    assert api_tts.rate_str(1.25) == "+25%"


def test_voices_list():
    c = TestClient(app)
    j = c.get("/api/tts/voices").json()
    ids = {v["id"] for v in j["voices"]}
    assert "en-US-AriaNeural" in ids and "en-GB-RyanNeural" in ids
    assert j["defaults"]["en"] in ids


def test_unknown_voice_rejected():
    c = TestClient(app)
    assert c.get("/api/tts", params={"text": "hi", "voice": "x"}).status_code == 400


def test_cache_hit(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("TTS_CACHE_DIR", str(tmp_path))
    calls = []

    async def fake(text, voice, rate, out):
        calls.append(text)
        out.write_bytes(b"ID3fake")

    monkeypatch.setattr(api_tts, "synth", fake)
    c = TestClient(app)
    for _ in range(2):
        r = c.get("/api/tts", params={"text": "Hello", "voice": "en-US-GuyNeural"})
        assert r.status_code == 200 and r.headers["content-type"] == "audio/mpeg"
    assert calls == ["Hello"]


def test_failure_gives_503(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("TTS_CACHE_DIR", str(tmp_path))

    async def boom(*a):
        raise OSError("offline")

    monkeypatch.setattr(api_tts, "synth", boom)
    r = TestClient(app).get("/api/tts", params={"text": "Hi", "voice": "en-US-GuyNeural"})
    assert r.status_code == 503
