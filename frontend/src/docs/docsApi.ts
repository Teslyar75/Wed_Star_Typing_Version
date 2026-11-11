/** Клиент /api/docs. Пилот только из cookie; pilot_id в теле не шлём. */

export type DocListItem = {
  id: number;
  title: string;
  rev: number;
  words: number;
  snippet?: string;
  deleted_at?: string | null;
  created_at?: string | null;
  updated_at: string | null;
};

export type DocOut = {
  id: number;
  title: string;
  body: string;
  rev: number;
  words: number;
  deleted_at?: string | null;
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

export type DocTemplate = {
  id: string;
  label: string;
  title: string;
  body: string;
};

export type DocSort = "updated" | "created" | "title";
export type ExportFmt = "txt" | "md" | "html" | "docx" | "stdoc" | "pdf";

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
  list: (opts?: { trash?: boolean; sort?: DocSort; q?: string; signal?: AbortSignal }) => {
    const sp = new URLSearchParams();
    if (opts?.trash) sp.set("trash", "true");
    if (opts?.sort) sp.set("sort", opts.sort);
    if (opts?.q) sp.set("q", opts.q);
    const qs = sp.toString();
    return j<{ items: DocListItem[]; sort: string; trash: boolean }>(`/api/docs${qs ? `?${qs}` : ""}`, {
      signal: opts?.signal,
    });
  },
  templates: (lang: string, signal?: AbortSignal) =>
    j<{ items: DocTemplate[] }>(`/api/docs/templates?lang=${encodeURIComponent(lang)}`, { signal }),
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
  trash: (id: number) => j<{ ok: boolean; id: number }>(`/api/docs/${id}`, { method: "DELETE" }),
  restoreTrash: (id: number) => j<DocOut>(`/api/docs/${id}/restore-trash`, { method: "POST", headers: JSONH, body: "{}" }),
  purge: (id: number) => j<{ ok: boolean; id: number }>(`/api/docs/${id}/purge`, { method: "DELETE" }),
  importFile: async (file: File) => {
    const fd = new FormData();
    fd.append("file", file, file.name);
    const r = await fetch("/api/docs/import", { method: "POST", credentials: "include", body: fd });
    if (!r.ok) {
      let msg = `http_${r.status}`;
      try {
        const d = await r.json();
        if (typeof d?.detail === "string") msg = d.detail;
      } catch {
        /* ignore */
      }
      throw new DocsHttpError(r.status, msg);
    }
    return (await r.json()) as DocOut;
  },
  exportUrl: (id: number, fmt: ExportFmt) => `/api/docs/${id}/export?fmt=${encodeURIComponent(fmt)}`,
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

export function filterItems(items: DocListItem[], query: string): DocListItem[] {
  const list = items ?? [];
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  return list.filter((it) => {
    const hay = `${it.title}\n${it.snippet || ""}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export function sortItems(items: DocListItem[], sort: DocSort): DocListItem[] {
  const xs = [...(items ?? [])];
  if (sort === "title") return xs.sort((a, b) => (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" }));
  if (sort === "created") {
    return xs.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")) || b.id - a.id);
  }
  return xs.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")) || b.id - a.id);
}
