"""Экспорт/импорт документов без внешних зависимостей (как desktop docs.py / docs_import).

Web-модель: title + plain Markdown body. .stdoc на вебе — zip с document.json
(title/body), без сегментов картинок desktop; картинки в body как Markdown.
PDF на сервере не собираем: браузерный Print→PDF (кириллица надёжнее без fpdf).
"""

from __future__ import annotations

import html
import io
import json
import re
import zipfile
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

HTML_CSS = (
    "body{font-family:'Segoe UI',sans-serif;max-width:860px;margin:2em auto;padding:0 1em;"
    "line-height:1.5;color:#1d2330}"
    "h1,h2{line-height:1.25}blockquote{border-left:3px solid #aab;margin:.4em 0;padding-left:1em;color:#555}"
    "code{background:#eef;padding:0 .2em;border-radius:3px}p{margin:.25em 0}"
    "table{border-collapse:collapse;margin:.6em 0}td,th{border:1px solid #bbc;padding:.25em .6em}"
    "th{background:#eef}ul{padding-left:1.4em}img{max-width:100%;display:block;margin:.5em 0}"
)

EXPORT_KINDS = ("txt", "md", "html", "docx", "stdoc")
IMPORT_KINDS = (".txt", ".md", ".markdown", ".docx", ".stdoc")


def plain_from_md(body: str) -> str:
    """Грубый plain: снять типичные маркеры Markdown."""
    t = body.replace("\r\n", "\n")
    t = re.sub(r"!\[([^\]]*)\]\([^)]+\)", r"\1", t)
    t = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", t)
    t = re.sub(r"`([^`]+)`", r"\1", t)
    t = re.sub(r"(\*\*|__)(.*?)\1", r"\2", t)
    t = re.sub(r"(\*|_)(.*?)\1", r"\2", t)
    t = re.sub(r"^#{1,6}\s+", "", t, flags=re.M)
    t = re.sub(r"^>\s?", "", t, flags=re.M)
    t = re.sub(r"^[-*+]\s+(\[[ xX]\]\s+)?", "", t, flags=re.M)
    t = re.sub(r"^\d+\.\s+", "", t, flags=re.M)
    t = re.sub(r"==([^=]+)==", r"\1", t)
    t = re.sub(r"</?u>", "", t, flags=re.I)
    return t


def export_txt(title: str, body: str) -> bytes:
    head = (title.strip() + "\n\n") if title.strip() else ""
    return (head + plain_from_md(body)).encode("utf-8")


def export_md(title: str, body: str) -> bytes:
    parts: list[str] = []
    if title.strip():
        parts.append(f"# {title.strip()}\n\n")
    parts.append(body.replace("\r\n", "\n"))
    if parts and not parts[-1].endswith("\n"):
        parts.append("\n")
    return "".join(parts).encode("utf-8")


def _inline_md_to_html(s: str) -> str:
    s = html.escape(s)
    s = re.sub(r"==(.+?)==", r"<mark>\1</mark>", s)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"<em>\1</em>", s)
    s = re.sub(r"__(.+?)__", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<!_)_(?!_)(.+?)(?<!_)_(?!_)", r"<em>\1</em>", s)
    s = re.sub(r"&lt;u&gt;(.+?)&lt;/u&gt;", r"<u>\1</u>", s, flags=re.I)
    s = re.sub(
        r"!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)",
        r'<img alt="\1" src="\2" style="max-width:100%">',
        s,
    )
    s = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", r'<a href="\2">\1</a>', s)
    return s


