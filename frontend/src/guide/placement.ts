/** Куда поставить окно гида (px от низа), чтобы не закрыть важные ряды кнопок. */
export const GAP = 14;

export function dialogBottom(vh: number, h: number, avoid: { top: number; bottom: number }[]): number {
  let bottom = GAP;
  // идём снизу вверх: пока окно пересекает ряд — поднимаем над ним
  const rows = [...avoid].sort((a, b) => b.bottom - a.bottom);
  for (const r of rows) {
    const top = vh - bottom - h;
    const bot = vh - bottom;
    if (r.bottom > top && r.top < bot) bottom = Math.max(bottom, vh - r.top + 8);
  }
  return Math.min(bottom, Math.max(GAP, vh - h - GAP));
}
