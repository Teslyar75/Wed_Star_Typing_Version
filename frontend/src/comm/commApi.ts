/** Клиент /api/comm. Автор только из cookie; client author не шлём. Пилот↔пилот, без ИИ. */

export type CommMsg = {
  id: number;
  callsign: string;
  accent: string;
  text: string;
  images: string[];
  ts: number;
  mine: boolean;
};

export type CommLimits = {
  max_text: number;
  max_messages: number;
  max_images: number;
  max_image_bytes: number;
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

export const DEFAULT_COMM_LIMITS: CommLimits = {
  max_text: 500,
  max_messages: 500,
  max_images: 3,
  max_image_bytes: 2_000_000,
};

export const commApi = {
  list: (signal?: AbortSignal) =>
    j<{ items: CommMsg[]; total: number; unread: number; limits?: CommLimits }>("/api/comm", { signal }),
  unread: (signal?: AbortSignal) => j<{ unread: number }>("/api/comm/unread", { signal }),
  send: (text: string, images: string[] = []) =>
    j<CommMsg>("/api/comm", {
      method: "POST",
      headers: JSONH,
      body: JSON.stringify({ text, images }),
    }),
  markRead: () => j<{ unread: number }>("/api/comm/read", { method: "POST" }),
};

export const COMM_UNREAD_EVENT = "st-comm-unread";

export function emitCommUnread(n: number) {
  window.dispatchEvent(new CustomEvent(COMM_UNREAD_EVENT, { detail: n }));
}

export function filterComm(items: CommMsg[], query: string): CommMsg[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (m) => m.text.toLowerCase().includes(q) || m.callsign.toLowerCase().includes(q),
  );
}

export type CommExportFmt = "txt" | "md" | "html";

export function exportCommBlob(items: CommMsg[], fmt: CommExportFmt): { blob: Blob; name: string } {
  const stamp = new Date().toISOString().slice(0, 10);
  if (fmt === "txt") {
    const body = items
      .map((m) => {
        const when = new Date(m.ts * 1000).toISOString();
        const pics = m.images?.length ? ` [${m.images.length} img]` : "";
        return `[${when}] ${m.callsign}${pics}: ${m.text}`;
      })
      .join("\n");
    return { blob: new Blob([body || ""], { type: "text/plain;charset=utf-8" }), name: `ether-${stamp}.txt` };
  }
  if (fmt === "md") {
    const body = items
      .map((m) => {
        const when = new Date(m.ts * 1000).toISOString();
        const imgs = (m.images || []).map((src, i) => `![${m.callsign}-${i}](${src})`).join("\n");
        return `### ${m.callsign} · ${when}\n\n${m.text || ""}${imgs ? `\n\n${imgs}` : ""}`;
      })
      .join("\n\n");
    return { blob: new Blob([body || ""], { type: "text/markdown;charset=utf-8" }), name: `ether-${stamp}.md` };
  }
  const rows = items
    .map((m) => {
      const when = new Date(m.ts * 1000).toISOString();
      const imgs = (m.images || []).map((src) => `<p><img src="${src}" alt="" style="max-width:240px"></p>`).join("");
      const safe = (m.text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `<article><h3>${m.callsign} · ${when}</h3><p>${safe}</p>${imgs}</article>`;
    })
    .join("\n");
  const html = `<!doctype html><meta charset="utf-8"><title>Ether</title>${rows}`;
  return { blob: new Blob([html], { type: "text/html;charset=utf-8" }), name: `ether-${stamp}.html` };
}
