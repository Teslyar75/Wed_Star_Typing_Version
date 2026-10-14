"""Пары PD Gutenberg (порт stamina.book_catalog bilingual*) — DE/FR/ES/IT.

EN→RU/UK идут через bilinguis; здесь — seed + поиск перевода по Gutendex.
"""

from __future__ import annotations

import re
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

# helpers из api_catalog — ленивый импорт (избежать цикла при загрузке роутера)
CEFR_PAGE = 16


def _gut():
    from app import api_catalog as gut

    return gut

# Кураторские пары PD (как desktop). RU не зашиваем — ложные EN→EN.
BILINGUAL_SEED: list[dict[str, Any]] = [
    {"lang_a": "en", "id_a": 5200, "lang_b": "de", "id_b": 22367},
    {"lang_a": "en", "id_a": 11, "lang_b": "de", "id_b": 19778},
    {"lang_a": "en", "id_a": 12, "lang_b": "de", "id_b": 28881},
    {"lang_a": "en", "id_a": 1342, "lang_b": "de", "id_b": 10765},
    {"lang_a": "en", "id_a": 84, "lang_b": "de", "id_b": 10166},
    {"lang_a": "en", "id_a": 345, "lang_b": "de", "id_b": 10066},
    {"lang_a": "en", "id_a": 98, "lang_b": "fr", "id_b": 13951},
    {"lang_a": "en", "id_a": 103, "lang_b": "fr", "id_b": 46501},
    {"lang_a": "en", "id_a": 164, "lang_b": "fr", "id_b": 50916},
    {"lang_a": "en", "id_a": 1184, "lang_b": "fr", "id_b": 17989},
    {"lang_a": "en", "id_a": 996, "lang_b": "es", "id_b": 2000},
    {"lang_a": "en", "id_a": 500, "lang_b": "it", "id_b": 19717},
]

_TITLE_STOP = {
    "the", "a", "an", "of", "and", "in", "to", "for", "on", "by", "or", "with",
    "der", "die", "das", "und", "ein", "eine", "le", "la", "les", "des", "du",
    "el", "los", "las", "и", "в", "на", "к", "по", "из", "о",
}


def _title_tokens(s: str) -> set[str]:
    s = re.sub(r"[^\w\s]", " ", (s or "").lower(), flags=re.UNICODE)
    return {w for w in s.split() if len(w) > 2 and w not in _TITLE_STOP}


