"""Кэш переводов + UPLINK (Google gtx / MyMemory), как stamina/translator.py."""

from __future__ import annotations

import hashlib
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, Session

from app.db import Base
from app.models import Segment

USER_AGENT = "StarTypingWeb/0.8 (+https://github.com/Teslyar75/Wed_Star_Typing_Version)"
TIMEOUT = 8.0


class TranslationCache(Base):
    __tablename__ = "translations"
    __table_args__ = (UniqueConstraint("digest", "src_lang", "dst_lang", name="uq_tr"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    digest: Mapped[str] = mapped_column(String(64), index=True)
    src_lang: Mapped[str] = mapped_column(String(16))
    dst_lang: Mapped[str] = mapped_column(String(16))
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


def _digest(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def cache_get(db: Session, text: str, src: str, dst: str) -> str | None:
    row = (
        db.query(TranslationCache)
        .filter_by(digest=_digest(text), src_lang=src, dst_lang=dst)
        .first()
    )
    return row.text if row else None


def cache_put(db: Session, source: str, src: str, dst: str, translated: str, *, commit: bool = True) -> None:
    dig = _digest(source)
    existing = db.query(TranslationCache).filter_by(digest=dig, src_lang=src, dst_lang=dst).first()
    if existing:
        existing.text = translated
    else:
        db.add(TranslationCache(digest=dig, src_lang=src, dst_lang=dst, text=translated))
    if commit:
        db.commit()


def _google(text: str, sl: str, tl: str) -> str:
    url = (
        "https://translate.googleapis.com/translate_a/single?client=gtx&dt=t"
        f"&sl={sl}&tl={tl}&q={urllib.parse.quote(text)}"
    )
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    parts = [p[0] for p in (data[0] or []) if p and p[0]]
    result = "".join(parts).strip()
    if not result:
        raise ValueError("empty google")
    return result


def _mymemory(text: str, sl: str, tl: str) -> str:
    url = "https://api.mymemory.translated.net/get?" + urllib.parse.urlencode(
        {"q": text[:480], "langpair": f"{sl}|{tl}"}
    )
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    result = (data.get("responseData") or {}).get("translatedText") or ""
    if int(data.get("responseStatus", 200)) != 200 or "MYMEMORY WARNING" in result.upper():
        raise ValueError("mymemory limit")
    if not result.strip():
        raise ValueError("empty mymemory")
    return result.strip()


def stub_translate(text: str, src: str, dst: str) -> str:
    if not text.strip():
        return ""
    return f"[{dst}] {text}"


def uplink_translate(text: str, src: str, dst: str) -> str:
    """Сетевой перевод; при TRANSLATE_OFFLINE=1 или сбое сети — stub."""
    text = (text or "").strip()
    if not text:
        return ""
    if src == dst:
        return text
    if os.environ.get("TRANSLATE_OFFLINE", "").lower() in {"1", "true", "yes"}:
        return stub_translate(text, src, dst)
    sl = src if src and src != "und" else "auto"
    backends = (_google,) if sl == "auto" else (_google, _mymemory)
    last: Exception | None = None
    for fn in backends:
        try:
            return fn(text, sl, dst)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, OSError, json.JSONDecodeError) as e:
            last = e
            continue
    return stub_translate(text, src, dst) if last else stub_translate(text, src, dst)


def fill_missing_translations(db: Session, text_id: int, src: str, dst: str, limit: int = 50) -> int:
    segs = (
        db.query(Segment)
        .filter(Segment.text_id == text_id, Segment.translation == "")
        .order_by(Segment.idx)
        .limit(limit)
        .all()
    )
    n = 0
    for s in segs:
        cached = cache_get(db, s.original, src, dst)
        if cached:
            tr = cached
        else:
            tr = uplink_translate(s.original, src, dst)
            # не кэшируем stub-плейсхолдеры как «настоящий» перевод
            if tr and not tr.startswith(f"[{dst}] "):
                cache_put(db, s.original, src, dst, tr, commit=False)
        s.translation = tr
        s.status = "aligned" if tr and not tr.startswith(f"[{dst}] ") else "unaligned"
        n += 1
    db.commit()
    return n