def md_to_html_body(title: str, body: str) -> str:
    lines = body.replace("\r\n", "\n").split("\n")
    out: list[str] = []
    if title.strip():
        out.append(f"<h1>{html.escape(title.strip())}</h1>")
    i = 0
    while i < len(lines):
        ln = lines[i]
        if re.match(r"^\|.+\|$", ln.strip()) and i + 1 < len(lines) and re.match(r"^\|[-:\s|]+\|$", lines[i + 1].strip()):
            rows = []
            while i < len(lines) and re.match(r"^\|.+\|$", lines[i].strip()):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                rows.append(cells)
                i += 1
                if i < len(lines) and re.match(r"^\|[-:\s|]+\|$", lines[i].strip()):
                    i += 1
                    continue
            if rows:
                head, *rest = rows
                out.append("<table><thead><tr>" + "".join(f"<th>{_inline_md_to_html(c)}</th>" for c in head) + "</tr></thead>")
                out.append("<tbody>")
                for r in rest:
                    out.append("<tr>" + "".join(f"<td>{_inline_md_to_html(c)}</td>" for c in r) + "</tr>")
                out.append("</tbody></table>")
            continue
        m = re.match(r"^(#{1,6})\s+(.*)$", ln)
        if m:
            lvl = len(m.group(1))
            out.append(f"<h{lvl}>{_inline_md_to_html(m.group(2))}</h{lvl}>")
            i += 1
            continue
        if ln.startswith("> "):
            out.append(f"<blockquote><p>{_inline_md_to_html(ln[2:])}</p></blockquote>")
            i += 1
            continue
        if re.match(r"^[-*+]\s+\[([ xX])\]\s+(.*)$", ln):
            mm = re.match(r"^[-*+]\s+\[([ xX])\]\s+(.*)$", ln)
            assert mm
            checked = " checked" if mm.group(1).lower() == "x" else ""
            out.append(f'<p><input type="checkbox" disabled{checked}> {_inline_md_to_html(mm.group(2))}</p>')
            i += 1
            continue
        if re.match(r"^[-*+]\s+", ln):
            items = []
            while i < len(lines) and re.match(r"^[-*+]\s+", lines[i]):
                items.append(f"<li>{_inline_md_to_html(re.sub(r'^[-*+]\\s+', '', lines[i]))}</li>")
                i += 1
            out.append("<ul>" + "".join(items) + "</ul>")
            continue
        if re.match(r"^\d+\.\s+", ln):
            items = []
            while i < len(lines) and re.match(r"^\d+\.\s+", lines[i]):
                items.append(f"<li>{_inline_md_to_html(re.sub(r'^\\d+\\.\\s+', '', lines[i]))}</li>")
                i += 1
            out.append("<ol>" + "".join(items) + "</ol>")
            continue
        if not ln.strip():
            i += 1
            continue
        para = [ln]
        i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r"^(#{1,6}\s|[>*+\-]|\d+\.)", lines[i]):
            if re.match(r"^\|.+\|$", lines[i].strip()):
                break
            para.append(lines[i])
            i += 1
        out.append("<p>" + "<br>".join(_inline_md_to_html(p) for p in para) + "</p>")
    return "\n".join(out)


def export_html(title: str, body: str) -> bytes:
    page = (
        "<!doctype html><html><head><meta charset=\"utf-8\">"
        f"<title>{html.escape(title.strip() or 'doc')}</title>"
        f"<style>{HTML_CSS}</style></head><body>{md_to_html_body(title, body)}</body></html>"
    )
    return page.encode("utf-8")


