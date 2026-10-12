"""АНГЛИЙСКИЙ: словарь (seed из stamina), SM-2, склад due-карт."""

from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import Date, Float, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, Session

from app.auth_deps import get_optional_pilot
from app.config import settings
from app.db import Base, get_db
from app.pilots import Pilot

router = APIRouter(prefix="/api/english", tags=["english"])

FALLBACK_SEED = [
    ("the", "определённый артикль", "the cat"),
    ("and", "и", "cats and dogs"),
    ("learn", "учить", "I learn English"),
    ("type", "печатать", "type faster"),
    ("space", "космос / пробел", "outer space"),
]


class VocabWord(Base):
    __tablename__ = "vocab_words"
    __table_args__ = (UniqueConstraint("word", name="uq_word"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    word: Mapped[str] = mapped_column(String(64), index=True)
    translation: Mapped[str] = mapped_column(String(256), default="")
    example: Mapped[str] = mapped_column(Text, default="")


class CardProgress(Base):
    __tablename__ = "card_progress"
    __table_args__ = (UniqueConstraint("pilot_id", "word_id", name="uq_card"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pilot_id: Mapped[int] = mapped_column(Integer, index=True)
    word_id: Mapped[int] = mapped_column(Integer)
    ease: Mapped[float] = mapped_column(Float, default=2.5)
    interval: Mapped[int] = mapped_column(Integer, default=0)
    reps: Mapped[int] = mapped_column(Integer, default=0)
    due: Mapped[date] = mapped_column(Date, default=date.today)
    bin: Mapped[str] = mapped_column(String(32), default="inbox")  # inbox|favorite|learned
    english_xp: Mapped[int] = mapped_column(Integer, default=0)


ENGLISH_RANKS = [
    (0, "Кадет EN"),
    (40, "Слушатель"),
    (120, "Голос экипажа"),
    (300, "Переводчик"),
    (700, "Лингвист флота"),
]


def rank_for_xp(xp: int) -> tuple[str, int, int | None]:
    current = ENGLISH_RANKS[0]
    nxt: int | None = None
    for i, (thr, name) in enumerate(ENGLISH_RANKS):
        if xp >= thr:
            current = (thr, name)
            nxt = ENGLISH_RANKS[i + 1][0] if i + 1 < len(ENGLISH_RANKS) else None
    return current[1], current[0], nxt


def sm2(ease: float, interval: int, reps: int, grade: int) -> tuple[float, int, int]:
    q = {1: 1, 2: 3, 3: 4, 4: 5}.get(grade, grade)
    if q < 3:
        return max(1.3, ease - 0.2), 0, 0
    if reps == 0:
        interval = 1
    elif reps == 1:
        interval = 6
    else:
        interval = max(1, int(round(interval * ease)))
    ease = max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
    return ease, interval, reps + 1


class WordOut(BaseModel):
    id: int
    word: str
    translation: str
    example: str

    model_config = {"from_attributes": True}


class ReviewIn(BaseModel):
    word_id: int
    grade: int = Field(ge=1, le=4)


class MoveIn(BaseModel):
    word_id: int
    bin: str = Field(pattern="^(inbox|favorite|learned)$")


class FromBookIn(BaseModel):
    text_id: int
    up_to_sentence_id: int = 50
    limit: int = Field(default=20, ge=1, le=100)


def _vocab_candidates(limit: int) -> list[Path]:
    here = Path(__file__).resolve().parent
    root = settings.repo_root()
    bundled = here / "data" / "vocab_seed.json"
    full = root / "stamina" / "english" / "data" / "vocab.json"
    dev = root / "stamina" / "english" / "data" / "vocab_dev.json"
    # для больших лимитов сначала полный словарь десктопа
    if limit > 2500:
        return [full, dev, bundled]
    return [bundled, full, dev]


def _iter_seed_rows(limit: int) -> list[tuple[str, str, str]]:
    for path in _vocab_candidates(limit):
        if not path.is_file():
            continue
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        words = raw.get("words") if isinstance(raw, dict) else raw
        if not isinstance(words, list):
            continue
        rows: list[tuple[str, str, str]] = []
        for item in words:
            if not isinstance(item, dict):
                continue
            w = (item.get("word") or "").strip()
            if not w:
                continue
            tr = (item.get("ru") or item.get("translation") or "")[:240]
            ex = (item.get("example") or item.get("definition") or "")[:400]
            rows.append((w, tr, ex))
            if len(rows) >= limit:
                break
        if rows:
            return rows
    return [(w, tr, ex) for w, tr, ex in FALLBACK_SEED]


@router.post("/seed")
def seed_vocab(
    db: Session = Depends(get_db),
    limit: int = Query(20000, ge=1, le=20000),
) -> dict[str, int]:
    n = 0
    for w, tr, ex in _iter_seed_rows(limit):
        if db.query(VocabWord).filter_by(word=w).first():
            continue
        db.add(VocabWord(word=w, translation=tr, example=ex))
        n += 1
    db.commit()
    return {"added": n, "total": db.query(VocabWord).count()}


@router.get("/words", response_model=list[WordOut])
def list_words(limit: int = 50, offset: int = 0, db: Session = Depends(get_db)) -> list[VocabWord]:
    if db.query(VocabWord).count() == 0:
        seed_vocab(db)
    return (
        db.query(VocabWord)
        .order_by(VocabWord.id)
        .offset(max(0, offset))
        .limit(max(1, min(limit, 500)))
        .all()
    )


@router.get("/warehouse", response_model=list[WordOut])
def warehouse_due(
    limit: int = 20,
    bin: str = Query("due"),
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> list[VocabWord]:
    """Склад: due | favorite | learned | inbox."""
    if db.query(VocabWord).count() == 0:
        seed_vocab(db)
    pid = pilot.id if pilot else 0
    limit = max(1, min(limit, 100))

    if bin == "favorite":
        ids = [
            r.word_id
            for r in db.query(CardProgress).filter_by(pilot_id=pid, bin="favorite").limit(limit).all()
        ]
        return db.query(VocabWord).filter(VocabWord.id.in_(ids)).all() if ids else []

    if bin == "learned":
        ids = [
            r.word_id
            for r in db.query(CardProgress)
            .filter(CardProgress.pilot_id == pid, CardProgress.bin == "learned")
            .limit(limit)
            .all()
        ]
        return db.query(VocabWord).filter(VocabWord.id.in_(ids)).all() if ids else []

    if bin == "inbox":
        ids = [
            r.word_id
            for r in db.query(CardProgress).filter_by(pilot_id=pid, bin="inbox").limit(limit).all()
        ]
        if ids:
            return db.query(VocabWord).filter(VocabWord.id.in_(ids)).all()
        seen = {r.word_id for r in db.query(CardProgress).filter_by(pilot_id=pid).all()}
        q = db.query(VocabWord).order_by(VocabWord.id)
        if seen:
            q = q.filter(~VocabWord.id.in_(seen))
        return q.limit(limit).all()

    # due (default)
    due_ids = [
        r.word_id
        for r in db.query(CardProgress)
        .filter(
            CardProgress.pilot_id == pid,
            CardProgress.due <= date.today(),
            CardProgress.bin != "learned",
        )
        .order_by(CardProgress.due)
        .limit(limit)
        .all()
    ]
    if due_ids:
        return db.query(VocabWord).filter(VocabWord.id.in_(due_ids)).all()
    seen = {r.word_id for r in db.query(CardProgress).filter_by(pilot_id=pid).all()}
    q = db.query(VocabWord).order_by(VocabWord.id)
    if seen:
        q = q.filter(~VocabWord.id.in_(seen))
    return q.limit(limit).all()


@router.post("/move")
def move_word(
    body: MoveIn,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    w = db.get(VocabWord, body.word_id)
    if w is None:
        raise HTTPException(404, "word not found")
    pid = pilot.id if pilot else 0
    card = db.query(CardProgress).filter_by(pilot_id=pid, word_id=body.word_id).first()
    if card is None:
        card = CardProgress(pilot_id=pid, word_id=body.word_id, due=date.today())
        db.add(card)
    card.bin = body.bin
    db.commit()
    return {"ok": True, "bin": card.bin}


@router.post("/from-book")
def from_book(
    body: FromBookIn,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    """Карточки из сегментов книги: EN слово ← translation как подсказка."""
    import re

    from app.models import Segment, TextDoc

    if db.get(TextDoc, body.text_id) is None:
        raise HTTPException(404, "text not found")
    segs = (
        db.query(Segment)
        .filter(Segment.text_id == body.text_id, Segment.idx <= body.up_to_sentence_id)
        .order_by(Segment.idx)
        .all()
    )
    added = 0
    word_ids: list[int] = []
    for seg in segs:
        tokens = re.findall(r"[A-Za-z']{3,}", seg.original or "")
        hint = (seg.translation or "")[:240]
        for tok in tokens[:4]:
            w = tok.lower()
            row = db.query(VocabWord).filter_by(word=w).first()
            if row is None:
                row = VocabWord(word=w, translation=hint, example=(seg.original or "")[:400])
                db.add(row)
                db.flush()
                added += 1
            word_ids.append(row.id)
            if len(word_ids) >= body.limit:
                break
        if len(word_ids) >= body.limit:
            break
    pid = pilot.id if pilot else 0
    for wid in word_ids:
        if db.query(CardProgress).filter_by(pilot_id=pid, word_id=wid).first() is None:
            db.add(CardProgress(pilot_id=pid, word_id=wid, due=date.today(), bin="inbox"))
    db.commit()
    return {"added_vocab": added, "cards": len(word_ids), "word_ids": word_ids}


@router.get("/progress")
def english_progress(
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    pid = pilot.id if pilot else 0
    cards = db.query(CardProgress).filter_by(pilot_id=pid).all()
    xp = sum(c.english_xp for c in cards)
    name, thr, nxt = rank_for_xp(xp)
    return {
        "xp": xp,
        "rank": name,
        "rank_threshold": thr,
        "next_threshold": nxt,
        "favorite": sum(1 for c in cards if c.bin == "favorite"),
        "learned": sum(1 for c in cards if c.bin == "learned"),
        "inbox": sum(1 for c in cards if c.bin == "inbox"),
        "due": sum(1 for c in cards if c.bin != "learned" and c.due <= date.today()),
    }


@router.post("/review")
def review(
    body: ReviewIn,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    w = db.get(VocabWord, body.word_id)
    if w is None:
        raise HTTPException(404, "word not found")
    pid = pilot.id if pilot else 0
    card = db.query(CardProgress).filter_by(pilot_id=pid, word_id=body.word_id).first()
    if card is None:
        card = CardProgress(pilot_id=pid, word_id=body.word_id, due=date.today())
        db.add(card)
        db.flush()
    ease, interval, reps = sm2(card.ease, card.interval, card.reps, body.grade)
    card.ease, card.interval, card.reps = ease, interval, reps
    card.due = date.today() + timedelta(days=max(1, interval) if interval else 1)
    gain = 3 if body.grade >= 3 else 1
    card.english_xp = (card.english_xp or 0) + gain
    if body.grade >= 4 and card.reps >= 3:
        card.bin = "learned"
    if pilot is not None:
        pilot.xp += 2 if body.grade >= 3 else 1
    db.commit()
    return {"ease": ease, "interval": interval, "reps": reps, "due": str(card.due), "pilot_id": pid, "english_xp": card.english_xp}
