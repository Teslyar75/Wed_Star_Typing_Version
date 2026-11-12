"""АНГЛИЙСКИЙ: словарь (seed из stamina), SM-2, склад due-карт."""

from __future__ import annotations

import json
import os
import random
import threading
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import Date, DateTime, Float, Integer, String, Text, UniqueConstraint, and_, case, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Mapped, mapped_column, Session

from app.auth_deps import get_optional_pilot
from app.db import Base, get_db
from app.pilots import Pilot
from app import english_warehouse as whm
from app import english_packs as packs
from app import english_quality as qeng

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
    wh_q: Mapped[str] = mapped_column(Text, default="")
    wh_run: Mapped[str] = mapped_column(Text, default="")


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
    q_filled: int = 0
    q_goal: int = 20
    q_hint: str = ""
    n_sents: int = 0
    left_today: int = 4
    q_by: dict = Field(default_factory=dict)
    q_done_keys: list[str] = Field(default_factory=list)
    difficulty_n: int = 0

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



def _stars_for_avg(avg: float) -> int:
    if avg >= 95:
        return 3
    if avg >= 80:
        return 2
    if avg >= 60:
        return 1
    return 0


def _q_rec(card: CardProgress) -> dict:
    raw = (getattr(card, "wh_q", None) or "").strip()
    if not raw:
        return {}
    try:
        d = json.loads(raw)
        return d if isinstance(d, dict) else {}
    except (json.JSONDecodeError, TypeError):
        return {}


class _QP:
    """Адаптер CardProgress.wh_q → quality.py (progress.data['quality'][slug])."""

    def __init__(self, rec: dict, settings: dict, slug: str):
        self.settings = dict(settings or {})
        store = {slug: rec} if rec else {}
        self.data = {"quality": store, "settings": self.settings, "version": 2}

    def save(self) -> None:
        pass


def _qp_from_card(card: CardProgress, settings: dict) -> tuple[_QP, str]:
    slug = str(card.word_id)
    return _QP(_q_rec(card), settings, slug), slug


def _q_flush(card: CardProgress, qp: _QP, slug: str) -> None:
    rec = (qp.data.get("quality") or {}).get(slug) or {}
    card.wh_q = json.dumps(rec, ensure_ascii=False)


def _qp_bundle(rows: list[CardProgress], settings: dict) -> _QP:
    store: dict = {}
    for c in rows:
        rec = _q_rec(c)
        if rec:
            store[str(c.word_id)] = rec
    qp = _QP({}, settings, "0")
    qp.data["quality"] = store
    return qp


def _card_sents(w: VocabWord) -> list[dict]:
    m = _parse_meta(w.meta)
    out: list[dict] = []
    for s in (m.get("sentences") or [])[:5]:
        if not isinstance(s, dict):
            continue
        en = (s.get("en") or "").strip()
        if not en:
            continue
        out.append({"en": en, "ru": (s.get("ru") or "").strip()})
    if not out and (w.example or "").strip():
        out.append({"en": w.example.strip(), "ru": (m.get("example_ru") or "").strip()})
    return out


def _pack_wh(w: VocabWord, card: CardProgress, settings: dict, sents: list[dict]) -> WordOut:
    wo = serialize_word(w, card)
    n = len(sents)
    qp, slug = _qp_from_card(card, settings)
    cnt = qeng.counts(qp, slug, n_sents=n)
    wo.sentences = sents
    wo.n_sents = n
    wo.q_filled = int(cnt["filled"])
    wo.q_goal = int(cnt["goal"])
    wo.q_hint = qeng.hint(qp, slug, n_sents=n)
    wo.left_today = qeng.left_today(qp, slug)
    wo.q_by = {k: list(v) for k, v in (cnt.get("by") or {}).items()}
    wo.q_done_keys = sorted(str(x) for x in (cnt.get("done_keys") or []))
    wo.difficulty_n = max(1, min(5, n))
    return wo


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
    "quality_goal": 20,
    "quality_daily_cap": 4,
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


class EnsureWordIn(BaseModel):
    word: str
    slug: str = ""
    pos: str = ""
    translation: str = ""
    definition: str = ""
    ipa: str = ""
    difficulty: str = ""
    example: str = ""


class WarehouseMoveIn(BaseModel):
    word_id: int
    state: str = Field(pattern="^(shelf|away|done)$")


class WarehouseRunIn(BaseModel):
    word_id: int
    avg: float = Field(ge=0, le=100)
    goal: int | None = Field(default=None, ge=1, le=5)


class WarehouseQualityIn(BaseModel):
    word_id: int
    group: str = Field(pattern="^[ABCDE]$")
    score: int = Field(ge=0, le=100)
    si: int | None = None
    self_rated: bool = False


