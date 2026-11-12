"""Лаборатория: граф, LOD, зум к курсору, API."""
from __future__ import annotations

import json
import time
import uuid

from fastapi.testclient import TestClient

from app.db import init_db
from app.main import app
from app import lab_data
from app.lab_demo import demo_graph
from app.lab_layout import (
    DRAG_CLICK_PX,
    MAX_STARS,
    PITCH_MAX,
    WORK_ZOOM,
    ZOOM_MAX,
    ZOOM_MIN,
    ZOOM_STEP,
    aggregate,
    clamp_pitch,
    layout,
    project_point,
    zoom_toward,
)

init_db()

NOW = time.mktime((2026, 11, 4, 12, 0, 0, 0, 0, -1))


def _day(days_ago: int) -> str:
    return time.strftime("%Y-%m-%d", time.localtime(NOW - days_ago * 86400))


def _fill_payload():
    eng = {
        "words": {"case": {"known": True, "known_at": _day(3)}},
        "cards": {
            "time": {"interval": 25, "reps": 4, "last": _day(1)},
            "dog": {"interval": 3, "reps": 1, "last": _day(1)},
        },
        "verb_scores": {"go:0": 92, "go:1": 85, "be:0": 40},
        "xp": {"by_day": {_day(0): 5}},
        "book_sentences": {
            "books": {
                "t1": {
                    "title": "Tale",
                    "sentences": [
                        {"id": "t1:0", "en": "In any case, it is time.", "w0": 0},
                        {"id": "t1:9", "en": "Never practised.", "w0": 9},
                    ],
                }
            },
            "cards": {"t1:0": {"reps": 2, "last": _day(2)}},
        },
    }
    stats = {
        "runs": [
            {"ts": NOW - 86400, "chars": 300, "cpm": 210, "acc": 96},
            {"ts": NOW - 5 * 86400, "chars": 300, "cpm": 120, "acc": 91, "mission": "en-01"},
        ],
        "missions": {"en-01": {"stars": 2}, "en-02": {"stars": 1}, "en-03": {"stars": 0}},
    }
    sr = {
        "sessions": [{"title": "Tale", "words": 900, "eff_wpm": 260, "ts": NOW - 2 * 86400}],
        "exercises": {"E-SHL": {"5x5-a": {"runs": [{"ts": NOW - 86400, "result": 40}]}}},
        "days": [_day(1)],
    }
    lib = {"texts": [{"id": "t1", "title": "Tale"}]}
    return eng, stats, sr, lib


def test_empty_pilot_gives_empty_graph():
    g = lab_data.collect_from_payload({}, {}, {}, {})
    assert g.nodes == []
    assert g.entity(NOW)["quiet_days"] == -1


def test_real_files_become_stars_and_edges():
    eng, stats, sr, lib = _fill_payload()
    g = lab_data.collect_from_payload(eng, stats, sr, lib)
    ids = {n["id"] for n in g.nodes}
    assert {"w:case", "w:time", "v:go", "vf:go:v2", "vf:go:v3", "b:t1"} <= ids
    assert "w:dog" not in ids
    assert "v:be" not in ids
    assert {"ty:cpm:100", "ty:cpm:200", "ty:acc:95", "ty:m:en-01", "ty:m:en-02"} <= ids
    assert "ty:cpm:250" not in ids
    assert "ty:m:en-03" not in ids
    assert {"sr:wpm:250", "sr:ex:E-SHL"} <= ids
    edges = {(g.nodes[a]["id"], g.nodes[b]["id"]) for a, b in g.edges}
    assert ("v:go", "vf:go:v2") in edges
    assert ("w:case", "b:t1") in edges or ("b:t1", "w:case") in edges
    assert g.counts()["read"] >= 2
    assert g.entity(NOW)["recent_days"] >= 1


def test_freshness_dims_but_never_disappears():
    f0 = lab_data.freshness(NOW, 0, NOW)
    f10 = lab_data.freshness(NOW - 10 * 86400, 0, NOW)
    f10_strong = lab_data.freshness(NOW - 10 * 86400, 8, NOW)
    f_old = lab_data.freshness(NOW - 3650 * 86400, 0, NOW)
    assert abs(f0 - 1.0) < 1e-9
    assert f10 < f0
    assert f10_strong > f10
    assert f_old >= lab_data.FLOOR - 1e-9


