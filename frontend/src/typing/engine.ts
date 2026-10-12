/** Порт stamina/engine.py — честный CPM, IDLE_CAP, ритм. */

export const IDLE_CAP = 4.0;
export const RHYTHM_WINDOW = 30;
export const SPEED_WINDOW = 25;
export const OK = "ok";
export const ERROR = "error";
export const DONE = "done";

export type PressResult = typeof OK | typeof ERROR | typeof DONE;

export class TypingEngine {
  text: string;
  caseSensitive: boolean;
  index: number;
  typed: number;
  errors: number;
  paused = false;
  streak = 0;
  bestStreak = 0;
  keyStats: Record<string, [number, number]> = {};
  startIndex: number;
  startTyped: number;
  startErrors: number;
  startElapsed: number;

  private _elapsed: number;
  private _last: number | null = null;
  private _intervals: number[] = [];

  constructor(
    text: string,
    opts: { index?: number; typed?: number; errors?: number; elapsed?: number; caseSensitive?: boolean } = {},
  ) {
    this.text = text;
    this.caseSensitive = opts.caseSensitive ?? false;
    this.index = Math.max(0, Math.min(opts.index ?? 0, text.length));
    this.typed = opts.typed ?? 0;
    this.errors = opts.errors ?? 0;
    this._elapsed = opts.elapsed ?? 0;
    this.startIndex = this.index;
    this.startTyped = this.typed;
    this.startErrors = this.errors;
    this.startElapsed = this._elapsed;
  }

  get finished() {
    return this.index >= this.text.length;
  }
  get started() {
    return this._last !== null || this.typed > this.startTyped;
  }
  get current(): string | null {
    return this.finished ? null : this.text[this.index]!;
  }
  get progress() {
    return this.text ? this.index / this.text.length : 0;
  }

  elapsed(now: number) {
    if (this._last === null || this.paused) return this._elapsed;
    return this._elapsed + Math.min(now - this._last, IDLE_CAP);
  }

  cpm(now: number) {
    const el = this.elapsed(now);
    return el > 0.5 ? (this.index * 60) / el : 0;
  }

  instantCpm() {
    const iv = this._intervals.slice(-SPEED_WINDOW);
    if (iv.length < 3) return 0;
    const total = iv.reduce((a, b) => a + b, 0);
    return total > 0 ? (iv.length * 60) / total : 0;
  }

  get accuracy(): number | null {
    if (this.typed === 0) return null;
    return Math.max(0, ((this.typed - this.errors) / this.typed) * 100);
  }

  get rhythm(): number | null {
    const iv = this._intervals.slice(-RHYTHM_WINDOW);
    if (iv.length < 6) return null;
    const mean = iv.reduce((a, b) => a + b, 0) / iv.length;
    if (mean <= 0) return null;
    const variance = iv.reduce((a, b) => a + (b - mean) ** 2, 0) / iv.length;
    const cv = Math.sqrt(variance) / mean;
    return Math.max(0, Math.min(100, 100 - cv * 100));
  }

  pause(now: number) {
    if (this.paused) return;
    this._elapsed = this.elapsed(now);
    this._last = null;
    this.paused = true;
  }

  resume() {
    this.paused = false;
    this._last = null;
  }

  press(char: string, now: number): PressResult | null {
    if (this.finished || !char) return null;
    if (this.paused) this.resume();
    const expected = this.text[this.index]!;
    let dt: number | null = null;
    if (this._last !== null) {
      dt = now - this._last;
      this._elapsed += Math.min(dt, IDLE_CAP);
    }
    this._last = now;
    this.typed += 1;
    const key = expected.toLowerCase();
    if (!this.keyStats[key]) this.keyStats[key] = [0, 0];
    const same = this.caseSensitive ? char === expected : char.toLowerCase() === expected.toLowerCase();
    if (same) {
      this.keyStats[key]![0] += 1;
      this.index += 1;
      this.streak += 1;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      if (dt !== null && dt < IDLE_CAP) {
        this._intervals.push(dt);
        if (this._intervals.length > Math.max(RHYTHM_WINDOW, SPEED_WINDOW)) this._intervals.shift();
      }
      return this.finished ? DONE : OK;
    }
    this.keyStats[key]![1] += 1;
    this.errors += 1;
    this.streak = 0;
    return ERROR;
  }

  segment(now: number) {
    const chars = this.index - this.startIndex;
    const typed = this.typed - this.startTyped;
    const errors = this.errors - this.startErrors;
    const el = this.elapsed(now) - this.startElapsed;
    return {
      chars,
      typed,
      errors,
      elapsed: Math.round(el * 100) / 100,
      cpm: el > 0.5 ? Math.round((chars * 60) / el * 10) / 10 : 0,
      acc: typed ? Math.round(((typed - errors) / typed) * 1000) / 10 : 0,
      rhythm: Math.round((this.rhythm ?? 0) * 10) / 10,
      best_streak: this.bestStreak,
    };
  }
}
