"""АНГЛИЙСКИЙ: словарь (seed из stamina), SM-2, склад due-карт."""

from __future__ import annotations

import json
import random
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import Date, DateTime, Float, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, Session

from app.auth_deps import get_optional_pilot
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
    slug: Mapped[str] = mapped_column(String(80), default="", index=True)
    rank: Mapped[int] = mapped_column(Integer, default=0, index=True)
    # JSON: ipa, definition, pos, sentences, sets, … (ENGLISH_DATA.md)
    meta: Mapped[str] = mapped_column(Text, default="")


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
    known: Mapped[int] = mapped_column(Integer, default=0)  # 1 = «ЗНАЮ» в сканере
    my_tr: Mapped[str] = mapped_column(String(256), default="")
    # Склад карточек (WAREHOUSE_CARDS.md): shelf | away | done | ""
    wh_state: Mapped[str] = mapped_column(String(16), default="")
    wh_runs: Mapped[int] = mapped_column(Integer, default=0)
    wh_goal: Mapped[int] = mapped_column(Integer, default=2)
    wh_stars: Mapped[int] = mapped_column(Integer, default=0)
    wh_avg: Mapped[float] = mapped_column(Float, default=0.0)


class EnglishList(Base):
    """Пользовательский отсек (Избранное / свои списки)."""

    __tablename__ = "english_lists"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pilot_id: Mapped[int] = mapped_column(Integer, index=True)
    name: Mapped[str] = mapped_column(String(128), default="")
    kind: Mapped[str] = mapped_column(String(32), default="custom")  # favorite|custom
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EnglishListItem(Base):
    __tablename__ = "english_list_items"
    __table_args__ = (UniqueConstraint("list_id", "word_id", name="uq_list_word"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    list_id: Mapped[int] = mapped_column(Integer, index=True)
    word_id: Mapped[int] = mapped_column(Integer, index=True)


class EnglishSettings(Base):
    __tablename__ = "english_settings"
    __table_args__ = (UniqueConstraint("pilot_id", name="uq_en_settings"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pilot_id: Mapped[int] = mapped_column(Integer, index=True)
    data: Mapped[str] = mapped_column(Text, default="{}")


class ReviewLog(Base):
    __tablename__ = "english_review_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pilot_id: Mapped[int] = mapped_column(Integer, index=True)
    word_id: Mapped[int] = mapped_column(Integer)
    grade: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SpeechAttempt(Base):
    """Попытка произношения / ответа — для точности по режимам в журнале."""

    __tablename__ = "english_speech_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pilot_id: Mapped[int] = mapped_column(Integer, index=True)
    word_id: Mapped[int] = mapped_column(Integer, default=0)
    mode: Mapped[str] = mapped_column(String(32), default="speaking")  # speaking|reading|questions|review
    score: Mapped[int] = mapped_column(Integer, default=0)
    ok: Mapped[int] = mapped_column(Integer, default=0)  # 1 если score >= 60
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


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
    slug: str = ""
    rank: int = 0
    pos: str = ""
    difficulty: str = ""
    definition: str = ""
    ipa: str = ""
    respelling: str = ""
    guide: str = ""
    notes: list[str] = []
    example_ru: str = ""
    sentences: list[dict] = []
    sets: list[str] = []
    my_tr: str = ""
    known: bool = False
    wh_state: str = ""
    wh_runs: int = 0
    wh_goal: int = 2
    wh_stars: int = 0
    wh_avg: float = 0.0

    model_config = {"from_attributes": True}


def _parse_meta(raw: str | None) -> dict:
    if not (raw or "").strip():
        return {}
    try:
        j = json.loads(raw)
        return j if isinstance(j, dict) else {}
    except json.JSONDecodeError:
        return {}


def serialize_word(w: VocabWord, card: CardProgress | None = None) -> WordOut:
    m = _parse_meta(w.meta)
    tr = (card.my_tr if card and (card.my_tr or "").strip() else "") or w.translation or m.get("ru") or ""
    return WordOut(
        id=w.id,
        word=w.word,
        translation=tr,
        example=w.example or "",
        slug=(w.slug or m.get("slug") or w.word.lower()),
        rank=int(w.rank or m.get("rank") or 0),
        pos=(m.get("pos") or ""),
        difficulty=(m.get("difficulty") or ""),
        definition=(m.get("definition") or ""),
        ipa=(m.get("ipa") or ""),
        respelling=(m.get("respelling") or ""),
        guide=(m.get("guide") or ""),
        notes=list(m.get("notes") or []),
        example_ru=(m.get("example_ru") or ""),
        sentences=list(m.get("sentences") or []),
        sets=[str(x) for x in (m.get("sets") or [])],
        my_tr=(card.my_tr if card else "") or "",
        known=bool(card and card.known),
        wh_state=(card.wh_state if card else "") or "",
        wh_runs=int(card.wh_runs if card else 0),
        wh_goal=int(card.wh_goal if card else 2) or 2,
        wh_stars=int(card.wh_stars if card else 0),
        wh_avg=float(card.wh_avg if card else 0),
    )


DEFAULT_EN_SETTINGS = {
    "tts_rate": 1.0,
    "auto_speak": False,
    "asr": True,
    "self_score": True,
    "current_set": "top-3000",
    "daily_goal": 30,
    "new_per_day": 20,
    "mission_len": 10,
    "reverse_cards": False,
    "xp_to_rank": True,
    "warehouse_passes": 2,
}


class ReviewIn(BaseModel):
    word_id: int
    grade: int = Field(ge=1, le=4)


class AttemptIn(BaseModel):
    word_id: int = 0
    mode: str = Field(default="speaking", pattern="^(speaking|reading|questions|review)$")
    score: int = Field(ge=0, le=100)


class MoveIn(BaseModel):
    word_id: int
    bin: str = Field(pattern="^(inbox|favorite|learned)$")


class KnownIn(BaseModel):
    word_id: int
    known: bool = True
    my_tr: str = ""


class WarehouseMoveIn(BaseModel):
    word_id: int
    state: str = Field(pattern="^(shelf|away|done)$")


class WarehouseRunIn(BaseModel):
    word_id: int
    avg: float = Field(ge=0, le=100)
    goal: int | None = Field(default=None, ge=1, le=5)


class ListCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=128)


class ListWordIn(BaseModel):
    word_id: int


class MissionStartIn(BaseModel):
    mode: str = Field(pattern="^(random|speaking|reading|questions)$")
    set_id: str = "top-3000"
    length: int = Field(default=10, ge=5, le=20)
    source: str = "set"  # set | due | inbox | favorite | list | mistakes | book
    list_id: int | None = None
    single: str | None = None  # одно слово (сканер → миссия)
    speech_ok: bool = True


class SettingsIn(BaseModel):
    tts_rate: float | None = None
    auto_speak: bool | None = None
    asr: bool | None = None
    self_score: bool | None = None
    current_set: str | None = None
    daily_goal: int | None = None
    new_per_day: int | None = None
    mission_len: int | None = None
    reverse_cards: bool | None = None
    xp_to_rank: bool | None = None
    warehouse_passes: int | None = None


class FromBookIn(BaseModel):
    text_id: int
    up_to_sentence_id: int = 50
    limit: int = Field(default=20, ge=1, le=100)


_SEED_ROWS_CACHE: dict[int, list[dict]] = {}


def _iter_seed_rows(limit: int) -> list[dict]:
    """Полные записи словаря (ENGLISH_DATA) + fallback seed."""
    from app.english_vocab import load_raw_words, word_meta

    cached = _SEED_ROWS_CACHE.get(limit)
    if cached is not None:
        return cached
    raw = load_raw_words(limit, include_dev=True)
    rows: list[dict] = []
    for item in raw:
        w = (item.get("word") or "").strip()
        if not w:
            continue
        meta = word_meta(item)
        # example: первое предложение или поле example
        ex = (item.get("example") or "")[:400]
        if not ex and meta.get("sentences"):
            ex = (meta["sentences"][0].get("en") or "")[:400]
        rows.append(
            {
                "word": w,
                "translation": (item.get("ru") or item.get("translation") or "")[:240],
                "example": ex,
                "slug": meta.get("slug") or w.lower(),
                "rank": int(meta.get("rank") or 0),
                "meta": json.dumps(meta, ensure_ascii=False),
            }
        )
        freq_n = sum(1 for r in rows if not str(r["slug"]).startswith("dev:"))
        if freq_n >= limit and str(rows[-1]["slug"]).startswith("dev:"):
            continue
        if freq_n >= limit and not str(rows[-1]["slug"]).startswith("dev:"):
            # продолжаем только для dev
            pass
    if not rows:
        rows = [
            {
                "word": w,
                "translation": tr,
                "example": ex,
                "slug": w.lower(),
                "rank": i + 1,
                "meta": "{}",
            }
            for i, (w, tr, ex) in enumerate(FALLBACK_SEED)
        ]
    _SEED_ROWS_CACHE[limit] = rows
    return rows


def _seed_vocab(db: Session, limit: int = 20000, batch: int = 400) -> dict[str, int | bool]:
    """Досеять словарь порцией + починить rank/slug у уже вставленных слов.

    Ранний сид мог вставить top-слова с rank=0; повторный insert их пропускал —
    из-за этого S-1000 показывал НАЙДЕНО: 0 при полном словаре.
    """
    limit = max(1, min(int(limit), 20580))
    batch = max(1, min(int(batch), 2000))
    total = db.query(VocabWord).count()
    target = max(limit, 20000)
    rows = _iter_seed_rows(20000)
    by_src = {r["word"].lower(): r for r in rows}

    n_add = 0
    n_upd = 0

    # 1) Починить порцию rank=0 (частотные слова без ранга)
    zeros = (
        db.query(VocabWord)
        .filter(VocabWord.rank == 0)
        .filter(~VocabWord.slug.like("dev:%"))
        .order_by(VocabWord.id)
        .limit(batch)
        .all()
    )
    for w in zeros:
        src = by_src.get((w.word or "").lower())
        if not src:
            continue
        want = int(src.get("rank") or 0)
        if want <= 0:
            continue
        w.rank = want
        slug = (src.get("slug") or w.word.lower()).strip()
        if slug:
            w.slug = slug
        if (src.get("meta") or "") and (not w.meta or w.meta == "{}"):
            w.meta = src["meta"]
        if (src.get("translation") or "") and not (w.translation or "").strip():
            w.translation = src["translation"]
        n_upd += 1

    # 2) Досев недостающих слов (по курсору total → конец источника)
    if total < len(rows):
        start = min(total, len(rows))
        chunk = rows[start : start + batch]
        words = [r["word"] for r in chunk]
        have = {
            (x or "").lower()
            for (x,) in db.query(VocabWord.word).filter(VocabWord.word.in_(words or ["__none__"])).all()
        }
        for r in chunk:
            key = r["word"].lower()
            if key in have:
                continue
            db.add(
                VocabWord(
                    word=r["word"],
                    translation=r["translation"],
                    example=r["example"],
                    slug=(r.get("slug") or r["word"].lower()).strip(),
                    rank=int(r.get("rank") or 0),
                    meta=r.get("meta") or "",
                )
            )
            n_add += 1
            have.add(key)

    if n_add or n_upd:
        db.commit()
        total = db.query(VocabWord).count()

    zero_left = (
        db.query(VocabWord)
        .filter(VocabWord.rank == 0)
        .filter(~VocabWord.slug.like("dev:%"))
        .count()
    )
    done = total >= len(rows) and zero_left == 0
    return {
        "added": n_add,
        "updated": n_upd,
        "total": total,
        "done": done,
        "target": target,
        "zero_rank": zero_left,
    }


@router.post("/seed")
def seed_vocab(
    db: Session = Depends(get_db),
    limit: int = Query(20000, ge=1, le=21000),
    batch: int = Query(400, ge=1, le=2000),
) -> dict[str, int | bool]:
    return _seed_vocab(db, limit, batch)


@router.get("/words", response_model=list[WordOut])
def list_words(limit: int = 50, offset: int = 0, db: Session = Depends(get_db)) -> list[VocabWord]:
    if db.query(VocabWord).count() == 0:
        _seed_vocab(db)
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
        _seed_vocab(db)
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
    today = date.today()
    streak = 0
    day_flags: list[bool] = []
    for i in range(14):
        day = today - timedelta(days=13 - i)
        start = datetime.combine(day, datetime.min.time())
        end = datetime.combine(day, datetime.max.time())
        n = (
            db.query(ReviewLog)
            .filter(ReviewLog.pilot_id == pid, ReviewLog.created_at >= start, ReviewLog.created_at <= end)
            .count()
        )
        day_flags.append(n > 0)
    for i in range(30):
        day = today - timedelta(days=i)
        start = datetime.combine(day, datetime.min.time())
        end = datetime.combine(day, datetime.max.time())
        n = (
            db.query(ReviewLog)
            .filter(ReviewLog.pilot_id == pid, ReviewLog.created_at >= start, ReviewLog.created_at <= end)
            .count()
        )
        if n == 0:
            if i == 0:
                continue
            break
        streak += 1
    start_t = datetime.combine(today, datetime.min.time())
    end_t = datetime.combine(today, datetime.max.time())
    reviews_today = (
        db.query(ReviewLog)
        .filter(ReviewLog.pilot_id == pid, ReviewLog.created_at >= start_t, ReviewLog.created_at <= end_t)
        .count()
    )
    xp_today = reviews_today * 3
    daily_goal = 30
    new_per_day = 20
    # грубый уровень по XP (как UI телеметрии)
    level = 1
    lo, hi = 0, 40
    for i, (thr, _) in enumerate(ENGLISH_RANKS):
        if xp >= thr:
            level = i + 1
            lo = thr
            hi = ENGLISH_RANKS[i + 1][0] if i + 1 < len(ENGLISH_RANKS) else thr + 400
    learned = sum(1 for c in cards if c.bin == "learned")
    due = sum(1 for c in cards if c.bin != "learned" and c.due <= date.today())
    return {
        "xp": xp,
        "rank": name,
        "rank_threshold": thr,
        "next_threshold": nxt,
        "favorite": sum(1 for c in cards if c.bin == "favorite"),
        "learned": learned,
        "inbox": sum(1 for c in cards if c.bin == "inbox"),
        "due": due,
        "streak_days": streak,
        "best_streak": max(streak, sum(1 for f in day_flags if f)),
        "day_flags": day_flags,
        "daily_goal": daily_goal,
        "xp_today": xp_today,
        "new_available": new_per_day,
        "level": level,
        "level_lo": lo,
        "level_hi": hi,
        "vocab_total": db.query(VocabWord).count(),
    }


@router.get("/word-of-day")
def word_of_day(db: Session = Depends(get_db)) -> dict:
    if db.query(VocabWord).count() == 0:
        _seed_vocab(db)
    rows = db.query(VocabWord).order_by(VocabWord.id).limit(500).all()
    if not rows:
        return {"id": 0, "word": "—", "translation": "", "example": "", "rank": 0, "pos": "—"}
    idx = date.today().toordinal() % len(rows)
    w = rows[idx]
    return {
        "id": w.id,
        "word": w.word,
        "translation": w.translation,
        "example": w.example,
        "rank": w.id,
        "pos": "NOUN",
    }


@router.get("/log")
def english_log(
    limit: int = 40,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> list[dict]:
    pid = pilot.id if pilot else 0
    rows = (
        db.query(ReviewLog)
        .filter_by(pilot_id=pid)
        .order_by(ReviewLog.id.desc())
        .limit(max(1, min(limit, 100)))
        .all()
    )
    out = []
    for r in rows:
        w = db.get(VocabWord, r.word_id)
        out.append(
            {
                "id": r.id,
                "word_id": r.word_id,
                "word": w.word if w else "?",
                "grade": r.grade,
                "at": r.created_at.isoformat() if r.created_at else None,
            }
        )
    return out


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
        card.known = 1
    # Склад: выученное (interval≥21) с примерами → shelf
    if card.interval >= 21 and (card.wh_state or "") not in ("away", "done"):
        meta = _parse_meta(w.meta)
        if meta.get("sentences") or (w.example or "").strip():
            card.wh_state = card.wh_state or "shelf"
    db.add(ReviewLog(pilot_id=pid, word_id=body.word_id, grade=body.grade))
    if pilot is not None:
        pilot.xp += 2 if body.grade >= 3 else 1
    db.commit()
    return {
        "ease": ease,
        "interval": interval,
        "reps": reps,
        "due": str(card.due),
        "pilot_id": pid,
        "english_xp": card.english_xp,
        "preview_days": interval,
    }


@router.post("/attempt")
def record_attempt(
    body: AttemptIn,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    """Как progress.record_attempt на десктопе — для журнала «точность по режимам»."""
    pid = pilot.id if pilot else 0
    ok = 1 if body.score >= 60 else 0
    db.add(
        SpeechAttempt(
            pilot_id=pid,
            word_id=body.word_id,
            mode=body.mode,
            score=body.score,
            ok=ok,
        )
    )
    # XP как scanner speaking: 5 / 3 / 0
    xp = 5 if body.score >= 85 else (3 if body.score >= 60 else 0)
    if xp and body.word_id:
        card = _card(db, pid, body.word_id)
        card.english_xp = (card.english_xp or 0) + xp
    if xp and pilot is not None:
        pilot.xp += xp
    db.commit()
    return {"ok": bool(ok), "score": body.score, "xp": xp}


@router.get("/asr/status")
def english_asr_status() -> dict:
    """Доступен ли серверный Vosk (модель + pip vosk)."""
    from app.english_asr import asr_status

    return asr_status()


@router.post("/asr")
async def english_asr(
    audio: UploadFile = File(...),
    expected: str = Form(...),
    target_word: str = Form(""),
) -> dict:
    """
    Браузер шлёт WAV 16-bit PCM; сервер гоняет Vosk + score_sentence (как десктоп).
    """
    from app.english_asr import asr_status, recognize_wav
    from app.english_score import score_best

    st = asr_status()
    if not st.get("ok"):
        raise HTTPException(status_code=503, detail=st.get("reason") or "asr unavailable")

    raw = await audio.read()
    if not raw or len(raw) < 44:
        raise HTTPException(status_code=400, detail="empty audio")
    if len(raw) > 8_000_000:
        raise HTTPException(status_code=413, detail="audio too large")

    try:
        alts = recognize_wav(raw)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=f"recognize failed: {exc}") from exc

    score, marks, heard = score_best(expected, alts, target_word.strip() or None)
    return {
        "ok": True,
        "engine": "vosk-server",
        "transcript": heard,
        "alternatives": alts,
        "score": score,
        "marks": [{"word": w, "ok": ok} for w, ok in marks],
        "error": None if heard else ("no-words" if alts == [] else "empty"),
    }


def _card(db: Session, pid: int, word_id: int) -> CardProgress:
    card = db.query(CardProgress).filter_by(pilot_id=pid, word_id=word_id).first()
    if card is None:
        card = CardProgress(pilot_id=pid, word_id=word_id, due=date.today())
        db.add(card)
        db.flush()
    return card


def _settings(db: Session, pid: int) -> dict:
    row = db.query(EnglishSettings).filter_by(pilot_id=pid).first()
    data = dict(DEFAULT_EN_SETTINGS)
    if row and (row.data or "").strip():
        try:
            data.update(json.loads(row.data))
        except json.JSONDecodeError:
            pass
    return data


@router.get("/sets")
def list_sets(db: Session = Depends(get_db), pilot: Pilot | None = Depends(get_optional_pilot)) -> list[dict]:
    from app.english_vocab import SET_LIMIT, THEMATIC_SETS, in_set, sets_catalog

    pid = pilot.id if pilot else 0
    cards = {c.word_id: c for c in db.query(CardProgress).filter_by(pilot_id=pid).all()}
    known_ids = {wid for wid, c in cards.items() if c.known or c.bin == "learned" or c.interval >= 21}
    out = []
    for s in sets_catalog():
        sid = s["id"]
        if sid in THEMATIC_SETS:
            q = db.query(VocabWord).filter(
                (VocabWord.slug.like("dev:%")) | (VocabWord.slug.like("dev-%")) | (VocabWord.word.ilike("dev:%"))
            )
            # fallback: meta.sets содержит dev-interview (через JSON — позже; пока slug)
            counted = q.count()
            cat_lim = max(1, int(s.get("limit") or 0) or 579)
            total = counted if counted > 0 else cat_lim
            known = sum(1 for w in q.limit(2000).all() if w.id in known_ids) if counted else 0
        else:
            lim = SET_LIMIT[sid]
            counted = db.query(VocabWord).filter(VocabWord.rank > 0, VocabWord.rank <= lim).count()
            # пока сид/repair не закончен — показываем каталожный лимит (как desktop)
            total = lim if counted < lim else counted
            known = (
                db.query(VocabWord)
                .filter(VocabWord.rank > 0, VocabWord.rank <= lim, VocabWord.id.in_(known_ids or [-1]))
                .count()
                if known_ids
                else 0
            )
        out.append({**s, "total": total, "known": known})
    return out


@router.get("/lookup")
def lookup_word(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> WordOut:
    if db.query(VocabWord).count() == 0:
        _seed_vocab(db, 500, 500)
    needle = q.strip().lower()
    w = (
        db.query(VocabWord)
        .filter((VocabWord.word == needle) | (VocabWord.slug == needle) | (VocabWord.word.ilike(needle)))
        .first()
    )
    if w is None:
        w = db.query(VocabWord).filter(VocabWord.word.ilike(f"{needle}%")).order_by(VocabWord.rank).first()
    if w is None:
        raise HTTPException(404, "word not found")
    pid = pilot.id if pilot else 0
    card = db.query(CardProgress).filter_by(pilot_id=pid, word_id=w.id).first()
    return serialize_word(w, card)


@router.get("/words/{word_id}", response_model=WordOut)
def get_word(
    word_id: int,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> WordOut:
    w = db.get(VocabWord, word_id)
    if w is None:
        raise HTTPException(404, "word not found")
    pid = pilot.id if pilot else 0
    card = db.query(CardProgress).filter_by(pilot_id=pid, word_id=word_id).first()
    return serialize_word(w, card)


@router.get("/set/{set_id}")
def words_in_set(
    set_id: str,
    limit: int = 60,
    offset: int = 0,
    q: str = "",
    pos: str = "",
    difficulty: str = "",
    status: str = "all",
    length: str = "all",
    sort: str = "freq",
    seed: int = 1,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    """Фильтры как desktop vocab.filtered — до пагинации."""
    import random as _rnd

    from app.english_vocab import SET_LIMIT, THEMATIC_SETS

    if db.query(VocabWord).count() == 0:
        _seed_vocab(db, 2000, 500)
    limit = max(1, min(limit, 120))
    offset = max(0, offset)
    status = (status or "all").lower()
    length = (length or "all").lower()
    sort = (sort or "freq").lower()
    pos_n = (pos or "").strip().lower()
    diff_n = (difficulty or "").strip().lower()

    query = db.query(VocabWord)
    if set_id in THEMATIC_SETS:
        query = query.filter(VocabWord.slug.like("dev:%"))
        # если S-DEV ещё не досеян — не отдаём пустоту молча (фронт покажет 0)
    else:
        lim = SET_LIMIT.get(set_id, 3000)
        query = query.filter(VocabWord.rank > 0, VocabWord.rank <= lim)
    if q.strip():
        qq = f"%{q.strip().lower()}%"
        query = query.filter(VocabWord.word.ilike(qq))
    rows = query.order_by(VocabWord.rank, VocabWord.id).all()

    pid = pilot.id if pilot else 0
    cards = {
        c.word_id: c
        for c in db.query(CardProgress).filter(CardProgress.pilot_id == pid).all()
    } if pid and (status != "all") else {
        c.word_id: c
        for c in db.query(CardProgress)
        .filter(CardProgress.pilot_id == pid, CardProgress.word_id.in_([r.id for r in rows] or [-1]))
        .all()
    } if pid else {}

    POS_MAIN = {"noun", "verb", "adjective", "adverb", "pronoun", "preposition", "conjunction"}
    DIFF_ORDER = {"easy": 0, "medium": 1, "tricky": 2}
    items: list[WordOut] = []
    for r in rows:
        wo = serialize_word(r, cards.get(r.id))
        n = len(wo.word or "")
        if length == "short" and n > 4:
            continue
        if length == "mid" and not (5 <= n <= 7):
            continue
        if length == "long" and n < 8:
            continue
        if status == "known" and not wo.known:
            continue
        if status == "unknown" and wo.known:
            continue
        if status == "review":
            card = cards.get(r.id)
            if wo.known or card is None:
                continue
        if pos_n and pos_n != "all":
            p = (wo.pos or "").lower()
            if pos_n == "other":
                if p in POS_MAIN:
                    continue
            elif p != pos_n:
                continue
        if diff_n and diff_n != "all" and (wo.difficulty or "").lower() != diff_n:
            continue
        items.append(wo)

    if sort == "random":
        _rnd.Random(max(1, int(seed) or 1)).shuffle(items)
    elif sort == "alpha":
        items.sort(key=lambda w: (w.word or "").lower())
    elif sort == "difficulty":
        items.sort(key=lambda w: (DIFF_ORDER.get((w.difficulty or "").lower(), 1), w.rank or 0, w.id))
    else:
        items.sort(key=lambda w: (w.rank or 10**9, w.id))

    total = len(items)
    page = items[offset : offset + limit]
    return {"set_id": set_id, "total": total, "offset": offset, "items": page}


@router.post("/known")
def mark_known(
    body: KnownIn,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    w = db.get(VocabWord, body.word_id)
    if w is None:
        raise HTTPException(404, "word not found")
    pid = pilot.id if pilot else 0
    card = _card(db, pid, body.word_id)
    card.known = 1 if body.known else 0
    if body.my_tr.strip():
        card.my_tr = body.my_tr.strip()[:240]
    meta = _parse_meta(w.meta)
    if body.known and (meta.get("sentences") or (w.example or "").strip()):
        if (card.wh_state or "") not in ("away", "done"):
            card.wh_state = "shelf"
    db.commit()
    return {"ok": True, "known": bool(card.known), "wh_state": card.wh_state}


@router.get("/warehouse/cards")
def warehouse_cards(
    state: str = Query("shelf"),
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> list[WordOut]:
    """Склад карточек: shelf | away | done (WAREHOUSE_CARDS.md)."""
    if state not in ("shelf", "away", "done"):
        raise HTTPException(400, "state must be shelf|away|done")
    pid = pilot.id if pilot else 0
    rows = (
        db.query(CardProgress)
        .filter(CardProgress.pilot_id == pid, CardProgress.wh_state == state)
        .order_by(CardProgress.id.desc())
        .limit(200)
        .all()
    )
    out: list[WordOut] = []
    for c in rows:
        w = db.get(VocabWord, c.word_id)
        if w is None:
            continue
        wo = serialize_word(w, c)
        if state == "shelf" and not (wo.sentences or wo.example):
            continue
        out.append(wo)
    return out


@router.post("/warehouse/move")
def warehouse_move(
    body: WarehouseMoveIn,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    w = db.get(VocabWord, body.word_id)
    if w is None:
        raise HTTPException(404, "word not found")
    pid = pilot.id if pilot else 0
    card = _card(db, pid, body.word_id)
    if body.state == "shelf":
        card.wh_state = "shelf"
        card.wh_runs = 0
        card.wh_stars = 0
        card.wh_avg = 0
        card.known = 1
    elif body.state == "away":
        card.wh_state = "away"
    else:
        card.wh_state = "done"
    db.commit()
    return {"ok": True, "state": card.wh_state}


@router.post("/warehouse/run")
def warehouse_run(
    body: WarehouseRunIn,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    """Засчитать прогон склада (ср. ≥ 85%). Авто → done при достижении goal."""
    PASS_QUALITY = 85.0
    w = db.get(VocabWord, body.word_id)
    if w is None:
        raise HTTPException(404, "word not found")
    pid = pilot.id if pilot else 0
    card = _card(db, pid, body.word_id)
    if body.goal:
        card.wh_goal = body.goal
    settings = _settings(db, pid)
    goal = card.wh_goal or int(settings.get("warehouse_passes") or 2)
    card.wh_goal = goal
    if body.avg < PASS_QUALITY:
        return {"ok": False, "accepted": False, "runs": card.wh_runs, "goal": goal, "avg": body.avg}
    card.wh_runs = (card.wh_runs or 0) + 1
    card.wh_avg = body.avg
    # звёзды по точности
    stars = 1 if body.avg >= 60 else 0
    if body.avg >= 80:
        stars = 2
    if body.avg >= 95:
        stars = 3
    card.wh_stars = max(card.wh_stars or 0, stars)
    card.english_xp = (card.english_xp or 0) + (5 if stars >= 2 else 2)
    done = False
    if card.wh_runs >= goal:
        card.wh_state = "done"
        done = True
    elif not card.wh_state:
        card.wh_state = "shelf"
    db.commit()
    return {
        "ok": True,
        "accepted": True,
        "runs": card.wh_runs,
        "goal": goal,
        "stars": card.wh_stars,
        "done": done,
        "avg": body.avg,
    }


@router.post("/missions/start")
def mission_start(
    body: MissionStartIn,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    from app.english_tasks import MODES, TaskFactory
    from app.english_vocab import SET_LIMIT, THEMATIC_SETS

    if db.query(VocabWord).count() < 20:
        _seed_vocab(db, 500, 500)
    pid = pilot.id if pilot else 0
    words_orm: list[VocabWord] = []
    if body.single:
        q = body.single.strip().lower()
        one = (
            db.query(VocabWord)
            .filter((VocabWord.word == q) | (VocabWord.slug == q) | (VocabWord.word.ilike(q)))
            .first()
        )
        words_orm = [one] if one else []
    elif body.source == "due":
        ids = [
            c.word_id
            for c in db.query(CardProgress)
            .filter(CardProgress.pilot_id == pid, CardProgress.due <= date.today(), CardProgress.bin != "learned")
            .limit(body.length * 2)
            .all()
        ]
        words_orm = db.query(VocabWord).filter(VocabWord.id.in_(ids or [-1])).all() if ids else []
    elif body.source == "favorite":
        ids = [c.word_id for c in db.query(CardProgress).filter_by(pilot_id=pid, bin="favorite").limit(40).all()]
        words_orm = db.query(VocabWord).filter(VocabWord.id.in_(ids or [-1])).all() if ids else []
    elif body.source == "inbox":
        ids = [c.word_id for c in db.query(CardProgress).filter_by(pilot_id=pid, bin="inbox").limit(40).all()]
        words_orm = db.query(VocabWord).filter(VocabWord.id.in_(ids or [-1])).all() if ids else []
    elif body.source == "list" and body.list_id:
        ids = [i.word_id for i in db.query(EnglishListItem).filter_by(list_id=body.list_id).limit(80).all()]
        words_orm = db.query(VocabWord).filter(VocabWord.id.in_(ids or [-1])).all() if ids else []
    elif body.source in ("mistakes", "book"):
        # mistakes / book: недавние карточки к повтору как пул
        ids = [
            c.word_id
            for c in db.query(CardProgress)
            .filter(CardProgress.pilot_id == pid, CardProgress.bin != "learned")
            .order_by(CardProgress.due)
            .limit(body.length * 3)
            .all()
        ]
        words_orm = db.query(VocabWord).filter(VocabWord.id.in_(ids or [-1])).all() if ids else []
    else:
        if body.set_id in THEMATIC_SETS:
            words_orm = db.query(VocabWord).filter(VocabWord.slug.like("dev:%")).order_by(VocabWord.id).limit(200).all()
        else:
            lim = SET_LIMIT.get(body.set_id, 3000)
            words_orm = (
                db.query(VocabWord)
                .filter(VocabWord.rank > 0, VocabWord.rank <= lim)
                .order_by(VocabWord.rank)
                .limit(400)
                .all()
            )
    if not words_orm:
        words_orm = db.query(VocabWord).order_by(VocabWord.id).limit(80).all()
    pool = [serialize_word(w).model_dump() for w in words_orm]
    rng = random.Random()
    rng.shuffle(pool)
    pick = pool[: body.length]
    factory = TaskFactory(pool, rng)
    tasks = factory.build(body.mode, pick, speech_ok=body.speech_ok)
    title, code, blurb = MODES[body.mode]
    return {
        "mode": body.mode,
        "code": code,
        "title": title,
        "blurb": blurb,
        "length": len(tasks),
        "tasks": tasks,
    }


@router.get("/lists")
def list_lists(db: Session = Depends(get_db), pilot: Pilot | None = Depends(get_optional_pilot)) -> list[dict]:
    pid = pilot.id if pilot else 0
    rows = db.query(EnglishList).filter_by(pilot_id=pid).order_by(EnglishList.id).all()
    # авто-создать «Избранное»
    if not any(r.kind == "favorite" for r in rows):
        fav = EnglishList(pilot_id=pid, name="Избранное", kind="favorite")
        db.add(fav)
        db.commit()
        db.refresh(fav)
        rows = [fav, *rows]
    out = []
    for r in rows:
        n = db.query(EnglishListItem).filter_by(list_id=r.id).count()
        out.append({"id": r.id, "name": r.name, "kind": r.kind, "count": n})
    return out


@router.post("/lists")
def create_list(
    body: ListCreateIn,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    pid = pilot.id if pilot else 0
    row = EnglishList(pilot_id=pid, name=body.name.strip()[:128], kind="custom")
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "name": row.name, "kind": row.kind, "count": 0}


@router.delete("/lists/{list_id}")
def delete_list(
    list_id: int,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    pid = pilot.id if pilot else 0
    row = db.get(EnglishList, list_id)
    if row is None or row.pilot_id != pid:
        raise HTTPException(404, "list not found")
    if row.kind == "favorite":
        raise HTTPException(400, "cannot delete favorite")
    db.query(EnglishListItem).filter_by(list_id=list_id).delete()
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/lists/{list_id}/words", response_model=list[WordOut])
def list_words_in_list(
    list_id: int,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> list[WordOut]:
    pid = pilot.id if pilot else 0
    row = db.get(EnglishList, list_id)
    if row is None or row.pilot_id != pid:
        raise HTTPException(404, "list not found")
    ids = [i.word_id for i in db.query(EnglishListItem).filter_by(list_id=list_id).all()]
    if not ids:
        return []
    words = db.query(VocabWord).filter(VocabWord.id.in_(ids)).all()
    cards = {
        c.word_id: c
        for c in db.query(CardProgress).filter(CardProgress.pilot_id == pid, CardProgress.word_id.in_(ids)).all()
    }
    return [serialize_word(w, cards.get(w.id)) for w in words]


@router.post("/lists/{list_id}/words")
def add_word_to_list(
    list_id: int,
    body: ListWordIn,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    pid = pilot.id if pilot else 0
    row = db.get(EnglishList, list_id)
    if row is None or row.pilot_id != pid:
        raise HTTPException(404, "list not found")
    if db.get(VocabWord, body.word_id) is None:
        raise HTTPException(404, "word not found")
    if db.query(EnglishListItem).filter_by(list_id=list_id, word_id=body.word_id).first() is None:
        db.add(EnglishListItem(list_id=list_id, word_id=body.word_id))
        db.commit()
    return {"ok": True}


@router.delete("/lists/{list_id}/words/{word_id}")
def remove_word_from_list(
    list_id: int,
    word_id: int,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    pid = pilot.id if pilot else 0
    row = db.get(EnglishList, list_id)
    if row is None or row.pilot_id != pid:
        raise HTTPException(404, "list not found")
    db.query(EnglishListItem).filter_by(list_id=list_id, word_id=word_id).delete()
    db.commit()
    return {"ok": True}


@router.get("/journal")
def english_journal(
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    """Журнал EN — паритет stamina/english/pages_misc.LogPage."""
    from app.pilots import rank_for as st_rank_for

    pid = pilot.id if pilot else 0
    prog = english_progress(db=db, pilot=pilot)
    today = date.today()
    goal = int(prog.get("daily_goal") or 30)

    # звание Star Typing (общий XP пилота), не EN-ранг
    st_rank = "—"
    if pilot is not None:
        st_rank, _, _ = st_rank_for(int(pilot.xp or 0))

    # теплокарта: XP по дням за 12 недель (как desktop by_day)
    start_heat = today - timedelta(days=today.weekday() + 7 * 11)
    heat: list[dict] = []
    for i in range(12 * 7):
        day = start_heat + timedelta(days=i)
        if day > today:
            break
        start = datetime.combine(day, datetime.min.time())
        end = datetime.combine(day, datetime.max.time())
        n_rev = (
            db.query(ReviewLog)
            .filter(ReviewLog.pilot_id == pid, ReviewLog.created_at >= start, ReviewLog.created_at <= end)
            .count()
        )
        n_spk = (
            db.query(SpeechAttempt)
            .filter(SpeechAttempt.pilot_id == pid, SpeechAttempt.created_at >= start, SpeechAttempt.created_at <= end)
            .count()
        )
        xp_day = n_rev * 3 + int(n_spk) * 3
        heat.append({"date": day.isoformat(), "xp": xp_day, "today": day == today})

    weeks: list[int] = []
    for w in range(12):
        end = today - timedelta(days=w * 7)
        start = end - timedelta(days=6)
        chunk = [h["xp"] for h in heat if start.isoformat() <= h["date"] <= end.isoformat()]
        weeks.append(sum(chunk))
    weeks.reverse()

    # точность по режимам (90 дн) — attempts + review
    since90 = datetime.combine(today - timedelta(days=89), datetime.min.time())
    attempts = (
        db.query(SpeechAttempt)
        .filter(SpeechAttempt.pilot_id == pid, SpeechAttempt.created_at >= since90)
        .all()
    )
    modes: dict[str, dict] = {
        m: {"ok": 0, "n": 0, "pct": None} for m in ("reading", "questions", "speaking", "review")
    }
    for a in attempts:
        m = a.mode if a.mode in modes else "speaking"
        modes[m]["n"] += 1
        modes[m]["ok"] += 1 if a.ok else 0
    rev_rows = (
        db.query(ReviewLog)
        .filter(ReviewLog.pilot_id == pid, ReviewLog.created_at >= since90)
        .all()
    )
    for r in rev_rows:
        modes["review"]["n"] += 1
        modes["review"]["ok"] += 1 if r.grade >= 3 else 0
    for m, v in modes.items():
        v["pct"] = round(100 * v["ok"] / v["n"], 1) if v["n"] else None

    tot_ok = sum(v["ok"] for v in modes.values())
    tot_n = sum(v["n"] for v in modes.values())
    overall = round(100 * tot_ok / tot_n, 1) if tot_n else None

    # освоение наборов — как /sets (S-1000…S-DEV)
    set_mastery = []
    try:
        from app.english_vocab import SET_LIMIT, THEMATIC_SETS, sets_catalog

        cards = {c.word_id: c for c in db.query(CardProgress).filter_by(pilot_id=pid).all()}
        known_ids = {wid for wid, c in cards.items() if c.known or c.bin == "learned" or c.interval >= 21}
        for s in sets_catalog():
            sid = s["id"]
            code = s.get("code") or sid
            name = s.get("name") or sid
            if sid in THEMATIC_SETS:
                q = db.query(VocabWord).filter(
                    (VocabWord.slug.like("dev:%")) | (VocabWord.slug.like("dev-%"))
                )
                counted = q.count()
                cat_lim = max(1, int(s.get("limit") or 0) or 579)
                total = counted if counted > 0 else cat_lim
                known_n = sum(1 for w in q.limit(2000).all() if w.id in known_ids) if counted else 0
            else:
                lim = SET_LIMIT[sid]
                counted = db.query(VocabWord).filter(VocabWord.rank > 0, VocabWord.rank <= lim).count()
                total = lim if counted < lim else counted
                known_n = (
                    db.query(VocabWord)
                    .filter(VocabWord.rank > 0, VocabWord.rank <= lim, VocabWord.id.in_(known_ids or [-1]))
                    .count()
                    if known_ids
                    else 0
                )
            set_mastery.append(
                {
                    "id": sid,
                    "code": code,
                    "name": f"{code} · {name}",
                    "known": known_n,
                    "total": total,
                }
            )
    except Exception:
        for sid, label, lim in (
            ("top-1000", "S-1000 · Essential 1000", 1000),
            ("top-3000", "S-3000 · Core 3000", 3000),
            ("top-10000", "S-10K · Advanced 10 000", 10000),
            ("top-20000", "S-20K · Master 20 000", 20000),
            ("dev-interview", "S-DEV · IT Interview", 579),
        ):
            known_n = (
                db.query(CardProgress)
                .join(VocabWord, VocabWord.id == CardProgress.word_id)
                .filter(CardProgress.pilot_id == pid, CardProgress.known == 1, VocabWord.rank <= lim)
                .count()
                if sid != "dev-interview"
                else 0
            )
            set_mastery.append({"id": sid, "code": sid, "name": label, "known": known_n, "total": lim})

    start7 = datetime.combine(today - timedelta(days=6), datetime.min.time())
    bad = (
        db.query(ReviewLog)
        .filter(ReviewLog.pilot_id == pid, ReviewLog.created_at >= start7, ReviewLog.grade <= 2)
        .order_by(ReviewLog.id.desc())
        .limit(40)
        .all()
    )
    mistakes = []
    seen_mis: set[int] = set()
    for r in bad:
        if r.word_id in seen_mis:
            continue
        seen_mis.add(r.word_id)
        w = db.get(VocabWord, r.word_id)
        mistakes.append({"word_id": r.word_id, "word": w.word if w else "?", "grade": r.grade})

    known_cnt = int(prog.get("learned") or 0) + sum(
        1
        for c in db.query(CardProgress).filter_by(pilot_id=pid).all()
        if c.known and c.bin != "learned"
    )
    speak_ok = sum(1 for a in attempts if a.mode == "speaking" and a.score >= 85)
    st = max(int(prog.get("streak_days") or 0), int(prog.get("best_streak") or 0))
    set_1000 = next((s for s in set_mastery if s["id"] == "top-1000"), None)
    set_1000_done = bool(set_1000 and set_1000["known"] >= set_1000["total"] >= 1000)

    # ACHIEVEMENTS как stamina/english/progress.py
    badge_defs = [
        ("first_step", "Первый шаг", "первое выполненное задание", 10, tot_n >= 1 or int(prog.get("xp") or 0) >= 1),
        ("known_10", "Словарный запас I", "10 слов «знаю» или выучено", 20, known_cnt >= 10),
        ("known_100", "Словарный запас II", "100 слов", 50, known_cnt >= 100),
        ("known_500", "Словарный запас III", "500 слов", 100, known_cnt >= 500),
        ("known_1000", "Словарный запас IV", "1000 слов", 200, known_cnt >= 1000),
        ("streak_3", "Серия 3", "3 дня подряд с дневной целью", 20, st >= 3),
        ("streak_7", "Серия 7", "7 дней подряд", 50, st >= 7),
        ("streak_30", "Серия 30", "30 дней подряд", 200, st >= 30),
        ("perfect_session", "Без ошибок", "миссия ≥ 10 заданий без ошибок", 30, False),
        ("speaker", "Голос", "50 ответов голосом с баллом ≥ 85", 50, speak_ok >= 50),
        ("reviewer", "Без долгов", "очередь проверки систем пройдена 7 дней подряд", 50, False),
        ("set_1000", "Фундамент", "все слова top-1000 «знаю» или выучены", 300, set_1000_done),
    ]
    badges = []
    for bid, title, desc, bonus, ok in badge_defs:
        badges.append(
            {
                "id": bid,
                "title": title,
                "desc": desc,
                "bonus": bonus,
                "ok": bool(ok),
                "date": today.isoformat() if ok else None,
            }
        )

    return {
        **prog,
        "st_rank": st_rank,
        "weeks": weeks,
        "heat": heat,
        "daily_goal": goal,
        "accuracy": {"overall": overall, "total": tot_n, "modes": modes},
        "sets": set_mastery,
        "mistakes": mistakes,
        "badges": badges,
    }


@router.get("/settings")
def get_settings(db: Session = Depends(get_db), pilot: Pilot | None = Depends(get_optional_pilot)) -> dict:
    return _settings(db, pilot.id if pilot else 0)


@router.put("/settings")
def put_settings(
    body: SettingsIn,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    pid = pilot.id if pilot else 0
    data = _settings(db, pid)
    patch = body.model_dump(exclude_none=True)
    data.update(patch)
    row = db.query(EnglishSettings).filter_by(pilot_id=pid).first()
    if row is None:
        row = EnglishSettings(pilot_id=pid, data=json.dumps(data, ensure_ascii=False))
        db.add(row)
    else:
        row.data = json.dumps(data, ensure_ascii=False)
    db.commit()
    return data


@router.get("/book/hub")
def book_hub(
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> list[dict]:
    """Книги на полке с числом сегментов — для «Из книги»."""
    from app.api_library import PilotText, _stats
    from app.models import TextDoc

    pid = pilot.id if pilot else None
    out = []
    if pid is None:
        docs = db.query(TextDoc).order_by(TextDoc.id.desc()).limit(20).all()
        for d in docs:
            chars, words, n = _stats(db, d.id)
            out.append(
                {
                    "text_id": d.id,
                    "title": d.title or f"#{d.id}",
                    "segments": n,
                    "sentence_id": 0,
                    "chars": chars,
                    "words": words,
                }
            )
        return out
    rows = db.query(PilotText).filter_by(pilot_id=pid).order_by(PilotText.updated_at.desc()).limit(30).all()
    for row in rows:
        d = db.get(TextDoc, row.text_id)
        if d is None:
            continue
        chars, words, n = _stats(db, d.id)
        out.append(
            {
                "text_id": d.id,
                "title": d.title or f"#{d.id}",
                "segments": n,
                "sentence_id": row.sentence_id,
                "chars": chars,
                "words": words,
            }
        )
    return out
