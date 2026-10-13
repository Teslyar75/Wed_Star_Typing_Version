/**
 * Клавиатурная навигация без мыши:
 * · Tab / Shift+Tab — нативный фокус по кнопкам
 * · ←→↑↓ внутри [data-nav-group] — соседние элементы группы
 * · Home / End — первый / последний в группе
 * · Ctrl+1…9 — вкладки (как stamina/cockpit.py)
 * · F6 — цикл зон: шапка → контент → шапка
 */

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function isTextEditTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag !== "INPUT") return false;
  if (el.classList.contains("ghost-input")) return false;
  const type = ((el as HTMLInputElement).type || "text").toLowerCase();
  return ["text", "search", "password", "email", "url", "tel", "number"].includes(type);
}

/** Гипердрайв / игры / набор — стрелки оставляем им. */
export function isCaptureOwner(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.closest(".hyperdrive, .lounge-game, .snake-wrap, .tetris-wrap, .breakout-wrap, [data-nav-lock]")) {
    return true;
  }
  if (el.classList.contains("ghost-input")) return true;
  return false;
}

function focusablesIn(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    if (el.getAttribute("aria-hidden") === "true") return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (el.offsetParent === null && style.position !== "fixed") return false;
    return true;
  });
}

function navGroupOf(el: HTMLElement | null): HTMLElement | null {
  return el?.closest<HTMLElement>("[data-nav-group]") ?? null;
}

function moveInGroup(group: HTMLElement, delta: number, vertical: boolean): boolean {
  const items = focusablesIn(group);
  if (items.length < 2) return false;
  const active = document.activeElement as HTMLElement | null;
  let i = items.indexOf(active!);
  if (i < 0) i = 0;

  if (vertical) {
    /* сетка: прыжок на ширину ряда по горизонтальным соседям */
    const cur = items[i]!;
    const cr = cur.getBoundingClientRect();
    const cy = cr.top + cr.height / 2;
    const cx = cr.left + cr.width / 2;
    const rowTol = Math.max(12, cr.height * 0.6);
    const candidates = items.filter((el, idx) => {
      if (idx === i) return false;
      const r = el.getBoundingClientRect();
      const ey = r.top + r.height / 2;
      if (delta < 0) return ey < cy - rowTol * 0.25;
      return ey > cy + rowTol * 0.25;
    });
    if (!candidates.length) {
      i = (i + delta + items.length) % items.length;
    } else {
      candidates.sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        const da = Math.abs(ra.top + ra.height / 2 - cy) * 2 + Math.abs(ra.left + ra.width / 2 - cx);
        const db = Math.abs(rb.top + rb.height / 2 - cy) * 2 + Math.abs(rb.left + rb.width / 2 - cx);
        return da - db;
      });
      const next = candidates[0]!;
      next.focus();
      return true;
    }
  } else {
    i = (i + delta + items.length) % items.length;
  }
  items[i]!.focus();
  return true;
}

export function handleArrowNav(e: KeyboardEvent): boolean {
  if (isTextEditTarget(e.target) || isCaptureOwner(e.target)) return false;
  const key = e.key;
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(key)) {
    return false;
  }
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return false;
  const group = navGroupOf(active);
  if (!group) return false;

  if (key === "Home" || key === "End") {
    const items = focusablesIn(group);
    if (!items.length) return false;
    e.preventDefault();
    (key === "Home" ? items[0]! : items[items.length - 1]!).focus();
    return true;
  }

  const vertical = key === "ArrowUp" || key === "ArrowDown";
  const delta = key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1;
  e.preventDefault();
  return moveInGroup(group, delta, vertical);
}

const ZONES = ["[data-nav-zone='chrome']", "[data-nav-zone='stage']"] as const;

export function cycleNavZone(): boolean {
  const zones = ZONES.map((sel) => document.querySelector<HTMLElement>(sel)).filter(
    (z): z is HTMLElement => !!z,
  );
  if (!zones.length) return false;
  const active = document.activeElement as HTMLElement | null;
  let zi = zones.findIndex((z) => active && z.contains(active));
  zi = (zi + 1) % zones.length;
  const items = focusablesIn(zones[zi]!);
  if (!items.length) return false;
  items[0]!.focus();
  return true;
}
