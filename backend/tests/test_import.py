"""Перенос пилотов десктопа: .stpilot / zip папки / весь %APPDATA%\\Stamina."""

import hashlib
import io
import json
import uuid
import zipfile

from fastapi.testclient import TestClient

from app.main import app


def _pin_rec(code: str) -> dict:
    salt = bytes(range(16))
    h = hashlib.pbkdf2_hmac("sha256", code.encode(), salt, 1000)
    return {"algo": "pbkdf2_sha256", "iter": 1000, "salt": salt.hex(), "hash": h.hex(), "set": "2026-10-01"}


def _pilot_files(cs: str, pin: str | None = None) -> dict[str, bytes]:
    prof = {"id": "p-20261009-abcd", "callsign": cs, "name": "Test Name", "accent": "amber",
            "avatar": {"kind": "builtin", "glyph": "comet"}}
    if pin:
        prof["pin"] = _pin_rec(pin)
    english = {
        "version": 1, "settings": {"daily_new": 7},
        "words": {"the": {"known": True}, "zzqword": {"tr": "моё"}},
        "lists": [{"id": "favorites", "name": "Избранное", "slugs": ["the"]},
                  {"id": "l1", "name": "Мой отсек", "slugs": ["zzqword"]}],
        "cards": {"the": {"slug": "the", "ef": 2.6, "interval": 30, "reps": 5, "due": "2026-11-01"},
                  "and": {"slug": "and", "ef": 2.3, "interval": 1, "reps": 1, "due": "2026-10-16"}},
        "xp": {"total": 40}, "attempts": [{"ts": 1760000000, "slug": "the", "mode": "speaking", "score": 80, "ok": True}],
        "warehouse": {"away": ["and"], "cleared": {"the": {"stars": 3, "avg": 91.5}}},
    }
    stats = {"version": 1, "xp": 350,
             "runs": [{"chars": 100, "typed": 100, "errors": 2, "elapsed": 30, "cpm": 200, "acc": 98, "mode": "mission",
                       "mission": "ru-01", "ts": 1760000000}],
             "keys": {"a": [50, 2], "ф": [10, 1]}, "missions": {"ru-01": {"stars": 2}}}
    return {
        "profile.json": json.dumps(prof, ensure_ascii=False).encode(),
        "english.json": json.dumps(english, ensure_ascii=False).encode(),
        "stats.json": json.dumps(stats).encode(),
        "speedread.json": json.dumps({"sessions": [{"words": 300, "secs": 60, "avg_wpm": 300, "comp": 80}]}).encode(),
        "radio.json": json.dumps({"favorites": [{"uuid": "u1", "name": "R", "url": "https://x.example/s"}],
                                  "volume": 50}).encode(),
        "settings.json": json.dumps({"skin": "steampunk", "keyboard": False, "font": "L", "lang": "uk"}).encode(),
        "cargo.txt": "hello cargo".encode(),
        "session.json": json.dumps({"text": "hello cargo", "index": 3}).encode(),
        "library/library.json": b"{}",
        "library/texts/t-1/meta.json": json.dumps({"title": "Book", "lang": "en"}).encode(),
        "library/texts/t-1/original.txt": b"First sentence. Second one.",
        "backups/junk.txt": b"x",
    }


def _zip(files: dict[str, bytes], prefix: str = "") -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for k, v in files.items():
            z.writestr(prefix + k, v)
    return buf.getvalue()


def _stpilot(files: dict[str, bytes]) -> bytes:
    files = {k: v for k, v in files.items() if not k.startswith("backups/")}
    man = {"format": "stpilot", "version": 1,
           "pilot": {"id": "p-x", "callsign": json.loads(files["profile.json"])["callsign"]},
           "files": {k: hashlib.sha256(v).hexdigest() for k, v in files.items()}}
    return _zip({"manifest.json": json.dumps(man).encode(), **{"data/" + k: v for k, v in files.items()}})


def _preview(c: TestClient, name: str, raw: bytes) -> dict:
    r = c.post("/api/import/preview", files=[("files", (name, raw, "application/zip"))])
    assert r.status_code == 200, r.text
    return r.json()


