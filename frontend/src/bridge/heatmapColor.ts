/** Desktop parity: stamina/theme.py heat_color + hud Keyboard.set_heat (*4). */

const GREEN_DIM = "#155E36";
const AMBER = "#FFB000";
const RED = "#FF3B5C";
const PANEL = "#1A2430";

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function blend(c1: string, c2: string, t: number): string {
  const u = Math.max(0, Math.min(1, t));
  const [r1, g1, b1] = rgb(c1);
  const [r2, g2, b2] = rgb(c2);
  const hex = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${hex(r1 + (r2 - r1) * u)}${hex(g1 + (g2 - g1) * u)}${hex(b1 + (b2 - b1) * u)}`;
}

/** Continuous green → amber → red for a 0..1 heat level. */
export function heatColor(level: number): string {
  if (level <= 0) return blend(PANEL, GREEN_DIM, 0.6);
  if (level < 0.5) return blend(GREEN_DIM, AMBER, level * 2);
  return blend(AMBER, RED, (level - 0.5) * 2);
}

/**
 * Error rate 0..1 → fill hex (green → amber → red).
 * Uses the raw rate so on-key % labels match perceived heat
 * (desktop multiplies ×4 for a tighter 0–25% band; web shows %).
 * Returns null when there is no heat for the key.
 */
export function colorFor(rate: number | undefined): string | null {
  if (rate == null) return null;
  return heatColor(Math.min(1, Math.max(0, rate)));
}

/** Glass fill strength: hotter raw rates look denser even when hue is capped. */
export function heatFillMix(rate: number): number {
  return Math.round(28 + Math.min(1, rate) * 52);
}
