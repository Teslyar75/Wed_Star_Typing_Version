/** Чистая логика простоя (тестируется без DOM) — порт stamina/idle. */
export function isIdle(lastActivity: number, now: number, minutes: number): boolean {
  return minutes > 0 && now - lastActivity >= minutes * 60_000;
}

/** Громкость плавного входа: 0 → target за durMs. */
export function fadeVolume(elapsedMs: number, durMs: number, target: number): number {
  if (durMs <= 0) return target;
  return Math.max(0, Math.min(target, (elapsedMs / durMs) * target));
}

type St = { name: string; url_resolved: string; tags?: string };
/** Выбор станции: сначала закреплённые по имени, иначе первая. */
export function pickStation<T extends St>(list: T[], pinned: string[] = []): T | null {
  for (const p of pinned) {
    const hit = list.find((s) => s.name.toLowerCase().includes(p.toLowerCase()));
    if (hit) return hit;
  }
  return list[0] ?? null;
}

/** Порядок волн: сохранённая → pinned → остальные (desktop order_stations). */
export function orderStations<T extends St>(
  stations: T[],
  saved: string | null | undefined,
  pinned: string[] = [],
): T[] {
  const prefs = [...(saved ? [saved] : []), ...pinned].map((p) => p.toLowerCase()).filter(Boolean);
  const rank = (s: St) => {
    const n = s.name.toLowerCase();
    if (saved && n === saved.toLowerCase()) return -1;
    const i = prefs.findIndex((p) => n.includes(p));
    return i === -1 ? prefs.length : i;
  };
  return [...stations].sort((a, b) => rank(a) - rank(b));
}

export function stationGenre(st: { tags?: string }): string {
  const tags = String(st.tags || "")
    .split(/[,·]/)
    .map((t) => t.trim())
    .filter(Boolean);
  return tags.slice(0, 2).join(", ");
}

/** Уникальные станции по url/uuid. */
export function dedupeStations<T extends St & { stationuuid?: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const s of list) {
    const id = s.stationuuid || s.url_resolved;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(s);
  }
  return out;
}
