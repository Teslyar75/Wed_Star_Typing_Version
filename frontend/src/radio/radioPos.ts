/**
 * Позиция плавающей плашки радио — доли свободного места окна браузера (viewport),
 * как на десктопе (stamina/radio/drag.py). Окно браузера — это и есть «главное окно»:
 * плашка position:fixed едет с ним на любой монитор и при сужении остаётся видимой.
 * null — на своём месте в шапке.
 */
export type Pos = { fx: number; fy: number };
export const POS_KEY = "st_radio_mini_pos";

const c01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

export function toFrac(x: number, y: number, w: number, h: number, vw: number, vh: number): Pos {
  return { fx: c01(vw > w ? x / (vw - w) : 0), fy: c01(vh > h ? y / (vh - h) : 0) };
}

export function fromFrac(p: Pos, w: number, h: number, vw: number, vh: number): { x: number; y: number } {
  return { x: Math.round(c01(p.fx) * Math.max(0, vw - w)), y: Math.round(c01(p.fy) * Math.max(0, vh - h)) };
}

export function loadPos(): Pos | null {
  try {
    const v = JSON.parse(localStorage.getItem(POS_KEY) || "null");
    if (v && typeof v.fx === "number" && typeof v.fy === "number") return { fx: c01(v.fx), fy: c01(v.fy) };
  } catch {
    /* битое значение — по умолчанию */
  }
  return null;
}

export function savePos(p: Pos | null): void {
  try {
    if (p) localStorage.setItem(POS_KEY, JSON.stringify(p));
    else localStorage.removeItem(POS_KEY);
  } catch {
    /* приватный режим */
  }
}