class WarehouseGoalIn(BaseModel):
    word_id: int
    goal: int = Field(ge=1, le=20)


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
    quality_goal: int | None = None
    quality_daily_cap: int | None = None


class FromBookIn(BaseModel):
    text_id: int
    up_to_sentence_id: int = 50
    limit: int = Field(default=20, ge=1, le=100)


_SEED_ROWS_CACHE: dict[int, list[dict]] = {}
_SEED_LOCK = threading.RLock()


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
    import sys

    # Playwright e2e (CI, не pytest): не грузить 29MB vocab.json на каждый POST /seed.
    e2e = bool(os.environ.get("CI")) and "pytest" not in sys.modules
    with _SEED_LOCK:
        return _seed_vocab_body(db, limit, batch, e2e)


def _seed_vocab_body(db: Session, limit: int, batch: int, e2e: bool) -> dict[str, int | bool]:
    if e2e:
        total = db.query(VocabWord).count()
        if total == 0:
            for i, (w, tr, ex) in enumerate(FALLBACK_SEED):
                db.add(
                    VocabWord(
                        word=w,
                        translation=tr,
                        example=ex,
                        slug=w.lower(),
                        rank=i + 1,
                        meta="{}",
                    )
                )
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
            total = db.query(VocabWord).count()
        return {
            "added": 0,
            "updated": 0,
            "total": total,
            "done": True,
            "target": total,
            "zero_rank": 0,
        }
    # JSON без открытой транзакции — иначе UI съедает QueuePool.
    rows = _iter_seed_rows(20000)
    target = max(limit, 20000)
    total = db.query(VocabWord).count()
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
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
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



def _ensure_seeded_for(db: Session, need_rank: int, max_rounds: int = 40, *, need_dev: bool = False) -> None:
    """Досеять словарь, пока набор с лимитом need_rank не заполнен целиком."""
    if os.environ.get("CI"):
        return
    _iter_seed_rows(20000)

    def _full() -> bool:
        have = db.query(VocabWord).filter(VocabWord.rank > 0, VocabWord.rank <= need_rank).count()
        dev_ok = not need_dev or db.query(VocabWord).filter(VocabWord.slug.like("dev:%")).count() > 0
        return have >= need_rank and dev_ok

    if _full():
        return
    with _SEED_LOCK:
        db.expire_all()
        _ensure_seeded_locked(db, need_rank, max_rounds, need_dev)


def _ensure_seeded_locked(db: Session, need_rank: int, max_rounds: int, need_dev: bool) -> None:
    for _ in range(max_rounds):
        have = db.query(VocabWord).filter(VocabWord.rank > 0, VocabWord.rank <= need_rank).count()
        dev_ok = not need_dev or db.query(VocabWord).filter(VocabWord.slug.like("dev:%")).count() > 0
        if have >= need_rank and dev_ok:
            return
        res = _seed_vocab(db, 20000, 2000)
        if res.get("done") or not (res.get("added") or res.get("updated")):
            return


def start_seed_worker() -> None:
    """Фоновый досев полного словаря при старте сервера (свежая БД сразу полная)."""
    import sys

    if "pytest" in sys.modules or os.environ.get("CI"):
        return

    def _run() -> None:
        from app.db import SessionLocal

        db = SessionLocal()
        try:
            # сначала S-3000 (карты/сканер), потом полный словарь — не держать lock на 20k
            _ensure_seeded_for(db, 3000)
            _ensure_seeded_for(db, 20000, need_dev=True)
        except Exception:  # noqa: BLE001 — досев догонят запросы /set и /sets
            db.rollback()
        finally:
            db.close()

    threading.Thread(target=_run, name="vocab-seed", daemon=True).start()

@router.post("/seed")
def seed_vocab(
    db: Session = Depends(get_db),
    limit: int = Query(20000, ge=1, le=21000),
    batch: int = Query(400, ge=1, le=2000),
) -> dict[str, int | bool]:
    return _seed_vocab(db, limit, batch)


