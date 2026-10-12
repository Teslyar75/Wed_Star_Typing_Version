/** Порт stamina/bridge.py — слово под прицелом и индекс буквы в слове. */

/** Слово под прицелом: токен вокруг index; на пробеле — следующее слово. */
export function wordAt(text: string, index: number): string {
  if (!text || index < 0) return "";
  let i = index;
  if (i >= text.length) i = text.length - 1;
  if (text[i] !== " ") {
    let a = i;
    while (a > 0 && text[a - 1] !== " ") a--;
    let b = i;
    while (b < text.length && text[b] !== " ") b++;
    return text.slice(a, b);
  }
  let j = i + 1;
  while (j < text.length && text[j] === " ") j++;
  let k = j;
  while (k < text.length && text[k] !== " ") k++;
  return text.slice(j, k);
}

/** Индекс текущей буквы внутри слова (−1, если сейчас пробел). */
export function wordCursor(text: string, index: number): number {
  if (!text || index < 0 || index >= text.length || text[index] === " ") return -1;
  let start = index;
  while (start > 0 && text[start - 1] !== " ") start--;
  return index - start;
}

/** Предложение вокруг позиции (грубо по .!? или весь текст). */
export function sentenceAround(text: string, index: number): string {
  if (!text) return "";
  const i = Math.max(0, Math.min(index, text.length - 1));
  let a = i;
  while (a > 0 && !/[.!?…]/.test(text[a - 1]!)) a--;
  while (a < text.length && /\s/.test(text[a]!)) a++;
  let b = i;
  while (b < text.length && !/[.!?…]/.test(text[b]!)) b++;
  if (b < text.length) b++;
  return text.slice(a, b).trim() || text.slice(Math.max(0, i - 40), Math.min(text.length, i + 60)).trim();
}