def export_stdoc(title: str, body: str, *, created: str | None = None, modified: str | None = None) -> bytes:
    meta = {
        "format": "web-1",
        "title": title,
        "body": body,
        "created": created,
        "modified": modified,
        "segments": [{"t": body}],
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("document.json", json.dumps(meta, ensure_ascii=False, indent=1))
    return buf.getvalue()


def export_docx(title: str, body: str) -> bytes:
    """Упрощённый .docx: абзацы + заголовки/списки/жирный/курсив по строкам Markdown."""

    def run(text: str, *, bold: bool = False, italic: bool = False) -> str:
        rpr = ""
        if bold:
            rpr += "<w:b/>"
        if italic:
            rpr += "<w:i/>"
        rpr = f"<w:rPr>{rpr}</w:rPr>" if rpr else ""
        return f'<w:r>{rpr}<w:t xml:space="preserve">{escape(text)}</w:t></w:r>'

    def runs_inline(s: str) -> str:
        parts: list[str] = []
        pos = 0
        for m in re.finditer(r"\*\*(.+?)\*\*|\*(.+?)\*", s):
            if m.start() > pos:
                parts.append(run(s[pos : m.start()]))
            if m.group(1) is not None:
                parts.append(run(m.group(1), bold=True))
            else:
                parts.append(run(m.group(2), italic=True))
            pos = m.end()
        if pos < len(s):
            parts.append(run(s[pos:]))
        return "".join(parts) or run("")

    def para(text: str, style: str | None = None) -> str:
        ppr = f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>' if style else ""
        return f"<w:p>{ppr}{runs_inline(text)}</w:p>"

    body_xml: list[str] = []
    if title.strip():
        body_xml.append(para(title.strip(), "Title"))
    for ln in body.replace("\r\n", "\n").split("\n"):
        if re.match(r"^#\s+", ln):
            body_xml.append(para(re.sub(r"^#\s+", "", ln), "Heading1"))
        elif re.match(r"^##\s+", ln):
            body_xml.append(para(re.sub(r"^##\s+", "", ln), "Heading2"))
        elif ln.startswith("> "):
            body_xml.append(para(ln[2:], "Quote"))
        elif re.match(r"^[-*+]\s+", ln):
            body_xml.append(para(re.sub(r"^[-*+]\s+(\[[ xX]\]\s+)?", "", ln), "ListParagraph"))
        elif re.match(r"^\d+\.\s+", ln):
            body_xml.append(para(re.sub(r"^\d+\.\s+", "", ln), "ListParagraph"))
        else:
            body_xml.append(para(ln))

    ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    document = (
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document {ns}><w:body>'
        + "".join(body_xml)
        + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
        '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/>'
        "</w:sectPr></w:body></w:document>"
    )

    def st(sid: str, name: str, rpr: str, ppr: str = "") -> str:
        return (
            f'<w:style w:type="paragraph" w:styleId="{sid}"><w:name w:val="{name}"/>'
            f"<w:basedOn w:val=\"Normal\"/><w:pPr>{ppr}</w:pPr><w:rPr>{rpr}</w:rPr></w:style>"
        )

    styles = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<w:styles {ns}>'
        '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'
        + st("Title", "Title", "<w:b/><w:sz w:val=\"40\"/>")
        + st("Heading1", "heading 1", "<w:b/><w:sz w:val=\"32\"/>")
        + st("Heading2", "heading 2", "<w:b/><w:sz w:val=\"27\"/>")
        + st("Quote", "Quote", "<w:i/>", '<w:ind w:left="567"/>')
        + st("ListParagraph", "List Paragraph", "", '<w:ind w:left="567"/>')
        + "</w:styles>"
    )
    ct = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        '<Override PartName="/word/styles.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
        "</Types>"
    )
    root_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="word/document.xml"/></Relationships>'
    )
    doc_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" '
        'Target="styles.xml"/></Relationships>'
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", ct)
        z.writestr("_rels/.rels", root_rels)
        z.writestr("word/document.xml", document)
        z.writestr("word/styles.xml", styles)
        z.writestr("word/_rels/document.xml.rels", doc_rels)
    return buf.getvalue()