@router.get("/words", response_model=list[WordOut])
def list_words(limit: int = 50, offset: int = 0, db: Session = Depends(get_db)) -> list[VocabWord]:
    _ensure_seeded_for(db, 1000)
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
    _ensure_seeded_for(db, 1000)
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

    from app.models import Segment
    from app.text_access import require_read

    if pilot is None:
        raise HTTPException(401, "login required")
    require_read(db, pilot, body.text_id)
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
    _ensure_seeded_for(db, 1000)
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
        pilot.xp += 2
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

    _ensure_seeded_for(db, max(SET_LIMIT.values()), need_dev=True)
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
    set_id: str = "",
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> WordOut:
    """Обычный английский case != SQL CASE из S-DEV (slug dev:case)."""
    from app.english_vocab import THEMATIC_SETS

    _ensure_seeded_for(db, 500)
    needle = q.strip().lower()
    want_dev = (set_id in THEMATIC_SETS) or needle.startswith("dev:") or needle.startswith("dev-")
    w = None
    if needle:
        w = db.query(VocabWord).filter(VocabWord.slug == needle).first()
        if w is not None and not want_dev and str(w.slug or "").startswith("dev:"):
            w = None
    if w is None and want_dev:
        slug = needle if needle.startswith("dev:") else f"dev:{needle}"
        w = db.query(VocabWord).filter(VocabWord.slug == slug).first()
    if w is None:
        qn = db.query(VocabWord).filter(func.lower(VocabWord.word) == needle)
        if not want_dev:
            qn = qn.filter(~VocabWord.slug.like("dev:%"))
        w = qn.order_by(VocabWord.rank.asc()).first()
    packed = None if want_dev else packs.find_cefr_word(needle)
    if w is None and packed:
        w = _ensure_vocab_from_pack(db, packed)
        if w is not None and str(w.slug or "").startswith("dev:"):
            # омоним SQL CASE / IT: не подменяем английский смысл
            pid = pilot.id if pilot else 0
            card = db.query(CardProgress).filter_by(pilot_id=pid, word_id=w.id).first()
            base = serialize_word(w, card)
            sents = packed.get("sentences") or []
            ex = ""
            if sents and isinstance(sents[0], dict):
                ex = str(sents[0].get("en") or "")
            return base.model_copy(update={
                "word": packed.get("word") or base.word,
                "translation": packed.get("ru") or base.translation,
                "definition": packed.get("definition") or "",
                "ipa": packed.get("ipa") or "",
                "pos": packed.get("pos") or base.pos,
                "example": ex,
                "example_ru": (sents[0].get("ru") if sents and isinstance(sents[0], dict) else "") or "",
                "sentences": sents,
                "slug": packed.get("slug") or needle,
                "rank": int(packed.get("cefr_order") or 0) + 1,
                "difficulty": packed.get("difficulty") or base.difficulty,
            })
    if w is None:
        pref = db.query(VocabWord).filter(VocabWord.word.ilike(f"{needle}%"))
        if not want_dev:
            pref = pref.filter(~VocabWord.slug.like("dev:%"))
        w = pref.order_by(VocabWord.rank.asc()).first()
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


_POS_MAIN = ("noun", "verb", "adjective", "adverb", "pronoun", "preposition", "conjunction")


def _meta_text(key: str):
    """Поле из JSON `vocab_words.meta`. Пустая строка не ломает cast."""
    from app.db import engine

    raw = func.nullif(VocabWord.meta, "")
    if engine.dialect.name == "postgresql":
        from sqlalchemy import cast
        from sqlalchemy.dialects.postgresql import JSONB

        return cast(raw, JSONB).op("->>")(key)
    return func.json_extract(raw, f"$.{key}")


def _set_word_query(db: Session, set_id: str, q: str, pos: str, difficulty: str, status: str, length: str, pid: int):
    """Фильтры набора в SQL. Случайная сортировка применяется к id отдельно."""
    from app.english_vocab import SET_LIMIT, THEMATIC_SETS

    query = db.query(VocabWord)
    if set_id in THEMATIC_SETS:
        query = query.filter(VocabWord.slug.like("dev:%"))
    else:
        lim = SET_LIMIT.get(set_id, 3000)
        query = query.filter(VocabWord.rank > 0, VocabWord.rank <= lim)
    if q.strip():
        query = query.filter(VocabWord.word.ilike(f"%{q.strip().lower()}%"))

    n = func.length(VocabWord.word)
    if length == "short":
        query = query.filter(n <= 4)
    elif length == "mid":
        query = query.filter(and_(n >= 5, n <= 7))
    elif length == "long":
        query = query.filter(n >= 8)

    pos_expr = func.lower(_meta_text("pos"))
    if pos and pos != "all":
        if pos == "other":
            query = query.filter(or_(pos_expr.is_(None), pos_expr == "", pos_expr.notin_(_POS_MAIN)))
        else:
            query = query.filter(pos_expr == pos)

    diff_expr = func.lower(_meta_text("difficulty"))
    if difficulty and difficulty != "all":
        query = query.filter(diff_expr == difficulty)

    card_on = and_(CardProgress.word_id == VocabWord.id, CardProgress.pilot_id == pid)
    if status == "known":
        query = query.join(CardProgress, card_on).filter(CardProgress.known == 1)
    elif status == "unknown":
        query = query.outerjoin(CardProgress, card_on).filter(or_(CardProgress.id.is_(None), CardProgress.known == 0))
    elif status == "review":
        query = query.join(CardProgress, card_on).filter(CardProgress.known == 0)
    return query


