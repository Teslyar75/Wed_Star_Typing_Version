from fastapi.testclient import TestClient

from app import api_slideshow as ss
from app.config import settings
from app.main import app


def test_providers_without_key(monkeypatch) -> None:
    monkeypatch.setattr(settings, "unsplash_access_key", "")
    j = TestClient(app).get("/api/slideshow/providers").json()
    assert j["default"] == "wikimedia" and j["unsplash"] is False
    assert "unsplash.com/developers" in j["links"]["unsplash"] and j["paid"]
    assert "key" not in str(j).lower().replace("pexels_note", "")


def test_images_wikimedia_cached(monkeypatch) -> None:
    monkeypatch.setattr(settings, "unsplash_access_key", "")
    ss._clear_cache()
    calls = []

    def fake(cats, per_cat=12):
        calls.append(cats)
        return [{"provider": "wikimedia", "url": "https://upload.wikimedia.org/x.jpg", "author": "A", "license": "CC0"}]

    monkeypatch.setattr(ss, "fetch_wikimedia", fake)
    c = TestClient(app)
    for _ in range(3):
        j = c.get("/api/slideshow/images", params={"skin": "old_england"}).json()
        assert j["provider"] == "wikimedia" and j["items"][0]["url"].startswith("https://")
    assert len(calls) == 1 and "Category:K6 telephone kiosks" in calls[0]


def test_images_unsplash_with_key_and_fallback(monkeypatch) -> None:
    monkeypatch.setattr(settings, "unsplash_access_key", "test-key")
    ss._clear_cache()
    seen = {}

    def fake_u(queries, key, per_q=10):
        seen["key"] = key
        seen["q"] = queries
        return [{"provider": "unsplash", "url": "https://images.unsplash.com/p", "author": "B", "license": "Unsplash License"}]

    monkeypatch.setattr(ss, "fetch_unsplash", fake_u)
    j = TestClient(app).get("/api/slideshow/images", params={"skin": "old_england"}).json()
    assert j["provider"] == "unsplash" and seen["key"] == "test-key" and "routemaster bus" in seen["q"]
    assert "test-key" not in str(j)

    ss._clear_cache()
    monkeypatch.setattr(ss, "fetch_unsplash", lambda *a, **k: [])
    monkeypatch.setattr(ss, "fetch_wikimedia", lambda *a, **k: [{"url": "https://w/x.jpg", "provider": "wikimedia"}])
    j = TestClient(app).get("/api/slideshow/images", params={"skin": "old_england"}).json()
    assert j["provider"] == "wikimedia"


def test_bad_skin() -> None:
    assert TestClient(app).get("/api/slideshow/images", params={"skin": "../etc"}).status_code == 400
