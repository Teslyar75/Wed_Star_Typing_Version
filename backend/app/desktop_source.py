"""READ-ONLY источник десктопных данных (%APPDATA%\\Stamina) для переноса по имени + PIN.

Каталог задаётся ``settings.desktop_data_dir`` (env ``DESKTOP_DATA_DIR``). Пусто или
не существует — функция выключена (эндпоинт отвечает 503 desktop_data_unavailable).

Структура: ``pilots.json`` (реестр ``{"pilots": [{"id", "callsign", …}]}``) и папки
``pilots/<id>/`` (profile.json, english.json, stats.json …). Здесь ничего не пишется
и не удаляется — только чтение.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.config import settings
from app.stpilot import MAX_FILE, MAX_FILES, MAX_TOTAL, Package, _skipped

REGISTRY = "pilots.json"
PILOTS_DIR = "pilots"


class DesktopError(Exception):
    """Ошибка переноса с десктопа (code — машинный код для i18n)."""

    def __init__(self, code: str, status: int = 400, detail: str = "") -> None:
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code = code
        self.status = status
        self.detail = detail


def desktop_root() -> Path | None:
    raw = (getattr(settings, "desktop_data_dir", "") or "").strip()
    if not raw:
        return None
    p = Path(raw)
    return p if p.is_dir() else None


def _norm(callsign: object) -> str:
    return str(callsign or "").strip().casefold()


def _read_json(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def _registry(root: Path) -> list[dict]:
    path = root / REGISTRY
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return []
    rows = data.get("pilots") if isinstance(data, dict) else data
    if not isinstance(rows, list):
        return []
    return [r for r in rows if isinstance(r, dict)]


def _entry_dir(root: Path, entry: dict) -> Path | None:
    raw = entry.get("dir") or entry.get("id")
    if raw:
        d = root / PILOTS_DIR / str(raw)
        if d.is_dir():
            return d
    return None


def _find_dir(root: Path, callsign: str) -> tuple[Path, dict]:
    target = _norm(callsign)
    if not target:
        raise DesktopError("not_found", 404, callsign)

    hits = [e for e in _registry(root) if _norm(e.get("callsign")) == target]
    if len(hits) > 1:
        raise DesktopError("ambiguous_callsign", 409, callsign)
    if len(hits) == 1:
        d = _entry_dir(root, hits[0])
        if d is not None:
            return d, hits[0]

    dirs: list[Path] = []
    pilots_dir = root / PILOTS_DIR
    if pilots_dir.is_dir():
        for d in sorted(p for p in pilots_dir.iterdir() if p.is_dir()):
            prof = _read_json(d / "profile.json")
            if _norm(prof.get("callsign")) == target:
                dirs.append(d)
    if len(dirs) > 1:
        raise DesktopError("ambiguous_callsign", 409, callsign)
    if not dirs:
        raise DesktopError("not_found", 404, callsign)
    return dirs[0], {}


def load_desktop_package(callsign: str) -> Package:
    """Найти пилота по позывному и собрать пакет (только чтение, без кэшей)."""
    root = desktop_root()
    if root is None:
        raise DesktopError("desktop_data_unavailable", 503)
    pilot_dir, entry = _find_dir(root, callsign)

    profile = _read_json(pilot_dir / "profile.json")
    profile.update(entry or {})

    pkg = Package(source_id=pilot_dir.name)
    total = 0
    for path in sorted(pilot_dir.rglob("*")):
        if path.is_symlink() or not path.is_file():
            continue
        rel = path.relative_to(pilot_dir).as_posix()
        if _skipped(rel):
            continue
        try:
            size = path.stat().st_size
        except OSError:
            continue
        if size > MAX_FILE:
            continue
        if len(pkg.files) >= MAX_FILES:
            raise DesktopError("too_many_files", 413)
        if total + size > MAX_TOTAL:
            raise DesktopError("too_large", 413, rel)
        try:
            pkg.files[rel] = path.read_bytes()
        except OSError:
            continue
        total += size
    pkg.files["profile.json"] = json.dumps(profile, ensure_ascii=False).encode()
    return pkg


def verify_desktop_pin(pkg: Package, pin: str) -> bool:
    """PIN из profile.json (pbkdf2_sha256). Нет хеша — допустим только пустой PIN."""
    rec = pkg.json("profile.json").get("pin")
    if not (isinstance(rec, dict) and rec.get("hash") and rec.get("salt")):
        return not pin
    from app.pilots import desktop_pin_hash, verify_pin

    try:
        return verify_pin(pin, desktop_pin_hash(rec))
    except (KeyError, TypeError, ValueError):
        return False
