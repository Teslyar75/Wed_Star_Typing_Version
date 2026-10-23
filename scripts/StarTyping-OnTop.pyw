"""Star Typing Web — отдельное окно приложения поверх всех окон (Windows).

Запуск: двойной щелчок по StarTyping-OnTop.vbs (или pythonw StarTyping-OnTop.pyw).
Ни одной консоли: сервера стартуют скрыто (CREATE_NO_WINDOW), сам скрипт — под pythonw.

1. Если бэкенд (:8000) и фронтенд (:5173) не отвечают — запускает их скрыто,
   логи в %LOCALAPPDATA%\\StarTypingWeb\\logs.
2. Открывает Edge (или Chrome) в режиме приложения --app=http://localhost:5173
   с отдельным профилем %LOCALAPPDATA%\\StarTypingWeb\\browser.
3. Раз в 1,5 с ставит окну HWND_TOPMOST (SWP_NOACTIVATE — фокус не крадёт).
   Ctrl+Alt+T — выключить/включить «поверх всех окон».
4. Окно закрыли — скрипт гасит запущенные им сервера и выходит.
"""
from __future__ import annotations

import ctypes
import ctypes.wintypes as wt
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
URL = os.environ.get("ST_WEB_URL", "http://localhost:5173")
TITLE = "Star Typing Web"
PERIOD = 1.5
NO_WINDOW = 0x08000000
DATA = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "StarTypingWeb"
LOGS = DATA / "logs"

user32 = ctypes.windll.user32
HWND_TOPMOST, HWND_NOTOPMOST = -1, -2
user32.SetWindowPos.argtypes = [wt.HWND, wt.HWND, ctypes.c_int, ctypes.c_int,
                                ctypes.c_int, ctypes.c_int, ctypes.c_uint]
user32.SetWindowPos.restype = wt.BOOL
SWP = 0x0001 | 0x0002 | 0x0010          # NOSIZE | NOMOVE | NOACTIVATE
MOD_ALT, MOD_CONTROL, MOD_NOREPEAT, VK_T, WM_HOTKEY = 0x1, 0x2, 0x4000, 0x54, 0x0312
PM_REMOVE = 1


def log(msg: str) -> None:
    try:
        LOGS.mkdir(parents=True, exist_ok=True)
        with open(LOGS / "launcher.log", "a", encoding="utf-8") as f:
            f.write(time.strftime("%Y-%m-%d %H:%M:%S ") + msg + "\n")
    except OSError:
        pass


def port_open(port: int) -> bool:
    # Vite may listen only on ::1, uvicorn only on 127.0.0.1 - check both.
    for host in ("127.0.0.1", "::1"):
        try:
            with socket.create_connection((host, port), timeout=0.5):
                return True
        except OSError:
            pass
    return False


def spawn(cmd: list[str], cwd: Path, name: str) -> subprocess.Popen:
    LOGS.mkdir(parents=True, exist_ok=True)
    out = open(LOGS / f"{name}.log", "ab")
    return subprocess.Popen(cmd, cwd=str(cwd), stdout=out, stderr=subprocess.STDOUT,
                            stdin=subprocess.DEVNULL, creationflags=NO_WINDOW)


def start_servers() -> list[subprocess.Popen]:
    procs = []
    if not port_open(8000):
        be = ROOT / "backend"
        py = be / ".venv" / "Scripts" / "python.exe"
        py = py if py.is_file() else Path(sys.executable.replace("pythonw.exe", "python.exe"))
        procs.append(spawn([str(py), "-m", "uvicorn", "app.main:app", "--port", "8000"], be, "backend"))
        log("backend started")
    if not port_open(5173):
        procs.append(spawn(["cmd.exe", "/c", "npm", "run", "dev"], ROOT / "frontend", "frontend"))
        log("frontend started")
    for _ in range(120):
        if port_open(5173) and port_open(8000):
            break
        time.sleep(0.5)
    return procs


def browser() -> str | None:
    pf = [os.environ.get(k, "") for k in ("ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA")]
    for rel in (r"Microsoft\Edge\Application\msedge.exe", r"Google\Chrome\Application\chrome.exe"):
        for base in pf:
            p = Path(base) / rel
            if base and p.is_file():
                return str(p)
    return None


EnumProc = ctypes.WINFUNCTYPE(wt.BOOL, wt.HWND, wt.LPARAM)


def find_windows() -> list[int]:
    found: list[int] = []

    def cb(h, _l):
        if user32.IsWindowVisible(h):
            n = user32.GetWindowTextLengthW(h)
            if n:
                buf = ctypes.create_unicode_buffer(n + 1)
                user32.GetWindowTextW(h, buf, n + 1)
                cls = ctypes.create_unicode_buffer(64)
                user32.GetClassNameW(h, cls, 64)
                if buf.value.startswith(TITLE) and cls.value.startswith("Chrome_WidgetWin"):
                    found.append(h)
        return True

    user32.EnumWindows(EnumProc(cb), 0)
    return found


def set_top(hwnds: list[int], on: bool) -> None:
    for h in hwnds:
        user32.SetWindowPos(h, HWND_TOPMOST if on else HWND_NOTOPMOST, 0, 0, 0, 0, SWP)


def main() -> None:
    procs = start_servers()
    exe = browser()
    if not exe:
        log("no Edge/Chrome found")
        return
    prof = DATA / "browser"
    prof.mkdir(parents=True, exist_ok=True)
    subprocess.Popen([exe, f"--app={URL}", f"--user-data-dir={prof}", "--no-first-run",
                      "--no-default-browser-check"], creationflags=NO_WINDOW)
    hot = bool(user32.RegisterHotKey(None, 1, MOD_CONTROL | MOD_ALT | MOD_NOREPEAT, VK_T))
    log(f"browser {exe}; hotkey={'Ctrl+Alt+T' if hot else 'busy'}")
    on, seen, t0 = True, False, time.time()
    msg = wt.MSG()
    try:
        while True:
            while user32.PeekMessageW(ctypes.byref(msg), None, 0, 0, PM_REMOVE):
                if msg.message == WM_HOTKEY:
                    on = not on
                    set_top(find_windows(), on)
                    log(f"topmost={on}")
            wins = find_windows()
            if wins:
                seen = True
                if on:
                    set_top(wins, True)
            elif seen or time.time() - t0 > 90:
                break
            time.sleep(PERIOD)
    finally:
        if hot:
            user32.UnregisterHotKey(None, 1)
        for p in procs:
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(p.pid)], capture_output=True,
                           creationflags=NO_WINDOW)
        log("exit")


if __name__ == "__main__":
    main()
