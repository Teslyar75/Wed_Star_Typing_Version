/** Клиент радиорубки — через backend-прокси /api/radio (как desktop stamina/radio/browser). */

export type Station = {
  name: string;
  url_resolved: string;
  favicon?: string;
  country?: string;
  language?: string;
  tags?: string;
  bitrate?: number;
  stationuuid?: string;
};

export type CountryOpt = { name: string; code: string };

function mapStation(raw: Record<string, unknown>): Station | null {
  const url = String(raw.url_resolved || raw.url || "");
  if (!url) return null;
  const tags = String(raw.tags || "").replace(/,/g, " · ");
  return {
    name: String(raw.name || "—").trim() || "—",
    url_resolved: url,
    favicon: String(raw.favicon || "") || undefined,
    country: String(raw.country || raw.countrycode || "") || undefined,
    language: String(raw.language || "") || undefined,
    tags: tags.slice(0, 80) || undefined,
    bitrate: Number(raw.bitrate) || undefined,
    stationuuid: String(raw.stationuuid || "") || undefined,
  };
}

async function getJson(url: string): Promise<unknown> {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

export async function searchStations(opts: {
  name?: string;
  country?: string;
  tag?: string;
  language?: string;
  limit?: number;
}): Promise<Station[]> {
  const q = new URLSearchParams();
  if (opts.name?.trim()) q.set("name", opts.name.trim());
  if (opts.country?.trim()) q.set("country", opts.country.trim());
  if (opts.tag?.trim()) q.set("tag", opts.tag.trim());
  if (opts.language?.trim()) q.set("language", opts.language.trim());
  q.set("limit", String(opts.limit ?? 120));
  const data = (await getJson(`/api/radio/stations/search?${q}`)) as Record<string, unknown>[];
  return (Array.isArray(data) ? data : []).map(mapStation).filter((s): s is Station => !!s);
}

export async function topStations(limit = 120): Promise<Station[]> {
  const data = (await getJson(`/api/radio/stations/top?limit=${limit}`)) as Record<string, unknown>[];
  return (Array.isArray(data) ? data : []).map(mapStation).filter((s): s is Station => !!s);
}

export async function fetchCountries(): Promise<CountryOpt[]> {
  try {
    const data = (await getJson("/api/radio/meta/countries")) as CountryOpt[];
    return Array.isArray(data) ? data.filter((d) => d?.name && d?.code) : [];
  } catch {
    return [];
  }
}

export async function fetchLanguages(): Promise<string[]> {
  try {
    const data = (await getJson("/api/radio/meta/languages")) as string[];
    return Array.isArray(data) ? data.filter(Boolean) : [];
  } catch {
    return [];
  }
}

export async function fetchTags(): Promise<string[]> {
  try {
    const data = (await getJson("/api/radio/meta/tags")) as string[];
    return Array.isArray(data) ? data.filter(Boolean) : [];
  } catch {
    return [];
  }
}