def import_txt(raw: bytes, stem: str) -> tuple[str, str]:
    for enc in ("utf-8-sig", "cp1251", "utf-8"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = raw.decode("utf-8", "replace")
    return stem, text.replace("\r\n", "\n")


def import_md(raw: bytes, stem: str) -> tuple[str, str]:
    text = raw.decode("utf-8-sig").replace("\r\n", "\n")
    title = stem
    m = re.match(r"\s*#\s+(.+?)\s*(?:\n+|$)", text)
    if m:
        title, text = m.group(1).strip(), text[m.end() :]
    return title, text


def import_stdoc(raw: bytes, stem: str) -> tuple[str, str]:
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        meta = json.loads(z.read("document.json").decode("utf-8"))
    title = str(meta.get("title") or stem)
    if isinstance(meta.get("body"), str):
        return title, meta["body"].replace("\r\n", "\n")
    segs = meta.get("segments") or []
    parts: list[str] = []
    for s in segs:
        if isinstance(s, dict) and "t" in s:
            parts.append(str(s["t"]))
        elif isinstance(s, dict) and s.get("img"):
            parts.append(f"\n![]({s['img']})\n")
    return title, "".join(parts)


def _run_text(r: ET.Element) -> str:
    out: list[str] = []
    for el in r:
        if el.tag == W + "t":
            out.append(el.text or "")
        elif el.tag == W + "tab":
            out.append("\t")
        elif el.tag in (W + "br", W + "cr"):
            out.append("\n")
    return "".join(out)


def _flag(rpr: ET.Element | None, name: str) -> bool:
    if rpr is None:
        return False
    el = rpr.find(W + name)
    return el is not None and el.get(W + "val", "true") not in ("0", "false", "none")


def import_docx(raw: bytes, stem: str) -> tuple[str, str]:
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        root = ET.fromstring(z.read("word/document.xml"))
        styles: dict[str, str] = {}
        try:
            for st in ET.fromstring(z.read("word/styles.xml")).iter(W + "style"):
                nm = st.find(W + "name")
                styles[st.get(W + "styleId") or ""] = (nm.get(W + "val") if nm is not None else "") or ""
        except KeyError:
            pass
        body_el = root.find(W + "body")
        buf: list[str] = []
        paras = [p for p in body_el.iter(W + "p")] if body_el is not None else []
        for p in paras:
            ppr = p.find(W + "pPr")
            sid = ""
            if ppr is not None and ppr.find(W + "pStyle") is not None:
                sid = ppr.find(W + "pStyle").get(W + "val", "") or ""
            name = (styles.get(sid) or sid).lower()
            m = re.search(r"(?:heading|заголовок)\s*(\d)", name)
            prefix = ""
            if m:
                prefix = "#" * max(1, min(6, int(m.group(1)))) + " "
            elif name in ("title", "название"):
                prefix = "# "
            elif (ppr is not None and ppr.find(W + "numPr") is not None) or "list" in name:
                prefix = "- "
            elif "quote" in name or "цитата" in name:
                prefix = "> "
            line: list[str] = []
            for r in p.iter(W + "r"):
                t = _run_text(r)
                if not t:
                    continue
                rpr = r.find(W + "rPr")
                b, i = _flag(rpr, "b"), _flag(rpr, "i")
                if (b or i) and t.strip() and not m:
                    mark = "***" if b and i else "**" if b else "*"
                    mm = re.match(r"(\s*)(.*?)(\s*)$", t, re.S)
                    if mm:
                        lead, core, tail = mm.groups()
                        t = f"{lead}{mark}{core}{mark}{tail}"
                line.append(t)
            buf.append(prefix + "".join(line) + "\n")
    text = "".join(buf)
    title = stem
    mm = re.match(r"#\s+(.+?)\n+", text)
    if mm:
        title, text = mm.group(1).strip(), text[mm.end() :]
    return title, text.rstrip("\n") + ("\n" if text else "")


def import_bytes(filename: str, raw: bytes) -> tuple[str, str]:
    from pathlib import Path

    stem = Path(filename).stem or "doc"
    ext = Path(filename).suffix.lower()
    if ext == ".stdoc":
        return import_stdoc(raw, stem)
    if ext in (".md", ".markdown"):
        return import_md(raw, stem)
    if ext == ".docx":
        return import_docx(raw, stem)
    if ext == ".txt" or ext == "":
        return import_txt(raw, stem)
    raise ValueError(f"unsupported: {ext}")
