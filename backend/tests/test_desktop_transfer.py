"""Перенос профиля по имени + PIN из DESKTOP_DATA_DIR и push пакета (Bearer)."""

import hashlib
import io
import json
import uuid
import zipfile

from fastapi.testclient import TestClient

from app.config import settings
from app.db import SessionLocal, init_db
from app.main import app

init_db()


def _pin_rec(code: str) -> dict:
    salt = bytes(range(16))
    h = hashlib.pbkdf2_hmac("sha256", code.encode(), salt, 1000)
    return {"algo": "pbkdf2_sha256", "iter": 1000, "salt": salt.hex(), "hash": h.hex(),
            "set": "2026-10-01"}


def _pilot_files(cs: str) -> dict[str, bytes]:
    prof = {"id": "p-20261009-abcd", "callsign": cs, "name": "Desk Two", "accent": "amber",
            "avatar": {"kind": "builtin", "glyph": "comet"}}
    english = {
        "version": 1,
        "words": {"the": {"known": True}, "zzqword": {"tr": "моё"}},
        "lists": [{"id": "favorites", "name": "Избранное", "slugs": ["the"]}],
        "cards": {"the": {"slug": "the", "ef": 2.6, "interval": 30, "reps": 5, "due": "2026-11-01"}},
        "xp": {"total": 40},
        "attempts": [{"ts": 1760000000, "slug": "the", "mode": "speaking", "score": 80, "ok": True}],
        "warehouse": {"away": [], "cleared": {"the": {"stars": 3, "avg": 91.5}}},
    }
    stats = {"version": 1, "xp": 350,
             "runs": [{"chars": 100, "typed": 100, "errors": 2, "elapsed": 30, "cpm": 200,
                       "acc": 98, "mode": "mission", "mission": "ru-01", "ts": 1760000000}],
             "keys": {"a": [50, 2]}, "missions": {"ru-01": {"stars": 2}}}
    return {
        "profile.json": json.dumps(prof, ensure_ascii=False).encode(),
        "english.json": json.dumps(english, ensure_ascii=False).encode(),
        "stats.json": json.dumps(stats).encode(),
        "speedread.json": json.dumps({"sessions": [
            {"words": 300, "secs": 60, "avg_wpm": 300, "comp": 80, "ts": 1760000000}]}).encode(),
        "lounge.json": json.dumps({"best": {"tetris": 47790}}).encode(),
    }


def _desktop_tree(tmp_path, callsign: str, pin: str = "2468"):
    root = tmp_path / "Stamina"
    pdir = root / "pilots" / "p-1"
    pdir.mkdir(parents=True)
    files = _pilot_files(callsign)
    prof = json.loads(files["profile.json"])
    prof["callsign"] = callsign
    prof["pin"] = _pin_rec(pin)
    files["profile.json"] = json.dumps(prof, ensure_ascii=False).encode()
    files["idle_cache/spaceship/huge.jpg"] = b"wallpaper-bytes"
    files["cache/tts/a.mp3"] = b"\x00"
    for rel, raw in files.items():
        p = pdir / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(raw)
    registry = {"version": 1, "pilots": [
        {"id": "p-1", "callsign": callsign, "name": "Desk Two", "accent": "amber",
         "avatar": {"kind": "builtin", "glyph": "comet"}}]}
    (root / "pilots.json").write_text(json.dumps(registry, ensure_ascii=False), encoding="utf-8")
    return root


