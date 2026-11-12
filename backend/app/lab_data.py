"""Лаборатория: граф знаний пилота (только чтение). Порт stamina/lab_data.py.

Источники web: card_progress / typing_sessions / drill_progress / speed_results /
pilot_texts + texts + CEFR/verbs из english_packs. book_sentences на web нет —
рёбра слово↔книга появятся, когда индекс появится; демо и тесты покрывают связи.
"""
from __future__ import annotations

import datetime as dt
import json
import math
import re
import time
from typing import Any, Callable, Iterator

DAY = 86400.0
FLOOR = 0.28
SKILLS = ("en", "read", "type")
KNOWN_INTERVAL = 21
VERB_OK = 80
CPM_STEPS = (100, 150, 200, 250, 300, 350, 400, 500)
ACC_STEPS = (90, 95, 97, 98, 99)
WPM_STEPS = (150, 200, 250, 300, 400, 500, 600, 800)
BOOK_WORD_EDGES = 40
SNAPSHOT_VERSION = 1
SNAPSHOT_CHUNK = 200
NEIGHBOR_BATCH = 20

_cefr_cache: dict[str, tuple[str, str, str]] | None = None
_verbs_cache: dict[str, dict] | None = None
_WORD_RE = re.compile(r"[a-z]+(?:'[a-z]+)?")


def cefr_index() -> dict[str, tuple[str, str, str]]:
    """slug → (уровень, тема ru, тема en)."""
    global _cefr_cache
    if _cefr_cache is None:
        idx: dict[str, tuple[str, str, str]] = {}
        try:
            from app import english_packs as packs

            root = packs.data_dir() / "sets"
            for p in sorted(root.glob("cefr_*.json")):
                try:
                    d = json.loads(p.read_text(encoding="utf-8"))
                except (OSError, ValueError):
                    continue
                lvl = str(d.get("level") or "")
                for w in d.get("words") or []:
                    if isinstance(w, dict) and w.get("slug") and lvl:
                        idx.setdefault(
                            w["slug"],
                            (lvl, w.get("topic") or "", w.get("topic_en") or ""),
                        )
        except Exception:  # noqa: BLE001
            pass
        _cefr_cache = idx
    return _cefr_cache


def irregular_verbs() -> dict[str, dict]:
    global _verbs_cache
    if _verbs_cache is None:
        try:
            from app import english_packs as packs

            _verbs_cache = {
                v["lemma"]: v
                for v in packs.all_verbs()
                if isinstance(v, dict) and v.get("lemma")
            }
        except Exception:  # noqa: BLE001
            _verbs_cache = {}
    return _verbs_cache


def _day_ts(day: str | None) -> float | None:
    if not day or not isinstance(day, str):
        return None
    try:
        d = dt.date.fromisoformat(day[:10])
    except ValueError:
        return None
    return time.mktime(d.timetuple()) + 12 * 3600


def stability_days(strength: float) -> float:
    return 3.0 * (1.0 + max(0.0, strength)) ** 1.3


def freshness(last: float | None, strength: float, now: float) -> float:
    if last is None:
        return 0.55
    days = max(0.0, (now - last) / DAY)
    return FLOOR + (1 - FLOOR) * math.exp(-days / stability_days(strength))


def entity_state(active_days: set[str], total_stars: int, now: float) -> dict:
    today = dt.date.fromtimestamp(now)
    recent = sum(1 for i in range(14) if (today - dt.timedelta(days=i)).isoformat() in active_days)
    quiet = 0
    while quiet < 365 and (today - dt.timedelta(days=quiet)).isoformat() not in active_days:
        quiet += 1
    if not active_days:
        quiet = -1
    vitality = recent / 14.0
    if quiet > 2:
        vitality *= 0.5 ** ((quiet - 2) / 4)
    return {
        "vitality": round(max(0.08, min(1.0, vitality)), 3),
        "quiet_days": quiet,
        "recent_days": recent,
        "growth": round(math.log1p(total_stars), 3),
    }


