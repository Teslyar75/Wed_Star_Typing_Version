/** Клиент /api/orion. Ключ BYO живёт только в localStorage этого браузера (на пилота). */
export type ModeId = "guide" | "byo" | "hosted" | "contributor";
export type ModeInfo = {
  id: ModeId;
  available: boolean;
  reason: string;
  capabilities: { text: boolean; images: boolean; proposals?: boolean };
};
export type OrionConfig = {
  mode: ModeId;
  modes: ModeInfo[];
  roles: string[];
  logged_in: boolean;
  pilot: string;
  max_images: number;
  max_image_bytes: number;
  opencode?: { available: boolean; cli: string; model: string; reason: string };
};
export type OrionHealth = {
  available: boolean;
  reason: string;
  state?: string;
  kind?: string;
  agent_id?: string;
  model?: string;
  cached?: boolean;
};
export type ChatMsg = {
  id: number;
  role: "user" | "orion" | "system";
  text: string;
  mode?: string;
  images?: string[] | number;
  kind?: string;
  clip_id?: string;
  at?: string;
};
export type Step = { title: string; weight: number; status: string };
export type Task = { id: number; title: string; state: string; steps: Step[]; percent: number; color: string; stale: boolean };
export type Hit = { id: number; role: string; before: string; match: string; after: string; at: string; text?: string };
export type Proposal = { id: number; title: string; description: string; status: string; branch: string; task_id: number | null };
export type Byo = { provider: "openai" | "anthropic"; base_url: string; model: string; vision: boolean; key: string };
export type CrewAgent = {
  id: number; agent_id: string; name: string; kind: string; access: string; enabled: boolean;
  provider: "openai" | "anthropic"; base_url: string; model: string; vision: boolean; manners: string; note: string; voice: string; needs_key: boolean;
};

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: "include", ...init });
  if (!r.ok) {
    let d = "";
    try {
      d = ((await r.json()) as { detail?: string }).detail ?? "";
    } catch {
      /* пусто */
    }
    if (r.status === 502 || r.status === 504) throw new Error("opencode_timeout");
    throw new Error(d || `http_${r.status}`);
  }
  return (await r.json()) as T;
}
const JSONH = { "Content-Type": "application/json" };

export const orionApi = {
  config: () => j<OrionConfig>("/api/orion/config"),
  health: (agentId = "", key = "", refresh = false) =>
    j<OrionHealth>(
      `/api/orion/health?agent_id=${encodeURIComponent(agentId)}&refresh=${refresh ? "1" : "0"}`,
      key ? { headers: { "X-Orion-Key": key } } : undefined,
    ),
  setMode: (mode: ModeId) => j<{ mode: ModeId }>("/api/orion/mode", { method: "PUT", headers: JSONH, body: JSON.stringify({ mode }) }),
  messages: (offset = 0, limit = 50) => j<{ total: number; items: ChatMsg[] }>(`/api/orion/messages?offset=${offset}&limit=${limit}`),
  agents: () => j<{ active: string; items: CrewAgent[] }>("/api/orion/agents"),
  createAgent: (body: Partial<CrewAgent>) =>
    j<CrewAgent>("/api/orion/agents", { method: "POST", headers: JSONH, body: JSON.stringify(body) }),
  updateAgent: (id: string, body: Partial<CrewAgent>) =>
    j<CrewAgent>(`/api/orion/agents/${id}`, { method: "PUT", headers: JSONH, body: JSON.stringify(body) }),
  activateAgent: (id: string) =>
    j<{ active: string }>(`/api/orion/agents/${id}/activate`, { method: "POST", headers: JSONH, body: "{}" }),
  deleteAgent: (id: string) => j<{ ok: boolean }>(`/api/orion/agents/${id}`, { method: "DELETE" }),
  chat: (text: string, images: string[], byo: Byo | null, agentId = "", extra?: { quotes?: string[]; context?: string }) =>
    j<{ reply: string; mode_used: string; fallback: boolean; reason: string; agent?: string }>("/api/orion/chat", {
      method: "POST",
      headers: byo?.key ? { ...JSONH, "X-Orion-Key": byo.key } : JSONH,
      body: JSON.stringify({
        agent_id: agentId,
        text,
        images,
        quotes: extra?.quotes || [],
        context: extra?.context || "",
        byo: byo ? { provider: byo.provider, base_url: byo.base_url, model: byo.model, vision: byo.vision } : null,
      }),
    }),
  clearMessages: () => j<{ ok: boolean; deleted: number }>("/api/orion/messages", { method: "DELETE" }),
  /** Desktop-compatible remember: шутка/факт в историю чата с kind. */
  remember: (body: { text: string; kind: "joke" | "fact"; clip_id?: string; role?: "orion" | "system"; mode?: string }) =>
    j<ChatMsg>("/api/orion/remember", { method: "POST", headers: JSONH, body: JSON.stringify(body) }),
  archive: (q: string) => j<{ items: Hit[]; found?: number }>(`/api/orion/archive?q=${encodeURIComponent(q)}&limit=400`),
  tasks: () => j<{ items: Task[] }>("/api/orion/tasks"),
  plan: (title: string, steps: { title: string; weight: number }[]) =>
    j<Task>("/api/orion/tasks", { method: "POST", headers: JSONH, body: JSON.stringify({ title, steps }) }),
  step: (id: number, index: number, status: string) =>
    j<Task>(`/api/orion/tasks/${id}/step`, { method: "POST", headers: JSONH, body: JSON.stringify({ index, status }) }),
  finish: (id: number, state: string) =>
    j<Task>(`/api/orion/tasks/${id}/finish`, { method: "POST", headers: JSONH, body: JSON.stringify({ state }) }),
  proposals: () => j<{ items: Proposal[] }>("/api/orion/proposals"),
  propose: (title: string, description: string) =>
    j<Proposal>("/api/orion/proposals", { method: "POST", headers: JSONH, body: JSON.stringify({ title, description }) }),
};

