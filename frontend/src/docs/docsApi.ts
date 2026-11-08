/** Клиент /api/docs. Пилот только из cookie; pilot_id в теле не шлём. */

export type DocListItem = {
  id: number;
  title: string;
  rev: number;
  words: number;
  updated_at: string | null;
};

export type DocOut = {
  id: number;
  title: string;
  body: string;
  rev: number;
  words: number;
  created_at: string | null;
  updated_at: string | null;
};

export type DocVersion = {
  id: number;
  rev: number;
  title: string;
  words: number;
  created_at: string | null;
};

export class DocsHttpError extends Error {
  status: number;
  code?: string;
  doc?: DocOut;
  constructor(status: number, message: string, extra?: { code?: string; doc?: DocOut }) {
    super(message);
    this.status = status;
    this.code = extra?.code;
    this.doc = extra?.doc;
  }
}

const JSONH = { "Content-Type": "application/json" };

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: "include", ...init });
  if (!r.ok) {
    let detail: unknown;
    try {
      detail = await r.json();
    } catch {
      detail = undefined;
    }
    const d = (detail as { detail?: unknown } | undefined)?.detail;
    if (r.status === 409 && d && typeof d === "object" && d !== null && "doc" in d) {
      const box = d as { code?: string; doc: DocOut };
      throw new DocsHttpError(409, "conflict", { code: box.code ?? "conflict", doc: box.doc });
    }
    const msg = typeof d === "string" ? d : `http_${r.status}`;
    throw new DocsHttpError(r.status, msg);
  }
  return (await r.json()) as T;
}

export const docsApi = {
  list: (signal?: AbortSignal) => j<{ items: DocListItem[] }>("/api/docs", { signal }),
  create: (title = "", body = "") =>
    j<DocOut>("/api/docs", { method: "POST", headers: JSONH, body: JSON.stringify({ title, body }) }),
  get: (id: number, signal?: AbortSignal) => j<DocOut>(`/api/docs/${id}`, { signal }),
  save: (id: number, title: string, body: string, rev: number, init?: RequestInit) =>
    j<DocOut>(`/api/docs/${id}`, {
      method: "PUT",
      headers: JSONH,
      body: JSON.stringify({ title, body, rev }),
      ...init,
    }),
  versions: (id: number, signal?: AbortSignal) =>
    j<{ items: DocVersion[] }>(`/api/docs/${id}/versions`, { signal }),
  restore: (id: number, version_id: number) =>
    j<DocOut>(`/api/docs/${id}/restore`, {
      method: "POST",
      headers: JSONH,
      body: JSON.stringify({ version_id }),
    }),
};

/** Поздний ответ чужого документа в UI не применяем. */
export function saveAppliesTo(openId: number | null, savedId: number): boolean {
  return openId !== null && openId === savedId;
}

export function pageOf<T>(items: T[], page: number, size: number): { rows: T[]; pages: number; page: number } {
  const s = Math.max(1, size);
  const pages = Math.max(1, Math.ceil(items.length / s));
  const p = Math.max(0, Math.min(page, pages - 1));
  return { rows: items.slice(p * s, p * s + s), pages, page: p };
}

export function wordCount(body: string): number {
  return body.trim() ? body.trim().split(/\s+/).length : 0;
}
