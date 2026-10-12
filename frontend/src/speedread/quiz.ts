/** Упрощённый порт stamina/speedread/quiz.py — «было ли слово». */

const DECOYS = [
  "mountain", "silver", "engine", "harbour", "violin", "blanket", "garden", "planet", "captain", "pocket",
];

function core(w: string) {
  return w.toLowerCase().replace(/[^a-zа-яёіїєґ0-9']/gi, "");
}

export type QuizItem = {
  kind: "seen";
  question: string;
  options: [string, string];
  answer: 0 | 1; // 0 = да, 1 = нет
};

export function makeQuiz(text: string, lang = "en"): QuizItem[] {
  const words = text
    .split(/\s+/)
    .map(core)
    .filter((w) => w.length >= 5);
  if (words.length < 8) return [];
  const uniq = [...new Set(words)];
  const yes = uniq.slice(0, 3);
  const noPool = DECOYS.filter((d) => !uniq.includes(d));
  const no = noPool.slice(0, 3);
  const da = lang === "en" ? "YES" : "ДА";
  const net = lang === "en" ? "NO" : "НЕТ";
  const items: QuizItem[] = [
    ...yes.map((w) => ({
      kind: "seen" as const,
      question: lang === "en" ? `Was the word “${w}” in the text?` : `Было ли в тексте слово «${w}»?`,
      options: [da, net] as [string, string],
      answer: 0 as const,
    })),
    ...no.map((w) => ({
      kind: "seen" as const,
      question: lang === "en" ? `Was the word “${w}” in the text?` : `Было ли в тексте слово «${w}»?`,
      options: [da, net] as [string, string],
      answer: 1 as const,
    })),
  ];
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}
