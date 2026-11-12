"""Бортовой гид: шутки / факты / заходы — порт stamina/guide_content + guide_idle.

Контент лежит в app/data/guide_content/<lang>.json и <lang>/{category}.json
(ленивая выдача по категории). Эталон: My_Stamina desktop guide_idle.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data" / "guide_content"
LANGS = ("ru", "en", "uk", "de")
CATEGORIES = ("jokes", "facts", "intros", "system")
FALLBACK = "ru"


def _norm_lang(lang: str | None) -> str:
    code = (lang or FALLBACK).lower().replace("_", "-").split("-", 1)[0]
    return code if code in LANGS else FALLBACK


@lru_cache(maxsize=16)
def load_full(lang: str = FALLBACK) -> dict:
    code = _norm_lang(lang)
    path = DATA / f"{code}.json"
    if not path.exists():
        path = DATA / f"{FALLBACK}.json"
    return json.loads(path.read_text(encoding="utf-8"))


def meta(lang: str = FALLBACK) -> dict:
    code = _norm_lang(lang)
    path = DATA / code / "meta.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    c = load_full(code)
    return {
        "lang": code,
        "counts": {
            "jokes": len(c.get("jokes") or []),
            "facts": len(c.get("facts") or []),
            "intros_joke": len((c.get("intros") or {}).get("joke") or []),
            "intros_fact": len((c.get("intros") or {}).get("fact") or []),
            "intros_any": len((c.get("intros") or {}).get("any") or []),
            "system": len(c.get("system") or []),
        },
        "categories": list(CATEGORIES),
        "source": "My_Stamina stamina/guide_content (desktop guide_idle)",
    }


def category(lang: str, name: str) -> dict:
    code = _norm_lang(lang)
    if name not in CATEGORIES:
        raise KeyError(name)
    path = DATA / code / f"{name}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    c = load_full(code)
    if name == "intros":
        return {"lang": code, "intros": c.get("intros") or {}}
    if name == "system":
        return {"lang": code, "items": c.get("system") or []}
    return {"lang": code, "items": c.get(name) or []}


def texts_map(lang: str = FALLBACK) -> dict[str, str]:
    """id → text (как guide_idle.texts)."""
    c = load_full(lang)
    out: dict[str, str] = {}
    for lst in list((c.get("intros") or {}).values()) + [c.get("system") or [], c.get("jokes") or [], c.get("facts") or []]:
        for x in lst:
            if isinstance(x, dict) and x.get("id"):
                out[str(x["id"])] = str(x.get("text") or "")
    return out


def parity_counts() -> dict[str, dict[str, int]]:
    """Сводка counts по языкам (для тестов / отчёта)."""
    return {lang: meta(lang)["counts"] for lang in LANGS}
