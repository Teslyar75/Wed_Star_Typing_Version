/** Ядро гипердрайва (RSVP) — порт stamina/speedread/rsvp.py */

const WORD_RE = /\S+/g;
const CORE_RE = /[\w\u00C0-\u024F\u0400-\u04FF]/u;
const SENT_END = [".", "!", "?", "…"] as const;
const CLAUSE = [",", ";", ":", "—", "–"] as const;
const CHAPTER_RE =
  /^\s*(глава|часть|книга|розділ|частина|chapter|part|book|kapitel|teil|buch)\b/i;

export type RsvpWord = {
  text: string;
  start: number;
  end: number;
  para_end: boolean;
  sent_end: boolean;
  chapter: boolean;
};

export function tokenize(text: string): RsvpWord[] {
  const words: RsvpWord[] = [];
  const matches = [...text.matchAll(WORD_RE)];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const start = m.index ?? 0;
    const end = start + m[0]!.length;
    const nxt = i + 1 < matches.length ? (matches[i + 1]!.index ?? text.length) : text.length;
    const gap = text.slice(end, nxt);
    const para_end = (gap.match(/\n/g) || []).length >= 2 || i + 1 === matches.length;
    const core = m[0]!.replace(/["'»”“’)\]›«]+$/g, "");
    const sent_end = SENT_END.some((s) => core.endsWith(s)) || para_end;
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    let chapter = false;
    if (lineStart === start || i === 0) {
      const lineEnd = text.indexOf("\n", start);
      const line = text.slice(start, lineEnd >= 0 ? lineEnd : text.length);
      chapter = CHAPTER_RE.test(line) && line.length < 60;
    }
    words.push({ text: m[0]!, start, end, para_end, sent_end, chapter });
  }
  return words;
}

function coreSpan(word: string): [number, number] {
  const letters: number[] = [];
  for (let i = 0; i < word.length; i++) {
    if (CORE_RE.test(word[i]!)) letters.push(i);
  }
  if (!letters.length) return [0, word.length];
  return [letters[0]!, letters[letters.length - 1]! + 1];
}

function orpOffset(length: number): number {
  if (length <= 1) return 0;
  if (length <= 5) return 1;
  if (length <= 9) return 2;
  if (length <= 13) return 3;
  return 4;
}

export function orpIndex(word: string): number {
  const [a, b] = coreSpan(word);
  return a + Math.min(orpOffset(b - a), Math.max(0, b - a - 1));
}

export function frameAt(words: RsvpWord[], start: number, n: number, maxChars = 24): number[] {
  if (start >= words.length) return [];
  const out = [start];
  let length = words[start]!.text.length;
  let i = start;
  while (out.length < n && !words[i]!.sent_end && i + 1 < words.length) {
    const nxt = words[i + 1]!;
    if (length + 1 + nxt.text.length > maxChars || nxt.chapter) break;
    i += 1;
    out.push(i);
    length += 1 + nxt.text.length;
  }
  return out;
}

export function frameText(words: RsvpWord[], frame: number[]): { text: string; orp: number } {
  const parts = frame.map((i) => words[i]!.text);
  const mid = Math.floor((frame.length - 1) / 2);
  const pos = parts.slice(0, mid).reduce((s, p) => s + p.length + 1, 0) + orpIndex(parts[mid]!);
  return { text: parts.join(" "), orp: pos };
}

function multiplier(words: RsvpWord[], frame: number[], punct: boolean): number {
  if (!punct) return 1;
  let m = 1;
  for (const i of frame) {
    const w = words[i]!;
    const [a, b] = coreSpan(w.text);
    const letters = b - a;
    if (letters > 12) m = Math.max(m, 1.6);
    else if (letters > 8) m = Math.max(m, 1.3);
    if (/\d/.test(w.text)) m = Math.max(m, 1.4);
    if (/^[«"“(„[]/.test(w.text)) m = Math.max(m, 1.2);
  }
  const last = words[frame[frame.length - 1]!]!;
  const tail = last.text.replace(/["'»”’)\]]+$/g, "");
  if (last.para_end) m = Math.max(m, 3);
  else if (last.sent_end) m = Math.max(m, 2.2);
  else if (CLAUSE.some((c) => tail.endsWith(c)) || last.text === "—" || last.text === "–") m = Math.max(m, 1.5);
  return m;
}

export function frameMs(words: RsvpWord[], frame: number[], wpm: number, punct = true): number {
  const base = 60000 / Math.max(30, wpm);
  return base * frame.length * multiplier(words, frame, punct);
}

export function prevSentence(words: RsvpWord[], i: number): number {
  const clamp = Math.max(0, Math.min(i, words.length - 1));
  let s = clamp;
  let j = clamp - 1;
  while (j >= 0 && !words[j]!.sent_end) j -= 1;
  s = j + 1;
  if (s === clamp && s > 0) {
    j = s - 1;
    while (j >= 0 && !words[j]!.sent_end) j -= 1;
    s = j + 1;
  }
  return s;
}

export class Ramp {
  wpm: number;
  target: number;
  step: number;
  everyS: number;
  mode: "smooth" | "steps" | "off";
  private acc = 0;
  private words = 0;
  private downs: number[] = [];
  private plateauUntil = 0;
  private clock = 0;

  constructor(start: number, target: number, step = 10, everyS = 30, mode: "smooth" | "steps" | "off" = "smooth") {
    this.wpm = start;
    this.target = target;
    this.step = step;
    this.everyS = everyS;
    this.mode = mode;
  }

  tick(dt: number, wordsRead = 0) {
    this.clock += dt;
    if (this.mode === "off" || this.wpm >= this.target || this.clock < this.plateauUntil) return;
    if (this.mode === "steps") {
      this.words += wordsRead;
      while (this.words >= 500 && this.wpm < this.target) {
        this.words -= 500;
        this.wpm = Math.min(this.target, this.wpm + 50);
      }
      return;
    }
    this.acc += dt;
    while (this.acc >= this.everyS && this.wpm < this.target) {
      this.acc -= this.everyS;
      this.wpm = Math.min(this.target, this.wpm + this.step);
    }
  }

  manual(delta: number) {
    this.wpm = Math.max(100, Math.min(1500, this.wpm + delta));
    this.acc = 0;
    if (delta < 0) {
      this.downs = [...this.downs.filter((t) => this.clock - t < 60), this.clock];
      if (this.downs.length >= 2) {
        this.plateauUntil = this.clock + 120;
        this.downs = [];
      }
    }
  }

  get ramping() {
    return this.mode !== "off" && this.wpm < this.target && this.clock >= this.plateauUntil;
  }
}
