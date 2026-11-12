/** Клиент /api/lab — visual / fragment / neighborhood / snapshot. */

export type LabNode = {
  id: string;
  kind: string;
  skill: string;
  label: string;
  group: string;
  last: number | null;
  strength: number;
  detail: string;
  fresh: number;
  count?: number;
  detail_level?: string;
};

export type LabGraphPayload = {
  level?: string;
  mode: string;
  focus: string | null;
  demo: boolean;
  gaps: string[];
  entity: {
    vitality: number;
    quiet_days: number;
    recent_days: number;
    growth: number;
  };
  counts: Record<string, number>;
  nodes: LabNode[];
  edges: [string, string][];
  positions: [number, number, number][];
};

export type Neighborhood = {
  selected: LabNode;
  neighbors: LabNode[];
  edges: [string, string][];
  neighbor_total: number;
  neighbor_offset: number;
  neighbor_limit: number;
  has_more: boolean;
  cached?: boolean;
};

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { credentials: "include", signal });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json() as Promise<T>;
}

export function fetchVisual(demo: boolean, signal?: AbortSignal) {
  return getJson<LabGraphPayload>(`/api/lab/visual?demo=${demo ? 1 : 0}`, signal);
}

export function fetchFragment(group: string, demo: boolean, signal?: AbortSignal) {
  return getJson<LabGraphPayload>(
    `/api/lab/fragment?group=${encodeURIComponent(group)}&demo=${demo ? 1 : 0}`,
    signal,
  );
}

export function fetchNeighborhood(
  id: string,
  opts: { offset?: number; limit?: number; group?: string; demo?: boolean; signal?: AbortSignal },
) {
  const q = new URLSearchParams({
    id,
    offset: String(opts.offset ?? 0),
    limit: String(opts.limit ?? 20),
    demo: opts.demo ? "1" : "0",
  });
  if (opts.group) q.set("group", opts.group);
  return getJson<Neighborhood>(`/api/lab/neighborhood?${q}`, opts.signal);
}

export type SnapshotEvent = {
  token?: string;
  phase: string;
  done: number;
  total: number;
  snapshot?: {
    version: number;
    kind: string;
    created_at: string;
    entity: LabGraphPayload["entity"];
    counts: Record<string, number>;
    nodes: LabNode[];
    edges: [string, string][];
    gaps: string[];
    demo: boolean;
  };
};

export async function startSnapshot(demo: boolean): Promise<SnapshotEvent> {
  const r = await fetch(`/api/lab/snapshot?demo=${demo ? 1 : 0}&chunk_size=200`, {
    method: "POST",
    credentials: "include",
  });
  if (!r.ok) throw new Error(`snapshot start ${r.status}`);
  return r.json();
}

export async function nextSnapshot(token: string): Promise<SnapshotEvent> {
  return getJson<SnapshotEvent>(`/api/lab/snapshot/${token}`);
}

export async function cancelSnapshot(token: string): Promise<void> {
  await fetch(`/api/lab/snapshot/${token}`, { method: "DELETE", credentials: "include" });
}

/** Загрузить полный слепок чанками с прогрессом и отменой. */
export async function loadFullSnapshot(
  demo: boolean,
  onProgress: (ev: SnapshotEvent) => void,
  shouldCancel: () => boolean,
): Promise<SnapshotEvent["snapshot"] | null> {
  let ev = await startSnapshot(demo);
  onProgress(ev);
  const token = ev.token;
  if (!token) return null;
  while (ev.phase !== "done" && ev.phase !== "cancelled") {
    if (shouldCancel()) {
      await cancelSnapshot(token);
      return null;
    }
    ev = await nextSnapshot(token);
    onProgress(ev);
  }
  if (ev.phase === "cancelled") return null;
  return ev.snapshot ?? null;
}
