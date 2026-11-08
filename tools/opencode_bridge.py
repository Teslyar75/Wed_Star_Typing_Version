# -*- coding: utf-8 -*-
"""Мост OpenCode на хосте Windows: веб-бэкенд в Docker зовёт CLI пилота.

POST /run  {prompt, model, agent}  →  {reply} | {error}
GET  /health                       →  {ok, cli, model}

Слушает 127.0.0.1 и 0.0.0.0:8765, чтобы host.docker.internal из контейнера достал CLI.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = int(os.environ.get("ORION_OPENCODE_PORT", "8765"))
HOSTS = ("0.0.0.0",)
DEFAULT_MODEL = "opencode/deepseek-v4.1-flash-free"
TIMEOUT = float(os.environ.get("ORION_OPENCODE_TIMEOUT", "180"))
TOKEN = os.environ.get("ORION_OPENCODE_TOKEN", "")
HERE = Path(__file__).resolve()
# tools/ → web_star_typing → My_New_Stamina
PROJECT_DIR = HERE.parents[2] if (HERE.parents[2] / "stamina").is_dir() else HERE.parents[1]
_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)


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
        self._send(200, {"ok": True, "cli": cli, "model": DEFAULT_MODEL, "project": str(PROJECT_DIR)})

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
    cli = find_cli()
    print(f"OpenCode bridge :{PORT} cli={cli or 'NOT FOUND'} dir={PROJECT_DIR}", flush=True)
    if not cli:
        print("WARNING: opencode CLI not on PATH. Desktop Orion uses the same lookup.", flush=True)

    servers = []
    for host in HOSTS:
        try:
            httpd = ThreadingHTTPServer((host, PORT), Handler)
        except OSError as exc:
            print(f"bind {host}:{PORT} failed: {exc}", flush=True)
            continue
        th = threading.Thread(target=httpd.serve_forever, daemon=True)
        th.start()
        servers.append(httpd)
        print(f"listening {host}:{PORT}", flush=True)
    if not servers:
        sys.exit(1)
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        pass
    for s in servers:
        s.shutdown()


if __name__ == "__main__":
    main()
