import io
import zipfile

from fastapi.testclient import TestClient

from app.book_formats import decode_text, extract_text, strip_gutenberg

GUT = (
    "The Project Gutenberg eBook of Alice\nLicense blah\n"
    "*** START OF THE PROJECT GUTENBERG EBOOK ALICE ***\n\nDown the rabbit hole.\n\n"
    "*** END OF THE PROJECT GUTENBERG EBOOK ALICE ***\nFull license text\n"
)


def test_strip_gutenberg():
    assert strip_gutenberg(GUT).strip() == "Down the rabbit hole."
    assert strip_gutenberg("plain text\n") == "plain text\n"


def test_decode_cp1251_and_bom():
    assert decode_text("Привет".encode("cp1251")) == "Привет"
    assert decode_text("\ufeffHi\r\nthere".encode("utf-8")) == "Hi\nthere"
    assert decode_text("Ой".encode("utf-16")) == "Ой"


def test_txt_gutenberg_upload_text():
    assert extract_text("pg11.txt", GUT.encode()).strip() == "Down the rabbit hole."


def test_html():
    t = extract_text("a.html", b"<html><head><style>x{}</style><title>T</title></head>"
                     b"<body><p>One &amp; two</p><p>Three\nfour</p></body></html>")
    assert "One & two" in t and "Three four" in t and "x{}" not in t


def _epub() -> bytes:
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        z.writestr("mimetype", "application/epub+zip")
        z.writestr("META-INF/container.xml",
                   '<container><rootfiles><rootfile full-path="OEBPS/c.opf"/></rootfiles></container>')
        z.writestr("OEBPS/c.opf", '<package><manifest><item id="b" href="b.xhtml"/><item id="a" href="a.xhtml"/>'
                   '</manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>')
        z.writestr("OEBPS/a.xhtml", "<html><body><p>First chapter.</p></body></html>")
        z.writestr("OEBPS/b.xhtml", "<html><body><p>Second chapter.</p></body></html>")
    return b.getvalue()


def test_epub_spine_order():
    t = extract_text("book.epub", _epub())
    assert t.index("First chapter.") < t.index("Second chapter.")


def test_fb2():
    src = '<?xml version="1.0" encoding="windows-1251"?><FictionBook><body><p>Слово</p></body></FictionBook>'
    assert "Слово" in extract_text("b.fb2", src.encode("cp1251"))


def test_extract_endpoint():
    from app.db import init_db
    from app.main import app

    init_db()
    client = TestClient(app)
    r = client.post("/api/texts/extract", files={"file": ("pg.txt", GUT.encode("utf-8"), "text/plain")})
    assert r.status_code == 200, r.text
    assert r.json()["text"].strip() == "Down the rabbit hole."
    r = client.post("/api/texts/extract", files={"file": ("e.epub", _epub(), "application/epub+zip")})
    assert "Second chapter." in r.json()["text"]
