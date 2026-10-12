/**
 * Скачивает small en-us модель для vosk-browser в public/models/.
 * Источник: демо vosk-browser (уже tar.gz).
 */
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(ROOT, "../public/models");
const OUT = path.join(OUT_DIR, "vosk-model-small-en-us.tar.gz");
const URL =
  process.env.VOSK_MODEL_URL ||
  "https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz";

await mkdir(OUT_DIR, { recursive: true });
console.log("Downloading", URL);
const res = await fetch(URL);
if (!res.ok || !res.body) {
  console.error("Failed:", res.status);
  process.exit(1);
}
await pipeline(res.body, createWriteStream(OUT));
console.log("Saved", OUT);
