"""Портал (дзен-режим в духе Monkeytype): сводки и общая таблица прогресса.

Порт desktop stamina/portal_stats.py + stamina/monkeytype.py (summarize/activity/level).
Monkeytype — только чтение публичного профиля GET /users/<name>/profile, ключей нет.
"""
from __future__ import annotations

import datetime as dt
import json
import math
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable

API = "https://api.monkeytype.com"
TIMEOUT = 10
SYNC_MIN_INTERVAL = 300  # не чаще раза в 5 минут
SYNC_BACKOFF = 900       # после 429/479 — 15 минут
PB_SLOTS = (("time", (15, 30, 60, 120)), ("words", (10, 25, 50, 100)))


class MonkeytypeError(Exception):
    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


Fetch = Callable[[str, dict], "tuple[int, Any]"]


def default_fetch(url: str, headers: dict[str, str]) -> tuple[int, Any]:
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:  # noqa: S310 — фиксированный https-хост
            return r.status, json.loads(r.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode("utf-8") or "{}")
        except (ValueError, OSError):
            body = {}
        return e.code, body


def fetch_profile(username: str, fetch: Fetch | None = None) -> dict:
    username = (username or "").strip()
    if not username:
        raise MonkeytypeError("no_username")
    url = API + "/users/" + urllib.parse.quote(username, safe="") + "/profile"
    try:
        status, body = (fetch or default_fetch)(url, {"Accept": "application/json", "User-Agent": "StarTyping/web"})
    except (urllib.error.URLError, OSError, TimeoutError, ValueError) as e:
        raise MonkeytypeError("offline") from e
    if status != 200:
        code = "rate_limit" if status in (429, 479) else "not_found" if status == 404 else f"http_{status}"
        raise MonkeytypeError(code, status)
    return (body.get("data") if isinstance(body, dict) else None) or {}


def level(xp: Any) -> int:
    try:
        return int(1 + (math.sqrt(392 * max(0.0, float(xp)) + 22801) - 151) / 98)
    except (TypeError, ValueError):
        return 0


def level_progress(xp: float) -> tuple[int, int, int]:
    lv = level(xp)
    base = lambda n: 24.5 * (n - 1) ** 2 + 75.5 * (n - 1)  # noqa: E731
    return lv, int(xp - base(lv)), int(base(lv + 1) - base(lv))


def activity(ta: dict | None, days: int = 365) -> list[tuple[str, int]]:
    if not isinstance(ta, dict) or not ta.get("testsByDays") or not ta.get("lastDay"):
        return []
    last = dt.datetime.fromtimestamp(int(ta["lastDay"]) / 1000, dt.timezone.utc).date()
    arr = list(ta["testsByDays"])[-days:]
    n = len(arr)
    return [((last - dt.timedelta(days=n - 1 - i)).isoformat(), int(v or 0)) for i, v in enumerate(arr)]


def summarize_mt(profile: dict | None) -> dict:
    profile = profile or {}
    ts = profile.get("typingStats") or {}
    pbs_in = profile.get("personalBests") or {}
    pbs = []
    for mode, keys in PB_SLOTS:
        for k in keys:
            ent = [e for e in ((pbs_in.get(mode) or {}).get(str(k)) or []) if isinstance(e, dict) and "wpm" in e]
            b = max(ent, key=lambda e: e.get("wpm", 0)) if ent else None
            pbs.append({"mode": mode, "mode2": str(k),
                        "wpm": round(float(b["wpm"]), 1) if b else None,
                        "acc": round(float(b.get("acc", 0)), 1) if b else None,
                        "language": (b or {}).get("language", "")})
    xp = int(profile.get("xp") or 0)
    lv, have, need = level_progress(xp)
    return {"name": profile.get("name", ""), "joined": (profile.get("addedAt") or 0) / 1000 or None,
            "xp": xp, "level": lv, "level_have": have, "level_need": need,
            "tests": int(ts.get("completedTests") or 0), "started": int(ts.get("startedTests") or 0),
            "seconds": float(ts.get("timeTyping") or 0),
            "hours": round(float(ts.get("timeTyping") or 0) / 3600, 1),
            "streak": int(profile.get("streak") or 0), "max_streak": int(profile.get("maxStreak") or 0),
            "pbs": pbs, "activity": activity(profile.get("testActivity")), "recent": []}


