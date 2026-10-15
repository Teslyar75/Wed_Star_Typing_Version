/** Чистая логика простоя (тестируется без DOM). */
export function isIdle(lastActivity: number, now: number, minutes: number): boolean {
  return minutes > 0 && now - lastActivity >= minutes * 60_000;
}

/** Громкость плавного входа: 0 → target за durMs. */
export function fadeVolume(elapsedMs: number, durMs: number, target: number): number {
  if (durMs <= 0) return target;
  return Math.max(0, Math.min(target, (elapsedMs / durMs) * target));
}

type St = { name: string; url_resolved: string };
/** Выбор станции: сначала закреплённые по имени, иначе первая. */
export function pickStation<T extends St>(list: T[], pinned: string[] = []): T | null {
  for (const p of pinned) {
    const hit = list.find((s) => s.name.toLowerCase().includes(p.toLowerCase()));
    if (hit) return hit;
  }
  return list[0] ?? null;
}
