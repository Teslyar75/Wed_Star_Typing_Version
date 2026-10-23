import datetime as dt
import time

from fastapi.testclient import TestClient

from app import api_portal, portal
from app.main import app

client = TestClient(app)
TODAY = dt.date(2026, 10, 23)


def _profile(**kw):
    last = int(dt.datetime(2026, 10, 23, tzinfo=dt.timezone.utc).timestamp() * 1000)
    d = {"name": "Teslyar75", "xp": 1000,
         "typingStats": {"completedTests": 100, "startedTests": 120, "timeTyping": 7200},
         "personalBests": {"time": {"15": [{"wpm": 90.4, "acc": 97, "language": "english"}],
                                    "30": [{"wpm": 80, "acc": 96}]},
                           "words": {"10": [{"wpm": 100, "acc": 100}]}},
         "streak": 3, "maxStreak": 10, "testActivity": {"testsByDays": [5, 0, 7], "lastDay": last}}
    d.update(kw)
    return d


def test_summarize_and_merge_priority():
    mt = portal.summarize_mt(_profile())
    assert mt["tests"] == 100 and mt["hours"] == 2.0
    assert dict(mt["activity"])["2026-10-23"] == 7
    ts = dt.datetime(2026, 10, 23, 12, tzinfo=dt.timezone.utc).timestamp()
    ours = portal.summarize_ours([{"ts": ts, "mode": "time", "mode2": 15, "wpm": 70, "acc": 95, "time": 15}],
                                 1, today=TODAY)
    m = portal.merge(ours, mt, today=TODAY)
    pbs = {(p["mode"], p["mode2"]): p for p in m["pbs"]}
    assert pbs[("time", "15")]["wpm"] == 70 and pbs[("time", "15")]["src"] == "ST"   # наш приоритетнее
    assert pbs[("time", "30")]["src"] == "MT"
    assert pbs[("words", "50")]["src"] == ""
    act = dict(m["activity"])
    assert act["2026-10-23"] == 1 and m["both"]["2026-10-23"] == [1, 7]
    assert act["2026-10-21"] == 5
    assert m["tests"] == 101
    assert m["streak"] == 1  # 22-го нет тестов


def test_kogasa_level():
    assert portal.level(0) == 1
    assert portal.level_progress(100)[0] == 2


def test_api_results_and_sync(monkeypatch):
    calls = []

    def fake(url, headers):
        calls.append(url)
        return 200, {"data": _profile()}

    monkeypatch.setattr(api_portal, "FETCH", fake)
    r = client.post("/api/pilots/register", json={"callsign": "ZenPilot", "pin": "1234"})
    client.cookies.set("st_token", r.cookies["st_token"])
    s = client.post("/api/portal/mt-sync").json()
    assert s["sync"]["status"] == "no_username"
    client.put("/api/portal/mt-user", json={"username": "Teslyar75"})
    s = client.post("/api/portal/mt-sync").json()
    assert s["sync"]["status"] == "ok" and s["mt"]["tests"] == 100
    assert calls and calls[0].endswith("/users/Teslyar75/profile")
    s = client.post("/api/portal/mt-sync").json()
    assert s["sync"]["status"] == "cached" and len(calls) == 1
    s = client.post("/api/portal/results", json={"mode": "words", "mode2": 10, "wpm": 120, "acc": 98,
                                                 "time": 5, "raw": 125, "consistency": 80}).json()
    p = {(x["mode"], x["mode2"]): x for x in s["merged"]["pbs"]}
    assert p[("words", "10")]["wpm"] == 120 and p[("words", "10")]["src"] == "ST"
    assert s["merged"]["tests"] == 101


def test_rate_limit_backoff(monkeypatch):
    monkeypatch.setattr(api_portal, "FETCH", lambda u, h: (429, {}))
    r = client.post("/api/pilots/register", json={"callsign": "ZenLimit", "pin": "1234"})
    client.cookies.set("st_token", r.cookies["st_token"])
    client.put("/api/portal/mt-user", json={"username": "x"})
    s = client.post("/api/portal/mt-sync").json()
    assert s["sync"]["error"] == "rate_limit"
    s = client.post("/api/portal/mt-sync").json()
    assert s["sync"]["status"] == "backoff"
    assert time.time() > 0