def test_entity_quiets_after_break():
    busy = {_day(i) for i in range(14)}
    pause = {_day(i) for i in range(10, 24)}
    a = lab_data.entity_state(busy, 100, NOW)
    b = lab_data.entity_state(pause, 100, NOW)
    assert a["quiet_days"] == 0
    assert b["quiet_days"] == 10
    assert a["vitality"] > b["vitality"]
    assert b["vitality"] >= 0.08


def test_visual_has_no_individual_words():
    eng, stats, sr, lib = _fill_payload()
    vis = lab_data.collapse_to_clusters(lab_data.collect_from_payload(eng, stats, sr, lib))
    kinds = {n["kind"] for n in vis.nodes}
    assert "word" not in kinds
    assert "form" not in kinds
    assert any(n["kind"] == "cluster" for n in vis.nodes) or any(n["kind"] == "book" for n in vis.nodes)
    assert vis.mode == "visual"


def test_fragment_and_neighborhood_batched():
    eng, stats, sr, lib = _fill_payload()
    full = lab_data.collect_from_payload(eng, stats, sr, lib)
    case = next(n for n in full.nodes if n["id"] == "w:case")
    frag = lab_data.fragment_of(full, case["group"])
    assert frag.mode == "fragment"
    assert any(n["id"] == "w:case" for n in frag.nodes)
    bund = lab_data.star_neighborhood(full, "b:t1", limit=1, offset=0, now=NOW)
    assert bund is not None
    assert bund["selected"]["id"] == "b:t1"
    assert bund["selected"]["detail_level"] == "full"
    assert len(bund["neighbors"]) <= 1
    assert all(n["detail_level"] == "compact" for n in bund["neighbors"])


def test_snapshot_chunks_progress_and_cancel():
    eng, stats, sr, lib = _fill_payload()
    g = lab_data.collect_from_payload(eng, stats, sr, lib)
    events = list(lab_data.iter_snapshot(chunk_size=2, now=NOW, graph=g))
    assert events[0]["phase"] == "collect"
    assert events[-1]["phase"] == "done"
    snap = events[-1]["snapshot"]
    assert snap["kind"] == "lab_entity_snapshot"
    assert all("fresh" in n for n in snap["nodes"])
    flag = {"n": 0}

    def cancel():
        flag["n"] += 1
        return flag["n"] > 1

    ev2 = list(lab_data.iter_snapshot(chunk_size=1, now=NOW, graph=g, cancel=cancel))
    assert any(e.get("phase") == "cancelled" for e in ev2)
    assert not any(e.get("phase") == "done" for e in ev2)


def test_zoom_toward_keeps_point_under_cursor():
    cx, cy, R = 400.0, 300.0, 180.0
    world = (0.28, -0.17, 0.12)
    pan = (0.08, -0.04)
    for yaw, pitch in ((0.0, 0.0), (0.85, 0.35), (-1.1, -0.55), (0.4, PITCH_MAX * 0.9)):
        zoom, vox, voy = 1.0, 0.0, 0.0
        sx0, sy0, _ = project_point(
            *world, yaw=yaw, pitch=pitch, zoom=zoom,
            pan_x=pan[0], pan_y=pan[1], cx=cx, cy=cy, R=R,
            view_ox=vox, view_oy=voy,
        )
        for factor in (ZOOM_STEP, ZOOM_STEP, 1.0 / ZOOM_STEP, ZOOM_STEP ** 2, 1.0 / ZOOM_STEP):
            zoom, vox, voy = zoom_toward(
                zoom, vox, voy, factor=factor,
                cursor_xy=(sx0, sy0), origin_xy=(cx, cy),
            )
            sx, sy, _ = project_point(
                *world, yaw=yaw, pitch=pitch, zoom=zoom,
                pan_x=pan[0], pan_y=pan[1], cx=cx, cy=cy, R=R,
                view_ox=vox, view_oy=voy,
            )
            assert abs(sx - sx0) < 1e-9
            assert abs(sy - sy0) < 1e-9
        assert zoom != 1.0
    assert clamp_pitch(10) == PITCH_MAX
    assert ZOOM_MIN >= 0.2
    assert WORK_ZOOM > 1.0
    assert DRAG_CLICK_PX >= 3


