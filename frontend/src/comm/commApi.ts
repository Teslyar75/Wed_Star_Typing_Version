/** Клиент /api/comm. Автор только из cookie; client author не шлём. */

export type CommMsg = {
  id: number;
  callsign: string;
  accent: string;
  text: string;
  ts: number;
  mine: boolean;
};

export class CommHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const JSONH = { "Content-Type": "application/json" };

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: "include", ...init });
  if (!r.ok) {
    let d = "";
    try {
      d = ((await r.json()) as { detail?: string }).detail ?? "";
    } catch {
      d = "";
    }
    throw new CommHttpError(r.status, d || `http_${r.status}`);
  }
  return (await r.json()) as T;
}

export const commApi = {
  list: (signal?: AbortSignal) =>
    j<{ items: CommMsg[]; total: number; unread: number }>("/api/comm", { signal }),
  unread: (signal?: AbortSignal) => j<{ unread: number }>("/api/comm/unread", { signal }),
  send: (text: string) =>
    j<CommMsg>("/api/comm", { method: "POST", headers: JSONH, body: JSON.stringify({ text }) }),
  markRead: () => j<{ unread: number }>("/api/comm/read", { method: "POST" }),
};

export const COMM_UNREAD_EVENT = "st-comm-unread";

export function emitCommUnread(n: number) {
  window.dispatchEvent(new CustomEvent(COMM_UNREAD_EVENT, { detail: n }));
}
