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
  if (opts.country) q.set("country", opts.country);
  if (opts.tag) q.set("tag", opts.tag);
  if (opts.language) q.set("language", opts.language);
  q.set("limit", String(opts.limit ?? 12));
  q.set("hidebroken", "true");
  q.set("order", "clickcount");
  q.set("reverse", "true");
  const r = await fetch(`${baseUrl}/json/stations/search?${q}`);
  if (!r.ok) throw new Error(String(r.status));
  const data = (await r.json()) as Station[];
  return data.filter((s) => s.url_resolved);
}
