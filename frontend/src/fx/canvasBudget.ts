import type { SpaceProfile } from "./livingSpace";

/** Автовыбор профиля фона: слабый CPU / save-data / reduced-motion → frost. */
export function detectSpaceProfile(stored?: string | null): SpaceProfile {
  if (stored === "frost" || stored === "light" || stored === "full") return stored;
  if (typeof window === "undefined") return "light";
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "frost";
    const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
    if (nav.connection?.saveData) return "frost";
    if (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4) return "frost";
    if (typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency <= 4) return "frost";
  } catch {
    /* ignore */
  }
  return "light";
}
