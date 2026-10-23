/** Звёздные карты в alt: сетка по размеру окна — порт SetsPage (5897486).
 *  Десктоп: cols = max(2, min(6, (w+6)//(Tile.W*0.8+6))). В вебе нет прокрутки,
 *  поэтому и ряды считаем по высоте: страница = cols×rows. */
export type StarGrid = { cols: number; rows: number; size: number };

export const TILE_W = 150;
export const TILE_H = 92;
export const GAP = 6;

export function fitStarGrid(w: number, h: number, maxCols = 6, maxRows = 6): StarGrid {
  const cols = Math.max(2, Math.min(maxCols, Math.floor((w + GAP) / (TILE_W + GAP)) || 0));
  const rows = Math.max(1, Math.min(maxRows, Math.floor((h + GAP) / (TILE_H + GAP)) || 0));
  return { cols, rows, size: cols * rows };
}

/** Сохранить первую видимую карточку при смене размера страницы. */
export function remapPage(page: number, oldSize: number, newSize: number): number {
  if (oldSize === newSize || newSize <= 0) return page;
  return Math.floor((page * oldSize) / newSize);
}
