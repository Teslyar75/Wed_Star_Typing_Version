"""Фоновая очередь перевода сегментов (in-process worker)."""

from __future__ import annotations

import threading
from dataclasses import dataclass
from queue import Empty, Queue

from app.db import SessionLocal
from app.translate_cache import fill_missing_translations


@dataclass
class TranslateTask:
    text_id: int
    src_lang: str
    dst_lang: str
    limit: int = 50


_q: Queue[TranslateTask] = Queue()
_started = False
_lock = threading.Lock()
_stats = {"queued": 0, "done": 0, "last_filled": 0}


def _worker() -> None:
    while True:
        task = _q.get()
        try:
            db = SessionLocal()
            try:
                n = fill_missing_translations(db, task.text_id, task.src_lang, task.dst_lang, task.limit)
                _stats["done"] += 1
                _stats["last_filled"] = n
            finally:
                db.close()
        except Exception:
            # fail-open: не роняем воркер
            pass
        finally:
            _q.task_done()


def ensure_worker() -> None:
    global _started
    with _lock:
        if _started:
            return
        t = threading.Thread(target=_worker, name="uplink-worker", daemon=True)
        t.start()
        _started = True


def enqueue(text_id: int, src: str, dst: str, limit: int = 50) -> dict[str, int]:
    ensure_worker()
    _q.put(TranslateTask(text_id=text_id, src_lang=src, dst_lang=dst, limit=limit))
    _stats["queued"] += 1
    return {"queued": _stats["queued"], "pending": _q.qsize(), "done": _stats["done"]}


def status() -> dict[str, int]:
    return {**_stats, "pending": _q.qsize()}
