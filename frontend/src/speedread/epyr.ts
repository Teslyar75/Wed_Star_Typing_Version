/** E-Pyr: строки пирамиды растут по ширине (символы из текста). */

export function buildPyramid(text: string, levels = 7): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return ["★"];
  const lines: string[] = [];
  let width = 3;
  let i = 0;
  for (let L = 0; L < levels; L++) {
    let chunk = "";
    while (chunk.length < width && i < clean.length) {
      chunk += clean[i]!;
      i += 1;
    }
    if (!chunk.trim()) chunk = clean.slice(0, width);
    lines.push(chunk.trim());
    width += 4;
    if (i >= clean.length) i = 0;
  }
  return lines;
}
