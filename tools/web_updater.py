# -*- coding: utf-8 -*-
"""Автообновление веб-версии с GitHub: origin/master.

GET  /health  -> {ok}
GET  /status  -> ветка, SHA, отставание, can_apply
POST /apply   -> git fetch + ff-only merge origin/master + docker compose up -d --build

CLI:
  py -3 tools/web_updater.py         HTTP :8766
  py -3 tools/web_updater.py --once  один проход без пересборки Docker
Отключить: WEB_NO_AUTOUPDATE=1
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = int(os.environ.get("WEB_UPDATE_PORT", "8766"))
TOKEN = os.environ.get("WEB_UPDATE_TOKEN", "")
REMOTE = os.environ.get("WEB_UPDATE_REMOTE", "origin")
BRANCH = os.environ.get("WEB_UPDATE_BRANCH", "master")
REPO = Path(__file__).resolve().parents[1]
_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)
_lock = threading.Lock()
_busy = False


def _git(*args: str, timeout: float = 60) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "-C", str(REPO), *args],
        capture_output=True,
        text=True,
        timeout=timeout,
        creationflags=_NO_WINDOW,
    )


def _out(proc: subprocess.CompletedProcess[str]) -> str:
    return (proc.stdout or "").strip()


def plan_update(branch: str, dirty: bool, head: str, remote: str) -> str:
    if os.environ.get("WEB_NO_AUTOUPDATE") == "1":
        return "skip_env"
    if branch != BRANCH:
        return "skip_branch"
    if dirty:
        return "skip_dirty"
    if not remote:
        return "skip_remote"
    if head == remote:
        return "up_to_date"
    return "pull"


def snapshot(*, fetch: bool = True) -> dict:
    if fetch:
        _git("fetch", REMOTE, BRANCH, timeout=90)
    branch = _out(_git("rev-parse", "--abbrev-ref", "HEAD"))
    head = _out(_git("rev-parse", "HEAD"))
    remote_ref = f"{REMOTE}/{BRANCH}"
    rp = _git("rev-parse", remote_ref)
    remote = _out(rp) if rp.returncode == 0 else ""
    porcelain = _out(_git("status", "--porcelain"))
    behind = 0
    if remote:
        cnt = _git("rev-list", "--count", f"HEAD..{remote_ref}")
        if cnt.returncode == 0:
            try:
                behind = int(_out(cnt) or "0")
            except ValueError:
                behind = 0
    dirty = bool(porcelain)
    action = plan_update(branch, dirty, head, remote)
    return {
        "ok": True,
        "repo": str(REPO),
        "branch": branch,
        "head": head[:12],
        "head_full": head,
        "remote": remote[:12],
        "remote_full": remote,
        "behind": behind,
        "dirty": dirty,
        "can_apply": action == "pull",
        "action": action,
        "busy": _busy,
    }


def apply_update(*, rebuild: bool = True) -> dict:
    global _busy
    with _lock:
        if _busy:
            return {"ok": False, "error": "busy"}
        _busy = True
    try:
        snap = snapshot(fetch=True)
        action = snap["action"]
        if action != "pull":
            return {"ok": True, "updated": False, "action": action, **snap}
        merge = _git("merge", "--ff-only", f"{REMOTE}/{BRANCH}", timeout=120)
        if merge.returncode != 0:
            return {
                "ok": False,
                "updated": False,
                "error": "ff_only_failed",
                "detail": (merge.stderr or merge.stdout or "")[-800],
                **snap,
            }
        rebuilt = False
        if rebuild:
            compose = subprocess.run(
                ["docker", "compose", "up", "-d", "--build"],
                cwd=REPO,
                capture_output=True,
                text=True,
                timeout=900,
                creationflags=_NO_WINDOW,
            )
            if compose.returncode != 0:
                return {
                    "ok": False,
                    "updated": True,
                    "error": "compose_failed",
                    "detail": (compose.stderr or compose.stdout or "")[-800],
                }
            rebuilt = True
        after = snapshot(fetch=False)
        after["updated"] = True
        after["rebuilt"] = rebuilt
        after["ok"] = True
        return after
    finally:
        _busy = False


def _auth_ok(handler: BaseHTTPRequestHandler) -> bool:
    if not TOKEN:
        return True
    return handler.headers.get("X-Web-Update") == TOKEN


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        sys.stderr.write("[web-updater] " + (fmt % args) + "\n")

    def _send(self, code: int, payload: dict) -> None:
        blob = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(blob)))
        self.end_headers()
        self.wfile.write(blob)

    def do_GET(self) -> None:  # noqa: N802
        path = self.path.split("?", 1)[0]
        if path == "/health":
            self._send(200, {"ok": True, "port": PORT})
            return
        if path == "/status":
            if not _auth_ok(self):
                self._send(401, {"ok": False, "error": "unauthorized"})
                return
            try:
                self._send(200, snapshot(fetch=True))
            except Exception as exc:  # noqa: BLE001
                self._send(500, {"ok": False, "error": str(exc)[:300]})
            return
        self._send(404, {"ok": False, "error": "not_found"})

    def do_POST(self) -> None:  # noqa: N802
        path = self.path.split("?", 1)[0]
        if path != "/apply":
            self._send(404, {"ok": False, "error": "not_found"})
            return
        if not _auth_ok(self):
            self._send(401, {"ok": False, "error": "unauthorized"})
            return
        length = int(self.headers.get("Content-Length") or "0")
        if length:
            self.rfile.read(length)
        try:
            self._send(200, apply_update(rebuild=True))
        except Exception as exc:  # noqa: BLE001
            self._send(500, {"ok": False, "error": str(exc)[:300]})


def serve() -> None:
    httpd = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"web-updater listening on 0.0.0.0:{PORT} repo={REPO}", flush=True)
    httpd.serve_forever()


def once() -> int:
    try:
        snap = snapshot(fetch=True)
    except Exception as exc:  # noqa: BLE001
        print(f"FAIL fetch: {exc}", flush=True)
        return 1
    action = snap["action"]
    print(
        f"branch={snap['branch']} head={snap['head']} remote={snap['remote']} behind={snap['behind']} action={action}",
        flush=True,
    )
    if action != "pull":
        print(action.upper(), flush=True)
        return 0
    result = apply_update(rebuild=False)
    if not result.get("ok"):
        print(f"FAIL {result.get('error')} {result.get('detail', '')}", flush=True)
        return 1
    print("UPDATED", flush=True)
    return 0


if __name__ == "__main__":
    if "--once" in sys.argv:
        raise SystemExit(once())
    serve()
