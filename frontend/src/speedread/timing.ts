/** RSVP-тайминг на базе performance.now / rAF-слотов. */

export function msPerWord(wpm: number): number {
  return 60000 / Math.max(1, wpm);
}

/** Сколько слов должно пройти за elapsedMs при заданном WPM. */
export function wordsElapsed(wpm: number, elapsedMs: number): number {
  return Math.floor(elapsedMs / msPerWord(wpm));
}

/**
 * Проверка дрейфа: при идеальном rAF дрейф на одно слово < toleranceMs.
 * Возвращает абсолютную ошибку слота (мс).
 */
export function slotErrorMs(wpm: number, firedAtMs: number, wordIndex: number): number {
  const ideal = wordIndex * msPerWord(wpm);
  return Math.abs(firedAtMs - ideal);
}
