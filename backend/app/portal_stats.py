"""Локальный прогресс дзен-портала. Сводка в том же виде, что monkeytype.summarize."""
from __future__ import annotations

import datetime as dt
import time

MAX_RESULTS = 5000


def xp_for(res: dict) -> int:
    return max(1, round(float(res.get("time", 0)) * float(res.get("acc", 0)) / 100))


def level_progress(xp: float) -> tuple[int, int, int]:
    from app.monkeytype import level
    lv = level(xp)
    def base(n: int) -> float:
        return 24.5 * (n - 1) ** 2 + 75.5 * (n - 1)
    have, need = xp - base(lv), base(lv + 1) - base(lv)
    return lv, int(have), int(need)


def _day(ts: float) -> dt.date:
    try:
        return dt.date.fromtimestamp(float(ts or 0))
    except (OSError, OverflowError, ValueError):
        return dt.date.today()


def streak(days: set, today: dt.date | None = None) -> int:
    today = today or dt.date.today()
    d = today if today in days else today - dt.timedelta(days=1)
    n = 0
    while d in days:
        n += 1
        d -= dt.timedelta(days=1)
    return n


def add_result(store: dict, res: dict) -> dict:
    store = dict(store or {})
    rows = list(store.get("results") or [])
    store["results"] = rows[-(MAX_RESULTS - 1):] + [res]
    store["started"] = max(int(store.get("started", 0) or 0), len(store["results"]))
    store.setdefault("joined", time.time())
    return store


def mark_started(store: dict) -> dict:
    store = dict(store or {})
    store["started"] = int(store.get("started", 0) or 0) + 1
    store.setdefault("joined", time.time())
    store.setdefault("results", [])
    return store


def summarize(d: dict | None = None, name: str = "", today: dt.date | None = None) -> dict:
    d = d if d is not None else {"results": [], "started": 0}
    res = [r for r in d.get("results") or [] if isinstance(r, dict)]
    today = today or dt.date.today()
    pbs = []
    for mode, keys in (("time", (15, 30, 60, 120)), ("words", (10, 25, 50, 100))):
        for k in keys:
            best = max((r for r in res if r.get("mode") == mode and int(r.get("mode2") or 0) == k),
                       key=lambda r: r.get("wpm", 0), default=None)
            pbs.append({"mode": mode, "mode2": str(k), "wpm": None if best is None else round(best["wpm"], 1),
                        "acc": None if best is None else round(best.get("acc", 0), 1), "language": ""})
    by_day: dict[dt.date, int] = {}
    for r in res:
        by_day[_day(r.get("ts", 0))] = by_day.get(_day(r.get("ts", 0)), 0) + 1
    first = today - dt.timedelta(days=364)
    act = [((first + dt.timedelta(days=i)).isoformat(), by_day.get(first + dt.timedelta(days=i), 0))
           for i in range(365)]
    xp = sum(xp_for(r) for r in res)
    lv, have, need = level_progress(xp)
    secs = sum(float(r.get("time", 0)) for r in res)
    return {"name": name, "joined": d.get("joined"), "tests": len(res), "started": int(d.get("started", 0) or 0),
            "hours": round(secs / 3600, 4), "seconds": secs, "streak": streak(set(by_day), today),
            "max_streak": 0, "pbs": pbs, "lbs": [], "activity": act, "xp": xp, "level": lv,
            "level_have": have, "level_need": need,
            "recent": [round(r.get("wpm", 0), 1) for r in res[-10:]],
            "avg_acc": round(sum(r.get("acc", 0) for r in res[-10:]) / len(res[-10:]), 1) if res else None}


def average_pace(d: dict | None = None, n: int = 10) -> int | None:
    res = (d if d is not None else {}).get("results") or []
    last = [r.get("wpm", 0) for r in res[-n:] if r.get("wpm")]
    return round(sum(last) / len(last)) if last else None


def merge(ours: dict | None, mt: dict | None, today: dt.date | None = None) -> dict:
    ours = ours or summarize({"results": [], "started": 0}, today=today)
    mt = mt or {}
    today = today or dt.date.today()
    pbs = []
    mt_pbs = {(p["mode"], str(p["mode2"])): p for p in mt.get("pbs") or []}
    for p in ours.get("pbs") or []:
        key = (p["mode"], str(p["mode2"]))
        if p.get("wpm") is not None:
            pbs.append(dict(p, src="ST"))
        elif mt_pbs.get(key, {}).get("wpm") is not None:
            pbs.append(dict(mt_pbs[key], src="MT"))
        else:
            pbs.append(dict(p, src=""))
    o_act = dict(ours.get("activity") or [])
    m_act = dict(mt.get("activity") or [])
    first = today - dt.timedelta(days=364)
    act, both = [], {}
    for i in range(365):
        k = (first + dt.timedelta(days=i)).isoformat()
        o, m = int(o_act.get(k, 0) or 0), int(m_act.get(k, 0) or 0)
        act.append((k, o if o else m))
        if o or m:
            both[k] = (o, m)
    days = {dt.date.fromisoformat(k) for k, v in act if v}
    mt_secs = float(mt.get("seconds") or 0) or float(mt.get("hours") or 0) * 3600
    xp = int(ours.get("xp") or 0) + int(mt.get("xp") or 0)
    lv, have, need = level_progress(xp)
    return {"name": mt.get("name") or ours.get("name") or "", "joined": ours.get("joined") or mt.get("joined"),
            "tests": int(ours.get("tests") or 0) + int(mt.get("tests") or 0),
            "started": int(ours.get("started") or 0) + int(mt.get("started") or 0),
            "seconds": float(ours.get("seconds") or 0) + mt_secs,
            "hours": round((float(ours.get("seconds") or 0) + mt_secs) / 3600, 4),
            "streak": streak(days, today), "max_streak": int(mt.get("max_streak") or 0),
            "pbs": pbs, "lbs": mt.get("lbs") or [], "activity": act,
            "both": both, "xp": xp, "level": lv, "level_have": have, "level_need": need,
            "recent": ours.get("recent") or mt.get("recent") or []}