def _zip(files: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for k, v in files.items():
            z.writestr(k, v)
    return buf.getvalue()


def _stpilot(files: dict[str, bytes]) -> bytes:
    man = {"format": "stpilot", "version": 1,
           "pilot": {"id": "p-x", "callsign": json.loads(files["profile.json"])["callsign"]},
           "files": {k: hashlib.sha256(v).hexdigest() for k, v in files.items()}}
    return _zip({"manifest.json": json.dumps(man).encode(),
                 **{"data/" + k: v for k, v in files.items()}})


def _register(c: TestClient, prefix: str = "Web", pin: str = "") -> tuple[str, int]:
    cs = f"{prefix}{uuid.uuid4().hex[:6]}"
    body = {"callsign": cs}
    if pin:
        body["pin"] = pin
    r = c.post("/api/pilots/register", json=body)
    assert r.status_code == 200, r.text
    return cs, int(r.json()["id"])


def _sessions(pid: int) -> int:
    from app.sessions import TypingSession

    db = SessionLocal()
    try:
        return db.query(TypingSession).filter_by(pilot_id=pid).count()
    finally:
        db.close()


def _known_the(pid: int) -> int:
    from app.api_english import CardProgress, VocabWord

    db = SessionLocal()
    try:
        w = db.query(VocabWord).filter((VocabWord.slug == "the") | (VocabWord.word == "the")).first()
        if w is None:
            return 0
        row = db.query(CardProgress).filter_by(pilot_id=pid, word_id=w.id).first()
        return int(row.known or 0) if row else 0
    finally:
        db.close()


def _set_xp(pid: int, xp: int) -> None:
    from app.pilots import Pilot

    db = SessionLocal()
    try:
        p = db.get(Pilot, pid)
        p.xp = xp
        db.commit()
    finally:
        db.close()


def test_from_desktop_by_name_and_pin_merges_and_dedupes(tmp_path, monkeypatch) -> None:
    cs = f"Desk{uuid.uuid4().hex[:5]}"
    root = _desktop_tree(tmp_path, cs, pin="2468")
    monkeypatch.setattr(settings, "desktop_data_dir", str(root))

    c = TestClient(app)
    _, pid = _register(c, "Web")
    _set_xp(pid, 500)

    bad = c.post("/api/import/from-desktop",
                 json={"callsign": cs, "pin": "2468", "confirm_identity": False})
    assert bad.status_code == 400 and bad.json()["detail"]["code"] == "callsign_mismatch"
    assert _sessions(pid) == 0 and _known_the(pid) == 0

    r = c.post("/api/import/from-desktop",
               json={"callsign": cs, "pin": "2468", "confirm_identity": True})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["pilot"]["id"] == pid and body["pilot"]["xp"] == 500
    assert body["report"]["runs"] == 1
    assert body["report"]["speed_sessions"] == 1
    assert body["report"]["lounge_best"] == 1
    assert _known_the(pid) == 1
    assert _sessions(pid) == 1

    again = c.post("/api/import/from-desktop",
                   json={"callsign": cs, "pin": "2468", "confirm_identity": True})
    assert again.status_code == 200, again.text
    assert again.json()["pilot"]["xp"] == 500
    assert _sessions(pid) == 1


def test_from_desktop_pin_failures_lock(tmp_path, monkeypatch) -> None:
    cs = f"Lock{uuid.uuid4().hex[:5]}"
    monkeypatch.setattr(settings, "desktop_data_dir", str(_desktop_tree(tmp_path, cs, pin="1357")))
    c = TestClient(app)
    _register(c, "Web")

    for _ in range(3):
        r = c.post("/api/import/from-desktop",
                   json={"callsign": cs, "pin": "0000", "confirm_identity": True})
        assert r.status_code == 401 and r.json()["detail"]["code"] == "bad_pin"
    locked = c.post("/api/import/from-desktop",
                    json={"callsign": cs, "pin": "1357", "confirm_identity": True})
    assert locked.status_code == 429 and locked.json()["detail"]["code"] == "pin_locked"


def test_from_desktop_unavailable_and_auth(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(settings, "desktop_data_dir", "")
    c = TestClient(app)
    _register(c, "Web")
    r = c.post("/api/import/from-desktop", json={"callsign": "Anyone", "pin": "", "confirm_identity": True})
    assert r.status_code == 503 and r.json()["detail"]["code"] == "desktop_data_unavailable"

    assert TestClient(app).post(
        "/api/import/from-desktop", json={"callsign": "Anyone", "pin": "", "confirm_identity": True}
    ).status_code == 401

    g = TestClient(app)
    assert g.post("/api/pilots/guest").status_code == 200
    rg = g.post("/api/import/from-desktop", json={"callsign": "Anyone", "pin": "", "confirm_identity": True})
    assert rg.status_code == 401


def test_login_token_works_as_bearer() -> None:
    c = TestClient(app)
    cs, _ = _register(c, "Tok", pin="4242")
    login = TestClient(app).post("/api/pilots/login", json={"callsign": cs, "pin": "4242"})
    assert login.status_code == 200
    token = login.json()["token"]
    assert token

    api = TestClient(app)
    me = api.get("/api/pilots/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200 and me.json()["callsign"] == cs
    ex = api.get("/api/import/export", headers={"Authorization": f"Bearer {token}"})
    assert ex.status_code == 200 and ex.headers["content-type"] == "application/zip"


def test_push_bearer_merges_and_dedupes() -> None:
    c = TestClient(app)
    cs, pid = _register(c, "Psh", pin="1111")
    token = TestClient(app).post("/api/pilots/login", json={"callsign": cs, "pin": "1111"}).json()["token"]

    desk = f"Push{uuid.uuid4().hex[:5]}"
    raw = _stpilot(_pilot_files(desk))
    api = TestClient(app)
    headers = {"Authorization": f"Bearer {token}"}
    mismatch = api.post("/api/import/push", files=[("files", ("p.stpilot", raw, "application/zip"))],
                        headers=headers, data={"confirm_identity": "false"})
    assert mismatch.status_code == 400 and mismatch.json()["detail"]["code"] == "callsign_mismatch"

    r1 = api.post("/api/import/push", files=[("files", ("p.stpilot", raw, "application/zip"))],
                  headers=headers, data={"confirm_identity": "true"})
    assert r1.status_code == 200, r1.text
    assert r1.json()["pilot"]["id"] == pid and r1.json()["report"]["runs"] == 1
    assert _sessions(pid) == 1

    r2 = api.post("/api/import/push", files=[("files", ("p.stpilot", raw, "application/zip"))],
                  headers=headers, data={"confirm_identity": "true"})
    assert r2.status_code == 200, r2.text
    assert _sessions(pid) == 1


def test_push_guest_rejected() -> None:
    g = TestClient(app)
    assert g.post("/api/pilots/guest").status_code == 200
    raw = _stpilot(_pilot_files("Somebody"))
    r = g.post("/api/import/push", files=[("files", ("p.stpilot", raw, "application/zip"))],
               data={"confirm_identity": "true"})
    assert r.status_code == 401
