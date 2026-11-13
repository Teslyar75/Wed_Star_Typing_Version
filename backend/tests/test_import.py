"""Перенос пилотов десктопа: .stpilot / zip папки / весь %APPDATA%\\Stamina."""

import hashlib
import io
import json
import uuid
import zipfile

from fastapi.testclient import TestClient

from app.db import SessionLocal, init_db
from app.main import app

init_db()


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
    bad = c.post("/api/import/commit", json={"token": pv["token"], "source_id": src, "mode": "merge"})
    assert bad.status_code == 400 and bad.json()["detail"]["code"] == "callsign_mismatch"
    r1 = c.post("/api/import/commit",
                json={"token": pv["token"], "source_id": src, "mode": "merge", "confirm_identity": True})
    assert r1.status_code == 200, r1.text
    assert c.get("/api/pilots/me").json()["callsign"] == me
    r2 = c.post("/api/import/commit",
                json={"token": pv["token"], "source_id": src, "mode": "merge", "confirm_identity": True})
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


def test_register_old_england_skin() -> None:
    c = TestClient(app)
    r = c.post("/api/pilots/register", json={"callsign": f"Oe{uuid.uuid4().hex[:5]}", "skin": "old_england"})
    assert r.status_code == 200 and r.json()["skin"] == "old_england"


def _register(c: TestClient, prefix: str = "Mg") -> str:
    cs = f"{prefix}{uuid.uuid4().hex[:6]}"
    r = c.post("/api/pilots/register", json={"callsign": cs})
    assert r.status_code == 200, r.text
    return cs