def test_stpilot_preview_commit_full_mapping() -> None:
    c = TestClient(app)
    cs = f"Ds{uuid.uuid4().hex[:6]}"
    pv = _preview(c, "p.stpilot", _stpilot(_pilot_files(cs, pin="1234")))
    assert len(pv["pilots"]) == 1
    s = pv["pilots"][0]
    assert s["callsign"] == cs and s["has_pin"] and s["counts"]["cards"] == 2 and s["counts"]["library_texts"] == 1
    r = c.post("/api/import/commit", json={"token": pv["token"], "source_id": s["source_id"], "mode": "new"})
    assert r.status_code == 200, r.text
    rep = r.json()["report"]
    assert rep["cards"] == 2 and rep["words_known"] == 1 and rep["my_translations"] == 1
    assert rep["warehouse_done"] == 1 and rep["warehouse_away"] == 1
    assert rep["runs"] == 1 and rep["keys"] == 2 and rep["missions"] == 1
    assert rep["speed_sessions"] == 1 and rep["radio_favorites"] == 1 and rep["library_texts"] == 1
    assert rep["lists"] == 2 and rep["english_xp"] == 40
    client = r.json()["client"]
    assert client["cargo"]["index"] == 3 and client["lang"] == "uk" and client["cabin"]["font"] == "L"
    assert r.json()["pilot"]["skin"] == "steampunk" and r.json()["pilot"]["xp"] == 350
    me = c.get("/api/pilots/me").json()
    assert me["callsign"] == cs and me["avatar_data"] == "emoji:☄"
    c2 = TestClient(app)
    assert c2.post("/api/pilots/login", json={"callsign": cs, "pin": "9999"}).status_code == 401
    assert c2.post("/api/pilots/login", json={"callsign": cs, "pin": "1234"}).status_code == 200
    assert TestClient(app).post("/api/pilots/login", json={"callsign": cs, "pin": "1234"}).status_code == 200


def test_corrupt_stpilot_rejected() -> None:
    c = TestClient(app)
    raw = _stpilot(_pilot_files("Bad1"))
    z = zipfile.ZipFile(io.BytesIO(raw))
    files = {n: z.read(n) for n in z.namelist()}
    files["data/stats.json"] = b'{"xp": 999999}'
    r = c.post("/api/import/preview", files=[("files", ("p.stpilot", _zip(files), "application/zip"))])
    assert r.status_code == 400 and r.json()["detail"]["code"] == "corrupt_file"


def test_zip_slip_rejected() -> None:
    c = TestClient(app)
    r = c.post("/api/import/preview",
               files=[("files", ("p.zip", _zip({"../evil/profile.json": b"{}"}), "application/zip"))])
    assert r.status_code == 400 and r.json()["detail"]["code"] == "bad_path"


def test_whole_appdata_folder_two_pilots_and_merge_dedupe() -> None:
    c = TestClient(app)
    a, b = f"Aa{uuid.uuid4().hex[:5]}", f"Bb{uuid.uuid4().hex[:5]}"
    files = {"pilots.json": b"{}", "english.json.migrated": b"{}", "stats.json": b'{"xp": 1}'}
    for cs, pid in ((a, "p-1"), (b, "p-2")):
        files.update({f"pilots/{pid}/{k}": v for k, v in _pilot_files(cs).items()})
    multi = [("files", (k.split("/")[-1], v, "application/octet-stream")) for k, v in files.items()]
    r = c.post("/api/import/preview", files=multi, data={"paths": [f"Stamina/{k}" for k in files]})
    assert r.status_code == 200, r.text
    pv = r.json()
    assert sorted(p["callsign"] for p in pv["pilots"]) == sorted([a, b])
    src = next(p for p in pv["pilots"] if p["callsign"] == a)["source_id"]
    assert c.post("/api/import/commit", json={"token": pv["token"], "source_id": src, "mode": "merge"}).status_code == 401
    me = f"Me{uuid.uuid4().hex[:5]}"
    assert c.post("/api/pilots/register", json={"callsign": me}).status_code == 200
    r1 = c.post("/api/import/commit", json={"token": pv["token"], "source_id": src, "mode": "merge"})
    assert r1.status_code == 200, r1.text
    assert c.get("/api/pilots/me").json()["callsign"] == me
    r2 = c.post("/api/import/commit", json={"token": pv["token"], "source_id": src, "mode": "merge"})
    assert r2.status_code == 409


def test_export_roundtrip() -> None:
    c = TestClient(app)
    cs = f"Ex{uuid.uuid4().hex[:6]}"
    pv = _preview(c, "p.zip", _zip(_pilot_files(cs), prefix=f"{cs}/"))
    c.post("/api/import/commit", json={"token": pv["token"], "source_id": pv["pilots"][0]["source_id"], "mode": "new"})
    r = c.get("/api/import/export")
    assert r.status_code == 200 and r.headers["content-type"] == "application/zip"
    z = zipfile.ZipFile(io.BytesIO(r.content))
    man = json.loads(z.read("manifest.json"))
    assert man["format"] == "stpilot" and "english.json" in man["files"]
    eng = json.loads(z.read("data/english.json"))
    assert "the" in eng["cards"] and eng["warehouse"]["cleared"]["the"]["stars"] == 3
    c2 = TestClient(app)
    pv2 = _preview(c2, "x.stpilot", r.content)
    assert pv2["pilots"][0]["callsign_taken"] is True
    r2 = c2.post("/api/import/commit",
                 json={"token": pv2["token"], "source_id": pv2["pilots"][0]["source_id"], "mode": "new"})
    assert r2.status_code == 200 and r2.json()["pilot"]["callsign"] != cs


