"""Импорт текстов в БД: mono и bilingual."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.align import align_by_paragraphs
from app.models import Paragraph, Segment, Sentence, TextDoc
from app.segment import segment_text


def _persist_mono(db: Session, title: str, lang: str, source: str, raw: str) -> TextDoc:
    data = segment_text(raw, lang=lang)
    doc = TextDoc(title=title or "Untitled", lang=lang, source=source)
    db.add(doc)
    db.flush()
    para_rows: dict[int, Paragraph] = {}
    for p in data["paragraphs"]:
        row = Paragraph(
            text_id=doc.id,
            idx=p["idx"],
            body=p["body"],
            char_start=p["char_start"],
            char_end=p["char_end"],
        )
        db.add(row)
        db.flush()
        para_rows[p["idx"]] = row
    for s in data["sentences"]:
        db.add(Sentence(
            text_id=doc.id,
            paragraph_id=para_rows.get(s["para_idx"]).id if s["para_idx"] in para_rows else None,
            idx=s["idx"],
            para_idx=s["para_idx"],
            body=s["body"],
            char_start=s["char_start"],
            char_end=s["char_end"],
        ))
    # моно: сегменты = предложения без перевода
    for s in data["sentences"]:
        db.add(Segment(
            text_id=doc.id,
            idx=s["idx"],
            para_idx=s["para_idx"],
            original=s["body"],
            translation="",
            status="aligned",
            char_start=s["char_start"],
            char_end=s["char_end"],
        ))
    db.commit()
    db.refresh(doc)
    return doc


def import_text(db: Session, *, title: str, lang: str, content: str, source: str = "upload") -> TextDoc:
    return _persist_mono(db, title, lang, source, content)


def import_bilingual(
    db: Session,
    *,
    title: str,
    lang_src: str,
    lang_tgt: str,
    original: str,
    translation: str,
) -> TextDoc:
    src = segment_text(original, lang=lang_src)
    tgt = segment_text(translation, lang=lang_tgt)
    # предложения по абзацам
    src_by_para: dict[int, list[str]] = {}
    for s in src["sentences"]:
        src_by_para.setdefault(s["para_idx"], []).append(s["body"])
    tgt_by_para: dict[int, list[str]] = {}
    for s in tgt["sentences"]:
        tgt_by_para.setdefault(s["para_idx"], []).append(s["body"])
    max_p = max([*src_by_para.keys(), *tgt_by_para.keys(), -1])
    src_lists = [src_by_para.get(i, []) for i in range(max_p + 1)]
    tgt_lists = [tgt_by_para.get(i, []) for i in range(max_p + 1)]
    pairs = align_by_paragraphs(src_lists, tgt_lists)

    doc = TextDoc(title=title or "Bilingual", lang=f"{lang_src}-{lang_tgt}", source="bilingual")
    db.add(doc)
    db.flush()
    for p in src["paragraphs"]:
        db.add(Paragraph(
            text_id=doc.id, idx=p["idx"], body=p["body"],
            char_start=p["char_start"], char_end=p["char_end"],
        ))
    for s in src["sentences"]:
        db.add(Sentence(
            text_id=doc.id, idx=s["idx"], para_idx=s["para_idx"], body=s["body"],
            char_start=s["char_start"], char_end=s["char_end"],
        ))
    for i, pair in enumerate(pairs):
        db.add(Segment(
            text_id=doc.id,
            idx=i,
            para_idx=pair.para_idx,
            original=pair.original,
            translation=pair.translation,
            status=pair.status,
        ))
    db.commit()
    db.refresh(doc)
    return doc
