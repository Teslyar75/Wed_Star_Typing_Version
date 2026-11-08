"""Загрузка CEFR и глаголов из данных десктопа (stamina/english/data)."""
from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path

from . import english_conjugation as cj
from .config import settings

LEVELS = [
    ("A1", "A1 · ВЫЖИВАНИЕ", "easy"),
    ("A2", "A2 · БЫТ", "easy"),
    ("B1.1", "B1.1 · ПОРОГ", "medium"),
    ("B1.2", "B1.2 · ПОРОГ+", "medium"),
    ("B2.1", "B2.1 · СВОБОДНО", "medium"),
    ("B2.2", "B2.2 · СВОБОДНО+", "tricky"),
    ("C1", "C1 · ПРОДВИНУТЫЙ", "tricky"),
    ("C2", "C2 · МАСТЕРСТВО", "tricky"),
]
LEVEL_TITLE = {lv: title for lv, title, _d in LEVELS}
LEVEL_DIFF = {lv: diff for lv, _t, diff in LEVELS}
BLOCK_SIZE = 50
UNLOCK_PCT = 80
MIN_SENTENCES = 1

VERB_TENSES = [
    ("present_simple", "Present Simple", "Настоящее простое", "регулярное действие"),
    ("present_continuous", "Present Continuous", "Настоящее длительное", "прямо сейчас"),
    ("present_perfect", "Present Perfect", "Настоящее совершенное", "результат к настоящему"),
    ("present_perfect_continuous", "Present Perfect Continuous", "Настоящее совершенное длительное",
     "длится до настоящего"),
    ("past_simple", "Past Simple", "Прошедшее простое", "завершённое действие"),
    ("past_continuous", "Past Continuous", "Прошедшее длительное", "процесс в прошлом"),
    ("past_perfect", "Past Perfect", "Прошедшее совершенное", "завершено до другого прошлого"),
    ("past_perfect_continuous", "Past Perfect Continuous", "Прошедшее совершенное длительное",
     "длилось до другого прошлого"),
    ("future_simple", "Future Simple", "Будущее простое", "решение или прогноз"),
    ("future_continuous", "Future Continuous", "Будущее длительное", "процесс в будущем"),
    ("future_perfect", "Future Perfect", "Будущее совершенное", "завершится к сроку"),
    ("future_perfect_continuous", "Future Perfect Continuous", "Будущее совершенное длительное",
     "будет длиться к сроку"),
]
TENSE_FORM = {
    "present_simple": ("v1", "s"), "future_simple": ("v1",),
    "past_simple": ("v2",),
    "present_continuous": ("ing",), "past_continuous": ("ing",), "future_continuous": ("ing",),
    "present_perfect_continuous": ("ing",), "past_perfect_continuous": ("ing",),
    "future_perfect_continuous": ("ing",),
    "present_perfect": ("v3",), "past_perfect": ("v3",), "future_perfect": ("v3",),
}


def data_dir() -> Path:
    env = os.environ.get("ENGLISH_DATA_DIR") or getattr(settings, "english_data_dir", "")
    if env:
        return Path(env)
    here = Path(__file__).resolve()
    candidates = [
        here.parents[3] / "stamina" / "english" / "data",  # My_New_Stamina/web_star_typing/backend/app
        here.parents[2].parent / "My_New_Stamina" / "stamina" / "english" / "data",
        settings.repo_root() / "stamina" / "english" / "data",
    ]
    for c in candidates:
        try:
            if c.is_dir():
                return c
        except (OSError, IndexError):
            continue
    return Path("/english-data")


def cefr_path(level: str) -> Path:
    return data_dir() / "sets" / f"cefr_{level.lower().replace('.', '_')}.json"


def available_levels() -> list[str]:
    return [lv for lv, _t, _d in LEVELS if cefr_path(lv).exists()]


