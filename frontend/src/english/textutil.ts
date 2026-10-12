/** Порт stamina/english/textutil.py — оценка произношения. */

const CONTRACTIONS: Record<string, string> = {
  "don't": "do not",
  "doesn't": "does not",
  "didn't": "did not",
  "can't": "can not",
  cannot: "can not",
  "won't": "will not",
  "wouldn't": "would not",
  "shouldn't": "should not",
  "couldn't": "could not",
  "isn't": "is not",
  "aren't": "are not",
  "wasn't": "was not",
  "weren't": "were not",
  "haven't": "have not",
  "hasn't": "has not",
  "hadn't": "had not",
  "i'm": "i am",
  "you're": "you are",
  "we're": "we are",
  "they're": "they are",
  "he's": "he is",
  "she's": "she is",
  "it's": "it is",
  "that's": "that is",
  "i've": "i have",
  "you've": "you have",
  "we've": "we have",
  "they've": "they have",
  "i'll": "i will",
  "you'll": "you will",
  "we'll": "we will",
  "they'll": "they will",
};

const NUMBERS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen",
  "nineteen", "twenty",
];

export function tokens(text: string): string[] {
  const t = text.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9' ]+/g, " ");
  const out: string[] = [];
  for (const raw of t.split(/\s+/)) {
    let w = raw.replace(/^'+|'+$/g, "");
    if (!w) continue;
    if (CONTRACTIONS[w]) out.push(...CONTRACTIONS[w].split(" "));
    else if (w.endsWith("'s")) out.push(w.slice(0, -2));
    else if (/^\d+$/.test(w) && Number(w) <= 20) out.push(NUMBERS[Number(w)]!);
    else out.push(w);
  }
  return out;
}

export function lev(a: string | string[], b: string | string[]): number {
  if (typeof a === "string" && typeof b === "string") return _levStr(a, b);
  return _levSeq(a as string[], b as string[]);
}

function _levStr(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur.push(Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] !== b[j - 1] ? 1 : 0)));
    }
    prev = cur;
  }
  return prev[b.length]!;
}

function _levSeq(a: string[], b: string[]): number {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur.push(Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] !== b[j - 1] ? 1 : 0)));
    }
    prev = cur;
  }
  return prev[b.length]!;
}

export function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  return 1 - lev(a, b) / Math.max(a.length, b.length);
}

export function wordForms(word: string): Set<string> {
  const w = word.toLowerCase();
  const forms = new Set([w, w + "s", w + "es", w + "ed", w + "d", w + "ing", w + "er", w + "ly"]);
  if (w.endsWith("y") && w.length > 2) {
    forms.add(w.slice(0, -1) + "ies");
    forms.add(w.slice(0, -1) + "ied");
  }
  if (w.endsWith("e")) forms.add(w.slice(0, -1) + "ing");
  return forms;
}

export function scoreSentence(
  expected: string,
  heard: string,
  target?: string | null,
): { score: number; marks: [string, boolean][] } {
  const exp = tokens(expected);
  const got = tokens(heard);
  if (!exp.length) return { score: 0, marks: [] };
  const forms = target ? wordForms(target) : new Set<string>();

  const same = (e: string, g: string) => {
    if (forms.has(e) || e.length <= 3) return e === g || (forms.has(e) && forms.has(g));
    return similarity(e, g) >= 0.8;
  };

  const n = exp.length;
  const m = got.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const ok = same(exp[i - 1]!, got[j - 1]!);
      dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]! + (ok ? 1 : 0));
    }
  }
  const matched = Array(n).fill(false) as boolean[];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (same(exp[i - 1]!, got[j - 1]!) && dp[i]![j] === dp[i - 1]![j - 1]! + 1) {
      matched[i - 1] = true;
      i -= 1;
      j -= 1;
    } else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) i -= 1;
    else j -= 1;
  }
  let score = Math.round((100 * matched.filter(Boolean).length) / n);
  if (target) {
    const hasTarget = exp.some((t) => forms.has(t));
    if (hasTarget && !matched.some((ok, k) => ok && forms.has(exp[k]!))) score = Math.min(score, 59);
  }
  return { score, marks: exp.map((w, k) => [w, matched[k]!]) };
}
