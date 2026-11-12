"""API текстов: импорт, сегменты. Доступ — cookie-пилот + pilot_texts / is_public."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth_deps import get_current_pilot
from app.book_formats import extract_text
from app.config import settings
from app.db import get_db
from app.models import Segment, TextDoc
from app.pilots import Pilot
from app.text_access import link_pilot_text, require_read, require_write
from app.text_processing import DEFAULT_PREP_OPTS, norm_opts
from app.texts_service import (
    ensure_prepared,
    import_bilingual,
    import_text,
    rebuild_original_body,
)
from app.upload_limits import assert_text_len, read_upload_limited

router = APIRouter(prefix="/api/texts", tags=["texts"])

_MAX_CHARS = settings.upload_max_text_chars


class TextCreate(BaseModel):
    title: str = ""
    lang: str = "und"
    content: str = Field(min_length=1, max_length=_MAX_CHARS)


class BilingualCreate(BaseModel):
    title: str = ""
    author: str = ""
    lang_src: str = "en"
    lang_tgt: str = "ru"
    original: str = Field(min_length=1, max_length=_MAX_CHARS)
    translation: str = Field(min_length=1, max_length=_MAX_CHARS)
    # pd | mt | mixed — как desktop BILINGUAL_SOURCES
    source_kind: str = "mt"


class TextOut(BaseModel):
    id: int
    title: str
    lang: str
    source: str

    model_config = {"from_attributes": True}


class SegmentOut(BaseModel):
    idx: int
    para_idx: int
    original: str
    translation: str
    status: str
    char_start: int = 0
    char_end: int = 0

    model_config = {"from_attributes": True}


@router.post("", response_model=TextOut)
def create_text(
    body: TextCreate,
    db: Session = Depends(get_db),
    pilot: Pilot = Depends(get_current_pilot),
) -> TextDoc:
    assert_text_len(body.content)
    doc = import_text(db, title=body.title, lang=body.lang, content=body.content)
    link_pilot_text(db, pilot, doc.id)
    return doc


def _parse_page_range(first_raw: str, last_raw: str) -> tuple[int, int | None]:
    first = int(first_raw) if str(first_raw).strip().isdigit() and int(first_raw) > 0 else 1
    last_s = str(last_raw or "").strip()
    last = int(last_s) if last_s.isdigit() and int(last_s) > 0 else None
    return first, last


def _load_pdf_bytes(raw: bytes, first: int = 1, last: int | None = None):
    """Извлечь текст через app.pdf_import (порт stamina.pdf_import)."""
    import tempfile
    from pathlib import Path

    from app.pdf_import import PdfError, load as pdf_load

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(raw)
        path = Path(tmp.name)
    try:
        return pdf_load(path, first, last)
    except PdfError as exc:
        raise HTTPException(400, str(exc)) from exc
    finally:
        path.unlink(missing_ok=True)


PREVIEW_CHARS = 6000


@router.post("/pdf/preview")
async def pdf_preview(
    file: UploadFile = File(...),
    first: str = Form("1"),
    last: str = Form(""),
    _pilot: Pilot = Depends(get_current_pilot),
) -> dict:
    """Предпросмотр PDF с диапазоном страниц (как desktop PdfImportDialog.reload)."""
    raw = await read_upload_limited(file, label="PDF")
    if not raw:
        raise HTTPException(400, "empty file")
    f, lst = _parse_page_range(first, last)
    try:
        res = _load_pdf_bytes(raw, f, lst)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, f"PDF preview failed: {exc}") from exc
    text = res.text or ""
    return {
        "filename": file.filename or "book.pdf",
        "total_pages": res.total_pages,
        "first": res.first,
        "last": res.last,
        "scanned": bool(res.scanned),
        "chars": len(text),
        "removed": dict(res.removed or {}),
        "preview": text[:PREVIEW_CHARS],
        "preview_truncated": len(text) > PREVIEW_CHARS,
        "ok": bool(text.strip()) and not res.scanned,
    }


@router.post("/pdf/import", response_model=TextOut)
async def pdf_import_text(
    file: UploadFile = File(...),
    first: str = Form("1"),
    last: str = Form(""),
    title: str = Form(""),
    lang: str = Form("und"),
    db: Session = Depends(get_db),
    pilot: Pilot = Depends(get_current_pilot),
) -> TextDoc:
    """Импорт PDF → текстовая книга на полке (печать / скорочтение / перевод)."""
    raw = await read_upload_limited(file, label="PDF")
    if not raw:
        raise HTTPException(400, "empty file")
    f, lst = _parse_page_range(first, last)
    try:
        res = _load_pdf_bytes(raw, f, lst)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, f"PDF import failed: {exc}") from exc
    if res.scanned or not (res.text or "").strip():
        raise HTTPException(400, "PDF looks scanned (no text layer)")
    assert_text_len(res.text or "")
    name = (file.filename or "book.pdf").rsplit(".", 1)[0]
    doc = import_text(
        db,
        title=(title or "").strip() or name,
        lang=lang or "und",
        content=res.text,
        source="pdf",
    )
    link_pilot_text(db, pilot, doc.id)
    return doc


@router.post("/extract")
async def extract_book_text(
    file: UploadFile = File(...),
    first: str = Form("1"),
    last: str = Form(""),
    _pilot: Pilot = Depends(get_current_pilot),
) -> dict:
    """Только текст файла (txt/html/epub/fb2/pdf) — для «СВОЕГО ТЕКСТА», без записи в библиотеку."""
    raw = await read_upload_limited(file, label="book")
    name = (file.filename or "").lower()
    if name.endswith(".pdf"):
        f, lst = _parse_page_range(first, last)
        try:
            res = _load_pdf_bytes(raw, f, lst)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(400, f"PDF import failed: {exc}") from exc
        if res.scanned and not (res.text or "").strip():
            raise HTTPException(400, "PDF looks scanned (no text layer)")
        text = res.text or ""
    else:
        try:
            text = extract_text(name, raw)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
    if not text.strip():
        raise HTTPException(400, "empty file")
    assert_text_len(text)
    return {"text": text, "chars": len(text)}


@router.post("/upload", response_model=TextOut)
async def upload_text(
    file: UploadFile = File(...),
    title: str = Form(""),
    lang: str = Form("und"),
    first: str = Form("1"),
    last: str = Form(""),
    db: Session = Depends(get_db),
    pilot: Pilot = Depends(get_current_pilot),
) -> TextDoc:
    raw = await read_upload_limited(file, label="book")
    name = (file.filename or "").lower()
    if name.endswith(".pdf"):
        f, lst = _parse_page_range(first, last)
        try:
            res = _load_pdf_bytes(raw, f, lst)
            content = res.text or ""
            if res.scanned and not content.strip():
                raise HTTPException(400, "PDF looks scanned (no text layer)")
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(400, f"PDF import failed: {exc}") from exc
    else:
        try:
            content = extract_text(name, raw)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
    if not content.strip():
        raise HTTPException(400, "empty file")
    assert_text_len(content)
    doc = import_text(
        db,
        title=title or (file.filename or "upload"),
        lang=lang,
        content=content,
        source="pdf" if name.endswith(".pdf") else "upload",
    )
    link_pilot_text(db, pilot, doc.id)
    return doc


@router.post("/bilingual", response_model=TextOut)
def create_bilingual(
    body: BilingualCreate,
    db: Session = Depends(get_db),
    pilot: Pilot = Depends(get_current_pilot),
) -> TextDoc:
    """Ручной импорт 2ЯЗ (порт stamina.bilingual_dialog) → полка пилота."""
    kind = (body.source_kind or "mt").strip().lower()
    if kind not in ("pd", "mt", "mixed"):
        kind = "mt"
    title = (body.title or "").strip()
    if body.author.strip():
        title = f"{title} — {body.author.strip()}" if title else body.author.strip()
    if len(body.original.strip()) < 20 or len(body.translation.strip()) < 20:
        raise HTTPException(400, "both original and translation required")
    assert_text_len(body.original)
    assert_text_len(body.translation)
    doc = import_bilingual(
        db,
        title=title or "Bilingual",
        lang_src=(body.lang_src or "en").strip().lower()[:8] or "en",
        lang_tgt=(body.lang_tgt or "ru").strip().lower()[:8] or "ru",
        original=body.original,
        translation=body.translation,
        source=f"bilingual_{kind}",
    )
    link_pilot_text(db, pilot, doc.id)
    return doc


@router.get("/{text_id}", response_model=TextOut)
def get_text(
    text_id: int,
    db: Session = Depends(get_db),
    pilot: Pilot = Depends(get_current_pilot),
) -> TextDoc:
    return require_read(db, pilot, text_id)


@router.get("/{text_id}/content")
def get_text_content(
    text_id: int,
    db: Session = Depends(get_db),
    pilot: Pilot = Depends(get_current_pilot),
) -> dict:
    """Оригинал для чтения: гипердрайв и «Книга». Никогда не prepared."""
    doc = require_read(db, pilot, text_id)
    body = rebuild_original_body(db, text_id)
    return {
        "id": doc.id,
        "title": doc.title or f"#{doc.id}",
        "lang": doc.lang or "und",
        "kind": "reading",
        "body": body,
        "chars": len(body),
    }


class PreparedOptsIn(BaseModel):
    lower: bool = True
    punct: bool = True
    spaces: bool = True
    translit: bool = False
    yo: bool = False
    glue: bool = True


@router.get("/{text_id}/prepared")
def get_text_prepared(
    text_id: int,
    db: Session = Depends(get_db),
    pilot: Pilot = Depends(get_current_pilot),
) -> dict:
    """Адаптированный текст только для набора (мостик / «Печатать»)."""
    doc = require_read(db, pilot, text_id)
    bilingual = (doc.source or "").startswith("bilingu") or "-" in (doc.lang or "")
    if bilingual:
        raise HTTPException(400, "bilingual texts are not for typing")
    body = ensure_prepared(db, doc)
    opts = dict(DEFAULT_PREP_OPTS)
    if (doc.prep_opts or "").strip():
        try:
            opts = norm_opts(json.loads(doc.prep_opts))
        except json.JSONDecodeError:
            pass
    return {
        "id": doc.id,
        "title": doc.title or f"#{doc.id}",
        "lang": doc.lang or "und",
        "kind": "typing",
        "body": body,
        "chars": len(body),
        "opts": opts,
    }


@router.post("/{text_id}/prepared")
def regenerate_prepared(
    text_id: int,
    body: PreparedOptsIn | None = None,
    db: Session = Depends(get_db),
    pilot: Pilot = Depends(get_current_pilot),
) -> dict:
    """Пересобрать prepared из оригинала с заданными опциями."""
    doc = require_write(db, pilot, text_id)
    bilingual = (doc.source or "").startswith("bilingu") or "-" in (doc.lang or "")
    if bilingual:
        raise HTTPException(400, "bilingual texts are not for typing")
    ensure_prepared(db, doc, opts=body.model_dump() if body else None)
    return get_text_prepared(text_id, db, pilot)


@router.get("/{text_id}/segments", response_model=list[SegmentOut])
def get_segments(
    text_id: int,
    offset: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
    pilot: Pilot = Depends(get_current_pilot),
) -> list[Segment]:
    require_read(db, pilot, text_id)
    limit = max(1, min(limit, 500))
    offset = max(0, offset)
    return (
        db.query(Segment)
        .filter(Segment.text_id == text_id)
        .order_by(Segment.idx)
        .offset(offset)
        .limit(limit)
        .all()
    )


class GlueFixIn(BaseModel):
    text: str = Field(default="", max_length=_MAX_CHARS)
    text_id: int | None = None
    lang: str | None = None


@router.post("/glue-fix")
def glue_fix(
    body: GlueFixIn,
    db: Session = Depends(get_db),
    pilot: Pilot = Depends(get_current_pilot),
) -> dict:
    """«✦ Проверить ИИ»: найти и разделить сросшиеся слова (офлайн, частотные словари EN/RU)."""
    from app.glue_fix import examples, repair

    base = body.text or ""
    doc = None
    if body.text_id is not None:
        doc = require_write(db, pilot, body.text_id)
        if not base.strip():
            base = ensure_prepared(db, doc)
    assert_text_len(base)
    lang = body.lang if body.lang in ("en", "ru") else None
    new, fixes = repair(base, lang)
    saved = False
    if doc is not None and fixes and (doc.prepared or "") == base:
        doc.prepared = new
        db.commit()
        saved = True
    return {
        "text": new,
        "count": len(fixes),
        "examples": examples(fixes, 8),
        "fixes": [[f.start, f.end, len(f.split)] for f in fixes],
        "saved": saved,
    }


class PrepareTextIn(BaseModel):
    text: str = Field(default="", max_length=_MAX_CHARS)
    opts: dict | None = None


@router.post("/prepare-text")
def prepare_text(
    body: PrepareTextIn,
    _pilot: Pilot = Depends(get_current_pilot),
) -> dict:
    """«Свой текст» из трюма: та же подготовка, что у книг (без склеек), с отчётом о склейках."""
    from app.glue_fix import examples, repair
    from app.text_processing import process_text

    assert_text_len(body.text or "")
    o = norm_opts(body.opts)
    glue = o.pop("glue", True)
    plain = process_text(body.text or "", **o, glue=False)
    fixes = []
    if glue:
        plain, fixes = repair(plain)
        if o.get("spaces", True):
            plain = " ".join(plain.split())
    return {"text": plain, "count": len(fixes), "examples": examples(fixes, 8)}
