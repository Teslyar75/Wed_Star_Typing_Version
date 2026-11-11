"""CEFR: vendored data, 8648 карточек, ленивая страница ≤ page_size."""
from __future__ import annotations

import json
import os

os.environ["DATABASE_URL"] = "sqlite:///./test_cefr_packs.db"
os.environ["ALLOW_DEV_SECRET"] = "1"
os.environ.setdefault("CI", "1")
os.environ.setdefault("TRANSLATE_OFFLINE", "1")

from fastapi.testclient import TestClient

from app import english_packs as packs
from app.db import Base, engine, init_db
from app.main import app

Base.metadata.drop_all(bind=engine)
init_db()
client = TestClient(app)

EXPECTED = dict(packs.EXPECTED_LEVEL_COUNTS)
EXPECTED_TOTAL = packs.EXPECTED_TOTAL


def _reset_cache() -> None:
    packs._cefr_words_cached.cache_clear()
    packs._load_cefr_file.cache_clear()
    packs._SLUGS.clear()


def test_vendored_data_dir_has_sets() -> None:
    d = packs.data_dir()
    assert (d / "sets").is_dir(), f"no sets in {d}"
    for lv in EXPECTED:
        assert packs.cefr_path(lv).exists(), lv


def test_level_counts_match_desktop_report() -> None:
    """Одно слово = одна карточка; счётчики = cefr_report.json десктопа 3.8.3."""
    _reset_cache()
    counts = packs.level_counts()
    assert counts["total"] == EXPECTED_TOTAL
    by_id = {r["id"]: r["total"] for r in counts["levels"]}
    for lv, n in EXPECTED.items():
        assert by_id.get(lv) == n, f"{lv}: got {by_id.get(lv)}, want {n}"

    r = client.get("/api/english/cefr/counts")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == EXPECTED_TOTAL
    api_by = {x["id"]: x["total"] for x in body["levels"]}
    assert api_by == EXPECTED


def test_cefr_page_payload_is_page_sized_not_full_level() -> None:
    """Страница не тащит весь уровень и не весь архив."""
    _reset_cache()
    level = "A1"
    page_size = 24
    # прямой packs.cefr_page — без DB; HTTP-ответ тоже page-sized
    data = packs.cefr_page(level, 0, 0, page_size)
    assert 1 <= len(data["words"]) <= page_size
    assert data["page_size"] == page_size
    assert data["total"] == EXPECTED[level]
    assert len(data["words"]) < data["total"]

    r = client.get(f"/api/english/cefr/{level}?block=0&page=0&page_size={page_size}")
    assert r.status_code == 200
    body = r.json()
    words = body.get("words") or []
    assert 1 <= len(words) <= page_size
    assert body.get("page_size") == page_size
    assert body.get("total") == EXPECTED[level]
    assert len(r.content) < 200_000
    # убеждаемся, что это не полный dump уровня
    assert len(json.dumps(words)) < len(json.dumps(list(packs.cefr_words(level))))


def test_words_without_sentences_included() -> None:
    """Карточки без примеров не отбрасываются (gaps / has_examples=false)."""
    _reset_cache()
    words = packs.cefr_words("C2")
    assert len(words) == EXPECTED["C2"]
    bare = [w for w in words if not w.get("sentences")]
    assert bare, "ожидали слова без примеров на C2"
    view = packs.card_view(bare[0])
    assert view["has_examples"] is False
    assert "sentences" in (view.get("gaps") or [])
