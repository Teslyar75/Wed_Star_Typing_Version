"""АНГЛИЙСКИЙ: минимальный словарь + SM-2 (фаза 5)."""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import Date, Float, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, Session

from app.db import Base, get_db

router = APIRouter(prefix="/api/english", tags=["english"])

# встроенный мини-словарь (полный vocab.json — позже из stamina)
SEED = [
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


def sm2(ease: float, interval: int, reps: int, grade: int) -> tuple[float, int, int]:
    """Классический SM-2: grade 0–5 (мы принимаем 1–4 → map)."""
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
    pilot_id: int = 1


@router.post("/seed")
def seed_vocab(db: Session = Depends(get_db)) -> dict[str, int]:
    n = 0
    for w, tr, ex in SEED:
        if db.query(VocabWord).filter_by(word=w).first():
            continue
        db.add(VocabWord(word=w, translation=tr, example=ex))
        n += 1
    db.commit()
    return {"added": n}


@router.get("/words", response_model=list[WordOut])
def list_words(limit: int = 50, db: Session = Depends(get_db)) -> list[VocabWord]:
    if db.query(VocabWord).count() == 0:
        seed_vocab(db)
    return db.query(VocabWord).order_by(VocabWord.id).limit(limit).all()


@router.post("/review")
def review(body: ReviewIn, db: Session = Depends(get_db)) -> dict:
    w = db.get(VocabWord, body.word_id)
    if w is None:
        raise HTTPException(404, "word not found")
    card = (
        db.query(CardProgress)
        .filter_by(pilot_id=body.pilot_id, word_id=body.word_id)
        .first()
    )
    if card is None:
        card = CardProgress(pilot_id=body.pilot_id, word_id=body.word_id, due=date.today())
        db.add(card)
        db.flush()
    ease, interval, reps = sm2(card.ease, card.interval, card.reps, body.grade)
    card.ease, card.interval, card.reps = ease, interval, reps
    card.due = date.today() + timedelta(days=max(1, interval) if interval else 1)
    db.commit()
    return {"ease": ease, "interval": interval, "reps": reps, "due": str(card.due)}
