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

#: Знаки, которые внутри слова — часть слова, а не разделитель.
_INNER_KEEP = {"'", "\u2019", "\u02bc", "\u2010", "\u2011", "-"}
#: Знаки внутри числа: «1.5», «1,5», «1990-1995».
_NUMBER_SEP = {".", ",", "-", "/", ":", "\u2013", "\u2014"}
_WORDISH = re.compile(r"[^\W_]", re.UNICODE)
#: Серия тире/дефисов — тире между словами («distaste--this»).
_DASH_RUN = re.compile(r"[-\u2010\u2011\u2012\u2013\u2014\u2015\u2212]{2,}")
#: Перенос на краю строки: «nine-\nteenth», «сло-\nво», мягкий перенос.
_LINE_HYPHEN = re.compile(r"([^\W\d_]+)[ \t]?[-\u00ad\u2010]\s*\r?\n\s*([^\W\d_]+)", re.UNICODE)

_UK_APOS = re.compile(r"(?<=[А-Яа-яЁёІіЇїЄєҐґ])['’ʼ](?=[А-Яа-яЁёІіЇїЄєҐґ])")

DEFAULT_PREP_OPTS: dict[str, bool] = {
    "lower": True,
    "punct": True,
    "spaces": True,
    "translit": False,
    "yo": False,
    # не оставлять сросшиеся слова: «fortyfive», «1984was», «nineteenthcentury»
    "glue": True,
}


def normalize_spaces(text: str) -> str:
    return " ".join(text.split())


def dehyphenate(text: str) -> str:
    """Перенос на краю строки: словарное слово склеиваем («nineteenth»),
    составное оставляем через дефис («forty-five»), а не «fortyfive»."""
    if "\n" not in text:
        return text
    from app.glue_fix import join_hyphenated
    return _LINE_HYPHEN.sub(lambda m: join_hyphenated(m.group(1), m.group(2), m.group(0)), text)


def remove_punctuation(text: str) -> str:
    """Убирает знаки, не сращивая слова: знак между буквами/цифрами → пробел.

    Дефис и апостроф внутри слова сохраняются («что-то», «don't»), разделитель
    внутри числа тоже («1.5»). Серия тире («--») всегда пробел.
    """
    text = dehyphenate(text)
    text = _UK_APOS.sub("\x01", text)
    text = _DASH_RUN.sub(" ", text)
    out: list[str] = []
    n = len(text)
    for i, ch in enumerate(text):
        if ch not in _PUNCTUATION:
            out.append(ch)
            continue
        prev = out[-1] if out else ""
        nxt = text[i + 1] if i + 1 < n else ""
        wp = bool(prev) and bool(_WORDISH.match(prev)) or prev == "\x01"
        wn = bool(nxt) and bool(_WORDISH.match(nxt))
        if ch in _INNER_KEEP and wp and wn:
            out.append(ch)
        elif ch in _NUMBER_SEP and prev.isdigit() and nxt.isdigit():
            out.append(ch)
        elif wp and wn:
            out.append(" ")
    return "".join(out).replace("\x01", "'")


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
    glue: bool = True,
) -> str:
    t = dehyphenate(text or "")
    out = _process(t, lower=lower, punct=punct, spaces=spaces, translit=translit, yo=yo)
    if glue:
        from app.glue_fix import repair
        out = repair(out)[0]
        if spaces:
            out = normalize_spaces(out)
    return out


def _process(t: str, *, lower: bool, punct: bool, spaces: bool, translit: bool, yo: bool) -> str:
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
        return normalize_spaces(normalize_typography(remove_punctuation(t)).lower())
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