def test_layout_english_crescent_and_book_fans():
    g = demo_graph(400, now=NOW)
    pos, _ = layout(g)
    en = [pos[i] for i, n in enumerate(g.nodes) if n["skill"] == "en"]
    assert en
    cx = sum(p[0] for p in en) / len(en)
    assert cx < 0.05
    books = [i for i, n in enumerate(g.nodes) if n["kind"] == "book"]
    assert books
    bi = books[0]
    linked = [b if a == bi else a for a, b in g.edges if a == bi or b == bi]
    linked = [i for i in linked if g.nodes[i]["kind"] == "word"]
    if linked:
        bx, by, _bz = pos[bi]
        dists = [((pos[i][0] - bx) ** 2 + (pos[i][1] - by) ** 2) ** 0.5 for i in linked]
        assert all(d < 0.55 for d in dists)
    a = aggregate(demo_graph(3000, now=NOW), 1200)
    assert len(a.nodes) <= 1200
    assert MAX_STARS <= 2000


def test_visual_collapse_of_demo_is_light():
    g = demo_graph(1000, now=NOW)
    vis = lab_data.collapse_to_clusters(g)
    assert len(vis.nodes) < 200
    assert not any(n["kind"] == "word" for n in vis.nodes)


def _pilot() -> TestClient:
    c = TestClient(app)
    cs = f"Lab-{uuid.uuid4().hex[:8]}"
    r = c.post("/api/pilots/register", json={"callsign": cs, "pin": "4242"})
    assert r.status_code == 200
    c.cookies.set("st_token", r.cookies["st_token"])
    return c


def test_api_visual_demo_and_fragment_and_neighborhood():
    c = _pilot()
    vis = c.get("/api/lab/visual?demo=1").json()
    assert vis["level"] == "visual"
    assert vis["demo"] is True
    assert not any(n["kind"] == "word" for n in vis["nodes"])
    assert "positions" in vis
    assert len(vis["positions"]) == len(vis["nodes"])
    cluster = next(n for n in vis["nodes"] if n["kind"] == "cluster")
    frag = c.get(f"/api/lab/fragment?demo=1&group={cluster['group']}").json()
    assert frag["level"] == "work"
    assert frag["nodes"]
    star = frag["nodes"][0]
    bund = c.get(f"/api/lab/neighborhood?demo=1&id={star['id']}&limit=5").json()
    assert bund["selected"]["id"] == star["id"]
    assert bund["selected"]["detail_level"] == "full"
    assert "has_more" in bund


def test_api_snapshot_chunked_and_cancel():
    c = _pilot()
    first = c.post("/api/lab/snapshot?demo=1&chunk_size=50").json()
    assert "token" in first
    assert first["phase"] in ("collect", "nodes", "done")
    token = first["token"]
    phases = [first["phase"]]
    for _ in range(40):
        nxt = c.get(f"/api/lab/snapshot/{token}").json()
        phases.append(nxt["phase"])
        if nxt["phase"] in ("done", "cancelled"):
            if nxt["phase"] == "done":
                assert nxt["snapshot"]["kind"] == "lab_entity_snapshot"
                assert "nodes" in nxt["snapshot"]
            break
    assert "done" in phases or "cancelled" in phases

    first2 = c.post("/api/lab/snapshot?demo=1&chunk_size=20").json()
    token2 = first2["token"]
    cancelled = c.delete(f"/api/lab/snapshot/{token2}").json()
    assert cancelled["phase"] == "cancelled"


def test_api_lab_isolation_guest_empty():
    c = TestClient(app)
    vis = c.get("/api/lab/visual").json()
    assert vis["nodes"] == [] or vis.get("demo") is False
    assert vis["entity"]["quiet_days"] == -1 or vis["nodes"] == []


def test_api_meta():
    c = TestClient(app)
    m = c.get("/api/lab/meta").json()
    assert m["neighbor_batch"] == 20
    assert m["zoom_step"] == ZOOM_STEP
