# -*- coding: utf-8 -*-
"""Мост OpenCode на хосте: веб-бэкенд в Docker зовёт CLI пилота.

POST /run  {prompt, model, agent}  →  {reply} | {error}
GET  /health                       →  {ok, cli, model, port}

Слушает 0.0.0.0:<port>. Предпочтительный порт — ORION_OPENCODE_PORT или 8765;
при WinError 10013/10048 / EADDRINUSE перебирает кандидатов вне типичных
исключений Hyper-V, затем порт 0 от ОС. Выбранный порт пишет в runtime-файл
(.runtime/opencode_bridge.json), который читает backend в контейнере.
"""
from __future__ import annotations

import errno
import json
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DEFAULT_PORT = 8765
HOSTS = ("0.0.0.0",)
DEFAULT_MODEL = "opencode/deepseek-v4.1-flash-free"
TIMEOUT = float(os.environ.get("ORION_OPENCODE_TIMEOUT", "180"))
TOKEN = os.environ.get("ORION_OPENCODE_TOKEN", "")
HERE = Path(__file__).resolve()
# tools/ → web_star_typing → My_New_Stamina
PROJECT_DIR = HERE.parents[2] if (HERE.parents[2] / "stamina").is_dir() else HERE.parents[1]
REPO_ROOT = HERE.parent if (HERE.parent / "docker-compose.yml").is_file() else PROJECT_DIR
RUNTIME_PATH = Path(
    os.environ.get("ORION_OPENCODE_RUNTIME")
    or str(REPO_ROOT / ".runtime" / "opencode_bridge.json")
)
_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)

# Кандидаты вне типичных Hyper-V excluded ranges (~5k–9k на Windows).
# Предпочтительный порт добавляется отдельно первым.
FALLBACK_PORTS = (
    7865,
    9765,
    18765,
    27654,
    34567,
    19876,
    45678,
    56789,
)


def preferred_port() -> int:
    raw = os.environ.get("ORION_OPENCODE_PORT", str(DEFAULT_PORT)).strip() or str(DEFAULT_PORT)
    try:
        port = int(raw)
    except ValueError:
        port = DEFAULT_PORT
    if not (1 <= port <= 65535):
        return DEFAULT_PORT
    return port


def port_candidates(preferred: int | None = None) -> list[int]:
    """Список портов: предпочтительный → запасные → 0 (ОС)."""
    pref = preferred if preferred is not None else preferred_port()
    out: list[int] = []
    for p in (pref, *FALLBACK_PORTS, 0):
        if p not in out:
            out.append(p)
    return out


def is_bind_error(exc: BaseException) -> bool:
    """WinError 10013/10048 и POSIX EADDRINUSE/EACCES — порт занят или запрещён."""
    if not isinstance(exc, OSError):
        return False
    winerror = getattr(exc, "winerror", None)
    if winerror in (10013, 10048):
        return True
    err = getattr(exc, "errno", None)
    if err in (errno.EADDRINUSE, errno.EACCES):
        return True
    # Некоторые окружения кладут код Windows в errno
    if err in (10013, 10048):
        return True
    msg = str(exc).lower()
    return any(
        s in msg
        for s in (
            "10013",
            "10048",
            "address already in use",
            "permission denied",
            "access",
            "excluded",
        )
    )


