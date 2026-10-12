from unittest.mock import patch

from fastapi.testclient import TestClient

from app.db import init_db
from app.main import app

init_db()
client = TestClient(app)


def test_bilinguis_list() -> None:
    r = client.get("/api/catalog/bilinguis/list", params={"lang_a": "en", "lang_b": "ru"})
    assert r.status_code == 200
    j = r.json()
    assert j["source"] == "bilinguis"
    assert j["count"] >= 1
    assert any(x["slug"] == "alice" for x in j["results"])


def test_bilinguis_import_mocked() -> None:
    orig = "Hello world. " * 40 + "\n\nSecond paragraph here. " * 20
    trans = "Привет мир. " * 40 + "\n\nВторой абзац здесь. " * 20
    with patch("app.api_catalog.download_pair", return_value=(orig, trans)):
        r = client.post(
            "/api/catalog/bilinguis/import",
            json={"slug": "alice", "lang_a": "en", "lang_b": "ru", "title": "Alice test"},
        )
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["text_id"] > 0
    assert j["source"] == "bilinguis"
