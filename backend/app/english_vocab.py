"""Наборы и сериализация словаря (порт stamina/english/vocab.py + ENGLISH_DATA.md)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

SETS: list[tuple[str, int, str, str, str]] = [
    ("top-1000", 1000, "Essential 1000", "ФУНДАМЕНТ", "S-1000"),
    ("top-3000", 3000, "Core 3000", "РАЗГОВОРНЫЙ", "S-3000"),
    ("top-10000", 10000, "Advanced 10 000", "СВОБОДНЫЙ", "S-10K"),
    ("top-20000", 20000, "Master 20 000", "КАК НОСИТЕЛЬ", "S-20K"),
    ("dev-interview", 0, "IT Interview", "СОБЕСЕДОВАНИЕ", "S-DEV"),
]
THEMATIC_SETS = {"dev-interview"}
SET_LIMIT = {s[0]: s[1] for s in SETS}

POS_SHORT = {
    "noun": "NOUN",
    "verb": "VERB",
    "adjective": "ADJ",
    "adverb": "ADVERB",
    "pronoun": "PRONOUN",
    "preposition": "PREP",
    "conjunction": "CONJ",
    "interjection": "INTERJ",
    "determiner": "DET",
}


def vocab_paths() -> list[Path]:
    """Только данные внутри web_star_typing (репо отдельно от десктопа)."""
    here = Path(__file__).resolve().parent / "data"
    return [
        here / "vocab.json",  # 20k — копия stamina/english/data/vocab.json
        here / "vocab_dev.json",  # S-DEV — копия vocab_dev.json
        here / "vocab_seed.json",  # компактный fallback
    ]


def load_raw_words(limit: int = 20000, *, include_dev: bool = True) -> list[dict[str, Any]]:
    """Загрузить записи словаря (full + optional S-DEV) только из app/data/."""
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    freq_n = 0
    for path in vocab_paths():
        if not path.is_file():
            continue
        name = path.name.lower()
        is_dev = "dev" in name
        if is_dev and not include_dev:
            continue
        # seed — только если ещё нет основного словаря
        if name == "vocab_seed.json" and freq_n > 100:
            continue
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        words = raw.get("words") if isinstance(raw, dict) else raw
        if not isinstance(words, list):
            continue
        for item in words:
            if not isinstance(item, dict):
                continue
            w = (item.get("word") or "").strip()
            slug = (item.get("slug") or w.lower()).strip()
            if not w or slug in seen:
                continue
            if not is_dev and freq_n >= limit:
                break
            seen.add(slug)
            out.append(item)
            if not is_dev:
                freq_n += 1
    return out


def word_meta(item: dict[str, Any]) -> dict[str, Any]:
    """Компактный JSON для колонки meta."""
    sents = item.get("sentences") or []
    if not isinstance(sents, list):
        sents = []
    clean_sents = []
    for s in sents[:5]:
        if not isinstance(s, dict):
            continue
        en = (s.get("en") or "").strip()
        if not en:
            continue
        clean_sents.append({"en": en, "ru": (s.get("ru") or "").strip() or None})
    return {
        "slug": (item.get("slug") or (item.get("word") or "").lower()).strip(),
        "rank": int(item.get("rank") or 0),
        "pos": (item.get("pos") or "")[:32],
        "pos_all": item.get("pos_all") or [],
        "difficulty": item.get("difficulty") or "medium",
        "definition": (item.get("definition") or "")[:600],
        "ipa": item.get("ipa") or "",
        "respelling": item.get("respelling") or "",
        "syllables": item.get("syllables") or 0,
        "syllable_breakdown": item.get("syllable_breakdown") or "",
        "guide": item.get("guide") or "",
        "notes": item.get("notes") or [],
        "sets": item.get("sets") or ([item.get("level")] if item.get("level") else []),
        "example_ru": item.get("example_ru") or "",
        "sentences": clean_sents,
        "sounds_like": item.get("sounds_like") or [],
    }


def in_set(meta: dict[str, Any], set_id: str) -> bool:
    if set_id in THEMATIC_SETS:
        sets = meta.get("sets") or []
        return set_id in sets or "dev-interview" in sets
    lim = SET_LIMIT.get(set_id, 0)
    if lim <= 0:
        return False
    rank = int(meta.get("rank") or 0)
    return 0 < rank <= lim


def sets_catalog() -> list[dict[str, Any]]:
    return [
        {"id": sid, "limit": lim, "name": name, "sub": sub, "code": code}
        for sid, lim, name, sub, code in SETS
    ]