def _ordered_set_page(query, sort: str, seed: int, offset: int, limit: int, db: Session) -> tuple[int, list[VocabWord]]:
    if sort == "random":
        ids = [row[0] for row in query.with_entities(VocabWord.id).all()]
        random.Random(max(1, int(seed) or 1)).shuffle(ids)
        page_ids = ids[offset : offset + limit]
        if not page_ids:
            return len(ids), []
        by_id = {w.id: w for w in db.query(VocabWord).filter(VocabWord.id.in_(page_ids)).all()}
        return len(ids), [by_id[i] for i in page_ids if i in by_id]

    total = query.count()
    diff_expr = func.lower(_meta_text("difficulty"))
    diff_rank = case((diff_expr == "easy", 0), (diff_expr == "tricky", 2), else_=1)
    if sort == "alpha":
        query = query.order_by(func.lower(VocabWord.word), VocabWord.id)
    elif sort == "difficulty":
        query = query.order_by(diff_rank, VocabWord.rank, VocabWord.id)
    else:
        query = query.order_by(VocabWord.rank, VocabWord.id)
    return total, query.offset(offset).limit(limit).all()


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
    """Фильтры как desktop vocab.filtered — до пагинации, страница в SQL."""
    from app.english_vocab import SET_LIMIT, THEMATIC_SETS

    if set_id in THEMATIC_SETS:
        if db.query(VocabWord).filter(VocabWord.slug.like("dev:%")).count() == 0:
            _ensure_seeded_for(db, 20000, need_dev=True)
    else:
        _ensure_seeded_for(db, SET_LIMIT.get(set_id, 3000))
    limit = max(1, min(limit, 120))
    offset = max(0, offset)
    status_n = (status or "all").lower()
    length_n = (length or "all").lower()
    sort_n = (sort or "freq").lower()
    pid = pilot.id if pilot else 0
    query = _set_word_query(
        db,
        set_id,
        q,
        (pos or "").strip().lower(),
        (difficulty or "").strip().lower(),
        status_n,
        length_n,
        pid,
    )
    total, rows = _ordered_set_page(query, sort_n, seed, offset, limit, db)
    ids = [r.id for r in rows]
    cards = {}
    if pid and ids:
        cards = {
            c.word_id: c
            for c in db.query(CardProgress)
            .filter(CardProgress.pilot_id == pid, CardProgress.word_id.in_(ids))
            .all()
        }
    page = [serialize_word(r, cards.get(r.id)) for r in rows]
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
    diff: int | None = Query(None),
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    """Склад: shelf | away | done | today. Качество — слоты как на десктопе."""
    if state not in ("shelf", "away", "done", "today"):
        raise HTTPException(400, "state must be shelf|away|done|today")
    pid = pilot.id if pilot else 0
    settings = _settings(db, pid)
    rows = (
        db.query(CardProgress)
        .filter(CardProgress.pilot_id == pid)
        .limit(800)
        .all()
    )
    ids = [c.word_id for c in rows]
    words = {w.id: w for w in db.query(VocabWord).filter(VocabWord.id.in_(ids)).all()} if ids else {}
    shelf: list[WordOut] = []
    away: list[WordOut] = []
    done: list[WordOut] = []
    dirty = False
    for c in rows:
        w = words.get(c.word_id)
        if w is None:
            continue
        sents = _card_sents(w)
        if not sents:
            continue
        st = (c.wh_state or "")
        qp, slug = _qp_from_card(c, settings)
        complete = qeng.is_complete(qp, slug, n_sents=len(sents))
        if complete and st not in ("away", "done"):
            avg = qeng.average_score(qp, slug)
            c.wh_state = "done"
            c.wh_avg = avg
            c.wh_stars = _stars_for_avg(avg)
            st = "done"
            dirty = True
        pack = _pack_wh(w, c, settings, sents)
        if st == "away":
            away.append(pack)
        elif st == "done":
            done.append(pack)
        elif c.known or (c.interval or 0) >= 21:
            if not complete:
                shelf.append(pack)
    if dirty:
        db.commit()
    bundle = _qp_bundle(rows, settings)
    due_ids = set(qeng.due_today(bundle, [str(c.word_id) for c in rows]))
    today = [x for x in (shelf + away) if str(x.id) in due_ids]
    pool = {"shelf": shelf, "away": away, "done": done, "today": today}[state]
    if diff in (1, 2, 3):
        if state == "done":
            pool = [x for x in pool if int(x.wh_stars or 0) == diff]
        else:
            pool = [x for x in pool if int(x.difficulty_n or 0) == diff]
    if state == "done":
        pool.sort(key=lambda x: (-(x.wh_stars or 0), -(x.wh_avg or 0), x.rank or 0))
    else:
        pool.sort(key=lambda x: (x.difficulty_n or 0, x.rank or 0, (x.word or "").lower()))
    cap = qeng.daily_cap(_QP({}, settings, "0"))
    return {
        "cards": pool,
        "counts": {
            "shelf": len(shelf),
            "away": len(away),
            "done": len(done),
            "today": len(today),
        },
        "cap": cap,
    }


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
    prev = (card.wh_state or "")
    if body.state == "shelf":
        card.wh_state = "shelf"
        card.wh_runs = 0
        card.wh_stars = 0
        card.wh_avg = 0
        card.known = 1
        if prev == "done":
            settings = _settings(db, pid)
            qp, slug = _qp_from_card(card, settings)
            if qeng.get(qp, slug):
                qeng.reset(qp, slug)
                _q_flush(card, qp, slug)
    elif body.state == "away":
        card.wh_state = "away"
        card.known = 0
        card.due = date.today()
    else:
        card.wh_state = "done"
    db.commit()
    return {"ok": True, "state": card.wh_state}