const BYO_KEY = (pilot: string) => `st_orion_byo:${pilot || "guest"}`;
export function loadByo(pilot: string): Byo | null {
  try {
    const raw = localStorage.getItem(BYO_KEY(pilot));
    return raw ? (JSON.parse(raw) as Byo) : null;
  } catch {
    return null;
  }
}
export function saveByo(pilot: string, b: Byo | null) {
  if (b) localStorage.setItem(BYO_KEY(pilot), JSON.stringify(b));
  else localStorage.removeItem(BYO_KEY(pilot));
}
/** sk-…abcd — ключ никогда не показывается целиком. */
export function maskKey(k: string): string {
  if (!k) return "";
  if (k.length <= 8) return "••••";
  return `${k.slice(0, 3)}…${k.slice(-4)}`;
}
/** Непрерывная смесь опорных цветов (порт stamina/task_progress.color_for). */
const STOPS: [number, [number, number, number]][] = [
  [0, [0xd9, 0x6a, 0x5f]],
  [25, [0xe3, 0x93, 0x55]],
  [50, [0xe6, 0xc4, 0x5c]],
  [75, [0xae, 0xc9, 0x5e]],
  [100, [0x6f, 0xbf, 0x73]],
];
export function colorFor(pct: number): string {
  const p = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [a, ca] = STOPS[i];
    const [b, cb] = STOPS[i + 1];
    if (p <= b) {
      const t = (p - a) / (b - a);
      return "#" + ca.map((x, k) => Math.round(x + (cb[k] - x) * t).toString(16).padStart(2, "0")).join("");
    }
  }
  return "#6fbf73";
}
/** Постраничность без прокрутки. */
export function pageOf<T>(items: T[], page: number, size: number): { rows: T[]; pages: number; page: number } {
  const s = Math.max(1, size);
  const pages = Math.max(1, Math.ceil(items.length / s));
  const p = Math.max(0, Math.min(page, pages - 1));
  return { rows: items.slice(p * s, p * s + s), pages, page: p };
}

const AGENT_KEY = (pilot: string, id: string) => `st_orion_agent:${pilot}:${id}`;
export function loadAgentKey(pilot: string, id: string): string {
  try { return localStorage.getItem(AGENT_KEY(pilot, id)) || ""; } catch { return ""; }
}
export function saveAgentKey(pilot: string, id: string, key: string) {
  try {
    if (key) localStorage.setItem(AGENT_KEY(pilot, id), key);
    else localStorage.removeItem(AGENT_KEY(pilot, id));
  } catch { /* quota */ }
}
