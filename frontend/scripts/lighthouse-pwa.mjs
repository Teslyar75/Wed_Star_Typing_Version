/**
 * Lighthouse 11 PWA category (в LH≥12 категория удалена — держим 11.x).
 * Цель WEB_PLAN: ≥ 90.
 */
import { spawn } from "node:child_process";
import net from "node:net";
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";

const port = 4173;

function waitOpen(ms = 45000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const c = net.connect(port, "127.0.0.1", () => {
        c.end();
        resolve();
      });
      c.on("error", () => {
        if (Date.now() - start > ms) reject(new Error("preview timeout"));
        else setTimeout(tick, 300);
      });
    };
    tick();
  });
}

const preview = spawn("npx vite preview --host 127.0.0.1 --port " + port, {
  stdio: "ignore",
  shell: true,
});

try {
  await waitOpen();
  const chrome = await chromeLauncher.launch({
    chromeFlags: ["--headless", "--no-sandbox", "--disable-gpu"],
  });
  const result = await lighthouse(`http://127.0.0.1:${port}/`, {
    port: chrome.port,
    onlyCategories: ["pwa"],
    output: "json",
  });
  await chrome.kill();
  const score = Math.round((result?.lhr?.categories?.pwa?.score ?? 0) * 100);
  console.log(`PWA score: ${score}`);
  for (const a of Object.values(result?.lhr?.audits || {})) {
    if (a.score !== null && a.score < 1) console.log(`- ${a.id}: ${a.title}`);
  }
  if (score < 90) {
    console.error(`PWA score ${score} < 90`);
    process.exitCode = 1;
  }
} finally {
  preview.kill();
}
