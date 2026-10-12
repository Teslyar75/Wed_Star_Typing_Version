from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.db import init_db
from app.main import app

init_db()
client = TestClient(app)


def test_catalog_search_mocked() -> None:
    fake = {
        "count": 1,
        "results": [
            {
                "id": 11,
                "title": "Alice",
                "authors": [{"name": "Carroll, Lewis"}],
                "languages": ["en"],
                "formats": {"text/plain; charset=utf-8": "https://example.com/alice.txt"},
            }
        ],
    }
    with patch("app.api_catalog._get_json", return_value=fake):
        r = client.get("/api/catalog/gutenberg/search", params={"q": "alice"})
    assert r.status_code == 200
    body = r.json()
    assert body["results"][0]["id"] == 11
    assert body["results"][0]["title"] == "Alice"
    assert body["results"][0]["text_url"]


def test_catalog_import_mocked() -> None:
    meta = {
        "id": 11,
        "title": "Alice",
        "authors": [{"name": "Carroll"}],
        "languages": ["en"],
        "formats": {"text/plain; charset=utf-8": "https://example.com/a.txt"},
    }
    text = ("CHAPTER I. Down the rabbit-hole. " * 30).encode("utf-8")
    with (
        patch("app.api_catalog._get_json", return_value=meta),
        patch("app.api_catalog._get_bytes", return_value=text),
    ):
        r = client.post("/api/catalog/gutenberg/import", json={"gutenberg_id": 11, "lang": "en"})
    assert r.status_code == 200
    assert r.json()["text_id"] > 0
    assert r.json()["chars"] > 50