class Graph:
    def __init__(self) -> None:
        self.nodes: list[dict] = []
        self.edges: list[tuple[int, int]] = []
        self.active_days: set[str] = set()
        self.gaps: list[str] = []
        self.demo = False
        self.mode = "full"
        self.focus: str | None = None
        self._ix: dict[str, int] = {}

    def add(
        self,
        nid: str,
        kind: str,
        skill: str,
        label: str,
        group: str,
        *,
        last: float | None = None,
        strength: float = 0.0,
        detail: str = "",
    ) -> int:
        if nid in self._ix:
            return self._ix[nid]
        self._ix[nid] = len(self.nodes)
        self.nodes.append(
            {
                "id": nid,
                "kind": kind,
                "skill": skill,
                "label": label,
                "group": group,
                "last": last,
                "strength": float(strength),
                "detail": detail,
            }
        )
        return self._ix[nid]

    def link(self, a: str, b: str) -> None:
        ia, ib = self._ix.get(a), self._ix.get(b)
        if ia is not None and ib is not None and ia != ib:
            self.edges.append((ia, ib))

    def index(self, nid: str) -> int | None:
        return self._ix.get(nid)

    def counts(self) -> dict[str, int]:
        out = {s: 0 for s in SKILLS}
        for n in self.nodes:
            out[n["skill"]] = out.get(n["skill"], 0) + 1
        return out

    def entity(self, now: float | None = None) -> dict:
        return entity_state(self.active_days, len(self.nodes), time.time() if now is None else now)

    def to_payload(self, now: float | None = None) -> dict:
        now = time.time() if now is None else now
        nodes = []
        for n in self.nodes:
            row = dict(n)
            row["fresh"] = round(freshness(n["last"], n["strength"], now), 4)
            if "count" in n:
                row["count"] = n["count"]
            nodes.append(row)
        return {
            "mode": self.mode,
            "focus": self.focus,
            "demo": bool(self.demo),
            "gaps": list(self.gaps),
            "entity": self.entity(now),
            "counts": self.counts(),
            "nodes": nodes,
            "edges": [[self.nodes[a]["id"], self.nodes[b]["id"]] for a, b in self.edges],
        }


def _qlast(rec: dict | None) -> float | None:
    days = [
        v[1]
        for v in ((rec or {}).get("slots") or {}).values()
        if isinstance(v, (list, tuple)) and len(v) > 1
    ]
    return _day_ts(max(days)) if days else None


def _qcomplete(rec: dict | None) -> bool:
    if not isinstance(rec, dict):
        return False
    goal = rec.get("goal") or 20
    return len(rec.get("slots") or {}) >= max(1, int(goal))


