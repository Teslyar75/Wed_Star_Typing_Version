"""API текстов: импорт, сегменты."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Segment, TextDoc
from app.texts_service import import_bilingual, import_text

router = APIRouter(prefix="/api/texts", tags=["texts"])


class TextCreate(BaseModel):
    title: str = ""
    lang: str = "und"
    content: str = Field(min_length=1)


class BilingualCreate(BaseModel):
    title: str = ""
    lang_src: str = "en"
    lang_tgt: str = "ru"
    original: str = Field(min_length=1)
    translation: str = Field(min_length=1)


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
def create_text(body: TextCreate, db: Session = Depends(get_db)) -> TextDoc:
    return import_text(db, title=body.title, lang=body.lang, content=body.content)


@router.post("/upload", response_model=TextOut)
async def upload_text(
    file: UploadFile = File(...),
    title: str = Form(""),
    lang: str = Form("und"),
    db: Session = Depends(get_db),
) -> TextDoc:
    import tempfile
    from pathlib import Path

    raw = await file.read()
    name = (file.filename or "").lower()
    if name.endswith(".pdf"):
        content = ""
        try:
            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
                tmp.write(raw)
                path = Path(tmp.name)
            try:
                from stamina.pdf_import import load as pdf_load

                result = pdf_load(path)
                content = result.text or ""
                if result.scanned and not content.strip():
                    raise HTTPException(400, "PDF looks scanned (no text layer)")
            finally:
                path.unlink(missing_ok=True)
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001
            try:
                import io

                from pypdf import PdfReader

                reader = PdfReader(io.BytesIO(raw))
                content = "\n".join((p.extract_text() or "") for p in reader.pages)
            except Exception as exc2:  # noqa: BLE001
                raise HTTPException(400, f"PDF import failed: {exc}; {exc2}") from exc2
    else:
        content = raw.decode("utf-8", errors="replace")
    if not content.strip():
        raise HTTPException(400, "empty file")
    return import_text(
        db,
        title=title or (file.filename or "upload"),
        lang=lang,
        content=content,
        source="pdf" if name.endswith(".pdf") else "upload",
    )


@router.post("/bilingual", response_model=TextOut)
def create_bilingual(body: BilingualCreate, db: Session = Depends(get_db)) -> TextDoc:
    return import_bilingual(
        db,
        title=body.title,
        lang_src=body.lang_src,
        lang_tgt=body.lang_tgt,
        original=body.original,
        translation=body.translation,
    )


@router.get("/{text_id}", response_model=TextOut)
def get_text(text_id: int, db: Session = Depends(get_db)) -> TextDoc:
    doc = db.get(TextDoc, text_id)
    if doc is None:
        raise HTTPException(404, "text not found")
    return doc


@router.get("/{text_id}/content")
def get_text_content(text_id: int, db: Session = Depends(get_db)) -> dict:
    """Полный текст книги для гипердрайва / страницы «Книга»."""
    from app.models import Paragraph, Sentence

    doc = db.get(TextDoc, text_id)
    if doc is None:
        raise HTTPException(404, "text not found")
    paras = (
        db.query(Paragraph)
        .filter(Paragraph.text_id == text_id)
        .order_by(Paragraph.idx)
        .all()
    )
    body = "\n\n".join((p.body or "").strip() for p in paras if (p.body or "").strip())
    if not body.strip():
        sents = (
            db.query(Sentence)
            .filter(Sentence.text_id == text_id)
            .order_by(Sentence.idx)
            .all()
        )
        body = " ".join((s.body or "").strip() for s in sents if (s.body or "").strip())
    return {
        "id": doc.id,
        "title": doc.title or f"#{doc.id}",
        "lang": doc.lang or "und",
        "body": body,
        "chars": len(body),
    }


@router.get("/{text_id}/segments", response_model=list[SegmentOut])
def get_segments(
    text_id: int,
    offset: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
) -> list[Segment]:
    if db.get(TextDoc, text_id) is None:
        raise HTTPException(404, "text not found")
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
