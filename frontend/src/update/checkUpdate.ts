import { isNewer, markdownToPlain, normalizeVersion } from "./semver";

export const UPDATE_REPO = "Teslyar75/Wed_Star_Typing_Version";
const CACHE_KEY = "st_update_check_v1";
const CACHE_MS = 30 * 60 * 1000;

export type UpdateInfo = {
  current: string;
  latest: string;
  tag: string;
  name: string;
  bodyPlain: string;
  htmlUrl: string;
  available: boolean;
  checkedAt: number;
};

export function appVersion(): string {
  const v = (import.meta.env.VITE_APP_VERSION as string | undefined) || "0.0.0";
  return normalizeVersion(v);
}

type CacheBlob = { at: number; info: UpdateInfo };

function readCache(): UpdateInfo | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as CacheBlob;
    if (!j?.info || Date.now() - j.at > CACHE_MS) return null;
    return j.info;
  } catch {
    return null;
  }
}

function writeCache(info: UpdateInfo): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), info }));
  } catch {
    /* ignore */
  }
}

export async function checkForUpdate(opts?: { force?: boolean }): Promise<UpdateInfo> {
  const current = appVersion();
  if (!opts?.force) {
    const hit = readCache();
    if (hit && hit.current === current) return hit;
  }

  const r = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": `StarTypingWeb/${current}`,
    },
  });
  if (r.status === 404) {
    const empty: UpdateInfo = {
      current,
      latest: current,
      tag: "",
      name: "",
      bodyPlain: "",
      htmlUrl: `https://github.com/${UPDATE_REPO}/releases`,
      available: false,
      checkedAt: Date.now(),
    };
    writeCache(empty);
    return empty;
  }
  if (!r.ok) throw new Error(`GitHub HTTP ${r.status}`);
  const data = (await r.json()) as {
    tag_name?: string;
    name?: string;
    body?: string;
    html_url?: string;
  };
  const tag = data.tag_name || "";
  const latest = normalizeVersion(tag);
  const info: UpdateInfo = {
    current,
    latest,
    tag,
    name: data.name || tag,
    bodyPlain: markdownToPlain(data.body || ""),
    htmlUrl: data.html_url || `https://github.com/${UPDATE_REPO}/releases`,
    available: isNewer(latest, current),
    checkedAt: Date.now(),
  };
  writeCache(info);
  return info;
}