def _english(g: Graph, eng: dict, _lib: dict) -> None:
    words = eng.get("words") or {}
    cards = eng.get("cards") or {}
    quality = eng.get("quality") or {}
    learned: dict[str, tuple[float | None, float]] = {}
    for slug in set(words) | set(cards) | {k for k in quality if ":" not in k}:
        w = words.get(slug) if isinstance(words.get(slug), dict) else {}
        c = cards.get(slug) if isinstance(cards.get(slug), dict) else {}
        q = quality.get(slug)
        if not (w.get("known") or int(c.get("interval", 0) or 0) >= KNOWN_INTERVAL or _qcomplete(q)):
            continue
        lasts = [x for x in (_day_ts(c.get("last")), _qlast(q), _day_ts(w.get("known_at"))) if x]
        strength = int(c.get("reps", 0) or 0) + len((q or {}).get("slots") or {}) / 5
        if w.get("known") and not c:
            strength = max(strength, 3)
        learned[slug] = (max(lasts) if lasts else None, strength)
    idx = cefr_index()
    for slug, (last, strength) in sorted(learned.items()):
        lvl, topic, topic_en = idx.get(slug, ("", "", ""))
        group = f"cefr:{lvl}:{topic_en or topic}" if lvl else "en:other"
        detail = f"{lvl} · {topic_en or topic}" if lvl else ""
        g.add("w:" + slug, "word", "en", slug, group, last=last, strength=strength, detail=detail)

    verbs = irregular_verbs()
    passed: dict[str, int] = {}
    for key, score in (eng.get("verb_scores") or {}).items():
        slug = str(key).split(":")[0]
        if isinstance(score, (int, float)) and score >= VERB_OK:
            passed[slug] = passed.get(slug, 0) + 1
    for k, rec in quality.items():
        if k.startswith("verb:") and _qcomplete(rec):
            passed.setdefault(k[5:], 1)
    for slug in sorted(passed):
        v = verbs.get(slug)
        if v is None:
            continue
        last = _qlast(quality.get("verb:" + slug))
        n = passed[slug]
        g.add(
            "v:" + slug,
            "verb",
            "en",
            slug,
            "verbs",
            last=last,
            strength=n,
            detail=f"{v.get('v2', '')} · {v.get('v3', '')}",
        )
        for form in ("v2", "v3"):
            f = str(v.get(form) or "")
            if f and f != slug:
                g.add(
                    f"vf:{slug}:{form}",
                    "form",
                    "en",
                    f,
                    "verbs",
                    last=last,
                    strength=n,
                    detail=slug,
                )
                g.link("v:" + slug, f"vf:{slug}:{form}")

    bs = eng.get("book_sentences") or {}
    bcards = bs.get("cards") or {}
    for tid, book in (bs.get("books") or {}).items():
        if not isinstance(book, dict):
            continue
        practised = [
            s
            for s in book.get("sentences") or []
            if isinstance(s, dict) and int((bcards.get(s.get("id")) or {}).get("reps", 0) or 0) > 0
        ]
        if not practised:
            continue
        lasts = [_day_ts((bcards.get(s.get("id")) or {}).get("last")) for s in practised]
        lasts = [x for x in lasts if x]
        bid = "b:" + str(tid)
        g.add(
            bid,
            "book",
            "read",
            book.get("title") or str(tid),
            "book:" + str(tid),
            last=max(lasts) if lasts else None,
            strength=len(practised) / 5,
            detail=book.get("author") or "",
        )
        seen = 0
        for s in practised:
            for tok in _WORD_RE.findall(str(s.get("en", "")).lower()):
                if tok in learned and seen < BOOK_WORD_EDGES:
                    g.link("w:" + tok, bid)
                    seen += 1


def _reading(g: Graph, sr: dict, lib: dict) -> None:
    sess = [s for s in sr.get("sessions") or [] if isinstance(s, dict)]
    titles = {str(t.get("title") or ""): t for t in lib.get("texts") or [] if isinstance(t, dict)}
    by_title: dict[str, list[dict]] = {}
    for s in sess:
        by_title.setdefault(str(s.get("title") or ""), []).append(s)
    for title, rows in by_title.items():
        meta = titles.get(title)
        if meta is None:
            continue
        bid = "b:" + str(meta.get("id"))
        words = sum(int(r.get("words", 0) or 0) for r in rows)
        idx = g.add(
            bid,
            "book",
            "read",
            title,
            "book:" + str(meta.get("id")),
            last=max(float(r.get("ts", 0) or 0) for r in rows) or None,
            strength=words / 2000,
            detail=meta.get("author") or "",
        )
        n = g.nodes[idx]
        n["last"] = max(n["last"] or 0, max(float(r.get("ts", 0) or 0) for r in rows)) or None
    # книги с полки без сессий
    for t in lib.get("texts") or []:
        if not isinstance(t, dict) or not t.get("id"):
            continue
        bid = "b:" + str(t["id"])
        if g.index(bid) is not None:
            continue
        g.add(
            bid,
            "book",
            "read",
            str(t.get("title") or t["id"]),
            "book:" + str(t["id"]),
            last=_day_ts(t.get("last")) or None,
            strength=1.0,
            detail=t.get("author") or "",
        )
    prev = None
    for thr in WPM_STEPS:
        hit = [s for s in sess if (s.get("eff_wpm") or 0) >= thr]
        if not hit:
            break
        nid = f"sr:wpm:{thr}"
        g.add(
            nid,
            "milestone",
            "read",
            f"{thr}",
            "sr:speed",
            last=max(float(s.get("ts", 0) or 0) for s in hit),
            strength=len(hit),
            detail="eff_wpm",
        )
        if prev:
            g.link(prev, nid)
        prev = nid
    for ex, variants in (sr.get("exercises") or {}).items():
        if not isinstance(variants, dict):
            continue
        runs = [
            r
            for rec in variants.values()
            if isinstance(rec, dict)
            for r in rec.get("runs") or []
            if isinstance(r, dict)
        ]
        if runs:
            g.add(
                f"sr:ex:{ex}",
                "exercise",
                "read",
                str(ex),
                "sr:exercises",
                last=max(float(r.get("ts", 0) or 0) for r in runs) or None,
                strength=len(runs) / 3,
            )
    for day in sr.get("days") or []:
        g.active_days.add(str(day))


