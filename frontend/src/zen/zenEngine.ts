/** Движок «портала» — порт desktop stamina/zen_engine.py (поведение и формулы как у Monkeytype).
 *  wpm = (символы верных слов + пробелы) / 5 / мин; raw = все символы / 5 / мин;
 *  acc = верные нажатия / все; consistency = 100·(1 − tanh(c + c³/3 + c⁵/5)), c = σ/μ посекундного raw. */

export type ZenMode = "time" | "words" | "quote" | "zen" | "custom";
export const COUNTS: Record<"time" | "words", number[]> = { time: [15, 30, 60, 120], words: [10, 25, 50, 100] };

export type SrcWord = { word: string; end: number };

const PUNCT = /[^\p{L}\p{N}_'’-]+/gu;

function cleanWord(raw: string, punctuation: boolean, numbers: boolean): string {
  let w = raw;
  if (!punctuation) w = w.replace(PUNCT, "").replace(/^['’-]+|['’-]+$/g, "").toLowerCase();
  if (!w) return "";
  if (!numbers && /\d/.test(w)) {
    if (!punctuation || /^\d+$/.test(w.replace(/[.,;:!?()"«»]/g, ""))) {
      w = w.replace(/\d/g, "").replace(/^['’-]+|['’-]+$/g, "");
    }
  }
  return w;
}

/** Слова из текста мостика с конечной позицией (в символах text) — чтобы вернуть прогресс на мостик. */
export function prepareWords(
  text: string,
  from = 0,
  opts: { punctuation?: boolean; numbers?: boolean; limit?: number } = {},
): SrcWord[] {
  const out: SrcWord[] = [];
  const re = /\S+/g;
  re.lastIndex = Math.max(0, from);
  let m: RegExpExecArray | null;
  const limit = opts.limit ?? 1000;
  while ((m = re.exec(text)) && out.length < limit) {
    let end = m.index + m[0].length;
    while (end < text.length && /\s/.test(text[end]!)) end++;
    // знак между буквами — граница слова: «hello—world» → два слова, а не «helloworld»
    const parts = opts.punctuation ? [m[0]] : m[0].split(/[^\p{L}\p{N}_'’-]+|-{2,}/u).filter(Boolean);
    let off = m.index;
    parts.forEach((part, k) => {
      const at = text.indexOf(part, off);
      off = at + part.length;
      const w = cleanWord(part, !!opts.punctuation, !!opts.numbers);
      if (!w || out.length >= limit) return;
      out.push({ word: w, end: k === parts.length - 1 ? end : off });
    });
  }
  return out;
}

/** Для quote: до конца предложения, 12…80 слов. */
export function quoteLen(text: string, from: number, min = 12, max = 80): number {
  const words = text.slice(from).split(/\s+/).filter(Boolean);
  for (let i = 0; i < Math.min(words.length, max); i++) {
    if (i + 1 >= min && /[.!?…]$/.test(words[i]!.replace(/[»"')]+$/, ""))) return i + 1;
  }
  return Math.min(words.length, max);
}

export function kogasa(cov: number): number {
  return 100 * (1 - Math.tanh(cov + cov ** 3 / 3 + cov ** 5 / 5));
}

export type ZenResult = {
  ts: number; mode: ZenMode; mode2: number; wpm: number; raw: number; acc: number;
  consistency: number; time: number; words: number;
  chars: { correct: number; incorrect: number; extra: number; missed: number };
  samples: { wpm: number; raw: number; err: number }[];
};

const now0 = () => performance.now() / 1000;

export class PortalTest {
  words: string[];
  mode: ZenMode;
  limit: number;
  inputs: string[] = [""];
  wi = 0;
  t0: number | null = null;
  tEnd: number | null = null;
  correctKeys = 0;
  totalKeys = 0;
  samples: { wpm: number; raw: number; err: number }[] = [];
  private secKeys = 0;
  private secErr = 0;
  private secNext = 0;

  constructor(words: string[], mode: ZenMode = "words", limit = 0) {
    this.words = words.length ? [...words] : ["…"];
    this.mode = mode;
    this.limit = limit;
  }

  get started() { return this.t0 !== null; }
  get finished() { return this.tEnd !== null; }

  elapsed(now?: number) {
    if (this.t0 === null) return 0;
    const end = this.tEnd ?? now ?? now0();
    return Math.max(0, end - this.t0);
  }

  wordOk(i: number) { return i < this.inputs.length && this.inputs[i] === this.words[i]; }

  private begin(now: number) {
    if (this.t0 === null) { this.t0 = now; this.secNext = now + 1; }
  }

  private key(ok: boolean, now: number) {
    this.totalKeys++;
    if (ok) this.correctKeys++;
    this.secKeys++;
    if (!ok) this.secErr++;
    this.tick(now);
  }

  typeChar(ch: string, now = now0()) {
    if (this.finished || !ch) return;
    if (ch === " ") {
      const cur = this.inputs[this.wi]!;
      if (!cur) return;
      this.begin(now);
      this.key(cur === this.words[this.wi], now);
      if (this.wi + 1 >= this.words.length) { this.finish(now); return; }
      this.wi++;
      if (this.inputs.length <= this.wi) this.inputs.push("");
      this.checkEnd(now);
      return;
    }
    this.begin(now);
    const cur = this.inputs[this.wi]!;
    const target = this.words[this.wi]!;
    if (cur.length >= target.length + 20) return;
    const ok = cur.length < target.length && target[cur.length] === ch;
    this.inputs[this.wi] = cur + ch;
    this.key(ok, now);
    if (this.wi === this.words.length - 1 && this.inputs[this.wi] === target) this.finish(now);
  }

  backspace(word = false) {
    if (this.finished) return;
    const cur = this.inputs[this.wi]!;
    if (cur) { this.inputs[this.wi] = word ? "" : cur.slice(0, -1); return; }
    if (this.wi > 0 && !this.wordOk(this.wi - 1)) {
      this.inputs.pop();
      this.wi--;
      if (word) this.inputs[this.wi] = "";
    }
  }

  tick(now = now0()) {
    if (this.t0 === null || this.finished) return;
    const cap = this.mode === "time" && this.limit ? this.t0 + this.limit : Infinity;
    while (now >= this.secNext && this.secNext <= cap) {
      const el = this.secNext - this.t0;
      this.samples.push({ wpm: this.wpm(el), raw: (this.secKeys * 60) / 5, err: this.secErr });
      this.secKeys = this.secErr = 0;
      this.secNext += 1;
    }
    this.checkEnd(now);
  }

  private checkEnd(now: number) {
    if (this.mode === "time" && this.limit && this.t0 !== null && now - this.t0 >= this.limit) this.finish(this.t0 + this.limit);
  }

  finish(now = now0()) {
    if (this.finished) return;
    if (this.t0 === null) this.t0 = now;
    this.tEnd = now;
  }

  chars() {
    let c = 0, i = 0, x = 0, m = 0;
    const last = this.wi;
    for (let k = 0; k < Math.min(this.inputs.length, this.words.length); k++) {
      const inp = this.inputs[k]!, w = this.words[k]!;
      for (let j = 0; j < inp.length; j++) {
        if (j >= w.length) x++;
        else if (inp[j] === w[j]) c++;
        else i++;
      }
      if (k < last || (k === last && this.finished && this.mode !== "time")) m += Math.max(0, w.length - inp.length);
      if (k < last && inp === w) c++;
    }
    return { correct: c, incorrect: i, extra: x, missed: m };
  }

  private wpmChars() {
    let n = 0;
    for (let k = 0; k < Math.min(this.wi, this.words.length); k++) if (this.inputs[k] === this.words[k]) n += this.words[k]!.length + 1;
    if (this.wi < this.inputs.length) {
      const inp = this.inputs[this.wi]!, w = this.words[this.wi]!;
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
    const typed = this.inputs.reduce((s, x) => s + x.length, 0) + this.wi;
    return e > 0 ? typed / 5 / (e / 60) : 0;
  }

  acc() { return this.totalKeys ? (100 * this.correctKeys) / this.totalKeys : 100; }

  consistency() {
    const r = this.samples.map((s) => s.raw);
    if (!r.length) return 0;
    const mean = r.reduce((a, b) => a + b, 0) / r.length;
    if (r.length < 2 || mean <= 0) return 100;
    const sd = Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / r.length);
    return Math.max(0, kogasa(sd / mean));
  }

  progressLabel() {
    if (this.mode === "time" && this.limit) return String(Math.max(0, Math.ceil(this.limit - this.elapsed())));
    return `${this.wi}/${this.words.length}`;
  }

  /** Сколько слов набрано верно подряд от начала до последнего верного — индекс за ним (для мостика). */
  lastCorrectWord(): number {
    let last = -1;
    const done = this.finished && this.inputs[this.wi] === this.words[this.wi] ? this.wi + 1 : this.wi;
    for (let k = 0; k < done; k++) if (this.inputs[k] === this.words[k]) last = k;
    return last;
  }

  result(): ZenResult {
    const el = this.elapsed();
    const r2 = (v: number) => Math.round(v * 100) / 100;
    return {
      ts: Date.now() / 1000, mode: this.mode, mode2: this.limit,
      wpm: r2(this.wpm(el)), raw: r2(this.raw(el)), acc: r2(this.acc()), consistency: r2(this.consistency()),
      time: r2(el), chars: this.chars(), samples: this.samples,
      words: this.wi + (this.finished && this.mode !== "time" ? 1 : 0),
    };
  }
}
