"""Извлечение текста из загружаемых книг (txt / html / epub / fb2) для слепой печати.

PDF обрабатывает pdf_import. Здесь: кодировка (utf-8 / utf-16 / cp1251, как в десктопе),
снятие шапки и лицензии Project Gutenberg, html/epub/fb2 → простой текст с абзацами.
"""
from __future__ import annotations

import html
import io
import posixpath
import re
import zipfile
from html.parser import HTMLParser

TEXT_EXT = (".txt", ".text", ".md", ".csv")
HTML_EXT = (".html", ".htm", ".xhtml")
SUPPORTED_EXT = TEXT_EXT + HTML_EXT + (".epub", ".fb2", ".pdf")

_G_START = re.compile(r"^.*\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG E-?BOOK[^\n]*$", re.I | re.M)
_G_END = re.compile(r"^.*(?:\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG E-?BOOK"
                    r"|End of (?:the )?Project Gutenberg'?s?\b)[^\n]*$", re.I | re.M)


def decode_text(raw: bytes) -> str:
    if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
        text = raw.decode("utf-16")
    else:
        for enc in ("utf-8-sig", "cp1251"):
            try:
                text = raw.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        else:  # pragma: no cover - cp1251 декодирует почти всё
            text = raw.decode("utf-8", errors="replace")
    return text.replace("\r\n", "\n").replace("\r", "\n")


def strip_gutenberg(text: str) -> str:
    """Убрать шапку и лицензию Project Gutenberg (если это их файл)."""
    s = _G_START.search(text)
    if not s:
        return text
    body = text[s.end():]
    e = _G_END.search(body)
    if e:
        body = body[: e.start()]
    return body.strip("\n") + "\n"


class _Html2Text(HTMLParser):
    BLOCK = {"p", "div", "br", "h1", "h2", "h3", "h4", "h5", "h6", "li", "tr", "section",
             "blockquote", "title", "v", "stanza", "subtitle", "empty-line", "pre"}
    SKIP = {"script", "style", "head", "binary", "noscript"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        tag = tag.lower().split(":")[-1]
        if tag in self.SKIP:
            self.skip += 1
        elif tag in self.BLOCK:
            self.out.append("\n\n")

    def handle_endtag(self, tag):
        tag = tag.lower().split(":")[-1]
        if tag in self.SKIP:
            self.skip = max(0, self.skip - 1)
        elif tag in self.BLOCK:
            self.out.append("\n\n")

    def handle_data(self, data):
        if not self.skip:
            self.out.append(data)


def html_to_text(src: str) -> str:
    p = _Html2Text()
    p.feed(src)
    p.close()
    text = html.unescape("".join(p.out))
    paras = [re.sub(r"[ \t\u00a0]+", " ", " ".join(b.split("\n"))).strip()
             for b in re.split(r"\n\s*\n", text)]
    return "\n\n".join(x for x in paras if x) + "\n"


def epub_to_text(raw: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        cont = z.read("META-INF/container.xml").decode("utf-8", "replace")
        m = re.search(r'full-path="([^"]+)"', cont)
        if not m:
            raise ValueError("epub: no rootfile")
        opf_path = m.group(1)
        opf = z.read(opf_path).decode("utf-8", "replace")
        base = posixpath.dirname(opf_path)
        items = {}
        for it in re.finditer(r"<(?:\w+:)?item\b[^>]*>", opf):
            tag = it.group(0)
            i = re.search(r'\bid="([^"]+)"', tag)
            h = re.search(r'\bhref="([^"]+)"', tag)
            if i and h:
                items[i.group(1)] = h.group(1)
        order = re.findall(r'<(?:\w+:)?itemref\b[^>]*\bidref="([^"]+)"', opf)
        parts = []
        for idref in order:
            href = items.get(idref)
            if not href:
                continue
            path = posixpath.normpath(posixpath.join(base, html.unescape(href).split("#")[0]))
            try:
                parts.append(html_to_text(z.read(path).decode("utf-8", "replace")))
            except KeyError:
                continue
    return strip_gutenberg("\n".join(p for p in parts if p.strip()))


def extract_text(filename: str, raw: bytes) -> str:
    """Текст книги (кроме PDF). ValueError — формат не поддержан или файл битый."""
    name = (filename or "").lower()
    if name.endswith(".epub"):
        try:
            return epub_to_text(raw)
        except (zipfile.BadZipFile, KeyError) as exc:
            raise ValueError(f"epub: {exc}") from exc
    if name.endswith(".fb2"):
        m = re.search(rb'encoding="([^"]+)"', raw[:200])
        enc = m.group(1).decode() if m else "utf-8"
        try:
            src = raw.decode(enc)
        except (LookupError, UnicodeDecodeError):
            src = decode_text(raw)
        return html_to_text(src)
    text = decode_text(raw)
    if name.endswith(HTML_EXT):
        text = html_to_text(text)
    return strip_gutenberg(text)