def _typing(g: Graph, stats: dict) -> None:
    runs = [r for r in stats.get("runs") or [] if isinstance(r, dict) and (r.get("chars", 0) or 0) >= 30]
    for r in runs:
        if r.get("ts"):
            g.active_days.add(time.strftime("%Y-%m-%d", time.localtime(float(r["ts"]))))
    for kind, steps, key in (("cpm", CPM_STEPS, "cpm"), ("acc", ACC_STEPS, "acc")):
        prev = None
        for thr in steps:
            hit = [r for r in runs if (r.get(key) or 0) >= thr]
            if not hit:
                break
            nid = f"ty:{kind}:{thr}"
            g.add(
                nid,
                "milestone",
                "type",
                f"{thr}{' %' if kind == 'acc' else ''}",
                f"type:{kind}",
                last=max(float(r.get("ts", 0) or 0) for r in hit) or None,
                strength=len(hit) / 2,
                detail=kind,
            )
            if prev:
                g.link(prev, nid)
            prev = nid
    missions = stats.get("missions") or {}
    last_by_m: dict[str, float] = {}
    for r in runs:
        if r.get("mission"):
            last_by_m[r["mission"]] = max(last_by_m.get(r["mission"], 0.0), float(r.get("ts", 0) or 0))
    chains: dict[str, list[tuple[int, str]]] = {}
    for mid, rec in missions.items():
        if not isinstance(rec, dict) or int(rec.get("stars", 0) or 0) <= 0:
            continue
        lang, _, num = str(mid).rpartition("-")
        nid = "ty:m:" + mid
        g.add(
            nid,
            "mission",
            "type",
            mid,
            f"type:missions:{lang}",
            last=last_by_m.get(mid) or None,
            strength=int(rec.get("stars", 0)) * 2,
            detail=f"{rec.get('best_cpm', 0)} · {rec.get('best_acc', 0)} %",
        )
        chains.setdefault(lang, []).append((int(num) if num.isdigit() else 0, nid))
    for items in chains.values():
        items.sort()
        for (_, a), (_, b) in zip(items, items[1:]):
            g.link(a, b)


def collect_from_payload(
    eng: dict | None = None,
    stats: dict | None = None,
    sr: dict | None = None,
    lib: dict | None = None,
    *,
    mode: str = "full",
) -> Graph:
    """Собрать граф из dict-снимков (тесты / импорт / адаптер БД)."""
    g = Graph()
    try:
        _typing(g, stats or {})
        _english(g, eng or {}, lib or {})
        _reading(g, sr or {}, lib or {})
    except Exception:  # noqa: BLE001
        g.gaps.append("parse")
    by_day = ((eng or {}).get("xp") or {}).get("by_day") or {}
    if isinstance(by_day, dict):
        for day, n in by_day.items():
            if n:
                g.active_days.add(str(day))
    g.mode = mode
    return g


def collect(eng=None, stats=None, sr=None, lib=None, now: float | None = None) -> Graph:
    return collect_from_payload(eng, stats, sr, lib, mode="full")


