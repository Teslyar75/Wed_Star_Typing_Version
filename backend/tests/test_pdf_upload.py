import io
import uuid

from fastapi.testclient import TestClient
from pypdf import PdfWriter

from app.db import init_db
from app.main import app

init_db()
client = TestClient(app)


def _tiny_pdf() -> bytes:
    """Минимальный PDF; текст может быть пустым у writer без контента — добавим через reportlab если нужно."""
    buf = io.BytesIO()
    w = PdfWriter()
    w.add_blank_page(width=200, height=200)
    w.write(buf)
    return buf.getvalue()


def test_pdf_upload_or_empty_scan() -> None:
    pdf = _tiny_pdf()
    r = client.post(
        "/api/texts/upload",
        files={"file": ("tiny.pdf", pdf, "application/pdf")},
        data={"title": "Tiny", "lang": "en"},
    )
    # blank page → scanned/empty → 400, либо если pypdf дал текст — 200
    assert r.status_code in (200, 400)


def test_pdf_preview_blank_is_scanned() -> None:
    pdf = _tiny_pdf()
    r = client.post(
        "/api/texts/pdf/preview",
        files={"file": ("tiny.pdf", pdf, "application/pdf")},
        data={"first": "1", "last": ""},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total_pages"] >= 1
    assert body["scanned"] is True or body["ok"] is False


def test_txt_upload_via_multipart() -> None:
    cs = f"P-{uuid.uuid4().hex[:6]}"
    client.post("/api/pilots/register", json={"callsign": cs, "pin": "1111"})
    r = client.post(
        "/api/texts/upload",
        files={"file": ("a.txt", b"Once upon a time. The end.", "text/plain")},
        data={"title": "Tale", "lang": "en"},
    )
    assert r.status_code == 200
    assert r.json()["id"] > 0
