/** Markdown-действия ленты (desktop docs_format) для textarea. */

export type Sel = { start: number; end: number };

export function wrapSelection(body: string, sel: Sel, left: string, right: string): { body: string; sel: Sel } {
  const core = body.slice(sel.start, sel.end);
  const next = body.slice(0, sel.start) + left + core + right + body.slice(sel.end);
  const start = sel.start + left.length;
  return { body: next, sel: { start, end: start + core.length } };
}

function lineBounds(body: string, pos: number): { a: number; b: number } {
  const a = body.lastIndexOf("\n", Math.max(0, pos - 1)) + 1;
  let b = body.indexOf("\n", pos);
  if (b < 0) b = body.length;
  return { a, b };
}

function stripBlockPrefix(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, "")
    .replace(/^>\s?/, "")
    .replace(/^[-*+]\s+\[[ xX]\]\s+/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+\.\s+/, "");
}

export function toggleLinePrefix(body: string, sel: Sel, prefix: string): { body: string; sel: Sel } {
  const { a, b } = lineBounds(body, sel.start);
  const line = body.slice(a, b);
  const nextLine = line.startsWith(prefix) ? stripBlockPrefix(line) : prefix + stripBlockPrefix(line);
  const next = body.slice(0, a) + nextLine + body.slice(b);
  return { body: next, sel: { start: a, end: a + nextLine.length } };
}

export function insertTable(body: string, sel: Sel, headers: [string, string, string]): { body: string; sel: Sel } {
  const block = `| ${headers[0]} | ${headers[1]} | ${headers[2]} |\n|---|---|---|\n| | | |\n| | | |\n`;
  const next = body.slice(0, sel.start) + block + body.slice(sel.end);
  const pos = sel.start + block.length;
  return { body: next, sel: { start: pos, end: pos } };
}

export function insertLink(body: string, sel: Sel): { body: string; sel: Sel } {
  const core = body.slice(sel.start, sel.end) || "link";
  const left = "[";
  const mid = "](";
  const right = ")";
  const url = "https://";
  const next = body.slice(0, sel.start) + left + core + mid + url + right + body.slice(sel.end);
  const urlStart = sel.start + left.length + core.length + mid.length;
  return { body: next, sel: { start: urlStart, end: urlStart + url.length } };
}

export type FormatId =
  | "b"
  | "i"
  | "u"
  | "h1"
  | "h2"
  | "li"
  | "ol"
  | "task"
  | "quote"
  | "hl"
  | "code"
  | "link"
  | "table";

export function applyFormat(
  id: FormatId,
  body: string,
  sel: Sel,
  tableHeaders: [string, string, string] = ["A", "B", "C"],
): { body: string; sel: Sel } {
  switch (id) {
    case "b":
      return wrapSelection(body, sel, "**", "**");
    case "i":
      return wrapSelection(body, sel, "*", "*");
    case "u":
      return wrapSelection(body, sel, "<u>", "</u>");
    case "hl":
      return wrapSelection(body, sel, "==", "==");
    case "code":
      return wrapSelection(body, sel, "`", "`");
    case "h1":
      return toggleLinePrefix(body, sel, "# ");
    case "h2":
      return toggleLinePrefix(body, sel, "## ");
    case "li":
      return toggleLinePrefix(body, sel, "- ");
    case "ol":
      return toggleLinePrefix(body, sel, "1. ");
    case "task":
      return toggleLinePrefix(body, sel, "- [ ] ");
    case "quote":
      return toggleLinePrefix(body, sel, "> ");
    case "link":
      return insertLink(body, sel);
    case "table":
      return insertTable(body, sel, tableHeaders);
    default:
      return { body, sel };
  }
}

export function replaceAll(body: string, find: string, repl: string): { body: string; count: number } {
  if (!find) return { body, count: 0 };
  let count = 0;
  let out = "";
  let i = 0;
  const lower = body.toLowerCase();
  const needle = find.toLowerCase();
  while (i < body.length) {
    const at = lower.indexOf(needle, i);
    if (at < 0) {
      out += body.slice(i);
      break;
    }
    out += body.slice(i, at) + repl;
    i = at + find.length;
    count += 1;
  }
  return { body: out, count };
}

export function findNext(body: string, find: string, from: number): number {
  if (!find) return -1;
  return body.toLowerCase().indexOf(find.toLowerCase(), from);
}

/** HTML clipboard → упрощённый Markdown (Ctrl+V). */
export function htmlToMd(html: string): string {
  let s = html
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<h1[^>]*>/gi, "# ")
    .replace(/<h2[^>]*>/gi, "## ")
    .replace(/<h[3-6][^>]*>/gi, "### ")
    .replace(/<(strong|b)[^>]*>/gi, "**")
    .replace(/<\/(strong|b)>/gi, "**")
    .replace(/<(em|i)[^>]*>/gi, "*")
    .replace(/<\/(em|i)>/gi, "*")
    .replace(/<u[^>]*>/gi, "<u>")
    .replace(/<\/u>/gi, "</u>")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)")
    .replace(/<img[^>]*src="([^"]+)"[^>]*>/gi, "![]($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

export type UndoSnap = { title: string; body: string };

export class DocUndoStack {
  private undo: UndoSnap[] = [];
  private redo: UndoSnap[] = [];

  reset(_snap?: UndoSnap) {
    this.undo = [];
    this.redo = [];
  }

  /** Запомнить состояние до изменения; after — чтобы не писать no-op. */
  pushBefore(before: UndoSnap, after?: UndoSnap) {
    if (after && before.title === after.title && before.body === after.body) return;
    const top = this.undo[this.undo.length - 1];
    if (top && top.title === before.title && top.body === before.body) {
      this.redo = [];
      return;
    }
    this.undo.push({ ...before });
    if (this.undo.length > 80) this.undo.shift();
    this.redo = [];
  }

  canUndo() {
    return this.undo.length > 0;
  }
  canRedo() {
    return this.redo.length > 0;
  }

  doUndo(current: UndoSnap): UndoSnap | null {
    if (!this.undo.length) return null;
    this.redo.push({ ...current });
    return this.undo.pop()!;
  }

  doRedo(current: UndoSnap): UndoSnap | null {
    if (!this.redo.length) return null;
    this.undo.push({ ...current });
    return this.redo.pop()!;
  }
}