def collect_visual(eng=None, stats=None, sr=None, lib=None, now: float | None = None) -> Graph:
    return collapse_to_clusters(collect_from_payload(eng, stats, sr, lib, mode="full"))


def collect_fragment(eng, stats, sr, lib, group: str, now: float | None = None) -> Graph:
    return fragment_of(collect_from_payload(eng, stats, sr, lib, mode="full"), group)


def collapse_to_clusters(graph: Graph) -> Graph:
    if not graph.nodes:
        out = Graph()
        out.demo, out.active_days, out.gaps = graph.demo, set(graph.active_days), list(graph.gaps)
        out.mode = "visual"
        return out
    groups: dict[str, list[int]] = {}
    for i, n in enumerate(graph.nodes):
        groups.setdefault(n["group"], []).append(i)
    out = Graph()
    out.demo, out.active_days, out.gaps = graph.demo, set(graph.active_days), list(graph.gaps)
    out.mode = "visual"
    remap: dict[int, int] = {}
    for gkey, ids in groups.items():
        ns = [graph.nodes[i] for i in ids]
        if len(ns) == 1 and ns[0]["kind"] in ("book", "milestone", "exercise", "mission", "cluster"):
            n = ns[0]
            remap[ids[0]] = out.add(
                n["id"], n["kind"], n["skill"], n["label"], n["group"],
                last=n["last"], strength=n["strength"], detail=n["detail"],
            )
            if "count" in n:
                out.nodes[remap[ids[0]]]["count"] = n["count"]
            continue
        lasts = [n["last"] for n in ns if n["last"]]
        skill = ns[0]["skill"]
        label = _cluster_label(gkey, len(ns))
        j = out.add(
            "agg:" + gkey,
            "cluster",
            skill,
            label,
            gkey,
            last=max(lasts) if lasts else None,
            strength=sum(n["strength"] for n in ns) / max(1, len(ns)),
            detail=gkey,
        )
        out.nodes[j]["count"] = len(ns)
        for i in ids:
            remap[i] = j
    seen: set[tuple[int, int]] = set()
    for a, b in graph.edges:
        ia, ib = remap.get(a), remap.get(b)
        if ia is None or ib is None or ia == ib:
            continue
        e = (ia, ib) if ia < ib else (ib, ia)
        if e not in seen:
            seen.add(e)
            out.edges.append((ia, ib))
    return out


def _cluster_label(group: str, count: int) -> str:
    if group.startswith("cefr:"):
        parts = group.split(":", 2)
        topic = parts[2] if len(parts) > 2 else ""
        lvl = parts[1] if len(parts) > 1 else ""
        return f"{lvl} · {topic}" if topic else (lvl or str(count))
    if group == "verbs":
        return "verbs"
    if group.startswith("book:"):
        return str(count)
    if ":" in group:
        return group.rsplit(":", 1)[-1]
    return str(count)


def fragment_of(graph: Graph, group: str) -> Graph:
    out = Graph()
    out.demo, out.active_days, out.gaps = graph.demo, set(graph.active_days), list(graph.gaps)
    out.mode = "fragment"
    out.focus = group
    keep: set[int] = {i for i, n in enumerate(graph.nodes) if n["group"] == group}
    for a, b in graph.edges:
        if a in keep or b in keep:
            keep.add(a)
            keep.add(b)
    remap: dict[int, int] = {}
    for i in sorted(keep):
        n = graph.nodes[i]
        remap[i] = out.add(
            n["id"], n["kind"], n["skill"], n["label"], n["group"],
            last=n["last"], strength=n["strength"], detail=n["detail"],
        )
    for a, b in graph.edges:
        if a in remap and b in remap:
            out.edges.append((remap[a], remap[b]))
    return out