class WarehouseAttemptIn(BaseModel):
    word_id: int
    key: int = Field(ge=-1, le=2)  # -1 = слово, 0..2 = предложение
    score: int = Field(ge=0, le=100)

class WarehouseSelectIn(BaseModel):
    word_id: int
    sel: list[bool]

@router.post("/warehouse/attempt")
def warehouse_attempt(
    body: WarehouseAttemptIn,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    """Попытка по слову (key=-1) или предложению (key=0..2) — порт pages_warehouse.on_speech.

    Балл — автоматическая оценка распознанной речи (score_word / score_sentence).
    Совпадение ≥ FLIP_OK (80%) — задание закрыто; прогон засчитывается сам (finish_pass).
    """
    from app import english_warehouse as whm
    from app.english_score import verdict

    w = db.get(VocabWord, body.word_id)
    if w is None:
        raise HTTPException(404, "word not found")
    pid = pilot.id if pilot else 0
    card = _card(db, pid, body.word_id)
    n = min(whm.MAX_DIFF, len(_parse_meta(w.meta).get("sentences") or []))
    if body.key >= n:
        raise HTTPException(400, "bad sentence index")
    st = whm.load_state(card.wh_run)
    sel = whm.selection(st, n)
    if not card.wh_goal:
        card.wh_goal = int(_settings(db, pid).get("warehouse_passes") or whm.DEFAULT_PASSES)
    if card.wh_state in ("", "away") and card.known:
        card.wh_state = "shelf"
    slug = (w.slug or w.word).lower()
    scores = whm.current_scores(st)
    score = int(body.score)
    scores[body.key] = max(scores.get(body.key, 0), score)
    ok = score >= whm.FLIP_OK
    xp = 0
    if True:  # десктоп пишет и слово (si=-1), и предложения
        xp += whm.record_sentence(st, slug, body.key, score, ok=ok, today=date.today().isoformat())
        db.add(SpeechAttempt(pilot_id=pid, word_id=body.word_id, mode="warehouse", score=score, ok=1 if ok else 0))
    next_key = body.key
    res: dict = {"status": "incomplete"}
    if ok:
        next_key = whm.next_active(scores, sel, body.key)
        res = whm.finish_pass(card, st, slug, scores, sel, int(card.wh_goal or 2))
        if res["status"] in ("weak", "pass", "cleared"):
            scores = {}
            if res["status"] != "cleared":
                next_key = whm.WORD_KEY
        xp += int(res.get("xp") or 0)
    else:
        whm.save_current(st, scores)
    if xp:
        card.english_xp = (card.english_xp or 0) + xp
        if pilot is not None:
            pilot.xp += xp
    card.wh_run = whm.dump_state(st)
    db.commit()
    label, color = verdict(score)
    return {
        "score": score, "ok": ok, "need": whm.FLIP_OK, "verdict": label, "color": color,
        "xp": xp, "next_key": next_key, "scores": {str(k): v for k, v in scores.items()},
        "sel": sel, "runs": card.wh_runs, "goal": int(card.wh_goal or 2), "state": card.wh_state,
        "stars": int(card.wh_stars or 0), "avg": float(card.wh_avg or 0), **{"result": res},
    }

@router.post("/warehouse/select")
def warehouse_select(
    body: WarehouseSelectIn,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    """Отметка предложений для прогона (хотя бы одно остаётся)."""
    from app import english_warehouse as whm

    w = db.get(VocabWord, body.word_id)
    if w is None:
        raise HTTPException(404, "word not found")
    pid = pilot.id if pilot else 0
    card = _card(db, pid, body.word_id)
    n = min(whm.MAX_DIFF, len(_parse_meta(w.meta).get("sentences") or []))
    st = whm.load_state(card.wh_run)
    sel = (list(body.sel) + [False] * n)[:n]
    sel = whm.set_selection(st, sel) if n else []
    card.wh_run = whm.dump_state(st)
    db.commit()
    return {"sel": sel}

@router.post("/warehouse/quality")
def warehouse_quality(
    body: WarehouseQualityIn,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    """Зачесть слот качества (A слово / B чтение / C перевод / D аудио / E своё)."""
    w = db.get(VocabWord, body.word_id)
    if w is None:
        raise HTTPException(404, "word not found")
    pid = pilot.id if pilot else 0
    card = _card(db, pid, body.word_id)
    sents = _card_sents(w)
    if not sents:
        raise HTTPException(400, "no sentences")
    settings = _settings(db, pid)
    qp, slug = _qp_from_card(card, settings)
    n = len(sents)
    qeng.ensure(qp, slug, n_sents=n)
    res, key = qeng.auto(
        qp, slug, body.group, body.score,
        si=body.si, self_rated=body.self_rated, n_sents=n,
    )
    _q_flush(card, qp, slug)
    cnt = qeng.counts(qp, slug, n_sents=n)
    complete = False
    if qeng.is_complete(qp, slug, n_sents=n) and (card.wh_state or "") != "done":
        avg = qeng.average_score(qp, slug)
        card.wh_avg = avg
        card.wh_stars = _stars_for_avg(avg)
        card.wh_state = "done"
        card.english_xp = (card.english_xp or 0) + (10 if card.wh_stars >= 2 else 5)
        complete = True
    elif (card.wh_state or "") not in ("away", "done"):
        card.wh_state = card.wh_state or "shelf"
    db.commit()
    need = None
    if res == "low" and key:
        sm = qeng.slot_map("word", n)
        need = int((sm.get(key) or {}).get("threshold") or 0)
    return {
        "ok": True,
        "result": res,
        "key": key,
        "need": need,
        "filled": int(cnt["filled"]),
        "goal": int(cnt["goal"]),
        "hint": qeng.hint(qp, slug, n_sents=n),
        "by": {k: list(v) for k, v in (cnt.get("by") or {}).items()},
        "done_keys": sorted(str(x) for x in (cnt.get("done_keys") or [])),
        "left_today": qeng.left_today(qp, slug),
        "complete": complete,
        "stars": int(card.wh_stars or 0),
        "avg": float(card.wh_avg or 0),
        "state": card.wh_state,
        "cap": qeng.daily_cap(qp),
    }


@router.post("/warehouse/goal")
def warehouse_goal(
    body: WarehouseGoalIn,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    """set_run_goal: число прогонов 1/2/3/5."""
    from app import english_warehouse as whm

    if body.goal not in whm.PASS_CHOICES:
        raise HTTPException(400, "goal must be one of 1,2,3,5")
    pid = pilot.id if pilot else 0
    card = _card(db, pid, body.word_id)
    card.wh_goal = max(1, min(5, body.goal))
    db.commit()
    return {"goal": card.wh_goal}



@router.post("/missions/start")
def mission_start(
    body: MissionStartIn,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    from app.english_tasks import MODES, TaskFactory
    from app.english_vocab import SET_LIMIT, THEMATIC_SETS

    _ensure_seeded_for(db, 500)
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

    if pilot is None:
        raise HTTPException(401, "login required")
    out = []
    rows = (
        db.query(PilotText)
        .filter_by(pilot_id=pilot.id)
        .order_by(PilotText.updated_at.desc())
        .limit(30)
        .all()
    )
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


# ---------- хаб НАБОРЫ: CEFR · глаголы (данные десктопа) ----------
from app import english_packs as packs



def _ensure_vocab_from_pack(db: Session, rec: dict) -> VocabWord:
    slug = str(rec.get("slug") or rec.get("word") or "").strip().lower()
    word = str(rec.get("word") or "").strip()
    if not word:
        raise HTTPException(400, "word")
    row = (
        db.query(VocabWord)
        .filter((VocabWord.slug == slug) | (VocabWord.word == word) | (VocabWord.word == word.lower()))
        .first()
    )
    if row is not None:
        return row
    sents = rec.get("sentences") or []
    example = ""
    if sents and isinstance(sents[0], dict):
        example = str(sents[0].get("en") or "")
    level = str(rec.get("level") or "a1")
    meta = {
        "pos": rec.get("pos") or "",
        "ru": rec.get("ru") or rec.get("translation") or "",
        "definition": rec.get("definition") or "",
        "ipa": rec.get("ipa") or "",
        "difficulty": rec.get("difficulty") or "",
        "slug": slug,
        "sentences": sents[:5],
        "sets": [f"cefr-{level.lower().replace('.', '-')}"],
    }
    row = VocabWord(
        word=word[:64],
        translation=str(rec.get("ru") or rec.get("translation") or "")[:256],
        example=example[:500] if example else "",
        slug=slug[:80],
        rank=int(rec.get("cefr_order") or rec.get("rank") or 0) + 1,
        meta=json.dumps(meta, ensure_ascii=False),
    )
    db.add(row)
    try:
        db.commit()
        db.refresh(row)
    except Exception:
        db.rollback()
        row = (
            db.query(VocabWord)
            .filter((VocabWord.slug == slug) | (VocabWord.word == word) | (VocabWord.word == word.lower()))
            .first()
        )
        if row is None:
            raise
    return row


def _attach_ids(db: Session, words: list[dict]) -> list[dict]:
    if not words:
        return words
    needles = []
    for w in words:
        if w.get("slug"):
            needles.append(w["slug"])
        if w.get("word"):
            needles.append(w["word"])
            needles.append(w["word"].lower())
    rows = (
        db.query(VocabWord.id, VocabWord.slug, VocabWord.word)
        .filter(or_(VocabWord.slug.in_(needles), VocabWord.word.in_(needles)))
        .all()
    )
    by: dict[str, int] = {}
    for i, slug, word in rows:
        if slug:
            by[slug.lower()] = i
        if word:
            by[word.lower()] = i
    for w in words:
        w["id"] = by.get((w.get("slug") or "").lower()) or by.get((w.get("word") or "").lower()) or 0
    return words


def _pilot_known_slugs(db: Session, pid: int | None) -> set[str]:
    if not pid:
        return set()
    rows = (
        db.query(VocabWord.slug, VocabWord.word)
        .join(CardProgress, CardProgress.word_id == VocabWord.id)
        .filter(CardProgress.pilot_id == pid)
        .filter((CardProgress.known == 1) | (CardProgress.bin == "learned") | (CardProgress.interval >= 21))
        .all()
    )
    out: set[str] = set()
    for slug, word in rows:
        if slug:
            out.add(slug.lower())
        if word:
            out.add(word.lower())
    return out


def _cefr_level_info(db: Session, pid: int | None, stop_at: str | None = None, warm_only: bool = False) -> list[dict]:
    known = _pilot_known_slugs(db, pid)
    prev_ok = True
    rows = []
    for lv, title, _d in packs.LEVELS:
        exists = packs.cefr_path(lv).exists()
        slugs = packs.cefr_slugs_if_warm(lv)
        if slugs is None and exists and not warm_only:
            slugs = packs.cefr_slugs(lv)
        if slugs is None:
            # холодный уровень: A1 открыт, остальные ждут прогресс — без разбора JSON
            unlocked = bool(exists) and (not rows)
            rows.append({
                "id": lv, "title": title, "total": 0, "known": 0, "pct": 0,
                "unlocked": unlocked, "ready": bool(exists),
            })
            prev_ok = False
            if stop_at and lv == stop_at:
                break
            continue
        kn = sum(1 for s in slugs if s.lower() in known)
        total = len(slugs)
        pct = int(100 * kn / total) if total else 0
        unlocked = prev_ok
        rows.append({
            "id": lv, "title": title, "total": total, "known": kn, "pct": pct,
            "unlocked": unlocked, "ready": True,
        })
        prev_ok = unlocked and pct >= packs.UNLOCK_PCT
        if stop_at and lv == stop_at:
            break
    return rows


def _known_slugs(db: Session, pid: int | None, slugs: list[str]) -> set[str]:
    if not pid or not slugs:
        return set()
    rows = db.query(VocabWord).filter(VocabWord.slug.in_(slugs)).all()
    if not rows:
        rows = db.query(VocabWord).filter(VocabWord.word.in_(slugs)).all()
    ids = {w.id: (w.slug or w.word.lower()) for w in rows}
    if not ids:
        return set()
    cards = (
        db.query(CardProgress)
        .filter(CardProgress.pilot_id == pid, CardProgress.word_id.in_(list(ids)))
        .all()
    )
    out = set()
    for c in cards:
        if c.known or c.bin == "learned" or c.interval >= 21:
            slug = ids.get(c.word_id)
            if slug:
                out.add(slug)
    return out


@router.get("/hub-stats")
def hub_stats(db: Session = Depends(get_db), pilot: Pilot | None = Depends(get_optional_pilot)) -> dict:
    pid = pilot.id if pilot else None
    level_rows = _cefr_level_info(db, pid, warm_only=True)
    cefr_total = sum(r["total"] for r in level_rows)
    cefr_known = sum(r["known"] for r in level_rows)
    verbs = packs.all_verbs()
    v_slugs = [v.get("lemma") for v in verbs if v.get("lemma")]
    v_known = _known_slugs(db, pid, v_slugs)
    return {
        "cefr": {"total": cefr_total, "known": cefr_known, "levels": level_rows, "ready": True},
        "verbs": {"total": len(verbs), "known": len(v_known), "ready": bool(verbs)},
        "book": {"ready": True},
    }


@router.get("/cefr/counts")
def cefr_counts() -> dict:
    """Счётчики A1–C2 без тела карточек. Отдельно от /cefr/{level} (страница 24)."""
    return packs.level_counts()


@router.get("/cefr/levels")
def cefr_levels(db: Session = Depends(get_db), pilot: Pilot | None = Depends(get_optional_pilot)) -> dict:
    """Чипы уровней: без разбора холодных JSON (счётчики — когда набор уже в кэше)."""
    pid = pilot.id if pilot else None
    rows = _cefr_level_info(db, pid, warm_only=True)
    return {
        "total": sum(r["total"] for r in rows),
        "known": sum(r["known"] for r in rows),
        "levels": rows,
        "ready": True,
    }


@router.post("/ensure-word")
def ensure_word(
    body: EnsureWordIn,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    del pilot
    packed = packs.find_cefr_word(body.word or body.slug) or {
        "word": body.word,
        "slug": body.slug or body.word.strip().lower(),
        "pos": body.pos,
        "ru": body.translation,
        "definition": body.definition,
        "ipa": body.ipa,
        "difficulty": body.difficulty,
        "sentences": [{"en": body.example, "ru": ""}] if body.example else [],
    }
    row = _ensure_vocab_from_pack(db, packed)
    return {"id": row.id, "word": row.word, "slug": row.slug}


@router.get("/cefr/{level}")
def cefr_level(
    level: str,
    block: int = 0,
    page: int = 0,
    page_size: int = 24,
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    """Порция карточек: только этот уровень, страница 24, без hub_stats на 8 файлах."""
    if level not in {lv for lv, _t, _d in packs.LEVELS}:
        raise HTTPException(404, "cefr_level")
    if not packs.cefr_path(level).exists():
        raise HTTPException(404, "cefr_level")
    pid = pilot.id if pilot else None
    rows = _cefr_level_info(db, pid, stop_at=level, warm_only=False)
    info = next((r for r in rows if r["id"] == level), None)
    if info and not info["unlocked"]:
        prev = next((r["id"] for r in rows if r["id"] != level), "")
        hint = f"{level} откроется, когда пройдёшь {packs.UNLOCK_PCT}% предыдущего уровня"
        if prev:
            hint = f"{level} откроется, когда пройдёшь {packs.UNLOCK_PCT}% уровня {prev}"
        return {
            "level": level, "unlocked": False, "hint": hint,
            "block": 0, "blocks": 0, "page": 0, "pages": 0, "words": [], **info,
        }
    data = packs.cefr_page(level, block, page, page_size)
    chunk = data["words"]
    slugs = [w["slug"] for w in chunk]
    known = _known_slugs(db, pid, slugs)
    for w in chunk:
        w["known"] = w["slug"] in known
    _attach_ids(db, chunk)
    words = [packs.card_view(w) for w in chunk]
    return {
        "level": level,
        "title": packs.LEVEL_TITLE.get(level, level),
        "unlocked": True,
        "block": data["block"],
        "blocks": data["blocks"],
        "page": data["page"],
        "pages": data["pages"],
        "page_size": data["page_size"],
        "block_size": packs.BLOCK_SIZE,
        "block_words": data["block_words"],
        "total": info["total"] if info and info["total"] else data["total"],
        "known": info["known"] if info else 0,
        "words": words,
    }


@router.get("/verbs")
def verbs_list(q: str = "", limit: int = 80) -> dict:
    rows = packs.search_verbs(q, max(1, min(int(limit), 200)))
    return {"total": len(packs.all_verbs()), "items": [packs.summarize_verb(v) for v in rows]}


@router.get("/verbs/{lemma}")
def verb_detail(lemma: str) -> dict:
    v = packs.find_verb(lemma)
    if v is None:
        raise HTTPException(404, "verb")
    return {"verb": packs.summarize_verb(v), "tenses": packs.verb_tenses(v)}
