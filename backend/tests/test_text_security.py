"""Изоляция текстов: пилот A ≠ B; аноним = 401; лимит размера = 413."""

from __future__ import annotations

import io
import uuid
import zipfile

from fastapi.testclient import TestClient

from app.db import init_db
from app.main import app
from app.ssrf import assert_safe_url, host_is_public

init_db()


def _client() -> TestClient:
    return TestClient(app)


def _pilot(c: TestClient | None = None) -> TestClient:
    c = c or _client()
    cs = f"Sec{uuid.uuid4().hex[:8]}"
    r = c.post("/api/pilots/register", json={"callsign": cs, "pin": "4242"})
    assert r.status_code == 200, r.text
    c.cookies.set("st_token", r.cookies["st_token"])
    return c


def test_anonymous_texts_401() -> None:
    c = _client()
    assert c.get("/api/texts/1").status_code == 401
    assert c.get("/api/texts/1/content").status_code == 401
    assert c.get("/api/texts/1/prepared").status_code == 401
    assert c.get("/api/texts/1/segments").status_code == 401
    assert c.post("/api/texts", json={"title": "x", "lang": "en", "content": "Hello world."}).status_code == 401
    assert c.post("/api/texts/1/prepared", json={}).status_code == 401
    assert c.get("/api/library").status_code == 401
    assert c.get("/api/reader/1/bilingual").status_code == 401


def test_pilot_a_cannot_read_or_mutate_pilot_b() -> None:
    a = _pilot()
    b = _pilot()
    created = a.post(
        "/api/texts",
        json={"title": "Secret", "lang": "en", "content": "Alpha private book. Second sentence."},
    )
    assert created.status_code == 200, created.text
    tid = created.json()["id"]

    assert a.get(f"/api/texts/{tid}/content").status_code == 200
    assert b.get(f"/api/texts/{tid}").status_code == 404
    assert b.get(f"/api/texts/{tid}/content").status_code == 404
    assert b.get(f"/api/texts/{tid}/prepared").status_code == 404
    assert b.get(f"/api/texts/{tid}/segments").status_code == 404
    assert b.post(f"/api/texts/{tid}/prepared", json={"lower": True}).status_code == 404
    assert b.patch(f"/api/library/{tid}", json={"title": "Hijack"}).status_code == 404
    assert b.delete(f"/api/library/{tid}").status_code == 404
    assert b.post("/api/library/shelf", json={"text_id": tid}).status_code == 404
    assert b.get(f"/api/reader/{tid}/bilingual").status_code == 404

    # A still owns it
    assert a.get(f"/api/texts/{tid}/content").json()["body"]
    shelf = a.get("/api/library").json()
    assert any(x["text_id"] == tid for x in shelf)


def test_public_catalog_readable_not_writable_without_shelf() -> None:
    from app.db import SessionLocal
    from app.models import TextDoc
    from app.texts_service import import_text

    db = SessionLocal()
    try:
        doc = import_text(
            db,
            title="PG Public",
            lang="en",
            content="Public catalog book. Another sentence here.",
            source="gutenberg",
            is_public=True,
        )
        tid = doc.id
    finally:
        db.close()

    a = _pilot()
    b = _pilot()
    assert a.get(f"/api/texts/{tid}/content").status_code == 200
    assert b.get(f"/api/texts/{tid}/content").status_code == 200
    # Мутация prepared без pilot_texts — 404
    assert a.post(f"/api/texts/{tid}/prepared", json={"lower": True}).status_code == 404
    # На полку можно
    assert a.post("/api/library/shelf", json={"text_id": tid}).status_code == 200
    assert a.post(f"/api/texts/{tid}/prepared", json={"lower": True}).status_code == 200


def test_upload_too_large_413(monkeypatch) -> None:
    from app import config

    monkeypatch.setattr(config.settings, "upload_max_book_bytes", 64)
    c = _pilot()
    big = b"x" * 200
    r = c.post(
        "/api/texts/upload",
        files={"file": ("big.txt", big, "text/plain")},
        data={"title": "Big", "lang": "en"},
    )
    assert r.status_code == 413, r.text


def test_json_text_too_long_413(monkeypatch) -> None:
    from app import config

    monkeypatch.setattr(config.settings, "upload_max_text_chars", 40)
    # Пересоздать модель лимита нельзя — assert_text_len в handler
    c = _pilot()
    r = c.post(
        "/api/texts",
        json={"title": "Long", "lang": "en", "content": "word " * 20},
    )
    assert r.status_code in (413, 422), r.text


def test_epub_zip_bomb_rejected(monkeypatch) -> None:
    from app import config
    from app.book_formats import epub_to_text

    monkeypatch.setattr(config.settings, "upload_max_epub_uncompressed", 200)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr("META-INF/container.xml", '<rootfile full-path="c.opf"/>')
        z.writestr(
            "c.opf",
            '<package><item id="a" href="a.xhtml"/><itemref idref="a"/></package>',
        )
        z.writestr("a.xhtml", "<p>" + ("boom " * 200) + "</p>")
    try:
        epub_to_text(buf.getvalue())
        raised = False
    except ValueError as e:
        raised = "limit" in str(e).lower()
    assert raised


def test_ssrf_blocks_private_and_metadata() -> None:
    assert host_is_public("localhost") is False
    assert host_is_public("127.0.0.1") is False
    assert host_is_public("169.254.169.254") is False
    assert host_is_public("metadata.google.internal") is False
    assert host_is_public("10.0.0.1") is False
    try:
        assert_safe_url("https://127.0.0.1/v1")
        ok = True
    except ValueError:
        ok = False
    assert ok is False
    try:
        assert_safe_url("ftp://example.com/x")
        bad = True
    except ValueError:
        bad = False
    assert bad is False