def adjacency(graph: Graph) -> dict[int, list[int]]:
    adj: dict[int, list[int]] = {i: [] for i in range(len(graph.nodes))}
    seen: set[tuple[int, int]] = set()
    for a, b in graph.edges:
        e = (a, b) if a < b else (b, a)
        if a == b or e in seen:
            continue
        seen.add(e)
        adj[a].append(b)
        adj[b].append(a)
    for i in adj:
        adj[i].sort()
    return adj


def star_neighborhood(
    graph: Graph,
    node_id: str,
    *,
    limit: int = NEIGHBOR_BATCH,
    offset: int = 0,
    now: float | None = None,
) -> dict | None:
    now = time.time() if now is None else now
    ix = graph.index(node_id)
    if ix is None:
        return None
    adj = adjacency(graph)
    nids = adj.get(ix) or []
    total = len(nids)
    chunk = nids[offset : offset + max(0, limit)]
    sel = dict(graph.nodes[ix])
    sel["fresh"] = round(freshness(sel["last"], sel["strength"], now), 4)
    sel["detail_level"] = "full"
    neighbors = []
    for j in chunk:
        row = dict(graph.nodes[j])
        row["fresh"] = round(freshness(row["last"], row["strength"], now), 4)
        row["detail_level"] = "compact"
        neighbors.append(row)
    edge_ids = [(node_id, graph.nodes[j]["id"]) for j in chunk]
    return {
        "selected": sel,
        "neighbors": neighbors,
        "edges": edge_ids,
        "neighbor_total": total,
        "neighbor_offset": offset,
        "neighbor_limit": limit,
        "has_more": offset + len(chunk) < total,
    }


def iter_snapshot(
    eng=None,
    stats=None,
    sr=None,
    lib=None,
    *,
    chunk_size: int = SNAPSHOT_CHUNK,
    now: float | None = None,
    cancel: Callable[[], bool] | None = None,
    graph: Graph | None = None,
) -> Iterator[dict]:
    now = time.time() if now is None else now
    yield {"phase": "collect", "done": 0, "total": 0}
    if cancel and cancel():
        yield {"phase": "cancelled", "done": 0, "total": 0}
        return
    g = graph if graph is not None else collect_from_payload(eng, stats, sr, lib, mode="full")
    total = len(g.nodes)
    nodes_out: list[dict] = []
    for i in range(0, max(total, 1), max(1, chunk_size)):
        if cancel and cancel():
            yield {"phase": "cancelled", "done": len(nodes_out), "total": total}
            return
        if total == 0:
            break
        for n in g.nodes[i : i + chunk_size]:
            row = dict(n)
            row["fresh"] = round(freshness(n["last"], n["strength"], now), 4)
            if n["last"]:
                row["last_iso"] = time.strftime("%Y-%m-%d", time.localtime(n["last"]))
            nodes_out.append(row)
        yield {"phase": "nodes", "done": min(i + chunk_size, total), "total": total}
    if cancel and cancel():
        yield {"phase": "cancelled", "done": len(nodes_out), "total": total}
        return
    edges = [[g.nodes[a]["id"], g.nodes[b]["id"]] for a, b in g.edges]
    yield {
        "phase": "done",
        "done": total,
        "total": total,
        "snapshot": {
            "version": SNAPSHOT_VERSION,
            "kind": "lab_entity_snapshot",
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(now)),
            "entity": g.entity(now),
            "counts": g.counts(),
            "nodes": nodes_out,
            "edges": edges,
            "gaps": list(g.gaps),
            "demo": bool(g.demo),
        },
    }


