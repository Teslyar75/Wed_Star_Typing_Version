import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FRONT = "http://127.0.0.1:5173";
const API = "http://127.0.0.1:8000";
const root = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(root, "../backend");
const py =
  process.platform === "win32"
    ? path.join(backend, ".venv", "Scripts", "python.exe")
    : path.join(backend, ".venv", "bin", "python");

/** Свой sqlite для e2e. Стираем только его и только в команде webServer — не в import конфига (worker иначе снесёт таблицы после init_db). */
const wipeE2eDb = `"${py}" -c "from pathlib import Path; [p.unlink(missing_ok=True) for p in Path('.').glob('star_typing_web_e2e.db*')]"`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  fullyParallel: false,
  /* SQLite не держит параллельных писателей: 2 worker = UNIQUE translations + гонки honor. */
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: FRONT,
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      command: `${wipeE2eDb} && "${py}" -m uvicorn app.main:app --host 127.0.0.1 --port 8000`,
      cwd: backend,
      url: `${API}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 90_000,
      env: {
        ...process.env,
        TRANSLATE_OFFLINE: "1",
        DATABASE_URL: "sqlite:///./star_typing_web_e2e.db",
      },
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 5173",
      url: FRONT,
      reuseExistingServer: !process.env.CI,
      timeout: 90_000,
    },
  ],
});
