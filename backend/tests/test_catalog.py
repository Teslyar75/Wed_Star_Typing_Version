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


def test_is_language_pair_seed_logic() -> None:
    from app.gutenberg_bilingual import is_language_pair

    en = {"id": 11, "title": "Alice's Adventures in Wonderland", "authors": "Lewis Carroll", "languages": ["en"]}
    de = {"id": 19778, "title": "Alice's Abenteuer im Wunderland", "authors": "Lewis Carroll", "languages": ["de"]}
    en2 = {"id": 12, "title": "Through the Looking-Glass", "authors": "Lewis Carroll", "languages": ["en"]}
    assert is_language_pair(en, de, "de")
    assert not is_language_pair(en, en2, "de")
    assert not is_language_pair(en, de, "fr")


def test_gutenberg_bilingual_list_seed_mocked() -> None:
    """Кураторская полка EN→DE без сети (fetch_book замокан)."""
    from app import gutenberg_bilingual as gbi

    books = {
        11: {
            "id": 11,
            "title": "Alice's Adventures in Wonderland",
            "authors": "Lewis Carroll",
            "languages": ["en"],
            "text_url": "https://example.com/a.txt",
            "has_cover": False,
        },
        19778: {
            "id": 19778,
            "title": "Alice's Abenteuer im Wunderland",
            "authors": "Lewis Carroll",
            "languages": ["de"],
            "text_url": "https://example.com/b.txt",
            "has_cover": False,
        },
    }

    def fake_fetch(gid: int):
        return books.get(int(gid))

    with patch.object(gbi, "fetch_book", side_effect=fake_fetch):
        # только seed с Alice для упрощения — подменим BILINGUAL_SEED
        with patch.object(
            gbi,
            "BILINGUAL_SEED",
            [{"lang_a": "en", "id_a": 11, "lang_b": "de", "id_b": 19778}],
        ):
            data = gbi.list_bilingual_seed(lang_a="en", lang_b="de", page=1)
    assert data["bilingual"] is True
    assert data["count"] == 1
    assert len(data["results"]) == 1
    assert data["results"][0]["tr_id"] == 19778
    assert data["results"][0]["lang_b"] == "de"
    assert data.get("seed_total") == 1


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
