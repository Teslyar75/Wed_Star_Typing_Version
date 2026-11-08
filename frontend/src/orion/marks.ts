/** Геолокация курсора: правый щелчок ставит пометку, как stamina/marks.py. */
export type Mark = {
  id: number;
  ts: number;
  x: number;
  y: number;
  nx: number;
  ny: number;
  root: [number, number];
  zone: string;
  subtab: string;
  widget: string;
  note: string;
};

const KEY = "st_orion_marks";
const SENT = "st_orion_marks_sent";
const LIMIT = 200;
const KEEP = 3;

function load(): Mark[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}
function save(items: Mark[]) {
  try { localStorage.setItem(KEY, JSON.stringify(items.slice(-LIMIT))); } catch { /* quota */ }
}

export function lastId(): number {
  const items = load();
  return items.length ? items[items.length - 1].id : 0;
}

export function add(partial: Omit<Mark, "id" | "ts" | "nx" | "ny"> & { nx?: number; ny?: number }): Mark {
  const [w, h] = partial.root;
  const mark: Mark = {
    ...partial,
    id: Math.max(Date.now(), lastId() + 1),
    ts: Math.floor(Date.now() / 1000),
    nx: w ? Math.round((partial.x / w) * 10000) / 10000 : 0,
    ny: h ? Math.round((partial.y / h) * 10000) / 10000 : 0,
    note: partial.note || "",
  };
  const items = load();
  items.push(mark);
  save(items);
  return mark;
}

export function describe(mark: Mark): string {
  const head = mark.subtab ? `${mark.zone} / ${mark.subtab}` : (mark.zone || "?");
  const bits = [head];
  if (mark.widget) bits.push(mark.widget);
  bits.push(`${mark.x}, ${mark.y}`);
  return bits.join(" · ");
}

export function placeLine(mark: Mark): string {
  const when = new Date((mark.ts || 0) * 1000).toLocaleTimeString("ru-RU", { hour12: false });
  const [w, h] = mark.root;
  const parts = [mark.zone || "?"];
  if (mark.subtab) parts.push(mark.subtab);
  if (mark.widget) parts.push(mark.widget);
  return `${parts.join(" / ")} — окно ${w}x${h}, точка ${mark.x},${mark.y} (доля ${mark.nx}, ${mark.ny}), ${when}`;
}

export function contextBlock(): string {
  let sent = 0;
  try { sent = Number(localStorage.getItem(SENT) || 0); } catch { sent = 0; }
  const items = load().filter((m) => m.id > sent).slice(-KEEP);
  if (!items.length) return "";
  const lines = ["МЕСТА, КОТОРЫЕ ПОКАЗАЛ ПИЛОТ (правая кнопка мыши):"];
  items.forEach((m, i) => {
    lines.push(`${i + 1}. ${placeLine(m)}`);
    if (m.note) lines.push(`   слова пилота: ${m.note}`);
  });
  return lines.join("\n");
}

export function markSent() {
  try { localStorage.setItem(SENT, String(lastId())); } catch { /* */ }
}

export function widgetLabel(el: EventTarget | null): string {
  if (!(el instanceof HTMLElement)) return "";
  const hit = el.closest("button, a, [role='tab'], [role='button'], [role='menuitem'], h1, h2, h3, label, [data-testid], [aria-label]");
  const node = (hit instanceof HTMLElement ? hit : el);
  const text = (node.getAttribute("aria-label") || node.innerText || node.getAttribute("data-testid") || node.tagName || "").replace(/\s+/g, " ").trim();
  return text.slice(0, 60);
}
