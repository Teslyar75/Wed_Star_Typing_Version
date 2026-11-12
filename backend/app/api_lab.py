"""API Лаборатории: visual / fragment / neighborhood / snapshot (чанки).

Данные пилота только читаются. Cookie-пилот — единственный источник identity.
"""
from __future__ import annotations

import json
import threading
import time
import uuid
from typing import Any, Iterator

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.auth_deps import get_current_pilot, get_optional_pilot
from app.db import get_db
from app import lab_data
from app import lab_layout
from app.lab_demo import demo_graph
from app.pilots import Pilot

router = APIRouter(prefix="/api/lab", tags=["lab"])

# jobs полного слепка: token → {pilot_id, events cursor, snapshot, cancel, created}
_SNAPSHOT_JOBS: dict[str, dict[str, Any]] = {}
_SNAPSHOT_LOCK = threading.Lock()
_SNAPSHOT_TTL = 600.0


def _purge_jobs() -> None:
    now = time.time()
    dead = [k for k, v in _SNAPSHOT_JOBS.items() if now - v.get("created", 0) > _SNAPSHOT_TTL]
    for k in dead:
        _SNAPSHOT_JOBS.pop(k, None)


def _graph_for(
    db: Session,
    pilot: Pilot | None,
    *,
    demo: bool,
    mode: str = "full",
) -> lab_data.Graph:
    if demo:
        g = demo_graph(400 if mode != "full" else 800)
        g.mode = "full"
        return g
    if pilot is None:
        return lab_data.Graph()
    return lab_data.collect_for_pilot(db, pilot.id, mode="full")


def _with_fresh_layout(g: lab_data.Graph) -> dict:
    return lab_layout.attach_layout(g)


@router.get("/visual")
def lab_visual(
    demo: bool = Query(False),
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    """Визуальный уровень: только кластеры, без отдельных слов."""
    full = _graph_for(db, pilot, demo=demo)
    vis = lab_data.collapse_to_clusters(full)
    payload = _with_fresh_layout(vis)
    payload["level"] = "visual"
    return payload


@router.get("/fragment")
def lab_fragment(
    group: str = Query(..., min_length=1, max_length=200),
    demo: bool = Query(False),
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    """Рабочий уровень: узлы одного созвездия + 1-hop соседи по рёбрам."""
    full = _graph_for(db, pilot, demo=demo)
    frag = lab_data.fragment_of(full, group)
    if not frag.nodes:
        raise HTTPException(404, "fragment empty")
    payload = _with_fresh_layout(frag)
    payload["level"] = "work"
    payload["mode"] = "fragment"
    return payload


@router.get("/neighborhood")
def lab_neighborhood(
    node_id: str = Query(..., min_length=1, max_length=200, alias="id"),
    offset: int = Query(0, ge=0),
    limit: int = Query(lab_data.NEIGHBOR_BATCH, ge=1, le=100),
    group: str | None = Query(None, max_length=200),
    demo: bool = Query(False),
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    """Выбранная звезда + порция 1-hop соседей (лениво, кэш на клиенте)."""
    full = _graph_for(db, pilot, demo=demo)
    bund = lab_data.star_neighborhood(full, node_id, limit=limit, offset=offset)
    if bund is None and group:
        frag = lab_data.fragment_of(full, group)
        bund = lab_data.star_neighborhood(frag, node_id, limit=limit, offset=offset)
    if bund is None:
        raise HTTPException(404, "node not found")
    return bund


@router.post("/snapshot")
def lab_snapshot_start(
    demo: bool = Query(False),
    chunk_size: int = Query(lab_data.SNAPSHOT_CHUNK, ge=10, le=500),
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> dict:
    """Начать полный слепок: первый чанк + token. Дальше — GET /snapshot/{token}."""
    _purge_jobs()
    full = _graph_for(db, pilot, demo=demo)
    token = uuid.uuid4().hex
    events = list(
        lab_data.iter_snapshot(chunk_size=chunk_size, graph=full, now=time.time())
    )
    with _SNAPSHOT_LOCK:
        _SNAPSHOT_JOBS[token] = {
            "pilot_id": pilot.id if pilot else 0,
            "demo": demo,
            "events": events,
            "idx": 0,
            "cancelled": False,
            "created": time.time(),
        }
    return _snapshot_next(token)


@router.get("/snapshot/{token}")
def lab_snapshot_next(token: str) -> dict:
    """Следующий чанк прогресса / финальный snapshot."""
    return _snapshot_next(token)


@router.delete("/snapshot/{token}")
def lab_snapshot_cancel(token: str) -> dict:
    with _SNAPSHOT_LOCK:
        job = _SNAPSHOT_JOBS.get(token)
        if not job:
            return {"ok": True, "phase": "cancelled"}
        job["cancelled"] = True
        job["idx"] = len(job["events"])
    return {"ok": True, "phase": "cancelled"}


def _snapshot_next(token: str) -> dict:
    with _SNAPSHOT_LOCK:
        job = _SNAPSHOT_JOBS.get(token)
        if not job:
            raise HTTPException(404, "snapshot job not found")
        if job.get("cancelled"):
            return {"token": token, "phase": "cancelled", "done": 0, "total": 0}
        events: list[dict] = job["events"]
        idx = job["idx"]
        if idx >= len(events):
            return {"token": token, "phase": "done", "done": 0, "total": 0}
        ev = dict(events[idx])
        job["idx"] = idx + 1
        # если это промежуточный nodes — можно отдать несколько за раз? один event
        ev["token"] = token
        if ev.get("phase") == "done":
            # очистка после выдачи
            pass
        return ev


@router.get("/snapshot-stream")
def lab_snapshot_stream(
    demo: bool = Query(False),
    chunk_size: int = Query(lab_data.SNAPSHOT_CHUNK, ge=10, le=500),
    db: Session = Depends(get_db),
    pilot: Pilot | None = Depends(get_optional_pilot),
) -> StreamingResponse:
    """NDJSON-поток прогресса + финальный слепок. Отмена — AbortController."""
    full = _graph_for(db, pilot, demo=demo)

    def gen() -> Iterator[bytes]:
        for ev in lab_data.iter_snapshot(chunk_size=chunk_size, graph=full, now=time.time()):
            yield (json.dumps(ev, ensure_ascii=False) + "\n").encode("utf-8")

    return StreamingResponse(gen(), media_type="application/x-ndjson")


@router.get("/meta")
def lab_meta() -> dict:
    return {
        "neighbor_batch": lab_data.NEIGHBOR_BATCH,
        "snapshot_chunk": lab_data.SNAPSHOT_CHUNK,
        "zoom_min": lab_layout.ZOOM_MIN,
        "zoom_max": lab_layout.ZOOM_MAX,
        "zoom_step": lab_layout.ZOOM_STEP,
        "pitch_max": lab_layout.PITCH_MAX,
        "drag_click_px": lab_layout.DRAG_CLICK_PX,
        "work_zoom": lab_layout.WORK_ZOOM,
    }
