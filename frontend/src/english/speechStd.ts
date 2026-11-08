/** Единый стандарт оценки речи — как stamina/english/speech_std.py. */

export const ITEM_OK = 80;
export const RUN_OK = 85;
export const ADVANCE_MS = 900;

export function passed(score: number | null | undefined): boolean {
  return score != null && Math.round(score) >= ITEM_OK;
}

export function scheduleAdvance(
  step: () => void,
  stillSame: () => boolean,
  delayMs = ADVANCE_MS,
): number {
  return window.setTimeout(() => {
    if (stillSame()) step();
  }, delayMs);
}
