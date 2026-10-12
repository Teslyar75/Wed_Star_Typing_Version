"""Единый разбор текста: абзацы → предложения с глобальными смещениями символов."""

from __future__ import annotations

import re
from dataclasses import dataclass

# Сокращения, после которых точка не конец предложения
_ABBREV = {
    "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "etc", "e.g", "i.e",
    "u.s", "u.k", "no", "vol", "pp", "fig", "al", "approx",
    "г", "ул", "т", "стр", "рис", "см", "др", "т.д", "т.п", "т.е",
}

_HARD_HYPHEN = re.compile(r"(\w)-\n(\w)")
_MULTI_NL = re.compile(r"\n{2,}")
_SENT_END = re.compile(r'([.!?…]+)(["»”\')\]]*)(\s+|$)')


@dataclass
class ParaSlice:
    idx: int
    body: str
    char_start: int
    char_end: int


@dataclass
class SentSlice:
    idx: int
    para_idx: int
    body: str
    char_start: int
    char_end: int


def join_hard_hyphens(text: str) -> str:
    """Склеить жёсткие переносы Gutenberg: word-\\nword → wordword."""
    prev = None
    cur = text
    while prev != cur:
        prev = cur
        cur = _HARD_HYPHEN.sub(r"\1\2", cur)
    return cur


def split_paragraphs(text: str) -> list[ParaSlice]:
    """Абзацы по пустой строке; внутри — схлопнуть одиночные \\n в пробел после склейки переносов."""
    text = join_hard_hyphens(text.replace("\r\n", "\n").replace("\r", "\n"))
    # нормализуем: одиночный перевод строки внутри абзаца → пробел
    parts: list[str] = []
    buf: list[str] = []
    for line in text.split("\n"):
        if line.strip() == "":
            if buf:
                parts.append(" ".join(buf).strip())
                buf = []
        else:
            buf.append(line.strip())
    if buf:
        parts.append(" ".join(buf).strip())
    out: list[ParaSlice] = []
    # смещения считаем по восстановленному тексту с \n\n между абзацами
    pos = 0
    rebuilt_chunks: list[str] = []
    for i, body in enumerate(parts):
        if not body:
            continue
        if rebuilt_chunks:
            pos += 2  # \n\n
        start = pos
        end = start + len(body)
        out.append(ParaSlice(idx=len(out), body=body, char_start=start, char_end=end))
        rebuilt_chunks.append(body)
        pos = end
    return out


def _is_abbrev(token: str) -> bool:
    t = token.strip().lower().rstrip(".")
    if t in _ABBREV:
        return True
    # инициалы: A. / J.K.
    if re.fullmatch(r"[A-Za-zА-Яа-яЁё]", t):
        return True
    return False


def split_sentences(paragraph: str, *, para_idx: int = 0, base_offset: int = 0,
                    start_idx: int = 0) -> list[SentSlice]:
    """Предложения с учётом сокращений, многоточий и закрывающих кавычек."""
    text = paragraph.strip()
    if not text:
        return []
    out: list[SentSlice] = []
    start = 0
    for m in _SENT_END.finditer(text):
        end = m.end()
        # символ после знака — если сокращение, не режем
        before = text[start:m.start(1)]
        last_word = re.split(r"\s+", before.strip())[-1] if before.strip() else ""
        # точка в сокращении: "Mr." — last_word may be "Mr"
        punct = m.group(1)
        if punct == "." and _is_abbrev(last_word):
            continue
        # многоточие внутри — уже в punct
        chunk = text[start:end].strip()
        if not chunk:
            start = end
            continue
        # абсолютные смещения в исходном абзаце (до strip итогового chunk)
        raw_start = start
        raw_end = end
        # уточнить: trim leading spaces in chunk relative to raw
        lead = len(text[raw_start:raw_end]) - len(text[raw_start:raw_end].lstrip())
        trail_body = text[raw_start:raw_end].strip()
        cs = base_offset + raw_start + lead
        ce = cs + len(trail_body)
        out.append(SentSlice(
            idx=start_idx + len(out),
            para_idx=para_idx,
            body=trail_body,
            char_start=cs,
            char_end=ce,
        ))
        start = end
    rest = text[start:].strip()
    if rest:
        lead = len(text[start:]) - len(text[start:].lstrip())
        cs = base_offset + start + lead
        out.append(SentSlice(
            idx=start_idx + len(out),
            para_idx=para_idx,
            body=rest,
            char_start=cs,
            char_end=cs + len(rest),
        ))
    return out


def segment_text(text: str, lang: str = "und") -> dict:
    """Один источник правды: абзацы + предложения + смещения.

    Возвращает:
      {
        "lang": ...,
        "paragraphs": [{idx, body, char_start, char_end}],
        "sentences": [{idx, para_idx, body, char_start, char_end}],
        "plain": восстановленный текст с \\n\\n между абзацами
      }
    """
    paras = split_paragraphs(text)
    sents: list[SentSlice] = []
    for p in paras:
        sents.extend(split_sentences(p.body, para_idx=p.idx, base_offset=p.char_start, start_idx=len(sents)))
    plain = "\n\n".join(p.body for p in paras)
    return {
        "lang": lang,
        "paragraphs": [p.__dict__ for p in paras],
        "sentences": [s.__dict__ for s in sents],
        "plain": plain,
    }
