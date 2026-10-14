"""Подготовка текста для набора (порт stamina/text_processing.py).

Результат — только для мостика/печати. Гипердрайв и «Книга» берут оригинал.
"""

from __future__ import annotations

import re
import string

_PUNCTUATION = set(string.punctuation) | {
    "«", "»", "“", "”", "„", "‟", "‹", "›",
    "—", "–", "−", "…", "·", "•",
    "№", "§", "¶", "©", "®", "™",
}

_TYPOGRAPHY = {
    "«": '"', "»": '"', "“": '"', "”": '"', "„": '"', "‟": '"',
    "‘": "'", "’": "'", "‚": "'", "‛": "'", "‹": "'", "›": "'",
    "—": "-", "–": "-", "−": "-", "…": "...", "\u00a0": " ", "\u202f": " ",
}

_UK_APOS = re.compile(r"(?<=[А-Яа-яЁёІіЇїЄєҐґ])['’ʼ](?=[А-Яа-яЁёІіЇїЄєҐґ])")

DEFAULT_PREP_OPTS: dict[str, bool] = {
    "lower": True,
    "punct": True,
    "spaces": True,
    "translit": False,
    "yo": False,
}


def normalize_spaces(text: str) -> str:
    return " ".join(text.split())


def remove_punctuation(text: str) -> str:
    text = _UK_APOS.sub("\x01", text)
    out = "".join("" if ch in _PUNCTUATION else ch for ch in text)
    return out.replace("\x01", "'")


def normalize_typography(text: str) -> str:
    out = "".join(_TYPOGRAPHY.get(ch, ch) for ch in text)
    return "".join(" " if ch in "\r\n\t\v\f" else ch for ch in out)


def process_text(
    text: str,
    *,
    lower: bool = True,
    punct: bool = True,
    spaces: bool = True,
    translit: bool = False,
    yo: bool = False,
) -> str:
    t = text or ""
    if yo:
        t = t.replace("ё", "е").replace("Ё", "Е")
    if translit:
        # минимальный набор — как web cargo
        for a, b in (
            ("ä", "ae"), ("ö", "oe"), ("ü", "ue"),
            ("Ä", "Ae"), ("Ö", "Oe"), ("Ü", "Ue"),
            ("ß", "ss"),
        ):
            t = t.replace(a, b)
    if lower and punct and spaces:
        return normalize_spaces(remove_punctuation(normalize_typography(t)).lower())
    if punct:
        t = remove_punctuation(t)
    t = normalize_typography(t)
    if lower:
        t = t.lower()
    if spaces:
        return normalize_spaces(t)
    return t.strip()


def norm_opts(opts: dict | None) -> dict[str, bool]:
    base = dict(DEFAULT_PREP_OPTS)
    if opts:
        for k in DEFAULT_PREP_OPTS:
            if k in opts:
                base[k] = bool(opts[k])
    return base
