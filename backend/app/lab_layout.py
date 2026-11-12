"""Раскладка и камера Лаборатории (порт чистых функций stamina/laboratory.py)."""
from __future__ import annotations

import math

from app import lab_data

MAX_STARS = 1600
MAX_EDGES = 900
ZOOM_MIN = 0.45
ZOOM_MAX = 4.0
ZOOM_STEP = 1.12
WORK_ZOOM = 1.55
PITCH_MAX = 1.15
DRAG_CLICK_PX = 5
GOLDEN = math.pi * (3 - math.sqrt(5))


def aggregate(graph: lab_data.Graph, limit: int = MAX_STARS) -> lab_data.Graph:
    if len(graph.nodes) <= limit:
        return graph
    groups: dict[str, list[int]] = {}
    for i, n in enumerate(graph.nodes):
        groups.setdefault(n["group"], []).append(i)
    order = sorted(groups, key=lambda k: len(groups[k]))
    fold: set[str] = set()
    total = len(graph.nodes)
    for k in order:
        if total <= limit:
            break
        fold.add(k)
        total -= len(groups[k]) - 1
    out = lab_data.Graph()
    out.demo, out.active_days, out.gaps = graph.demo, graph.active_days, graph.gaps
    out.mode = getattr(graph, "mode", "full")
    out.focus = getattr(graph, "focus", None)
    remap: dict[int, int] = {}
    for k, ids in groups.items():
        if k in fold:
            ns = [graph.nodes[i] for i in ids]
            lasts = [n["last"] for n in ns if n["last"]]
            j = out.add(
                "agg:" + k,
                "cluster",
                ns[0]["skill"],
                f"{len(ns)}",
                k,
                last=max(lasts) if lasts else None,
                strength=sum(n["strength"] for n in ns) / len(ns),
                detail=k,
            )
            out.nodes[j]["count"] = len(ns)
            for i in ids:
                remap[i] = j
        else:
            for i in ids:
                n = graph.nodes[i]
                remap[i] = out.add(
                    n["id"], n["kind"], n["skill"], n["label"], n["group"],
                    last=n["last"], strength=n["strength"], detail=n["detail"],
                )
    seen = set()
    for a, b in graph.edges:
        e = (remap[a], remap[b])
        if e[0] != e[1] and e not in seen:
            seen.add(e)
            out.edges.append(e)
    return out


def layout(graph: lab_data.Graph) -> tuple[list[tuple[float, float, float]], list[tuple[int, int]]]:
    n = len(graph.nodes)
    pos: list[tuple[float, float, float]] = [(0.0, 0.0, 0.0)] * n
    shape: list[tuple[int, int]] = []
    if not n:
        return pos, shape

    by_skill: dict[str, list[int]] = {s: [] for s in lab_data.SKILLS}
    for i, node in enumerate(graph.nodes):
        by_skill.setdefault(node["skill"], []).append(i)

    en_ids = by_skill.get("en") or []
    en_groups: dict[str, list[int]] = {}
    for i in en_ids:
        en_groups.setdefault(graph.nodes[i]["group"], []).append(i)
    en_keys = sorted(en_groups, key=lambda k: (-len(en_groups[k]), k))
    n_en = max(1, len(en_keys))
    for gi, gkey in enumerate(en_keys):
        ids = en_groups[gkey]
        t = (gi + 0.5) / n_en
        ang = math.pi * (0.55 + 1.05 * t)
        r_arm = 0.42 + 0.28 * abs(math.sin(t * math.pi))
        cx, cy = r_arm * math.cos(ang), r_arm * math.sin(ang) * 0.92
        _place_cluster(
            pos, shape, ids, cx, cy, z0=-0.12 + 0.08 * (gi % 3),
            spread=0.018 + 0.16 * math.sqrt(len(ids) / max(1, n)),
        )

    read_ids = by_skill.get("read") or []
    books = [i for i in read_ids if graph.nodes[i]["kind"] == "book"]
    other_read = [i for i in read_ids if graph.nodes[i]["kind"] != "book"]
    word_of_book: dict[int, list[int]] = {b: [] for b in books}
    linked_words: set[int] = set()
    id_to_book = {i: i for i in books}
    for a, b in graph.edges:
        for src, dst in ((a, b), (b, a)):
            if src in id_to_book and graph.nodes[dst]["kind"] in ("word", "cluster", "form"):
                word_of_book[src].append(dst)
                linked_words.add(dst)
    free_read = [i for i in other_read if i not in linked_words]
    n_books = max(1, len(books))
    for bi, bidx in enumerate(books):
        t = (bi + 0.5) / n_books
        ang = -0.55 + 1.1 * t
        r = 0.38 + 0.12 * (bi % 3) / 2
        bx, by = r * math.cos(ang), r * math.sin(ang) * 0.85
        bz = 0.05 * math.sin(bi * 1.7)
        pos[bidx] = (bx, by, bz)
        fans = word_of_book.get(bidx) or []
        for j, wi in enumerate(fans):
            ft = (j + 0.5) / max(1, len(fans))
            fang = ang + (ft - 0.5) * 1.0
            fr = 0.10 + 0.22 * math.sqrt((j + 0.5) / max(1, len(fans)))
            pos[wi] = (
                bx + fr * math.cos(fang),
                by + fr * math.sin(fang),
                bz + 0.04 * math.sin(j * GOLDEN),
            )
            shape.append((bidx, wi))
    free_groups: dict[str, list[int]] = {}
    for i in free_read:
        free_groups.setdefault(graph.nodes[i]["group"], []).append(i)
    for gi, gkey in enumerate(sorted(free_groups)):
        ids = free_groups[gkey]
        t = (gi + 0.5) / max(1, len(free_groups))
        ang = -0.2 + 0.9 * t
        r = 0.62 + 0.08 * (gi % 2)
        _place_cluster(
            pos, shape, ids, r * math.cos(ang), r * math.sin(ang) * 0.8,
            z0=0.08, spread=0.02 + 0.1 * math.sqrt(len(ids) / max(1, n)),
        )

    type_ids = by_skill.get("type") or []
    type_groups: dict[str, list[int]] = {}
    for i in type_ids:
        type_groups.setdefault(graph.nodes[i]["group"], []).append(i)
    type_keys = sorted(type_groups, key=lambda k: (-len(type_groups[k]), k))
    for gi, gkey in enumerate(type_keys):
        ids = type_groups[gkey]
        t = (gi + 0.5) / max(1, len(type_keys))
        ang = -0.9 - 0.85 * t
        r = 0.30 + 0.55 * math.sqrt(t)
        _place_cluster(
            pos, shape, ids, r * math.cos(ang), r * math.sin(ang) * 0.9,
            z0=0.1 - 0.05 * (gi % 2),
            spread=0.018 + 0.14 * math.sqrt(len(ids) / max(1, n)),
        )
    return pos, shape


