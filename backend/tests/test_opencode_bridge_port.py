"""Автовыбор порта моста OpenCode и чтение runtime-файла бэкендом."""
from __future__ import annotations

import errno
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from app import api_orion
from app.config import settings

ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / "tools"
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import opencode_bridge as bridge  # noqa: E402


class _BusyServer:
    """Занимает порт на 127.0.0.1, чтобы bind на 0.0.0.0/тот же порт падал."""

    def __init__(self, port: int) -> None:
        class _H(BaseHTTPRequestHandler):
            def do_GET(self):  # noqa: N802
                self.send_response(200)
                self.end_headers()

            def log_message(self, *_a):  # noqa: A003
                return

        self.httpd = ThreadingHTTPServer(("127.0.0.1", port), _H)
        self.port = self.httpd.server_address[1]

    def close(self) -> None:
        self.httpd.server_close()


def test_port_candidates_prefer_env(monkeypatch) -> None:
    monkeypatch.setenv("ORION_OPENCODE_PORT", "7865")
    cands = bridge.port_candidates()
    assert cands[0] == 7865
    assert 0 == cands[-1]
    assert 7865 in bridge.FALLBACK_PORTS or cands.count(7865) == 1
    # без env — 8765 первым
    monkeypatch.delenv("ORION_OPENCODE_PORT", raising=False)
    assert bridge.port_candidates()[0] == bridge.DEFAULT_PORT


def test_is_bind_error_windows_and_posix() -> None:
    e_inuse = OSError(errno.EADDRINUSE, "Address already in use")
    assert bridge.is_bind_error(e_inuse)
    e_acc = OSError(errno.EACCES, "Permission denied")
    assert bridge.is_bind_error(e_acc)
    win = OSError("bind failed")
    win.winerror = 10013  # type: ignore[attr-defined]
    assert bridge.is_bind_error(win)
    win48 = OSError("busy")
    win48.winerror = 10048  # type: ignore[attr-defined]
    assert bridge.is_bind_error(win48)
    assert not bridge.is_bind_error(ValueError("nope"))


def test_pick_listening_server_skips_busy_port(tmp_path, monkeypatch) -> None:
    busy = _BusyServer(0)
    taken = busy.port
    try:
        monkeypatch.setenv("ORION_OPENCODE_PORT", str(taken))
        # Сужаем кандидатов: занятый → 0 (ОС выдаст свободный)
        monkeypatch.setattr(bridge, "FALLBACK_PORTS", ())
        httpd, port = bridge.pick_listening_server("127.0.0.1", preferred=taken)
        try:
            assert port != taken
            assert port > 0
        finally:
            httpd.server_close()
    finally:
        busy.close()


def test_pick_listening_server_skips_forbidden_port(monkeypatch) -> None:
    calls: list[int] = []
    forbidden = 8765

    def fake_bind(host: str, port: int):
        calls.append(port)
        if port == forbidden:
            exc = OSError("WinError 10013")
            exc.winerror = 10013  # type: ignore[attr-defined]
            raise exc
        if port == 0:
            srv = ThreadingHTTPServer((host, 0), BaseHTTPRequestHandler)
            return srv
        # следующий кандидат
        if port == 7865:
            return ThreadingHTTPServer((host, port), BaseHTTPRequestHandler)
        exc = OSError(errno.EADDRINUSE, "busy")
        raise exc

    monkeypatch.setattr(bridge, "bind_server", fake_bind)
    monkeypatch.setattr(bridge, "FALLBACK_PORTS", (7865,))
    httpd, port = bridge.pick_listening_server("127.0.0.1", preferred=forbidden)
    try:
        assert forbidden in calls
        assert port == 7865
    finally:
        httpd.server_close()


def test_write_and_read_runtime(tmp_path) -> None:
    path = tmp_path / "opencode_bridge.json"
    bridge.write_runtime(19876, path=path)
    assert bridge.read_runtime_port(path) == 19876
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["port"] == 19876
    assert "19876" in data["url"]


