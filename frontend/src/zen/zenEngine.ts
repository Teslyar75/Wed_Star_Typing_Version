/** Порт stamina/zen_engine.py — набор по словам, формулы WPM/raw/acc. */
export const COUNTS = { time: [15, 30, 60, 120] as const, words: [10, 25, 50, 100] as const };
export type ZenMode = "time" | "words" | "quote" | "zen" | "custom";

const PUNCT = /[^\w'’-]+/gu;

export function prepareWords(text: string, punctuation = false, numbers = false): string[] {
  let raw = (text || "").split(/\s+/).filter(Boolean);
  if (!punctuation) {
    raw = raw.flatMap((w) => w.replace(/-{2,}/g, " ").replace(PUNCT, " ").split(/\s+/).filter(Boolean));
  }
  const out: string[] = [];
  for (let w of raw) {
    if (!punctuation) w = w.replace(/^['’-]+|['’-]+$/g, "").toLowerCase();
    if (!w) continue;
    if (!numbers && /\d/.test(w)) {
      w = w.replace(/\d/g, "").replace(/^['’-]+|['’-]+$/g, "");
      if (!w) continue;
    }
    out.push(w);
  }
  return out;
}

export function quoteSlice(text: string, startWord: number, minWords = 12, maxWords = 80): number {
  const words = (text || "").split(/\s+/).filter(Boolean).slice(startWord);
  for (let i = 0; i < Math.min(words.length, maxWords); i++) {
    const w = words[i] || "";
    if (i + 1 >= minWords && /[.!?…]"?'?$/.test(w.replace(/[»"')]+$/, ""))) return i + 1;
  }
  return Math.min(words.length, maxWords);
}

function kogasa(cov: number): number {
  return 100 * (1 - Math.tanh(cov + cov ** 3 / 3 + cov ** 5 / 5));
}

export class PortalTest {
  words: string[];
  mode: string;
  limit: number;
  inputs: string[] = [""];
  wi = 0;
  t0: number | null = null;
  tEnd: number | null = null;
  correctKeys = 0;
  totalKeys = 0;
  samples: [number, number, number][] = [];
  private secKeys = 0;
  private secErr = 0;
  private secNext = 0;

  constructor(words: string[], mode = "words", limit = 0) {
    this.words = words.length ? words : ["…"];
    this.mode = mode;
    this.limit = limit;
  }

  get started() {
    return this.t0 != null;
  }
  get finished() {
    return this.tEnd != null;
  }
  elapsed(now = performance.now() / 1000) {
    if (this.t0 == null) return 0;
    const end = this.tEnd ?? now;
    return Math.max(0, end - this.t0);
  }
  wordOk(i: number) {
    return i < this.inputs.length && this.inputs[i] === this.words[i];
  }

  private begin(now: number) {
    if (this.t0 == null) {
      this.t0 = now;
      this.secNext = now + 1;
    }
  }
  private key(ok: boolean, now: number) {
    this.totalKeys += 1;
    if (ok) this.correctKeys += 1;
    this.secKeys += 1;
    if (!ok) this.secErr += 1;
    this.tick(now);
  }

  typeChar(ch: string, now = performance.now() / 1000) {
    if (this.finished || !ch) return;
    if (ch === " ") {
      const cur = this.inputs[this.wi] || "";
      if (!cur) return;
      this.begin(now);
      this.key(cur === this.words[this.wi], now);
      if (this.wi + 1 >= this.words.length) {
        this.finish(now);
        return;
      }
      this.wi += 1;
      if (this.inputs.length <= this.wi) this.inputs.push("");
      this.checkEnd(now);
      return;
    }
    this.begin(now);
    const cur = this.inputs[this.wi] || "";
    const target = this.words[this.wi] || "";
    const ok = cur.length < target.length && target[cur.length] === ch;
    if (cur.length >= target.length + 20) return;
    this.inputs[this.wi] = cur + ch;
    this.key(ok, now);
    if (this.wi === this.words.length - 1 && this.inputs[this.wi] === target) this.finish(now);
  }

  backspace(word = false) {
    if (this.finished) return;
    const cur = this.inputs[this.wi] || "";
    if (cur) {
      this.inputs[this.wi] = word ? "" : cur.slice(0, -1);
      return;
    }
    if (this.wi > 0 && !this.wordOk(this.wi - 1)) {
      this.inputs.pop();
      this.wi -= 1;
      if (word) this.inputs[this.wi] = "";
    }
  }

  tick(now = performance.now() / 1000) {
    if (this.t0 == null || this.finished) return;
    while (now >= this.secNext) {
      const el = this.secNext - this.t0;
      this.samples.push([this.wpm(el), (this.secKeys * 60) / 5, this.secErr]);
      this.secKeys = 0;
      this.secErr = 0;
      this.secNext += 1;
    }
    this.checkEnd(now);
  }

  private checkEnd(now: number) {
    if (this.mode === "time" && this.limit && this.t0 != null && now - this.t0 >= this.limit) {
      this.finish(this.t0 + this.limit);
    }
  }

  finish(now = performance.now() / 1000) {
    if (this.finished) return;
    if (this.t0 == null) this.t0 = now;
    this.tEnd = now;
  }

  private wpmChars() {
    let n = 0;
    for (let k = 0; k < Math.min(this.wi, this.words.length); k++) {
      if (this.inputs[k] === this.words[k]) n += (this.words[k] || "").length + 1;
    }
    if (this.wi < this.inputs.length) {
      const inp = this.inputs[this.wi] || "";
      const w = this.words[this.wi] || "";
      if (inp === w || (this.mode === "time" && w.startsWith(inp))) n += inp.length;
    }
    return n;
  }

  wpm(el?: number) {
    const e = el ?? this.elapsed();
    return e > 0 ? this.wpmChars() / 5 / (e / 60) : 0;
  }
  raw(el?: number) {
    const e = el ?? this.elapsed();
    const typed = this.inputs.reduce((a, s) => a + s.length, 0) + this.wi;
    return e > 0 ? typed / 5 / (e / 60) : 0;
  }
  acc() {
    return this.totalKeys ? (100 * this.correctKeys) / this.totalKeys : 100;
  }
  consistency() {
    const raws = this.samples.map((s) => s[1]);
    if (raws.length < 2) return raws.length ? 100 : 0;
    const mean = raws.reduce((a, b) => a + b, 0) / raws.length;
    if (mean <= 0) return 100;
    const vr = raws.reduce((a, b) => a + (b - mean) ** 2, 0) / raws.length;
    return Math.max(0, kogasa(Math.sqrt(vr) / mean));
  }
  progressLabel() {
    if (this.mode === "time" && this.limit) return String(Math.max(0, Math.ceil(this.limit - this.elapsed())));
    return `${this.wi}/${this.words.length}`;
  }
  result() {
    const el = this.elapsed();
    return {
      ts: Date.now() / 1000,
      mode: this.mode,
      mode2: this.limit,
      wpm: Math.round(this.wpm(el) * 100) / 100,
      raw: Math.round(this.raw(el) * 100) / 100,
      acc: Math.round(this.acc() * 100) / 100,
      consistency: Math.round(this.consistency() * 100) / 100,
      time: Math.round(el * 100) / 100,
      words: this.wi + (this.finished && this.mode !== "time" ? 1 : 0),
    };
  }
}
