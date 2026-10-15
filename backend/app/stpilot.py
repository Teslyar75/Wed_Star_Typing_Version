"""Перенос пилотов десктопа Star Typing в веб.

Форматы на входе (всё приходит как набор файлов «относительный путь → байты»):
  * ``.stpilot`` — zip десктопа (``manifest.json`` + ``data/<файлы>``, SHA-256 каждого файла);
  * zip/папка одного пилота (``profile.json``, ``english.json``, ``stats.json`` …);
  * zip/папка всего ``%APPDATA%\\Stamina`` (``pilots.json`` + ``pilots/<id>/…``).

``parse_*`` ничего не пишет в БД; ``apply_package`` переносит один пакет в пилота.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import zipfile
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

# Лимиты: защита от zip-бомб и случайно выбранного диска целиком.
MAX_TOTAL = 200 * 1024 * 1024
MAX_FILES = 6000
MAX_FILE = 40 * 1024 * 1024
SKIP_DIRS = {"backups", "cache", "logs"}
KNOWN = ("profile.json", "settings.json", "stats.json", "session.json", "cargo.txt", "cargo_original.txt",
         "english.json", "speedread.json", "radio.json", "achievements.json", "avatar.png")
DESKTOP_SKIN = {"spaceship", "bathyscaphe", "steampunk", "scriptorium", "neon_city", "zen_garden"}


class ImportError_(ValueError):
    """Ошибка разбора (код для i18n в .code)."""

    def __init__(self, code: str, detail: str = "") -> None:
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code = code
        self.detail = detail


@dataclass
class Package:
    source_id: str
    files: dict[str, bytes] = field(default_factory=dict)  # путь относительно папки пилота
    from_stpilot: bool = False

    # -- чтение ---------------------------------------------------------------
    def json(self, rel: str) -> dict:
        raw = self.files.get(rel)
        if not raw:
            return {}
        try:
            d = json.loads(raw.decode("utf-8-sig"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return {}
        return d if isinstance(d, dict) else {}

    def text(self, rel: str) -> str:
        raw = self.files.get(rel)
        return raw.decode("utf-8-sig", errors="replace") if raw else ""

    @property
    def sha(self) -> str:
        h = hashlib.sha256()
        for rel in sorted(self.files):
            h.update(rel.encode())
            h.update(hashlib.sha256(self.files[rel]).digest())
        return h.hexdigest()

    # -- сводка для превью (только счётчики, без содержимого) -----------------
    def library_texts(self) -> list[str]:
        ids = set()
        for rel in self.files:
            parts = rel.split("/")
            if len(parts) >= 4 and parts[0] == "library" and parts[1] == "texts":
                ids.add(parts[2])
        return sorted(ids)

    def summary(self) -> dict[str, Any]:
        prof = self.json("profile.json")
        en = self.json("english.json")
        st = self.json("stats.json")
        sr = self.json("speedread.json")
        rd = self.json("radio.json")
        settings = self.json("settings.json")
        wh = en.get("warehouse") or {}
        words = en.get("words") or {}
        av = prof.get("avatar") or {}
        return {
            "source_id": self.source_id,
            "callsign": str(prof.get("callsign") or self.source_id)[:32],
            "name": str(prof.get("name") or "")[:64],
            "accent": prof.get("accent") or "cyan",
            "avatar": _avatar_glyph(av) if isinstance(av, dict) else "",
            "has_pin": isinstance(prof.get("pin"), dict) and bool(prof["pin"].get("hash")),
            "skin": settings.get("skin") if settings.get("skin") in DESKTOP_SKIN else "spaceship",
            "xp": int(st.get("xp") or 0),
            "counts": {
                "words_known": sum(1 for w in words.values() if isinstance(w, dict) and w.get("known")),
                "my_translations": sum(1 for w in words.values() if isinstance(w, dict) and w.get("tr")),
                "cards": len(en.get("cards") or {}),
                "lists": len(en.get("lists") or []),
                "warehouse_away": len(wh.get("away") or []),
                "warehouse_done": len(wh.get("cleared") or {}),
                "speech_attempts": len(en.get("attempts") or []),
                "english_xp": int((en.get("xp") or {}).get("total") or 0),
                "runs": len(st.get("runs") or []),
                "keys": len(st.get("keys") or {}),
                "missions": len(st.get("missions") or {}),
                "speed_sessions": len(sr.get("sessions") or []),
                "radio_favorites": len(rd.get("favorites") or []),
                "library_texts": len(self.library_texts()),
                "cargo": bool(self.files.get("cargo.txt")) or bool(self.json("session.json").get("text")),
                "session": bool(self.files.get("session.json")),
                "settings": bool(settings),
            },
        }


# ---------------------------------------------------------------------------- разбор входа
def _safe_rel(rel: str) -> str:
    rel = rel.replace("\\", "/").lstrip("/")
    parts = [p for p in rel.split("/") if p not in ("", ".")]
    if any(p == ".." for p in parts) or (parts and ":" in parts[0]):
        raise ImportError_("bad_path", rel)
    return "/".join(parts)


def files_from_zip(raw: bytes) -> dict[str, bytes]:
    try:
        z = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile as e:
        raise ImportError_("bad_zip") from e
    infos = [i for i in z.infolist() if not i.is_dir()]
    if len(infos) > MAX_FILES:
        raise ImportError_("too_many_files")
    if sum(i.file_size for i in infos) > MAX_TOTAL:
        raise ImportError_("too_large")
    out: dict[str, bytes] = {}
    for i in infos:
        rel = _safe_rel(i.filename)
        if _skipped(rel):
            continue
        if i.file_size > MAX_FILE:
            continue
        out[rel] = z.read(i)
    return out


def _skipped(rel: str) -> bool:
    parts = rel.split("/")
    return any(p in SKIP_DIRS for p in parts[:-1]) or parts[-1].endswith((".tmp", ".log", ".migrated"))


def parse_stpilot(files: dict[str, bytes]) -> Package:
    try:
        man = json.loads(files["manifest.json"].decode("utf-8"))
    except (KeyError, ValueError) as e:
        raise ImportError_("bad_manifest") from e
    if man.get("format") != "stpilot":
        raise ImportError_("not_stpilot")
    pkg = Package(source_id=str((man.get("pilot") or {}).get("id") or "stpilot"), from_stpilot=True)
    for rel, h in (man.get("files") or {}).items():
        rel = _safe_rel(rel)
        if _skipped(rel):
            # backups/, cache/ … не переносим и не проверяем (их и так отсекает files_from_zip)
            continue
        data = files.get("data/" + rel)
        if data is None:
            raise ImportError_("missing_file", rel)
        if hashlib.sha256(data).hexdigest() != h:
            raise ImportError_("corrupt_file", rel)
        pkg.files[rel] = data
    # запись реестра важнее profile.json (как import_package десктопа)
    prof = pkg.json("profile.json")
    prof.update(man.get("pilot") or {})
    pkg.files["profile.json"] = json.dumps(prof, ensure_ascii=False).encode()
    return pkg


def split_packages(files: dict[str, bytes]) -> list[Package]:
    """Найти пилотов в произвольном наборе файлов (zip папки / выбор папки в браузере)."""
    files = {_safe_rel(k): v for k, v in files.items() if not _skipped(_safe_rel(k))}
    if not files:
        raise ImportError_("empty")
    # .stpilot внутри zip/папки
    nested = [k for k in files if k.lower().endswith(".stpilot")]
    if "manifest.json" in files or any(k.endswith("/manifest.json") and k.count("/") == 1 for k in files):
        root = "" if "manifest.json" in files else next(k for k in files if k.endswith("/manifest.json")).rsplit("/", 1)[0] + "/"
        sub = {k[len(root):]: v for k, v in files.items() if k.startswith(root)}
        return [parse_stpilot(sub)]
    out: list[Package] = []
    for k in nested:
        out.append(parse_stpilot(files_from_zip(files[k])))
    # папки пилотов: каталог, где лежит profile.json или english.json/stats.json
    dirs: set[str] = set()
    for k in files:
        d, _, name = k.rpartition("/")
        if name in ("profile.json", "english.json", "stats.json"):
            dirs.add(d)
    # пилоты внутри pilots/<id>/ имеют приоритет над старыми файлами в корне Stamina
    pilot_dirs = {d for d in dirs if d.split("/")[-2:-1] == ["pilots"]}
    if pilot_dirs:
        dirs = pilot_dirs
    for d in sorted(dirs):
        prefix = d + "/" if d else ""
        pkg = Package(source_id=d.split("/")[-1] if d else "pilot")
        for k, v in files.items():
            if k.startswith(prefix):
                rel = k[len(prefix):]
                if rel.startswith("pilots/") and not d:
                    continue
                pkg.files[rel] = v
        out.append(pkg)
    if not out:
        raise ImportError_("no_pilots")
    return out


# ---------------------------------------------------------------------------- перенос
def _avatar_glyph(av: dict) -> str:
    from app.api_pilots import GLYPHS

    if av.get("kind") == "builtin":
        return GLYPHS.get(str(av.get("glyph") or "star"), "★")
    return ""


def _ts(v: Any) -> datetime | None:
    try:
        if isinstance(v, (int, float)) and v > 0:
            return datetime.fromtimestamp(float(v), tz=timezone.utc)
        if isinstance(v, str) and v:
            d = datetime.fromisoformat(v)
            return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except (ValueError, OverflowError, OSError):
        return None
    return None


def _date(v: Any) -> date:
    try:
        return date.fromisoformat(str(v)[:10])
    except ValueError:
        return date.today()


def _avatar_data(pkg: Package) -> str:
    prof = pkg.json("profile.json")
    av = prof.get("avatar") or {}
    if isinstance(av, dict) and av.get("kind") == "builtin":
        return "emoji:" + _avatar_glyph(av)
    raw = pkg.files.get("avatar.png")
    if raw:
        try:
            from PIL import Image

            im = Image.open(io.BytesIO(raw)).convert("RGBA")
            im.thumbnail((256, 256))
            buf = io.BytesIO()
            im.save(buf, format="PNG")
            raw = buf.getvalue()
        except Exception:  # noqa: BLE001
            if len(raw) > 400_000:
                return ""
        return "data:image/png;base64," + base64.b64encode(raw).decode("ascii")
    return ""


def _word_ids(db: Session, slugs: set[str], report: dict) -> dict[str, int]:
    from app.api_english import VocabWord, _seed_vocab

    out: dict[str, int] = {}
    slugs = {s for s in slugs if isinstance(s, str) and s.strip()}
    if not slugs:
        return out
    if db.query(VocabWord).count() == 0:
        # словарь веба заполняется лениво — сначала он, иначе «свои» слова займут места словарных
        _seed_vocab(db)
    rows = db.query(VocabWord).filter((VocabWord.slug.in_(slugs)) | (VocabWord.word.in_(slugs))).all()
    for r in rows:
        if r.slug in slugs:
            out[r.slug] = r.id
        elif r.word in slugs:
            out.setdefault(r.word, r.id)
    for s in sorted(slugs - set(out)):
        # слова нет в словаре веба → добавить как своё (без потерь)
        w = VocabWord(word=s[:64], slug=s[:80], translation="", example="", rank=999999, meta="")
        db.add(w)
        db.flush()
        out[s] = w.id
        report["words_added_to_vocab"] += 1
    return out


def apply_package(db: Session, pkg: Package, pilot, *, merge: bool) -> dict[str, Any]:
    """Перенести пакет в пилота (без commit). Возвращает отчёт и client-часть для браузера."""
    from app.api_english import CardProgress, EnglishList, EnglishListItem, EnglishSettings, SpeechAttempt
    from app.api_library import PilotText
    from app.api_missions import DrillProgress, PilotKeyStat
    from app.api_radio import PilotRadioFav
    from app.api_speedread import SpeedResult
    from app.sessions import TypingSession

    rep: dict[str, Any] = {k: 0 for k in (
        "cards", "words_known", "my_translations", "lists", "list_items", "warehouse_shelf", "warehouse_away",
        "warehouse_done", "speech_attempts", "english_xp", "runs", "keys", "missions", "speed_sessions",
        "radio_favorites", "library_texts", "words_added_to_vocab")}
    rep["skipped"] = []
    prof = pkg.json("profile.json")
    st = pkg.json("stats.json")
    en = pkg.json("english.json")
    sr = pkg.json("speedread.json")
    rd = pkg.json("radio.json")
    settings = pkg.json("settings.json")

    # -- профиль
    if not merge:
        pilot.display_name = str(prof.get("name") or pilot.display_name or pilot.callsign)[:64]
        if prof.get("accent"):
            pilot.accent = str(prof["accent"])[:32]
        av = _avatar_data(pkg)
        if av:
            pilot.avatar_data = av
        pin = prof.get("pin")
        if isinstance(pin, dict) and pin.get("hash") and pin.get("salt") and pin.get("algo", "pbkdf2_sha256") == "pbkdf2_sha256":
            from app.pilots import desktop_pin_hash

            pilot.pin_hash = desktop_pin_hash(pin)
        if settings.get("skin") in DESKTOP_SKIN:
            pilot.skin = settings["skin"]
    pilot.xp = max(int(pilot.xp or 0), int(st.get("xp") or 0)) if merge else int(st.get("xp") or 0)

    # -- английский
    words = {k: v for k, v in (en.get("words") or {}).items() if isinstance(v, dict)}
    cards = {k: v for k, v in (en.get("cards") or {}).items() if isinstance(v, dict)}
    lists = [l for l in (en.get("lists") or []) if isinstance(l, dict)]
    wh = en.get("warehouse") or {}
    away = set(x for x in (wh.get("away") or []) if isinstance(x, str))
    cleared = {k: v for k, v in (wh.get("cleared") or {}).items()} if isinstance(wh.get("cleared"), dict) else {}
    wh_runs = wh.get("runs") if isinstance(wh.get("runs"), dict) else {}
    attempts = [a for a in (en.get("attempts") or []) if isinstance(a, dict)]
    slugs = set(words) | set(cards) | away | set(cleared) | {a.get("slug") for a in attempts}
    for l in lists:
        slugs |= set(x for x in (l.get("slugs") or []) if isinstance(x, str))
    ids = _word_ids(db, slugs, rep)
    fav = next((l for l in lists if l.get("id") == "favorites"), None)
    fav_slugs = set((fav or {}).get("slugs") or [])

    existing = {c.word_id: c for c in db.query(CardProgress).filter_by(pilot_id=pilot.id).all()}

    def card_for(slug: str) -> CardProgress:
        wid = ids[slug]
        c = existing.get(wid)
        if c is None:
            c = CardProgress(pilot_id=pilot.id, word_id=wid, ease=2.5, interval=0, reps=0, due=date.today(),
                             bin="inbox", english_xp=0, known=0, my_tr="", wh_state="", wh_runs=0, wh_goal=2,
                             wh_stars=0, wh_avg=0.0)
            db.add(c)
            existing[wid] = c
        return c

    for slug, c in cards.items():
        if slug not in ids:
            continue
        row = card_for(slug)
        reps = int(c.get("reps") or 0)
        if not merge or reps >= int(row.reps or 0):
            row.ease = float(c.get("ef") or 2.5)
            row.interval = int(c.get("interval") or 0)
            row.reps = reps
            row.due = _date(c.get("due"))
        rep["cards"] += 1
    for slug, w in words.items():
        if slug not in ids:
            continue
        row = card_for(slug)
        if w.get("known"):
            row.known = 1
            rep["words_known"] += 1
        if w.get("tr"):
            row.my_tr = str(w["tr"])[:256]
            rep["my_translations"] += 1
    # отсеки
    for slug in slugs:
        if slug in ids and ids[slug] in existing:
            row = existing[ids[slug]]
            if (row.interval or 0) >= 21:
                row.bin = "learned"
            elif slug in fav_slugs:
                row.bin = "favorite"
    # склад
    for slug, row in ((s, existing.get(ids.get(s, -1))) for s in slugs):
        if row is None:
            continue
        if slug in cleared:
            v = cleared[slug] if isinstance(cleared[slug], dict) else {}
            row.wh_state = "done"
            row.wh_stars = max(int(row.wh_stars or 0), int(v.get("stars") or 0))
            row.wh_avg = max(float(row.wh_avg or 0), float(v.get("avg") or 0))
            rep["warehouse_done"] += 1
        elif slug in away:
            row.wh_state = "away"
            rep["warehouse_away"] += 1
        elif (row.known or (row.interval or 0) >= 21) and (row.wh_state or "") not in ("away", "done"):
            row.wh_state = "shelf"
            rep["warehouse_shelf"] += 1
        r = wh_runs.get(slug)
        if isinstance(r, (int, float)):
            row.wh_runs = max(int(row.wh_runs or 0), int(r))
    # списки
    for l in lists:
        kind = "favorite" if l.get("id") == "favorites" else "custom"
        name = str(l.get("name") or ("Избранное" if kind == "favorite" else "Отсек"))[:128]
        q = db.query(EnglishList).filter_by(pilot_id=pilot.id, kind=kind)
        lst = q.first() if kind == "favorite" else q.filter_by(name=name).first()
        if lst is None:
            lst = EnglishList(pilot_id=pilot.id, name=name, kind=kind)
            db.add(lst)
            db.flush()
            rep["lists"] += 1
        have = {i.word_id for i in db.query(EnglishListItem).filter_by(list_id=lst.id).all()}
        for s in l.get("slugs") or []:
            if s in ids and ids[s] not in have:
                db.add(EnglishListItem(list_id=lst.id, word_id=ids[s]))
                have.add(ids[s])
                rep["list_items"] += 1
    # попытки речи
    for a in attempts[-2000:]:
        score = int(a.get("score") or 0)
        row = SpeechAttempt(pilot_id=pilot.id, word_id=ids.get(a.get("slug"), 0),
                            mode=str(a.get("mode") or "speaking")[:32], score=score,
                            ok=1 if a.get("ok") or score >= 60 else 0)
        t = _ts(a.get("ts"))
        if t:
            row.created_at = t
        db.add(row)
        rep["speech_attempts"] += 1
    # опыт английского: в вебе он — сумма english_xp карточек
    en_xp = int((en.get("xp") or {}).get("total") or 0)
    if en_xp and existing:
        rows = sorted(existing.values(), key=lambda r: -(r.reps or 0))
        have_xp = sum(int(r.english_xp or 0) for r in rows)
        add = max(0, en_xp - have_xp) if merge else en_xp - have_xp
        if add > 0:
            share, rest = divmod(add, len(rows))
            for i, r in enumerate(rows):
                r.english_xp = int(r.english_xp or 0) + share + (1 if i < rest else 0)
        rep["english_xp"] = en_xp
    if isinstance(en.get("settings"), dict) and en["settings"]:
        es = db.query(EnglishSettings).filter_by(pilot_id=pilot.id).first()
        cur = json.loads(es.data or "{}") if es else {}
        new = {**en["settings"], **cur} if merge else {**cur, **en["settings"]}
        if es is None:
            db.add(EnglishSettings(pilot_id=pilot.id, data=json.dumps(new, ensure_ascii=False)))
        else:
            es.data = json.dumps(new, ensure_ascii=False)
    for k in ("achievements", "book_sentences", "speech_best", "review_done_days"):
        if en.get(k):
            rep["skipped"].append(f"english.{k}")

    # -- набор: забеги, клавиши, миссии
    for r in (st.get("runs") or [])[-5000:]:
        if not isinstance(r, dict):
            continue
        mid = str(r.get("mission") or "")
        row = TypingSession(
            pilot_id=pilot.id, text_id=None,
            mode=str(r.get("mode") or "cargo")[:32],
            lang=(mid.split("-")[0] if "-" in mid else "")[:16] or "en",
            chars=int(r.get("chars") or 0), typed=int(r.get("typed") or 0), errors=int(r.get("errors") or 0),
            elapsed=float(r.get("elapsed") or 0), cpm=float(r.get("cpm") or 0), acc=float(r.get("acc") or 0),
            rhythm=float(r.get("rhythm") or 0), best_streak=int(r.get("best_streak") or 0),
        )
        t = _ts(r.get("ts"))
        if t:
            row.created_at = t
        db.add(row)
        rep["runs"] += 1
    keys = {k.key: k for k in db.query(PilotKeyStat).filter_by(pilot_id=pilot.id).all()}
    for ch, v in (st.get("keys") or {}).items():
        if not isinstance(v, list) or len(v) < 2 or not ch or len(ch) > 8:
            continue
        row = keys.get(ch)
        if row is None:
            row = PilotKeyStat(pilot_id=pilot.id, key=ch, hits=0, errors=0)
            db.add(row)
            keys[ch] = row
        row.hits = int(row.hits or 0) + int(v[0] or 0)
        row.errors = int(row.errors or 0) + int(v[1] or 0)
        rep["keys"] += 1
    drills = {d.mission_id: d for d in db.query(DrillProgress).filter_by(pilot_id=pilot.id).all()}
    for mid, v in (st.get("missions") or {}).items():
        if not isinstance(v, dict):
            continue
        row = drills.get(mid)
        if row is None:
            row = DrillProgress(pilot_id=pilot.id, mission_id=str(mid)[:64], best_stars=0, attempts=0)
            db.add(row)
            drills[mid] = row
        row.best_stars = max(int(row.best_stars or 0), int(v.get("stars") or 0))
        row.attempts = max(int(row.attempts or 0), 1)
        rep["missions"] += 1

    # -- скорочтение
    for s in (sr.get("sessions") or [])[-2000:]:
        if not isinstance(s, dict):
            continue
        row = SpeedResult(pilot_id=pilot.id, mode="reading", wpm=float(s.get("avg_wpm") or s.get("eff_wpm") or 0),
                          words=int(s.get("words") or 0), elapsed=float(s.get("secs") or 0),
                          score=float(s.get("comp") or 0))
        t = _ts(s.get("ts"))
        if t:
            row.created_at = t
        db.add(row)
        rep["speed_sessions"] += 1
    if sr.get("exercises"):
        rep["skipped"].append("speedread.exercises")

    # -- радио
    favs = {f.station_uuid for f in db.query(PilotRadioFav).filter_by(pilot_id=pilot.id).all()}
    for f in rd.get("favorites") or []:
        if not isinstance(f, dict) or not str(f.get("url") or "").startswith(("http://", "https://")):
            continue
        uuid = str(f.get("uuid") or f.get("url"))
        if uuid in favs:
            continue
        payload = {"stationuuid": uuid, "name": str(f.get("name") or ""), "url_resolved": f["url"],
                   "country": str(f.get("country") or ""), "favicon": str(f.get("favicon") or ""),
                   "tags": str(f.get("tags") or ""), "language": ""}
        db.add(PilotRadioFav(pilot_id=pilot.id, station_uuid=uuid, payload=json.dumps(payload, ensure_ascii=False)))
        favs.add(uuid)
        rep["radio_favorites"] += 1

    # -- клиентская часть (localStorage браузера): настройки кабины, груз, радио
    client: dict[str, Any] = {}
    cab: dict[str, Any] = {}
    for k_src, k_dst in (("sound", "sound"), ("stars", "stars"), ("keyboard", "keyboard"), ("zones", "zones"),
                         ("translator", "translator")):
        if isinstance(settings.get(k_src), bool):
            cab[k_dst] = settings[k_src]
    if isinstance(settings.get("volume"), int) and 1 <= settings["volume"] <= 4:
        cab["volume"] = settings["volume"]
    for k_src, k_dst in (("font", "font"), ("ui_scale", "uiScale")):
        if settings.get(k_src) in ("S", "M", "L", "XL", "XXL"):
            cab[k_dst] = settings[k_src]
    if cab:
        client["cabin"] = cab
    if settings.get("lang") in ("ru", "uk", "en", "de"):
        client["lang"] = settings["lang"]
    sess = pkg.json("session.json")
    cargo = pkg.text("cargo.txt") or (sess.get("text") if isinstance(sess.get("text"), str) else "")
    if cargo:
        idx = int(sess.get("index") or 0) if sess.get("text") in (None, "", cargo) else 0
        client["cargo"] = {"text": cargo, "original": pkg.text("cargo_original.txt") or cargo,
                           "index": max(0, min(idx, len(cargo))), "typed": int(sess.get("typed") or 0),
                           "errors": int(sess.get("errors") or 0), "elapsed": float(sess.get("elapsed") or 0)}
    if rd:
        client["radio"] = {k: rd[k] for k in ("volume", "autoplay", "duck_typing") if k in rd}

    # -- библиотека (последней: импорт текста сам делает commit)
    rep["_library"] = pkg.library_texts()
    return {"report": rep, "client": client}


def import_library(db: Session, pkg: Package, pilot, report: dict) -> None:
    """Тексты полки: original (+translation) → texts; позиция чтения → pilot_texts."""
    from app.api_library import PilotText
    from app.models import TextDoc
    from app.texts_service import import_bilingual, import_text

    have_titles = {
        t.title for t in db.query(TextDoc).join(PilotText, PilotText.text_id == TextDoc.id)
        .filter(PilotText.pilot_id == pilot.id).all()
    }
    for tid in report.pop("_library", []):
        base = f"library/texts/{tid}/"
        meta = pkg.json(base + "meta.json")
        original = pkg.text(base + "original.txt") or pkg.text(base + "prepared.txt")
        if not original.strip():
            continue
        title = str(meta.get("title") or tid)[:500]
        if meta.get("author"):
            title = f"{title} — {meta['author']}"[:500]
        if title in have_titles:
            continue
        lang = str(meta.get("lang") or "en")[:16]
        tr = pkg.text(base + "translation.txt")
        if tr.strip():
            tgt = "ru" if lang != "ru" else "en"
            doc = import_bilingual(db, title=title, lang_src=lang, lang_tgt=tgt, original=original, translation=tr)
        else:
            doc = import_text(db, title=title, lang=lang, content=original, source="desktop")
        db.add(PilotText(pilot_id=pilot.id, text_id=doc.id, sentence_id=0, mode="reader"))
        db.commit()
        have_titles.add(title)
        report["library_texts"] += 1


# ---------------------------------------------------------------------------- экспорт
def export_stpilot(db: Session, pilot) -> bytes:
    """Веб → .stpilot в формате десктопа (pilots.export): manifest + data/…"""
    from app.api_english import CardProgress, EnglishList, EnglishListItem, SpeechAttempt, VocabWord
    from app.api_missions import DrillProgress, PilotKeyStat
    from app.api_radio import PilotRadioFav
    from app.api_speedread import SpeedResult
    from app.sessions import TypingSession

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    avatar: dict[str, Any] = {"kind": "builtin", "glyph": "star"}
    files: dict[str, bytes] = {}
    av = pilot.avatar_data or ""
    if av.startswith("emoji:"):
        from app.api_pilots import GLYPHS

        g = av[6:]
        avatar = {"kind": "builtin", "glyph": next((k for k, v in GLYPHS.items() if v == g), "star")}
    elif av.startswith("data:image/"):
        try:
            files["avatar.png"] = base64.b64decode(av.split(",", 1)[1])
            avatar = {"kind": "custom"}
        except (IndexError, ValueError):
            pass
    entry = {"id": f"web-{pilot.id}", "callsign": pilot.callsign, "name": pilot.display_name or "",
             "accent": pilot.accent or "cyan", "avatar": avatar, "locked": False, "pin_setup_pending": False}
    prof: dict[str, Any] = {**entry, "created": now}
    from app.pilots import is_desktop_hash

    if is_desktop_hash(pilot.pin_hash or ""):
        # PIN десктопа (pbkdf2) переносится обратно как есть; bcrypt-веба десктоп проверить не может
        try:
            _a, it, salt, h = pilot.pin_hash.split("$")
            prof["pin"] = {"algo": "pbkdf2_sha256", "iter": int(it), "salt": salt, "hash": h, "set": now}
            entry["locked"] = prof["locked"] = True
        except ValueError:
            pass
    files["profile.json"] = _j(prof)

    wid = {w.id: (w.slug or w.word) for w in db.query(VocabWord).join(
        CardProgress, CardProgress.word_id == VocabWord.id).filter(CardProgress.pilot_id == pilot.id).all()}
    cards: dict[str, Any] = {}
    words: dict[str, Any] = {}
    wh = {"flips": 0, "ok": 0, "by_day": {}, "best": {}, "away": [], "cleared": {}}
    for c in db.query(CardProgress).filter_by(pilot_id=pilot.id).all():
        s = wid.get(c.word_id)
        if not s:
            continue
        if c.reps or c.interval:
            cards[s] = {"slug": s, "ef": c.ease, "interval": c.interval, "reps": c.reps, "due": c.due.isoformat(),
                        "last": None, "lapses": 0, "created": c.due.isoformat()}
        w: dict[str, Any] = {}
        if c.known:
            w["known"] = True
        if c.my_tr:
            w["tr"] = c.my_tr
        if w:
            words[s] = w
        if c.wh_state == "away":
            wh["away"].append(s)
        elif c.wh_state == "done":
            wh["cleared"][s] = {"stars": c.wh_stars, "avg": c.wh_avg}
    lists = []
    for l in db.query(EnglishList).filter_by(pilot_id=pilot.id).all():
        items = [wid.get(i.word_id) for i in db.query(EnglishListItem).filter_by(list_id=l.id).all()]
        lists.append({"id": "favorites" if l.kind == "favorite" else f"l{l.id}", "name": l.name,
                      "slugs": [x for x in items if x], "created": now[:10]})
    en_xp = sum(int(c.english_xp or 0) for c in db.query(CardProgress).filter_by(pilot_id=pilot.id).all())
    attempts = [{"ts": a.created_at.timestamp() if a.created_at else 0, "slug": wid.get(a.word_id, ""),
                 "mode": a.mode, "score": a.score, "ok": bool(a.ok)}
                for a in db.query(SpeechAttempt).filter_by(pilot_id=pilot.id).all()]
    from app.api_english import EnglishSettings

    es = db.query(EnglishSettings).filter_by(pilot_id=pilot.id).first()
    try:
        en_settings = json.loads(es.data or "{}") if es else {}
    except ValueError:
        en_settings = {}
    en_doc = {"version": 1, "words": words, "lists": lists, "cards": cards,
              "xp": {"total": en_xp, "by_day": {}, "best_streak": 0, "awarded": {}},
              "attempts": attempts, "warehouse": wh}
    if isinstance(en_settings, dict) and en_settings:
        en_doc["settings"] = en_settings
    files["english.json"] = _j(en_doc)
    runs = [{"chars": s.chars, "typed": s.typed, "errors": s.errors, "elapsed": s.elapsed, "cpm": s.cpm,
             "acc": s.acc, "rhythm": s.rhythm, "best_streak": s.best_streak, "mode": s.mode,
             "ts": s.created_at.timestamp() if s.created_at else 0}
            for s in db.query(TypingSession).filter_by(pilot_id=pilot.id).order_by(TypingSession.id).all()]
    files["stats.json"] = _j({
        "version": 1, "runs": runs[-5000:],
        "keys": {k.key: [k.hits, k.errors] for k in db.query(PilotKeyStat).filter_by(pilot_id=pilot.id).all()},
        "missions": {d.mission_id: {"stars": d.best_stars, "best_cpm": 0, "best_acc": 0}
                     for d in db.query(DrillProgress).filter_by(pilot_id=pilot.id).all()},
        "xp": int(pilot.xp or 0), "total_time": sum(r["elapsed"] for r in runs),
        "total_chars": sum(r["chars"] for r in runs)})
    files["speedread.json"] = _j({"version": 1, "sessions": [
        {"words": r.words, "secs": r.elapsed, "avg_wpm": r.wpm, "comp": r.score,
         "ts": r.created_at.timestamp() if r.created_at else 0, "mode": r.mode}
        for r in db.query(SpeedResult).filter_by(pilot_id=pilot.id).all()]})
    favs = []
    for f in db.query(PilotRadioFav).filter_by(pilot_id=pilot.id).all():
        p = json.loads(f.payload or "{}")
        favs.append({"uuid": f.station_uuid, "name": p.get("name", ""), "url": p.get("url_resolved", ""),
                     "favicon": p.get("favicon", ""), "country": p.get("country", ""), "tags": p.get("tags", "")})
    files["radio.json"] = _j({"favorites": favs})
    files["settings.json"] = _j({"skin": pilot.skin or "spaceship"})
    _export_library(db, pilot, files, now)

    manifest = {"format": "stpilot", "version": 1, "app": "Star Typing Web", "exported": now, "pilot": entry,
                "files": {k: hashlib.sha256(v).hexdigest() for k, v in files.items()}}
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=1))
        for k, v in files.items():
            z.writestr("data/" + k, v)
    return buf.getvalue()


def _export_library(db: Session, pilot, files: dict[str, bytes], now: str) -> None:
    """Полка пилота → library/library.json + library/texts/<id>/{meta,original,prepared,translation}."""
    from app.api_library import PilotText
    from app.models import Segment, TextDoc
    from app.texts_service import rebuild_original_body

    rows = []
    links = db.query(PilotText).filter_by(pilot_id=pilot.id).order_by(PilotText.id).all()
    for n, link in enumerate(links, 1):
        doc = db.get(TextDoc, link.text_id)
        if doc is None:
            continue
        original = rebuild_original_body(db, doc.id).strip()
        segs = db.query(Segment).filter_by(text_id=doc.id).order_by(Segment.idx).all()
        translation = ""
        if segs and any((s.translation or "").strip() for s in segs):
            paras: dict[int, list[str]] = {}
            for s in segs:
                paras.setdefault(s.para_idx, []).append((s.translation or "").strip())
            translation = "\n\n".join(" ".join(x for x in v if x) for _, v in sorted(paras.items())).strip()
            if not original:
                o: dict[int, list[str]] = {}
                for s in segs:
                    o.setdefault(s.para_idx, []).append((s.original or "").strip())
                original = "\n\n".join(" ".join(x for x in v if x) for _, v in sorted(o.items())).strip()
        if not original:
            continue
        original += "\n"
        prepared = (doc.prepared or "").strip() + "\n" if (doc.prepared or "").strip() else original
        tid = f"w{doc.id:06d}-{n:03d}"
        lang = (doc.lang or "en") if doc.lang != "und" else "en"
        meta: dict[str, Any] = {
            "id": tid, "title": doc.title or tid, "author": "", "lang": lang,
            "source": {"kind": "web", "web_id": doc.id}, "created": now, "updated": now,
            "kind": "bilingual" if translation else "text",
            "original": {"status": "ok", "chars": len(original), "words": len(original.split()),
                         "sha256": hashlib.sha256(original.encode()).hexdigest(), "note": ""},
            "prepared": {"opts": {}, "processor": "web", "chars": len(prepared),
                         "sha256": hashlib.sha256(prepared.encode()).hexdigest(), "generated": now},
            "positions": {"typing": {"char": 0, "updated": None}, "reading": {"word": 0, "updated": None}},
            "sync": "ask", "protected": False, "tags": [],
        }
        if translation:
            meta["bilingual"] = {"source": "mt", "lang_a": lang, "lang_b": "ru" if lang != "ru" else "en",
                                 "align": "paragraph"}
            files[f"library/texts/{tid}/translation.txt"] = (translation + "\n").encode("utf-8")
        files[f"library/texts/{tid}/meta.json"] = _j(meta)
        files[f"library/texts/{tid}/original.txt"] = original.encode("utf-8")
        files[f"library/texts/{tid}/prepared.txt"] = prepared.encode("utf-8")
        rows.append({"id": tid, "title": meta["title"], "author": "", "lang": lang, "kind": meta["kind"],
                     "updated": now})
    if rows:
        files["library/library.json"] = _j({"version": 1, "migrated": True, "active_typing": None,
                                            "active_reading": None, "texts": rows})


def _j(d: dict) -> bytes:
    return json.dumps(d, ensure_ascii=False, indent=1).encode("utf-8")
