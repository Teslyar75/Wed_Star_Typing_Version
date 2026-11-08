/** Поколение запросов: поздний ответ не пишет в state после смены вкладки/unmount. */

export type Epoch = {
  next: () => number;
  is: (n: number) => boolean;
  invalidate: () => void;
};

export function createEpoch(): Epoch {
  let cur = 0;
  return {
    next() {
      cur += 1;
      return cur;
    },
    is(n) {
      return n === cur;
    },
    invalidate() {
      cur += 1;
    },
  };
}

export function isAbortError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === "AbortError") return true;
  return e instanceof Error && e.name === "AbortError";
}