def _score_title_pair(a: str, b: str) -> float:
    ta, tb = _title_tokens(a), _title_tokens(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / max(len(ta), len(tb))


def _author_surname(author: str) -> str:
    author = (author or "").replace(",", " ").strip()
    if not author:
        return ""
    parts = [p for p in author.split() if p]
    return parts[-1] if parts else ""


def _book_dict(book) -> dict[str, Any]:
    """CatalogBook / dict → plain dict для pairing."""
    if book is None:
        return {}
    if isinstance(book, dict):
        return book
    return {
        "id": int(book.id),
        "title": book.title or "",
        "authors": book.authors or "",
        "author": book.authors or "",
        "languages": list(book.languages or []),
        "text_url": book.text_url,
        "cover_url": book.cover_url,
        "has_cover": bool(book.has_cover),
        "download_count": int(book.download_count or 0),
        "cefr": book.cefr,
        "source": "gutenberg",
    }


def book_langs(book: dict | None) -> set[str]:
    if not book:
        return set()
    return {str(x).lower() for x in (book.get("languages") or []) if x}


def primary_lang(book: dict | None, default: str = "") -> str:
    raw = (book.get("languages") or []) if book else []
    if raw:
        return str(raw[0]).lower()
    return default


def is_language_pair(
    book_a: dict | None,
    book_b: dict | None,
    lang_b: str,
    *,
    require_title_overlap: bool = True,
) -> bool:
    if not book_a or not book_b:
        return False
    if int(book_a.get("id") or 0) == int(book_b.get("id") or 0):
        return False
    lb = (lang_b or "").strip().lower()
    if not lb:
        return False
    langs_b = book_langs(book_b)
    langs_a = book_langs(book_a)
    if not langs_a or not langs_b:
        return False
    if lb not in langs_b or primary_lang(book_b) != lb:
        return False
    if primary_lang(book_a) == lb or primary_lang(book_a) == primary_lang(book_b):
        return False
    if langs_a == langs_b:
        return False
    if require_title_overlap:
        score = _score_title_pair(book_a.get("title") or "", book_b.get("title") or "")
        sa = _author_surname(book_a.get("authors") or book_a.get("author") or "")
        sb = _author_surname(book_b.get("authors") or book_b.get("author") or "")
        same_author = bool(sa and sb and sa.lower() == sb.lower())
        if same_author:
            return True
        if score < 0.22:
            return False
    return True


def fetch_book(gid: int) -> dict | None:
    gut = _gut()
    try:
        item = gut._get_json(f"{gut.GUTENDEX}{int(gid)}")
    except Exception:  # noqa: BLE001 — сеть/404 → нет книги
        return None
    book = gut._normalize(item)
    return _book_dict(book) if book else None


def _fetch_by_ids(ids: list[int]) -> list[dict]:
    """Пакетный запрос Gutendex ?ids=… (как desktop) + добор по одному при промахе."""
    if not ids:
        return []
    gut = _gut()
    by_id: dict[int, dict] = {}
    # gutendex принимает пачку ids одним запросом
    try:
        params = {"ids": ",".join(str(i) for i in ids)}
        data = gut._get_json(gut.GUTENDEX + "?" + urllib.parse.urlencode(params))
        for item in data.get("results") or []:
            book = gut._normalize(item)
            if book is not None:
                d = _book_dict(book)
                by_id[int(d["id"])] = d
    except Exception:  # noqa: BLE001
        pass
    missing = [i for i in ids if i not in by_id]
    if missing:
        with ThreadPoolExecutor(max_workers=min(8, len(missing))) as pool:
            futs = {pool.submit(fetch_book, gid): gid for gid in missing}
            for fut in as_completed(futs):
                book = fut.result()
                if book is not None:
                    by_id[int(book["id"])] = book
    return [by_id[i] for i in ids if i in by_id]


def _attach_seed(book_a: dict, book_b: dict, lang_a: str, lang_b: str) -> dict | None:
    """Кураторская пара: языки по seed, без жёсткого title-overlap."""
    if not book_a or not book_b:
        return None
    if int(book_a.get("id") or 0) == int(book_b.get("id") or 0):
        return None
    # строгая проверка, если проходит — ок
    rec = _attach_translation(book_a, book_b, lang_b)
    if rec:
        return rec
    # seed кураторский: показываем пару даже если Gutendex криво проставил language
    return {
        **book_a,
        "translation": book_b,
        "tr_id": int(book_b.get("id") or 0),
        "lang_a": lang_a,
        "lang_b": lang_b,
        "bilingual": True,
        "source": "gutenberg",
    }


def find_translation(book: dict, lang_b: str, *, min_score: float = 0.34) -> dict | None:
    if not book or not lang_b:
        return None
    lang_b = lang_b.strip().lower()
    if lang_b in book_langs(book):
        return None
    gid = int(book.get("id") or 0)
    for seed in BILINGUAL_SEED:
        tr = None
        if seed["id_a"] == gid and seed["lang_b"] == lang_b:
            tr = fetch_book(seed["id_b"])
        elif seed["id_b"] == gid and seed["lang_a"] == lang_b:
            tr = fetch_book(seed["id_a"])
        if tr and is_language_pair(book, tr, lang_b):
            return tr

    title = book.get("title") or ""
    surname = _author_surname(book.get("authors") or book.get("author") or "")
    queries: list[str] = []
    if surname:
        queries.append(surname)
    words = list(_title_tokens(title))[:4]
    if words:
        queries.append(" ".join(words[:3]))
    best: dict | None = None
    best_score = 0.0
    seen_q: set[str] = set()
    gut = _gut()
    for q in queries:
        q = q.strip()
        if not q or q in seen_q:
            continue
        seen_q.add(q)
        params = {"search": q, "languages": lang_b}
        try:
            data = gut._get_json(gut.GUTENDEX + "?" + urllib.parse.urlencode(params))
        except Exception:  # noqa: BLE001
            continue
        packed = gut._pack(data, query=q)
        for cand_m in packed.results[:16]:
            cand = _book_dict(cand_m)
            if int(cand.get("id") or 0) == gid:
                continue
            if not is_language_pair(book, cand, lang_b):
                continue
            score = _score_title_pair(title, cand.get("title") or "")
            if surname and surname.lower() in (cand.get("authors") or "").lower():
                score += 0.28
            if score > best_score:
                best, best_score = cand, score
    if best and best_score >= min_score:
        return best
    return None


def _attach_translation(book: dict, tr: dict, lang_b: str) -> dict | None:
    if not is_language_pair(book, tr, lang_b):
        return None
    rec = dict(book)
    rec["translation"] = tr
    rec["tr_id"] = int(tr.get("id") or 0)
    rec["lang_a"] = primary_lang(book, "en")
    rec["lang_b"] = lang_b
    rec["bilingual"] = True
    rec["source"] = "gutenberg"
    return rec


def list_bilingual_seed(*, lang_a: str = "en", lang_b: str = "de", page: int = 1) -> dict:
    lang_a = (lang_a or "en").strip().lower()
    lang_b = (lang_b or "de").strip().lower()
    page = max(1, int(page or 1))
    seeds = [s for s in BILINGUAL_SEED if s["lang_a"] == lang_a and s["lang_b"] == lang_b]
    # одна страница = вся кураторская полка пары (обычно ≤12)
    ids: list[int] = []
    for s in seeds:
        ids.extend([s["id_a"], s["id_b"]])
    # уникальные, порядок сохранить
    seen: set[int] = set()
    uniq: list[int] = []
    for i in ids:
        if i not in seen:
            seen.add(i)
            uniq.append(i)
    books = _fetch_by_ids(uniq)
    by_id = {int(b["id"]): b for b in books}
    results: list[dict] = []
    for s in seeds:
        a, b = by_id.get(s["id_a"]), by_id.get(s["id_b"])
        rec = _attach_seed(a, b, lang_a, lang_b) if a and b else None
        if rec:
            results.append(rec)
    return {
        # честный счётчик = сколько пар реально в ответе
        "count": len(results),
        "seed_total": len(seeds),
        "next": True,  # после seed можно добрать popular
        "results": results,
        "query": f"свободные · 2 языка ({lang_a.upper()}→{lang_b.upper()})",
        "bilingual": True,
        "source": "gutenberg",
    }


def list_bilingual_free(*, lang_a: str = "en", lang_b: str = "de", page: int = 1) -> dict:
    """page=1 — вся seed-полка; page≥2 — popular lang_a с PD-переводом."""
    lang_a = (lang_a or "en").strip().lower()
    lang_b = (lang_b or "de").strip().lower()
    page = max(1, int(page or 1))
    if page == 1:
        seeded = list_bilingual_seed(lang_a=lang_a, lang_b=lang_b, page=1)
        if seeded.get("results"):
            seeded["next"] = True
            return seeded
    popular_page = page - 1 if page >= 2 else 1
    gut = _gut()
    params: dict[str, str] = {"sort": "popular", "languages": lang_a}
    if popular_page > 1:
        params["page"] = str(popular_page)
    data = gut._get_json(gut.GUTENDEX + "?" + urllib.parse.urlencode(params))
    packed = gut._pack(data, query="popular")
    out: list[dict] = []
    for book_m in packed.results:
        book = _book_dict(book_m)
        tr = find_translation(book, lang_b)
        if tr:
            rec = _attach_translation(book, tr, lang_b)
            if rec:
                out.append(rec)
    return {
        "count": len(out),
        "next": bool(packed.next),
        "results": out,
        "query": f"свободные · 2 языка ({lang_a.upper()}→{lang_b.upper()})",
        "bilingual": True,
        "source": "gutenberg",
    }


def search_bilingual(
    *,
    title: str = "",
    author: str = "",
    lang_a: str = "en",
    lang_b: str = "de",
    page: int = 1,
) -> dict:
    lang_a = (lang_a or "").strip().lower() or "en"
    lang_b = (lang_b or "de").strip().lower()
    parts = [p for p in (author.strip(), title.strip()) if p]
    if not parts:
        return list_bilingual_free(lang_a=lang_a, lang_b=lang_b, page=page)
    gut = _gut()
    params: dict[str, str] = {"search": " ".join(parts), "languages": lang_a}
    if page > 1:
        params["page"] = str(page)
    data = gut._get_json(gut.GUTENDEX + "?" + urllib.parse.urlencode(params))
    packed = gut._pack(data, query=" ".join(parts))
    out: list[dict] = []
    for book_m in packed.results:
        book = _book_dict(book_m)
        tr = find_translation(book, lang_b)
        if tr:
            rec = _attach_translation(book, tr, lang_b)
            if rec:
                out.append(rec)
    return {
        "count": int(packed.count or 0),
        "next": bool(packed.next),
        "results": out,
        "query": packed.query or "",
        "bilingual": True,
        "source": "gutenberg",
    }


def list_bilingual_by_cefr(
    level: str,
    *,
    lang_a: str = "en",
    lang_b: str = "de",
    page: int = 1,
) -> dict:
    gut = _gut()
    lv = (level or "").strip().upper()
    lang_a = (lang_a or "en").strip().lower()
    lang_b = (lang_b or "de").strip().lower()
    page = max(1, int(page or 1))
    ids = list(gut.CEFR_IDS_EN.get(lv) or []) if lang_a == "en" else []
    id_pages = max(1, (len(ids) + CEFR_PAGE - 1) // CEFR_PAGE) if ids else 0
    books: list[dict] = []
    has_more = False
    if ids and page <= id_pages:
        chunk = ids[(page - 1) * CEFR_PAGE : page * CEFR_PAGE]
        books = _fetch_by_ids(chunk)
        for b in books:
            b["cefr"] = lv
        has_more = page < id_pages or bool(gut.CEFR_TOPICS.get(lv))
    else:
        topic_page = page - id_pages if ids else page
        topic = gut.CEFR_TOPICS.get(lv) or "fiction"
        params: dict[str, str] = {"topic": topic, "sort": "popular", "languages": lang_a}
        if topic_page > 1:
            params["page"] = str(topic_page)
        data = gut._get_json(gut.GUTENDEX + "?" + urllib.parse.urlencode(params))
        packed = gut._pack(data, query=f"cefr {lv}", cefr=lv)
        books = [_book_dict(b) for b in packed.results]
        has_more = bool(packed.next)
    out: list[dict] = []
    for book in books:
        tr = find_translation(book, lang_b)
        if tr:
            rec = _attach_translation(book, tr, lang_b)
            if rec:
                if book.get("cefr"):
                    rec["cefr"] = book["cefr"]
                out.append(rec)
    return {
        "count": len(ids) if ids else len(out),
        "next": has_more,
        "results": out,
        "query": f"cefr {lv} · 2 языка",
        "bilingual": True,
        "source": "gutenberg",
    }
