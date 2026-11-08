import os

from fastapi.testclient import TestClient

from app.db import SessionLocal
from app.main import app
from app.translate_cache import cache_get, cache_put, stub_translate, uplink_translate

client = TestClient(app)


def test_stub_prefix() -> None:
    assert stub_translate("hello", "en", "ru").startswith("[ru] ")


def test_uplink_offline_env(monkeypatch) -> None:
    monkeypatch.setenv("TRANSLATE_OFFLINE", "1")
    assert uplink_translate("hello world", "en", "ru") == "[ru] hello world"


def test_same_lang_passthrough(monkeypatch) -> None:
    monkeypatch.delenv("TRANSLATE_OFFLINE", raising=False)
    assert uplink_translate("same", "en", "en") == "same"


def test_cache_put_same_digest_twice() -> None:
    _ = client
    db = SessionLocal()
    try:
        cache_put(db, "s0-hello", "en", "ru", "а")
        cache_put(db, "s0-hello", "en", "ru", "б")
        assert cache_get(db, "s0-hello", "en", "ru") == "б"
    finally:
        db.close()