def _commit_stpilot(c: TestClient, files: dict[str, bytes], *, mode: str, force: bool = False) -> dict:
    pv = _preview(c, "p.stpilot", _stpilot_full(files))
    s = pv["pilots"][0]
    body = {"token": pv["token"], "source_id": s["source_id"], "mode": mode, "force": force}
    if mode == "merge":
        body["confirm_identity"] = True
    r = c.post("/api/import/commit", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def _row_counts(pilot_id: int) -> tuple[int, int, int]:
    from app.api_english import SpeechAttempt
    from app.api_speedread import SpeedResult
    from app.sessions import TypingSession

    db = SessionLocal()
    try:
        return (
            db.query(TypingSession).filter_by(pilot_id=pilot_id).count(),
            db.query(SpeechAttempt).filter_by(pilot_id=pilot_id).count(),
            db.query(SpeedResult).filter_by(pilot_id=pilot_id).count(),
        )
    finally:
        db.close()


def test_desktop_export_with_idle_cache_and_lazy_vocab() -> None:
    c = TestClient(app)
    cs = f"Ic{uuid.uuid4().hex[:6]}"
    files = _pilot_files(cs)
    files["idle_cache/spaceship/x.jpg"] = b"jpgbytes"
    files["vocab_lazy_v1/index.json.gz"] = b"gzipbytes"
    files["vocab_lazy/other.json"] = b"{}"
    man = {"format": "stpilot", "version": 1, "pilot": {"id": "p-x", "callsign": cs},
           "files": {k: hashlib.sha256(v).hexdigest() for k, v in files.items()}}
    # служебный файл намеренно с «плохим» SHA: его не должно требовать и проверять
    man["files"]["vocab_lazy_v1/index.json.gz"] = "0" * 64
    raw = _zip({"manifest.json": json.dumps(man).encode(), **{"data/" + k: v for k, v in files.items()}})
    pv = _preview(c, "p.stpilot", raw)
    s = pv["pilots"][0]
    r = c.post("/api/import/commit", json={"token": pv["token"], "source_id": s["source_id"], "mode": "new"})
    assert r.status_code == 200, r.text
    assert r.json()["report"]["library_texts"] == 1


def test_merge_repeat_does_not_duplicate_rows_or_xp() -> None:
    c = TestClient(app)
    _register(c, "Id")
    cs = f"Ot{uuid.uuid4().hex[:6]}"
    files = _pilot_files(cs)
    _commit_stpilot(c, files, mode="merge")
    me = c.get("/api/pilots/me").json()
    before = _row_counts(me["id"])
    xp = me["xp"]
    assert before == (1, 1, 1)

    files2 = dict(files)
    settings = json.loads(files2["settings.json"])
    settings["extra_key"] = 1
    files2["settings.json"] = json.dumps(settings).encode()
    _commit_stpilot(c, files2, mode="merge", force=True)

    assert _row_counts(me["id"]) == before
    assert c.get("/api/pilots/me").json()["xp"] == xp


def test_merge_key_stats_use_max() -> None:
    c = TestClient(app)
    _register(c, "Kx")
    cs = f"Kx{uuid.uuid4().hex[:6]}"
    files = _pilot_files(cs)
    _commit_stpilot(c, files, mode="merge")
    files2 = dict(files)
    settings = json.loads(files2["settings.json"])
    settings["extra_key"] = 2
    files2["settings.json"] = json.dumps(settings).encode()
    _commit_stpilot(c, files2, mode="merge", force=True)

    from app.api_missions import PilotKeyStat

    pid = c.get("/api/pilots/me").json()["id"]
    db = SessionLocal()
    try:
        row = db.query(PilotKeyStat).filter_by(pilot_id=pid, key="a").first()
        assert row is not None and (row.hits, row.errors) == (50, 2)
    finally:
        db.close()


def test_lounge_best_imported_once() -> None:
    c = TestClient(app)
    _register(c, "Lg")
    cs = f"Lg{uuid.uuid4().hex[:6]}"
    files = _pilot_files(cs)
    files["lounge.json"] = json.dumps({"best": {"tetris": 47790, "snake": 0}}).encode()
    r1 = _commit_stpilot(c, files, mode="merge")
    assert r1["report"]["lounge_best"] == 1

    files2 = dict(files)
    settings = json.loads(files2["settings.json"])
    settings["extra_key"] = 3
    files2["settings.json"] = json.dumps(settings).encode()
    r2 = _commit_stpilot(c, files2, mode="merge", force=True)
    assert r2["report"]["lounge_best"] == 0

    from app.api_lounge import LoungeScore

    pid = c.get("/api/pilots/me").json()["id"]
    db = SessionLocal()
    try:
        rows = db.query(LoungeScore).filter_by(pilot_id=pid, game="tetris").all()
        assert [x.score for x in rows] == [47790]
        assert db.query(LoungeScore).filter_by(pilot_id=pid, game="snake").count() == 0
    finally:
        db.close()


def test_schulte_exercises_imported_once() -> None:
    c = TestClient(app)
    _register(c, "Sh")
    cs = f"Sh{uuid.uuid4().hex[:6]}"
    files = _pilot_files(cs)
    files["speedread.json"] = json.dumps({
        "sessions": [],
        "exercises": {"E-SHL": {"5x5": {"runs": [{"ts": 1760000500, "result": 23.4, "stars": 2, "errors": 1}]}}},
    }).encode()
    r1 = _commit_stpilot(c, files, mode="merge")
    assert r1["report"]["schulte_runs"] == 1

    files2 = dict(files)
    settings = json.loads(files2["settings.json"])
    settings["extra_key"] = 4
    files2["settings.json"] = json.dumps(settings).encode()
    _commit_stpilot(c, files2, mode="merge", force=True)

    from app.api_speedread import SpeedResult

    pid = c.get("/api/pilots/me").json()["id"]
    db = SessionLocal()
    try:
        rows = db.query(SpeedResult).filter_by(pilot_id=pid, mode="schulte").all()
        assert len(rows) == 1
        assert abs(rows[0].elapsed - 23.4) < 0.01 and abs(rows[0].score - 23.4) < 0.01
    finally:
        db.close()


def test_library_position_from_session_is_max() -> None:
    c = TestClient(app)
    cs = f"Bk{uuid.uuid4().hex[:6]}"
    book = "First sentence. Second one. Third sentence here."
    files = _pilot_files(cs)
    files["cargo.txt"] = book.encode()
    files["session.json"] = json.dumps({"text": book, "index": 20}).encode()
    files["library/library.json"] = json.dumps({
        "active_typing": "t-1",
        "texts": [{"id": "t-1", "title": "Book", "author": "", "lang": "en", "kind": "text"}],
    }).encode()
    _commit_stpilot(c, files, mode="new")

    shelf = c.get("/api/library").json()
    first = next(x for x in shelf if x["title"] == "Book")
    assert first["sentence_id"] > 0

    files2 = dict(files)
    files2["session.json"] = json.dumps({"text": book, "index": 2}).encode()
    settings = json.loads(files2["settings.json"])
    settings["extra_key"] = 5
    files2["settings.json"] = json.dumps(settings).encode()
    _commit_stpilot(c, files2, mode="merge", force=True)

    shelf2 = c.get("/api/library").json()
    second = next(x for x in shelf2 if x["title"] == "Book")
    assert second["sentence_id"] == first["sentence_id"]


def test_warehouse_flips_ok_best() -> None:
    c = TestClient(app)
    _register(c, "Wh")
    cs = f"Wh{uuid.uuid4().hex[:6]}"
    files = _pilot_files(cs)
    en = json.loads(files["english.json"])
    en["warehouse"] = {"flips": 172, "ok": 92, "by_day": {"2026-10-01": 40}, "best": {"the": 91.5}}
    files["english.json"] = json.dumps(en, ensure_ascii=False).encode()
    _commit_stpilot(c, files, mode="merge")

    from app.api_english import CardProgress, EnglishSettings, VocabWord

    pid = c.get("/api/pilots/me").json()["id"]
    db = SessionLocal()
    try:
        word = db.query(VocabWord).filter_by(slug="the").first()
        card = db.query(CardProgress).filter_by(pilot_id=pid, word_id=word.id).first()
        assert card is not None and card.wh_avg >= 91.5
        es = db.query(EnglishSettings).filter_by(pilot_id=pid).first()
        wh = json.loads(es.data)["warehouse"]
        assert wh["flips"] == 172 and wh["ok"] == 92 and wh["by_day"]["2026-10-01"] == 40
        assert wh["best"]["the"] == 91.5
    finally:
        db.close()

    files2 = dict(files)
    settings = json.loads(files2["settings.json"])
    settings["extra_key"] = 6
    files2["settings.json"] = json.dumps(settings).encode()
    _commit_stpilot(c, files2, mode="merge", force=True)

    db = SessionLocal()
    try:
        es = db.query(EnglishSettings).filter_by(pilot_id=pid).first()
        wh = json.loads(es.data)["warehouse"]
        assert wh["flips"] == 172 and wh["ok"] == 92
    finally:
        db.close()


def test_lab_slug_not_in_vocab() -> None:
    c = TestClient(app)
    cs = f"Lb{uuid.uuid4().hex[:6]}"
    files = _pilot_files(cs)
    en = json.loads(files["english.json"])
    en["words"] = {"the": {"known": True}, "dev:noweb": {"known": True}}
    files["english.json"] = json.dumps(en, ensure_ascii=False).encode()
    r = _commit_stpilot(c, files, mode="new")
    assert r["report"]["words_known"] == 1

    from app.api_english import VocabWord

    pid = c.get("/api/pilots/me").json()["id"]
    db = SessionLocal()
    try:
        assert db.query(VocabWord).filter(
            (VocabWord.slug == "dev:noweb") | (VocabWord.word == "dev:noweb")
        ).count() == 0
    finally:
        db.close()


def test_merge_preserves_web_card_and_xp() -> None:
    from datetime import date

    c = TestClient(app)
    _register(c, "We")
    pid = c.get("/api/pilots/me").json()["id"]
    from app.api_english import CardProgress, ReviewLog, VocabWord
    from app.pilots import Pilot

    db = SessionLocal()
    try:
        slug = f"webonly-{uuid.uuid4().hex[:10]}"
        w = db.query(VocabWord).filter_by(word=slug).first()
        if w is None:
            w = VocabWord(word=slug[:64], slug=slug[:80], translation="", example="", rank=999999, meta="")
            db.add(w)
            db.flush()
        db.add(CardProgress(pilot_id=pid, word_id=w.id, ease=2.5, interval=5, reps=3, due=date.today(),
                            bin="favorite", english_xp=10, known=1, my_tr="веб",
                            wh_state="", wh_runs=0, wh_goal=2, wh_run="", wh_stars=0, wh_avg=0.0))
        db.add(ReviewLog(pilot_id=pid, word_id=w.id, grade=4))
        p = db.get(Pilot, pid)
        p.xp = 1000
        db.commit()
        wid = w.id
    finally:
        db.close()

    files = _pilot_files(f"An{uuid.uuid4().hex[:6]}")
    r = _commit_stpilot(c, files, mode="merge")
    assert r["pilot"]["xp"] == 1000

    db = SessionLocal()
    try:
        card = db.query(CardProgress).filter_by(pilot_id=pid, word_id=wid).first()
        assert card is not None and card.known == 1 and card.my_tr == "веб"
        assert db.query(ReviewLog).filter_by(pilot_id=pid, word_id=wid).count() == 1
    finally:
        db.close()