def test_runtime_path_is_web_repo_not_project_dir(tmp_path) -> None:
    """Layout как на Windows: My_New_Stamina/web_star_typing/tools/bridge.py.

    Runtime должен быть в web_star_typing/.runtime, а не в родительском PROJECT_DIR.
    """
    project = tmp_path / "My_New_Stamina"
    web = project / "web_star_typing"
    tools_dir = web / "tools"
    tools_dir.mkdir(parents=True)
    (project / "stamina").mkdir()
    bridge_file = tools_dir / "opencode_bridge.py"
    bridge_file.write_text("# stub\n", encoding="utf-8")

    path = bridge.resolve_runtime_path(here=bridge_file.resolve(), env={})
    assert path == web / ".runtime" / "opencode_bridge.json"
    assert path != project / ".runtime" / "opencode_bridge.json"
    assert bridge.WEB_REPO_ROOT == TOOLS.parent

    override = tmp_path / "custom" / "opencode_bridge.json"
    path2 = bridge.resolve_runtime_path(
        here=bridge_file.resolve(),
        env={"ORION_OPENCODE_RUNTIME": str(override)},
    )
    assert path2 == override


def test_backend_reads_runtime_port(tmp_path, monkeypatch) -> None:
    path = tmp_path / "opencode_bridge.json"
    path.write_text(json.dumps({"port": 7865, "url": "http://127.0.0.1:7865"}), encoding="utf-8")
    monkeypatch.setattr(settings, "orion_opencode_runtime", str(path))
    monkeypatch.setattr(settings, "orion_opencode_url", "http://host.docker.internal:8765")
    assert api_orion.read_opencode_runtime_port() == 7865
    assert api_orion.opencode_base_url() == "http://host.docker.internal:7865"


def test_backend_falls_back_without_runtime(monkeypatch) -> None:
    monkeypatch.setattr(settings, "orion_opencode_runtime", "/no/such/opencode_bridge.json")
    monkeypatch.setattr(settings, "orion_opencode_url", "http://host.docker.internal:8765")
    assert api_orion.read_opencode_runtime_port() is None
    assert api_orion.opencode_base_url() == "http://host.docker.internal:8765"


def test_cli_env_sets_silent_say(monkeypatch) -> None:
    monkeypatch.setenv("PATH", "/usr/bin")
    monkeypatch.delenv("ORION_SILENT_SAY", raising=False)
    env = bridge.cli_env()
    assert env["ORION_SILENT_SAY"] == "1"
    assert env["PATH"] == "/usr/bin"


def test_run_opencode_passes_silent_say(monkeypatch) -> None:
    seen: dict = {}

    class _Proc:
        returncode = 0
        stdout = b'{"type":"text","part":{"messageID":"1","text":"ok"}}\n'
        stderr = b""

    def fake_run(cmd, **kwargs):
        seen["env"] = kwargs.get("env") or {}
        seen["cmd"] = cmd
        return _Proc()

    monkeypatch.setattr(bridge, "find_cli", lambda: "/fake/opencode")
    monkeypatch.setattr(bridge.subprocess, "run", fake_run)
    out = bridge.run_opencode("hi", "m", "orion-commander", 30.0)
    assert out["reply"] == "ok"
    assert seen["env"].get("ORION_SILENT_SAY") == "1"


def test_opencode_status_uses_runtime_url(tmp_path, monkeypatch) -> None:
    path = tmp_path / "opencode_bridge.json"
    path.write_text(json.dumps({"port": 18765}), encoding="utf-8")
    monkeypatch.setattr(settings, "orion_opencode_runtime", str(path))
    monkeypatch.setattr(settings, "orion_opencode_url", "http://host.docker.internal:8765")

    class _Resp:
        status_code = 200

        @staticmethod
        def json():
            return {"ok": True, "cli": "/fake/opencode", "model": "m", "port": 18765}

    class _Client:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def get(self, url):
            assert url == "http://host.docker.internal:18765/health"
            return _Resp()

    monkeypatch.setattr(api_orion.httpx, "Client", _Client)
    st = api_orion.opencode_status()
    assert st["available"] is True
    assert st["port"] == 18765
    assert st["url"] == "http://host.docker.internal:18765"
