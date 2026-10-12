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

const FALLBACK = "https://de1.api.radio-browser.info";
let baseUrl = FALLBACK;

export async function pickRadioServer(): Promise<string> {
  try {
    const r = await fetch("https://all.api.radio-browser.info/json/servers");
    if (!r.ok) return (baseUrl = FALLBACK);
    const list = (await r.json()) as { name: string }[];
    const host = list[Math.floor(Math.random() * list.length)]?.name;
    if (host) baseUrl = `https://${host}`;
  } catch {
    baseUrl = FALLBACK;
  }
  return baseUrl;
}

function mapStation(raw: Record<string, unknown>): Station | null {
  const url = String(raw.url_resolved || raw.url || "");
  if (!url) return null;
  const tags = String(raw.tags || "").replace(/,/g, " · ");
  return {
    name: (String(raw.name || "—").trim() || "—"),
    url_resolved: url,
    favicon: String(raw.favicon || "") || undefined,
    country: String(raw.country || raw.countrycode || "") || undefined,
    language: String(raw.language || "") || undefined,
    tags: tags.slice(0, 80) || undefined,
    bitrate: Number(raw.bitrate) || undefined,
    stationuuid: String(raw.stationuuid || "") || undefined,
  };
}

export async function searchStations(opts: {
  name?: string;
  country?: string;
  tag?: string;
  language?: string;
  limit?: number;
}): Promise<Station[]> {
  await pickRadioServer();
  const q = new URLSearchParams();
  if (opts.name) q.set("name", opts.name);
  if (opts.country) {
    if (opts.country.length === 2) q.set("countrycode", opts.country.toUpperCase());
    else q.set("country", opts.country);
  }
  if (opts.tag) q.set("tag", opts.tag);
  if (opts.language) q.set("language", opts.language);
  q.set("limit", String(opts.limit ?? 80));
  q.set("hidebroken", "true");
  q.set("order", "clickcount");
  q.set("reverse", "true");
  const r = await fetch(`${baseUrl}/json/stations/search?${q}`);
  if (!r.ok) throw new Error(String(r.status));
  const data = (await r.json()) as Record<string, unknown>[];
  return data.map(mapStation).filter((s): s is Station => !!s);
}

export async function topStations(limit = 70): Promise<Station[]> {
  await pickRadioServer();
  const r = await fetch(`${baseUrl}/json/stations/topvote/${limit}`);
  if (!r.ok) throw new Error(String(r.status));
  const data = (await r.json()) as Record<string, unknown>[];
  return data.map(mapStation).filter((s): s is Station => !!s);
}

export async function fetchCountries(): Promise<CountryOpt[]> {
  await pickRadioServer();
  const r = await fetch(`${baseUrl}/json/countries?order=stationcount&reverse=true`);
  if (!r.ok) return [];
  const data = (await r.json()) as { name?: string; iso_3166_1?: string }[];
  return data
    .filter((d) => d.name && d.iso_3166_1)
    .slice(0, 120)
    .map((d) => ({ name: d.name!, code: d.iso_3166_1! }));
}

export async function fetchLanguages(): Promise<string[]> {
  await pickRadioServer();
  const r = await fetch(`${baseUrl}/json/languages?order=stationcount&reverse=true&limit=80`);
  if (!r.ok) return [];
  const data = (await r.json()) as { name?: string }[];
  return data.map((d) => d.name).filter((n): n is string => !!n);
}

export async function fetchTags(): Promise<string[]> {
  await pickRadioServer();
  const r = await fetch(`${baseUrl}/json/tags?order=stationcount&reverse=true&limit=100`);
  if (!r.ok) return [];
  const data = (await r.json()) as { name?: string; stationcount?: number }[];
  return data
    .filter((d) => d.name && (d.stationcount || 0) > 5)
    .map((d) => d.name!)
    .slice(0, 100);
}