def xp_for(r: dict) -> int:
    return max(1, round(float(r.get("time", 0)) * float(r.get("acc", 0)) / 100))


def streak(days: set, today: dt.date) -> int:
    d = today if today in days else today - dt.timedelta(days=1)
    n = 0
    while d in days:
        n += 1
        d -= dt.timedelta(days=1)
    return n


def _day(ts: float) -> dt.date:
    return dt.datetime.fromtimestamp(float(ts or 0), dt.timezone.utc).date()


def summarize_ours(results: list[dict], started: int = 0, name: str = "", joined: float | None = None,
                   today: dt.date | None = None) -> dict:
    today = today or dt.datetime.now(dt.timezone.utc).date()
    pbs = []
    for mode, keys in PB_SLOTS:
        for k in keys:
            best = max((r for r in results if r.get("mode") == mode and int(r.get("mode2") or 0) == k),
                       key=lambda r: r.get("wpm", 0), default=None)
            pbs.append({"mode": mode, "mode2": str(k), "wpm": None if best is None else round(best["wpm"], 1),
                        "acc": None if best is None else round(best.get("acc", 0), 1), "language": ""})
    by_day: dict[dt.date, int] = {}
    for r in results:
        d = _day(r.get("ts", 0))
        by_day[d] = by_day.get(d, 0) + 1
    first = today - dt.timedelta(days=364)
    act = [((first + dt.timedelta(days=i)).isoformat(), by_day.get(first + dt.timedelta(days=i), 0))
           for i in range(365)]
    xp = sum(xp_for(r) for r in results)
    lv, have, need = level_progress(xp)
    secs = sum(float(r.get("time", 0)) for r in results)
    last = results[-10:]
    return {"name": name, "joined": joined, "tests": len(results), "started": max(started, len(results)),
            "seconds": secs, "hours": round(secs / 3600, 4), "streak": streak(set(by_day), today),
            "max_streak": 0, "pbs": pbs, "activity": act, "xp": xp, "level": lv,
            "level_have": have, "level_need": need, "recent": [round(r.get("wpm", 0), 1) for r in last],
            "avg_acc": round(sum(r.get("acc", 0) for r in last) / len(last), 1) if last else None}


def merge(ours: dict, mt: dict | None, today: dt.date | None = None) -> dict:
    """Наши данные в приоритете: PB/день — наши, если есть, иначе Monkeytype; итоги — сумма."""
    today = today or dt.datetime.now(dt.timezone.utc).date()
    mt = mt or {}
    mt_pbs = {(p["mode"], str(p["mode2"])): p for p in mt.get("pbs") or []}
    pbs = []
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
        o, m = int(o_act.get(k, 0)), int(m_act.get(k, 0))
        act.append((k, o if o else m))
        if o or m:
            both[k] = [o, m]
    days = {dt.date.fromisoformat(k) for k, v in act if v}
    secs = float(ours.get("seconds") or 0) + float(mt.get("seconds") or 0)
    xp = int(ours.get("xp") or 0) + int(mt.get("xp") or 0)
    lv, have, need = level_progress(xp)
    return {"name": mt.get("name") or ours.get("name") or "", "joined": ours.get("joined") or mt.get("joined"),
            "tests": int(ours.get("tests") or 0) + int(mt.get("tests") or 0),
            "started": int(ours.get("started") or 0) + int(mt.get("started") or 0),
            "seconds": secs, "hours": round(secs / 3600, 4), "streak": streak(days, today),
            "max_streak": int(mt.get("max_streak") or 0), "pbs": pbs, "activity": act, "both": both,
            "xp": xp, "level": lv, "level_have": have, "level_need": need,
            "recent": ours.get("recent") or mt.get("recent") or []}
