from app.docs_io import export_docx, export_html, export_md, export_stdoc, export_txt, import_bytes, plain_from_md


def test_plain_and_roundtrip_md_txt() -> None:
    assert "hello" in plain_from_md("**hello**")
    md = export_md("Title", "body **x**")
    title, body = import_bytes("a.md", md)
    assert title == "Title"
    assert "body" in body
    txt = export_txt("T", "**a** b")
    assert b"a b" in txt or b"a" in txt


def test_html_and_stdoc_roundtrip() -> None:
    html = export_html("Hi", "# H\n\npara").decode("utf-8")
    assert "<h1>Hi</h1>" in html
    raw = export_stdoc("S", "seg text", created="c", modified="m")
    title, body = import_bytes("x.stdoc", raw)
    assert title == "S"
    assert body == "seg text"


def test_docx_export_import() -> None:
    raw = export_docx("Doc", "# Head\n\n**bold** line")
    assert raw[:2] == b"PK"
    title, body = import_bytes("n.docx", raw)
    assert "Head" in title or "Head" in body or "bold" in body