def write_runtime(port: int, path: Path | None = None) -> Path:
    target = path or RUNTIME_PATH
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "port": int(port),
        "host": "0.0.0.0",
        "pid": os.getpid(),
        "url": f"http://127.0.0.1:{int(port)}",
        "ts": int(time.time()),
    }
    tmp = target.with_suffix(target.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    tmp.replace(target)
    return target


def read_runtime_port(path: Path | None = None) -> int | None:
    target = path or RUNTIME_PATH
    try:
        data = json.loads(target.read_text(encoding="utf-8"))
        port = int(data.get("port") or 0)
        return port if 1 <= port <= 65535 else None
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return None


def health_ok(port: int, token: str = "", timeout: float = 1.5) -> bool:
    if not (1 <= port <= 65535):
        return False
    req = urllib.request.Request(f"http://127.0.0.1:{port}/health", method="GET")
    if token:
        req.add_header("X-Orion-OpenCode", token)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status != 200:
                return False
            data = json.loads(resp.read().decode("utf-8", "replace") or "{}")
            return bool(data.get("ok"))
    except (urllib.error.URLError, TimeoutError, ValueError, OSError):
        return False


def existing_bridge_port(token: str = "") -> int | None:
    """Если живой мост уже есть — вернуть его порт (runtime → предпочтительный → запасные)."""
    seen: list[int] = []
    runtime_port = read_runtime_port()
    for port in (runtime_port, preferred_port(), *FALLBACK_PORTS):
        if port is None or port in seen or port == 0:
            continue
        seen.append(port)
        if health_ok(port, token=token):
            return port
    return None


def bind_server(host: str, port: int) -> ThreadingHTTPServer:
    return ThreadingHTTPServer((host, port), Handler)


def pick_listening_server(host: str = "0.0.0.0", preferred: int | None = None) -> tuple[ThreadingHTTPServer, int]:
    """Пробует кандидатов; при успехе возвращает (server, actual_port)."""
    last_exc: BaseException | None = None
    for port in port_candidates(preferred):
        try:
            httpd = bind_server(host, port)
        except OSError as exc:
            last_exc = exc
            if is_bind_error(exc):
                print(f"bind {host}:{port} failed: {exc}", flush=True)
                continue
            raise
        actual = int(httpd.server_address[1])
        return httpd, actual
    if last_exc is not None:
        raise last_exc
    raise OSError("no_port")


def _native_exe(path: str) -> str:
    shim = Path(str(path))
    if shim.suffix.lower() not in {".cmd", ".bat"}:
        return str(shim)
    native = shim.parent / "node_modules" / "opencode-ai" / "bin" / "opencode.exe"
    return str(native) if native.is_file() else str(shim)


def find_cli() -> str:
    explicit = os.environ.get("STAR_TYPING_OPENCODE")
    if explicit and Path(explicit).is_file():
        return explicit
    appdata = os.environ.get("APPDATA", "")
    for candidate in (
        shutil.which("opencode"),
        shutil.which("opencode.cmd"),
        Path(appdata) / "npm/node_modules/opencode-ai/bin/opencode.exe",
        Path(appdata) / "npm/opencode.cmd",
    ):
        if not candidate:
            continue
        path = Path(str(candidate))
        if path.is_file():
            return _native_exe(str(path))
    return ""


def parse_reply(stdout: str) -> str:
    texts: dict[str, list[str]] = {}
    order: list[str] = []
    for line in (stdout or "").splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            ev = json.loads(line)
        except ValueError:
            continue
        if ev.get("type") != "text":
            continue
        part = ev.get("part") or {}
        mid = str(part.get("messageID") or "_")
        if mid not in texts:
            texts[mid] = []
            order.append(mid)
        texts[mid].append(str(part.get("text") or ""))
    blob = "".join("".join(texts[m]) for m in order).strip()
    return blob


def run_opencode(prompt: str, model: str, agent: str, timeout: float) -> dict:
    exe = find_cli()
    if not exe:
        return {"error": "no_cli", "reply": ""}
    model = (model or DEFAULT_MODEL).strip()
    cmd = [exe, "run", "--format", "json", "--dir", str(PROJECT_DIR)]
    if agent:
        cmd += ["--agent", agent]
    if model:
        cmd += ["--model", model]
    cmd.append(prompt)
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            timeout=max(30.0, timeout),
            cwd=str(PROJECT_DIR),
            creationflags=_NO_WINDOW,
        )
    except subprocess.TimeoutExpired:
        return {"error": "timeout", "reply": ""}
    except OSError as exc:
        return {"error": "spawn", "detail": str(exc), "reply": ""}
    out = proc.stdout.decode("utf-8", "replace")
    err = proc.stderr.decode("utf-8", "replace")
    reply = parse_reply(out)
    if not reply and proc.returncode:
        tail = (err or out).strip().splitlines()
        return {"error": "opencode_fail", "detail": (tail[-1] if tail else f"code_{proc.returncode}")[:300], "reply": ""}
    return {"reply": reply, "error": "" if reply else "empty"}


class Handler(BaseHTTPRequestHandler):
    bridge_port: int = 0

    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        sys.stderr.write("[opencode-bridge] " + (fmt % args) + "\n")

    def _auth(self) -> bool:
        if not TOKEN:
            return True
        return self.headers.get("X-Orion-OpenCode") == TOKEN

    def _send(self, code: int, payload: dict) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] != "/health":
            self._send(404, {"error": "not_found"})
            return
        cli = find_cli()
        self._send(
            200,
            {
                "ok": True,
                "cli": cli,
                "model": DEFAULT_MODEL,
                "project": str(PROJECT_DIR),
                "port": self.bridge_port or self.server.server_address[1],
            },
        )

    def do_POST(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] != "/run":
            self._send(404, {"error": "not_found"})
            return
        if not self._auth():
            self._send(403, {"error": "auth"})
            return
        n = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(n).decode("utf-8") or "{}")
        except ValueError:
            self._send(400, {"error": "bad_json"})
            return
        prompt = str(body.get("prompt") or "").strip()
        if not prompt:
            self._send(400, {"error": "empty"})
            return
        timeout = float(body.get("timeout") or TIMEOUT)
        result = run_opencode(
            prompt,
            str(body.get("model") or DEFAULT_MODEL),
            str(body.get("agent") or "orion-commander"),
            timeout,
        )
        self._send(200 if not result.get("error") else 502, result)


def main() -> None:
    alive = existing_bridge_port(token=TOKEN)
    if alive is not None:
        write_runtime(alive)
        print(f"OpenCode bridge already running on :{alive} — not starting a second instance", flush=True)
        return

    cli = find_cli()
    pref = preferred_port()
    print(f"OpenCode bridge prefer :{pref} cli={cli or 'NOT FOUND'} dir={PROJECT_DIR}", flush=True)
    if not cli:
        print("WARNING: opencode CLI not on PATH. Desktop Orion uses the same lookup.", flush=True)

    try:
        httpd, port = pick_listening_server(HOSTS[0], preferred=pref)
    except OSError as exc:
        print(f"bind failed for all candidates: {exc}", flush=True)
        sys.exit(1)

    Handler.bridge_port = port
    runtime = write_runtime(port)
    print(f"OpenCode bridge listening 0.0.0.0:{port} (runtime={runtime})", flush=True)

    th = threading.Thread(target=httpd.serve_forever, daemon=True)
    th.start()
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        pass
    httpd.shutdown()


if __name__ == "__main__":
    main()
