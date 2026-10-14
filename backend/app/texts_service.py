"""Импорт текстов в БД: mono и bilingual.

Параграфы/предложения = оригинал (чтение: гипердрайв, книга).
TextDoc.prepared = адаптированный текст только для набора.
"""

from __future__ import annotations

import json

from sqlalchemy.orm import Session

from app.align import align_by_paragraphs
from app.models import Paragraph, Segment, Sentence, TextDoc
from app.segment import segment_text
from app.text_processing import DEFAULT_PREP_OPTS, norm_opts, process_text


def rebuild_original_body(db: Session, text_id: int) -> str:
    """Собрать оригинал из paragraphs (fallback: sentences). Никогда не prepared."""
    paras = (
        db.query(Paragraph)
        .filter(Paragraph.text_id == text_id)
        .order_by(Paragraph.idx)
        .all()
    )
    body = "\n\n".join((p.body or "").strip() for p in paras if (p.body or "").strip())
    if body.strip():
        return body
    sents = (
        db.query(Sentence)
        .filter(Sentence.text_id == text_id)
        .order_by(Sentence.idx)
        .all()
    )
    return " ".join((s.body or "").strip() for s in sents if (s.body or "").strip())


def make_prepared(original: str, opts: dict | None = None) -> tuple[str, str]:
    """Вернуть (prepared_text, prep_opts_json)."""
    o = norm_opts(opts)
    return process_text(original, **o), json.dumps(o, ensure_ascii=False)


def ensure_prepared(db: Session, doc: TextDoc, *, opts: dict | None = None) -> str:
    """Лениво сгенерировать prepared, если пусто (старые тексты)."""
    if (doc.prepared or "").strip() and not opts:
        return doc.prepared
    original = rebuild_original_body(db, doc.id)
    if not original.strip():
        return ""
    use_opts = opts
    if use_opts is None and (doc.prep_opts or "").strip():
        try:
            use_opts = json.loads(doc.prep_opts)
        except json.JSONDecodeError:
            use_opts = None
    prepared, opts_json = make_prepared(original, use_opts)
    doc.prepared = prepared
    doc.prep_opts = opts_json
    db.commit()
    db.refresh(doc)
    return prepared


def _persist_mono(db: Session, title: str, lang: str, source: str, raw: str) -> TextDoc:
    data = segment_text(raw, lang=lang)
    prepared, opts_json = make_prepared(raw, DEFAULT_PREP_OPTS)
    doc = TextDoc(
        title=title or "Untitled",
        lang=lang,
        source=source,
        prepared=prepared,
        prep_opts=opts_json,
    )
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
    source: str = "bilingual",
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

    # 2ЯЗ: печать закрыта — prepared не нужен
    doc = TextDoc(
        title=title or "Bilingual",
        lang=f"{lang_src}-{lang_tgt}",
        source=(source or "bilingual").strip() or "bilingual",
        prepared="",
        prep_opts="",
    )
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