def _place_cluster(pos, shape, ids, cx, cy, *, z0: float, spread: float) -> None:
    for j, ni in enumerate(ids):
        rr = spread * math.sqrt((j + 0.5) / max(1, len(ids)))
        aa = j * GOLDEN
        pos[ni] = (
            cx + rr * math.cos(aa),
            cy + rr * math.sin(aa),
            z0 + rr * 0.55 * math.sin(aa * 1.3),
        )
    for j in range(1, len(ids)):
        x, y, _z = pos[ids[j]]
        best = min(
            range(max(0, j - 6), j),
            key=lambda q: (pos[ids[q]][0] - x) ** 2 + (pos[ids[q]][1] - y) ** 2,
        )
        shape.append((ids[best], ids[j]))


def rotate_xyz(x: float, y: float, z: float, yaw: float, pitch: float) -> tuple[float, float, float]:
    cy, sy = math.cos(yaw), math.sin(yaw)
    x1 = x * cy + z * sy
    z1 = -x * sy + z * cy
    cp, sp = math.cos(pitch), math.sin(pitch)
    y2 = y * cp - z1 * sp
    z2 = y * sp + z1 * cp
    return x1, y2, z2


def project_point(
    x: float,
    y: float,
    z: float,
    *,
    yaw: float,
    pitch: float,
    zoom: float,
    pan_x: float,
    pan_y: float,
    cx: float,
    cy: float,
    R: float,
    view_ox: float = 0.0,
    view_oy: float = 0.0,
) -> tuple[float, float, float]:
    rx, ry, rz = rotate_xyz(x + pan_x, y + pan_y, z, yaw, pitch)
    depth = 1.0 / max(0.45, 1.0 + rz * 0.42)
    sx = cx + rx * zoom * R * depth + view_ox
    sy = cy + ry * zoom * R * 0.86 * depth + view_oy
    return sx, sy, depth


def clamp_pitch(p: float) -> float:
    return max(-PITCH_MAX, min(PITCH_MAX, p))


def zoom_toward(
    zoom: float,
    view_ox: float,
    view_oy: float,
    *,
    factor: float,
    cursor_xy: tuple[float, float],
    origin_xy: tuple[float, float],
) -> tuple[float, float, float]:
    """Зум к курсору: точка под курсором остаётся на том же пикселе."""
    old = zoom
    new = max(ZOOM_MIN, min(ZOOM_MAX, old * factor))
    if abs(new - old) < 1e-9 or abs(old) < 1e-12:
        return old, view_ox, view_oy
    mx, my = cursor_xy
    cx, cy = origin_xy
    qx = (mx - cx - view_ox) / old
    qy = (my - cy - view_oy) / old
    return new, mx - cx - qx * new, my - cy - qy * new


def attach_layout(graph: lab_data.Graph) -> dict:
    """Payload графа + 3D-позиции и контурные рёбра."""
    g = aggregate(graph) if getattr(graph, "mode", "") != "fragment" else graph
    pos, shape = layout(g)
    now = None
    payload = g.to_payload(now)
    payload["positions"] = [[round(x, 5), round(y, 5), round(z, 5)] for x, y, z in pos]
    # рёбра данных + контур
    edge_ids = list(payload["edges"])
    for a, b in shape:
        edge_ids.append([g.nodes[a]["id"], g.nodes[b]["id"]])
    # дедуп
    seen = set()
    uniq = []
    for a, b in edge_ids:
        e = (a, b) if a < b else (b, a)
        if e not in seen and a != b:
            seen.add(e)
            uniq.append([a, b])
    payload["edges"] = uniq[:MAX_EDGES]
    payload["nodes"] = payload["nodes"][:MAX_STARS]
    payload["positions"] = payload["positions"][:MAX_STARS]
    return payload