def test_pin_rate_limit_and_clear_pin_closed() -> None:
    c = TestClient(app)
    cs = f"Pn{uuid.uuid4().hex[:6]}"
    pid = c.post("/api/pilots/register", json={"callsign": cs, "pin": "5555"}).json()["id"]
    assert c.post("/api/pilots/me/pin", json={"old_pin": "0000", "new_pin": "6666"}).status_code == 403
    assert c.post("/api/pilots/me/pin", json={"old_pin": "5555", "new_pin": "6666"}).status_code == 200
    o = TestClient(app)
    assert o.post(f"/api/pilots/{pid}/clear-pin", json={"callsign": cs}).status_code == 410
    codes = [o.post("/api/pilots/login", json={"callsign": cs, "pin": "0000"}).status_code for _ in range(3)]
    assert codes == [401, 401, 401]
    r = o.post("/api/pilots/login", json={"callsign": cs, "pin": "6666"})
    assert r.status_code == 429 and r.json()["detail"]["retry_after"] > 0


def test_register_validates() -> None:
    c = TestClient(app)
    assert c.post("/api/pilots/register", json={"callsign": "a<b>c"}).status_code == 400
    r = c.post("/api/pilots/register", json={"callsign": f"Ok{uuid.uuid4().hex[:5]}", "skin": "zen_garden",
                                             "accent": "green", "avatar": "⚓"})
    assert r.status_code == 200 and r.json()["skin"] == "zen_garden" and r.json()["avatar_data"] == "emoji:⚓"


def test_secret_refuses_default(tmp_path, monkeypatch) -> None:
    from app import config

    monkeypatch.setattr(config.settings, "secret_key", config.DEFAULT_SECRET)
    monkeypatch.setattr(config.settings, "allow_dev_secret", False)
    monkeypatch.setattr(config.settings, "secret_key_file", str(tmp_path / "s"))
    config.check_secret()
    assert config.settings.secret_key != config.DEFAULT_SECRET and len(config.settings.secret_key) >= 32
    assert (tmp_path / "s").read_text() == config.settings.secret_key


def test_patch_me_skin() -> None:
    c = TestClient(app)
    assert c.patch("/api/pilots/me", json={"skin": "steampunk"}).status_code == 401
    c.post("/api/pilots/register", json={"callsign": f"Sk{uuid.uuid4().hex[:5]}"})
    r = c.patch("/api/pilots/me", json={"skin": "neon_city", "accent": "amber", "avatar": "♞"})
    assert r.status_code == 200 and r.json()["skin"] == "neon_city" and r.json()["avatar_data"] == "emoji:♞"
    assert c.patch("/api/pilots/me", json={"skin": "nope"}).status_code == 400


def _stpilot_full(files: dict[str, bytes]) -> bytes:
    """Как pilots.export десктопа: backups/ и cache/ тоже в manifest."""
    man = {"format": "stpilot", "version": 1,
           "pilot": {"id": "p-x", "callsign": json.loads(files["profile.json"])["callsign"]},
           "files": {k: hashlib.sha256(v).hexdigest() for k, v in files.items()}}
    return _zip({"manifest.json": json.dumps(man).encode(), **{"data/" + k: v for k, v in files.items()}})


def test_desktop_export_with_backups_and_full_roundtrip() -> None:
    c = TestClient(app)
    cs = f"Rt{uuid.uuid4().hex[:6]}"
    files = _pilot_files(cs, pin="4321")
    files["backups/deleted-texts/x/meta.json"] = b"{}"
    files["cache/tts/a.mp3"] = b"\x00"
    pv = _preview(c, "p.stpilot", _stpilot_full(files))
    s = pv["pilots"][0]
    r = c.post("/api/import/commit", json={"token": pv["token"], "source_id": s["source_id"], "mode": "new"})
    assert r.status_code == 200, r.text
    ex = c.get("/api/import/export")
    z = zipfile.ZipFile(io.BytesIO(ex.content))
    names = set(z.namelist())
    prof = json.loads(z.read("data/profile.json"))
    assert prof["locked"] and prof["pin"]["iter"] == 1000 and prof["pin"]["hash"] == _pin_rec("4321")["hash"]
    eng = json.loads(z.read("data/english.json"))
    assert eng["settings"]["daily_new"] == 7
    lib = json.loads(z.read("data/library/library.json"))
    assert len(lib["texts"]) == 1
    tid = lib["texts"][0]["id"]
    assert f"data/library/texts/{tid}/original.txt" in names
    assert "First sentence" in z.read(f"data/library/texts/{tid}/original.txt").decode()
    assert json.loads(z.read(f"data/library/texts/{tid}/meta.json"))["title"] == "Book"