def pilot_payload_from_db(db: Any, pilot_id: int) -> tuple[dict, dict, dict, dict]:
    """Собрать eng/stats/sr/lib dicts из web-БД для collect_from_payload."""
    from datetime import date as date_cls

    from app.api_english import CardProgress, VocabWord
    from app.api_library import PilotText
    from app.api_missions import DrillProgress
    from app.api_speedread import SpeedResult
    from app.models import TextDoc
    from app.sessions import TypingSession

    eng: dict[str, Any] = {"words": {}, "cards": {}, "quality": {}, "verb_scores": {}, "xp": {"by_day": {}}}
    stats: dict[str, Any] = {"runs": [], "missions": {}}
    sr: dict[str, Any] = {"sessions": [], "exercises": {}, "days": []}
    lib: dict[str, Any] = {"texts": []}

    cards = db.query(CardProgress).filter(CardProgress.pilot_id == pilot_id).all()
    word_ids = [c.word_id for c in cards]
    words = {}
    if word_ids:
        for w in db.query(VocabWord).filter(VocabWord.id.in_(word_ids)).all():
            words[w.id] = w
    by_day: dict[str, int] = {}
    for c in cards:
        w = words.get(c.word_id)
        slug = (w.slug if w else "") or str(c.word_id)
        if c.known:
            eng["words"][slug] = {
                "known": True,
                "known_at": date_cls.today().isoformat(),
            }
        last = None
        if getattr(c, "due", None) is not None and c.reps:
            # last practice approximate: due - interval
            try:
                last = (c.due - dt.timedelta(days=max(0, int(c.interval or 0)))).isoformat()
            except Exception:  # noqa: BLE001
                last = None
        eng["cards"][slug] = {
            "interval": int(c.interval or 0),
            "reps": int(c.reps or 0),
            "last": last,
        }
        raw = (c.wh_q or "").strip()
        if raw:
            try:
                rec = json.loads(raw)
                if isinstance(rec, dict):
                    eng["quality"][slug] = rec
            except ValueError:
                pass
        if c.english_xp:
            day = date_cls.today().isoformat()
            by_day[day] = by_day.get(day, 0) + int(c.english_xp)
    eng["xp"]["by_day"] = by_day

    for s in db.query(TypingSession).filter(TypingSession.pilot_id == pilot_id).all():
        ts = s.created_at.timestamp() if s.created_at else time.time()
        stats["runs"].append(
            {
                "ts": ts,
                "chars": int(s.chars or 0),
                "cpm": float(s.cpm or 0),
                "acc": float(s.acc or 0),
                "mission": "",
            }
        )
    for d in db.query(DrillProgress).filter(DrillProgress.pilot_id == pilot_id).all():
        if int(d.best_stars or 0) <= 0:
            continue
        stats["missions"][d.mission_id] = {
            "stars": int(d.best_stars or 0),
            "best_cpm": 0,
            "best_acc": 0,
        }

    for r in db.query(SpeedResult).filter(SpeedResult.pilot_id == pilot_id).all():
        ts = r.created_at.timestamp() if r.created_at else time.time()
        day = time.strftime("%Y-%m-%d", time.localtime(ts))
        sr["days"].append(day)
        sr["sessions"].append(
            {
                "title": "",
                "words": int(r.words or 0),
                "eff_wpm": float(r.wpm or 0),
                "ts": ts,
            }
        )
        mode = str(r.mode or "rsvp")
        if mode and mode != "rsvp":
            sr["exercises"].setdefault(mode, {}).setdefault("default", {"runs": []})
            sr["exercises"][mode]["default"]["runs"].append({"ts": ts, "result": float(r.score or 0)})

    pts = db.query(PilotText).filter(PilotText.pilot_id == pilot_id).all()
    tids = [p.text_id for p in pts]
    docs = {}
    if tids:
        for doc in db.query(TextDoc).filter(TextDoc.id.in_(tids)).all():
            docs[doc.id] = doc
    for p in pts:
        doc = docs.get(p.text_id)
        if not doc:
            continue
        title = doc.title or str(doc.id)
        author = ""
        if " · " in title:
            title, author = title.split(" · ", 1)
        elif " — " in title:
            title, author = title.split(" — ", 1)
        lib["texts"].append({"id": str(doc.id), "title": title, "author": author})

    return eng, stats, sr, lib


def collect_for_pilot(db: Any, pilot_id: int, *, mode: str = "full") -> Graph:
    eng, stats, sr, lib = pilot_payload_from_db(db, pilot_id)
    return collect_from_payload(eng, stats, sr, lib, mode=mode)
