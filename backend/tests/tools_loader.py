"""Грузит tools/web_updater.py в тестах без установки пакета."""
from __future__ import annotations

import importlib.util
from pathlib import Path


def load_updater():
    path = Path(__file__).resolve().parents[2] / "tools" / "web_updater.py"
    spec = importlib.util.spec_from_file_location("web_updater", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(mod)
    return mod