@lru_cache(maxsize=16)
def _load_cefr_file(level: str, stamp: tuple) -> dict:
    del stamp
    try:
        return json.loads(cefr_path(level).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _stamp(path: Path) -> tuple:
    try:
        st = path.stat()
        return (st.st_mtime_ns, st.st_size)
    except OSError:
        return (0, 0)


def load_cefr(level: str) -> dict:
    return _load_cefr_file(level, _stamp(cefr_path(level)))


_SLUGS: dict[str, tuple[str, ...]] = {}


@lru_cache(maxsize=16)
def _cefr_words_cached(level: str, stamp: tuple) -> tuple:
    data = _load_cefr_file(level, stamp)
    out = []
    for idx, raw in enumerate(data.get("words") or []):
        word = str(raw.get("word") or "").strip()
        if not word:
            continue
        sents = []
        for s in raw.get("sentences") or []:
            if isinstance(s, dict) and s.get("en"):
                sents.append({"en": s["en"], "ru": s.get("ru") or ""})
            elif isinstance(s, str) and s.strip():
                sents.append({"en": s.strip(), "ru": ""})
        if len(sents) < MIN_SENTENCES:
            continue
        senses = raw.get("senses") or []
        definition = (senses[0].get("definition") if senses else "") or raw.get("definition", "")
        slug = str(raw.get("slug") or word.lower())
        out.append({
            "word": word,
            "slug": slug,
            "pos": raw.get("pos") or "noun",
            "ru": raw.get("ru") or "",
            "ipa": raw.get("ipa") or "",
            "definition": definition or "",
            "difficulty": raw.get("difficulty") or LEVEL_DIFF.get(level, "easy"),
            "sentences": sents[:5],
            "level": level,
            "cefr_order": idx,
            "topic": raw.get("topic") or "",
        })
    _SLUGS[level] = tuple(w["slug"] for w in out)
    return tuple(out)


def cefr_words(level: str) -> list[dict]:
    return list(_cefr_words_cached(level, _stamp(cefr_path(level))))


def cefr_slugs(level: str) -> tuple[str, ...]:
    hit = _SLUGS.get(level)
    if hit is not None:
        return hit
    cefr_words(level)
    return _SLUGS.get(level, ())


def cefr_slugs_if_warm(level: str) -> tuple[str, ...] | None:
    return _SLUGS.get(level)


def cefr_blocks(level: str) -> list[list[dict]]:
    words = cefr_words(level)
    return [words[i:i + BLOCK_SIZE] for i in range(0, len(words), BLOCK_SIZE)] or [[]]


PAGE_SIZE = 24  # 6x4, как СТАНДАРТ и десктопный CefrPage


def cefr_page(level: str, block: int = 0, page: int = 0, page_size: int = PAGE_SIZE) -> dict:
    """Одна порция карточек: блок 50, внутри страница 24. Не отдаём все слова уровня."""
    per = max(1, min(int(page_size or PAGE_SIZE), PAGE_SIZE))
    blocks = cefr_blocks(level)
    n = max(1, len(blocks))
    bi = max(0, min(int(block), n - 1))
    items = blocks[bi]
    pages = max(1, (len(items) + per - 1) // per)
    pi = max(0, min(int(page), pages - 1))
    chunk = items[pi * per:(pi + 1) * per]
    return {
        "block": bi,
        "blocks": n,
        "page": pi,
        "pages": pages,
        "page_size": per,
        "block_words": len(items),
        "total": sum(len(b) for b in blocks),
        "words": chunk,
    }


def card_view(w: dict) -> dict:
    """Сетка 6x4: без примеров (они в сканере)."""
    return {
        "id": int(w.get("id") or 0),
        "word": w.get("word") or "",
        "slug": w.get("slug") or "",
        "pos": w.get("pos") or "",
        "ru": w.get("ru") or "",
        "translation": w.get("ru") or w.get("translation") or "",
        "ipa": w.get("ipa") or "",
        "definition": (w.get("definition") or "")[:280],
        "difficulty": w.get("difficulty") or "easy",
        "rank": int(w.get("cefr_order") or 0) + 1,
        "known": bool(w.get("known")),
        "topic": w.get("topic") or "",
    }


def find_cefr_word(needle: str) -> dict | None:
    n = (needle or "").strip().lower()
    if not n:
        return None
    warm = [lv for lv, _t, _d in LEVELS if lv in _SLUGS]
    cold = [lv for lv, _t, _d in LEVELS if lv not in _SLUGS and cefr_path(lv).exists()]
    for lv in warm + cold:
        for w in _cefr_words_cached(lv, _stamp(cefr_path(lv))):
            if w["slug"] == n or w["word"].lower() == n:
                return dict(w)
    return None


def warmup() -> dict:
    n = 0
    for lv in available_levels():
        n += len(cefr_words(lv))
    return {"levels": available_levels(), "words": n}


@lru_cache(maxsize=4)
def _load_verb_pack(name: str, stamp: tuple) -> list[dict]:
    del stamp
    path = data_dir() / "verbs" / f"{name}.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    return list(data.get("verbs") or [])


def _pack(name: str) -> list[dict]:
    path = data_dir() / "verbs" / f"{name}.json"
    try:
        st = path.stat()
        stamp = (st.st_mtime_ns, st.st_size)
    except OSError:
        stamp = (0, 0)
    return _load_verb_pack(name, stamp)


def all_verbs() -> list[dict]:
    seen, out = set(), []
    for v in _pack("irregular") + _pack("frequent_1000"):
        lemma = str(v.get("lemma") or "").strip().lower()
        if lemma and lemma not in seen:
            seen.add(lemma)
            out.append(v)
    return out


def find_verb(lemma: str) -> dict | None:
    needle = (lemma or "").strip().lower()
    return next((v for v in all_verbs() if v.get("lemma") == needle), None)


def example_for(verb: dict, tense: str) -> dict | None:
    want = set()
    for k in TENSE_FORM.get(tense, ("v1",)):
        val = verb["lemma"] if k == "v1" else verb.get(k) or ""
        want |= {x.strip() for x in str(val).split("/") if x.strip()}
    exs = verb.get("examples") or []
    return next((e for e in exs if e.get("form") in want), exs[0] if exs else None)


def verb_tenses(verb: dict) -> list[dict]:
    lemma = verb["lemma"]
    out = []
    for key, en_name, ru_name, hint in VERB_TENSES:
        try:
            en = cj.conjugate(lemma, key, "I", v2=verb.get("v2"), v3=verb.get("v3"))
        except ValueError:
            en = lemma
        ex = example_for(verb, key) if verb.get("examples") else None
        ru = ""
        if ex:
            ru = f"{ex.get('en') or ''} — {ex.get('ru') or ''}"
            if ex.get("source_id"):
                ru += f" (tatoeba.org #{ex['source_id']})"
        out.append({
            "key": key,
            "tense": en_name,
            "tense_ru": ru_name,
            "hint": hint,
            "en": en,
            "ru": ru,
            "example": {"en": (ex or {}).get("en") or "", "ru": (ex or {}).get("ru") or ""},
        })
    return out


def search_verbs(query: str, limit: int = 60) -> list[dict]:
    pool = all_verbs()
    q = (query or "").strip().lower()
    if not q:
        return pool[:limit]
    first, second = [], []
    for v in pool:
        forms = [v.get("lemma") or "", *(str(v.get("v2") or "").split("/")), *(str(v.get("v3") or "").split("/"))]
        forms = [f.strip().lower() for f in forms if f.strip()]
        ru = str(v.get("ru") or "").lower()
        if any(f.startswith(q) for f in forms):
            first.append(v)
        elif q in ru or any(q in f for f in forms):
            second.append(v)
        if len(first) >= limit:
            break
    return (first + second)[:limit]


def summarize_verb(v: dict) -> dict:
    return {
        "lemma": v.get("lemma"),
        "ru": v.get("ru") or "",
        "v2": v.get("v2") or "",
        "v3": v.get("v3") or "",
        "s": v.get("s") or "",
        "ing": v.get("ing") or "",
        "ipa": v.get("ipa") or "",
        "cefr": v.get("cefr") or "",
        "rank": int(v.get("rank") or 0),
        "irregular": str(v.get("v2") or "") != "" and True,
    }
