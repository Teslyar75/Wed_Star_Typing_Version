/**
 * Клавиатурная навигация (порт stamina/keynav.py):
 * · Tab — к вкладке текущей зоны; ещё Tab — к кнопкам ниже (подменю / шапка / контент)
 * · Shift+Tab / Esc — снять фокус с кнопок (назад к сцене / набору)
 * · ←→↑↓ — соседняя кнопка по положению на экране (все видимые HUD-кнопки)
 * · Ctrl+Home / Ctrl+End — первая / последняя в группе (Home/PgUp/PgDn заняты Орион/слайды/экран)
 * · Enter / Пробел — нативный клик по кнопке в фокусе
 * · Ctrl+1…9 / F6 — в App.tsx
 * · Стрелки во время набора на мостике не уводят (сначала Tab или Esc — к кнопкам)
 */

/** Программный фокус с видимой рамкой (иначе :focus-visible не срабатывает). */
export function focusNav(el: HTMLElement): void {
  document.querySelectorAll(".is-kbd-focus").forEach((n) => n.classList.remove("is-kbd-focus"));
  el.classList.add("is-kbd-focus");
  try {
    /* focusVisible есть в Chromium; в DOM lib TS может отсутствовать */
    (el as HTMLElement & { focus: (o?: FocusOptions & { focusVisible?: boolean }) => void }).focus({
      focusVisible: true,
    });
  } catch {
    el.focus();
  }
  el.addEventListener(
    "blur",
    () => {
      el.classList.remove("is-kbd-focus");
    },
    { once: true },
  );
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Кнопки пульта, по которым ходим стрелками / Tab (как HudButton на десктопе). */
const NAV_BUTTON_SEL = [
  "button.nav-tab",
  "button.hud-btn",
  "button.pilot-chip",
  "a.hud-btn",
  "[data-nav-item]",
  ".top-right > button",
  ".chrome-under-actions button",
  ".zone-subnav button",
  ".bridge-subnav button",
  ".en-nav button",
  ".mission-list button",
  ".radio-minibar button",
  ".path-crumbs button",
].join(",");

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

/**
 * Блокировать chrome-хоткеи (Home / PgUp / PgDn) в обычных полях ввода.
 * ghost-input — не блок.
 */
export function shouldBlockChromeHotkey(el: EventTarget | null): boolean {
  return isTextEditTarget(el);
}

/** Гипердрайв / книга / игры / набор — стрелки оставляем им (не прыжок по toolbar). */
export function isCaptureOwner(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (
    el.closest(
      ".hyperdrive, .sr-book-reader, .lounge-game, .snake-wrap, .tetris-wrap, .breakout-wrap, [data-nav-lock]",
    )
  ) {
    return true;
  }
  if (el.classList.contains("ghost-input")) return true;
  return false;
}

/** Идёт набор на мостике (как bridge.state == "run") — Tab/стрелки не уводят. */
export function isBridgeTypingActive(): boolean {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement) || !el.classList.contains("ghost-input")) return false;
  const vp = el.closest(".viewport");
  if (!vp || vp.classList.contains("is-paused")) return false;
  if (document.querySelector(".flight-status.done")) return false;
  return true;
}

function isVisible(el: HTMLElement): boolean {
  if (el.getAttribute("aria-hidden") === "true") return false;
  if ((el as HTMLButtonElement).disabled) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (el.offsetParent === null && style.position !== "fixed") return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function focusablesIn(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(isVisible);
}

function isMenuButton(el: HTMLElement): boolean {
  return el.classList.contains("nav-tab") || el.getAttribute("data-nav-menu") === "1";
}

export function isNavButton(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (!isVisible(el)) return false;
  if (el.classList.contains("ghost-input")) return false;
  if (el.matches(NAV_BUTTON_SEL)) return true;
  if (el.tagName === "BUTTON" && el.closest("[data-nav-group]")) return true;
  return false;
}

/** Все видимые HUD-кнопки окна (аналог visible_buttons). */
export function visibleNavButtons(): HTMLElement[] {
  const root = document.querySelector(".cockpit") || document.body;
  const set = new Set<HTMLElement>();
  for (const el of root.querySelectorAll<HTMLElement>(NAV_BUTTON_SEL)) {
    if (isVisible(el)) set.add(el);
  }
  for (const group of root.querySelectorAll("[data-nav-group]")) {
    for (const el of focusablesIn(group)) {
      if (el.tagName === "BUTTON" || el.getAttribute("role") === "tab") set.add(el);
    }
  }
  const list = [...set];
  list.sort((a, b) => {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    const row = Math.round(ra.top / 20) - Math.round(rb.top / 20);
    if (row) return row;
    return ra.left - rb.left;
  });
  return list;
}

function centerOf(el: HTMLElement): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Сосед по направлению — как stamina/keynav.neighbour. */
export function spatialNeighbour(
  cur: HTMLElement,
  buttons: HTMLElement[],
  dx: number,
  dy: number,
): HTMLElement | null {
  const { x: cx, y: cy } = centerOf(cur);
  let best: HTMLElement | null = null;
  let score: number | null = null;
  const curH = cur.getBoundingClientRect().height;
  for (const b of buttons) {
    if (b === cur) continue;
    const { x: bx, y: by } = centerOf(b);
    const prim = (bx - cx) * dx + (by - cy) * dy;
    if (prim <= 2) continue;
    let sec = dx ? Math.abs(by - cy) : Math.abs(bx - cx);
    if (dx && sec > Math.max(curH, b.getBoundingClientRect().height)) sec *= 4;
    const s = prim + 2 * sec;
    if (score === null || s < score) {
      best = b;
      score = s;
    }
  }
  return best;
}

function navGroupOf(el: HTMLElement | null): HTMLElement | null {
  return el?.closest<HTMLElement>("[data-nav-group]") ?? null;
}

function moveInGroup(group: HTMLElement, delta: number, vertical: boolean): boolean {
  const items = focusablesIn(group).filter(isNavButton);
  if (items.length < 2) return false;
  const active = document.activeElement as HTMLElement | null;
  let i = items.indexOf(active!);
  if (i < 0) i = 0;

  if (vertical) {
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
      focusNav(candidates[0]!);
      return true;
    }
  } else {
    i = (i + delta + items.length) % items.length;
  }
  focusNav(items[i]!);
  return true;
}

/** Вернуть фокус сцене / ghost-input (как top.focus_set на десктопе). */
export function blurNavToStage(): boolean {
  const ghost = document.querySelector<HTMLElement>(".ghost-input");
  if (ghost && isVisible(ghost)) {
    ghost.focus();
    return true;
  }
  const stage = document.querySelector<HTMLElement>("[data-nav-zone='stage']");
  if (stage) {
    stage.focus();
    return true;
  }
  (document.activeElement as HTMLElement | null)?.blur?.();
  return true;
}

/**
 * Tab / Shift+Tab — как stamina/keynav.on_tab.
 * @returns true, если событие обработано
 */
export function handleTabNav(e: KeyboardEvent): boolean {
  if (e.key !== "Tab") return false;
  if (e.ctrlKey || e.altKey || e.metaKey) return false;
  /* диалоги / палитры / справка — нативный Tab */
  if (
    document.querySelector(".cmd-palette-overlay, .help-drawer.open, .help-modal, [role='dialog']")
  ) {
    const dlg = document.querySelector<HTMLElement>(
      ".cmd-palette, .help-drawer, .help-modal, [role='dialog']",
    );
    if (dlg && document.activeElement instanceof Node && dlg.contains(document.activeElement)) {
      return false;
    }
  }
  if (isTextEditTarget(e.target)) return false;

  const shift = e.shiftKey;
  const focus = document.activeElement;

  if (shift) {
    e.preventDefault();
    e.stopPropagation();
    blurNavToStage();
    return true;
  }

  const buttons = visibleNavButtons();
  if (!buttons.length) return false;

  const menuBtns = buttons.filter(isMenuButton);
  const curMenu =
    document.querySelector<HTMLElement>(".nav-tab.on, .nav-tab[aria-selected='true']") ||
    menuBtns[0] ||
    null;

  e.preventDefault();
  e.stopPropagation();

  if (focus instanceof HTMLElement && menuBtns.includes(focus)) {
    /* из меню — к кнопкам ниже (подменю / Орион / контент) */
    const fy = centerOf(focus).y;
    const content = buttons.filter((b) => !isMenuButton(b) && centerOf(b).y > fy + 5);
    focusNav((content[0] || buttons[0])!);
    return true;
  }

  if (menuBtns.length) {
    focusNav((curMenu && menuBtns.includes(curMenu) ? curMenu : menuBtns[0])!);
    return true;
  }

  /* без меню зон — по кругу */
  if (focus instanceof HTMLElement && buttons.includes(focus)) {
    const i = buttons.indexOf(focus);
    focusNav(buttons[(i + 1) % buttons.length]!);
  } else {
    focusNav(buttons[0]!);
  }
  return true;
}

/**
 * ←→↑↓ / Ctrl+Home / Ctrl+End.
 * Стрелки: по всем HUD-кнопкам (как десктоп), если фокус уже на кнопке.
 * Ctrl+Home/End: край группы (простые Home/PgUp/PgDn — Орион/слайды/экран).
 */
export function handleArrowNav(e: KeyboardEvent): boolean {
  if (isTextEditTarget(e.target)) return false;
  if (isBridgeTypingActive()) return false;
  /* игры / гипердрайв / книга — не перехватываем */
  if (isCaptureOwner(e.target) && !isNavButton(document.activeElement)) return false;

  const key = e.key;
  const jumpEnd = e.ctrlKey && (key === "Home" || key === "End");
  if (
    !jumpEnd &&
    !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(key)
  ) {
    return false;
  }

  const active = document.activeElement;
  if (!isNavButton(active)) return false;

  if (jumpEnd) {
    const group = navGroupOf(active);
    const items = group ? focusablesIn(group).filter(isNavButton) : visibleNavButtons();
    if (!items.length) return false;
    e.preventDefault();
    focusNav(key === "Home" ? items[0]! : items[items.length - 1]!);
    return true;
  }

  const dx = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0;
  const dy = key === "ArrowUp" ? -1 : key === "ArrowDown" ? 1 : 0;
  const buttons = visibleNavButtons();
  const next = spatialNeighbour(active, buttons, dx, dy);
  if (!next) {
    /* фолбэк: внутри группы по кругу */
    const group = navGroupOf(active);
    if (group) {
      e.preventDefault();
      return moveInGroup(group, dx || dy, dy !== 0);
    }
    return false;
  }
  e.preventDefault();
  focusNav(next);
  return true;
}

/** Esc на кнопке HUD — снять фокус (не закрывает справку — это решает App). */
export function handleEscNav(e: KeyboardEvent): boolean {
  if (e.key !== "Escape" && e.key !== "Delete") return false;
  if (!isNavButton(document.activeElement)) return false;
  e.preventDefault();
  blurNavToStage();
  return true;
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
  const zone = zones[zi]!;
  /* шапка: текущая вкладка; сцена: первая кнопка или сама сцена */
  if (zone.getAttribute("data-nav-zone") === "chrome") {
    const tab =
      zone.querySelector<HTMLElement>(".nav-tab.on, .nav-tab[aria-selected='true']") ||
      focusablesIn(zone)[0];
    if (tab) {
      focusNav(tab);
      return true;
    }
  }
  const items = focusablesIn(zone).filter(isNavButton);
  if (items.length) {
    focusNav(items[0]!);
    return true;
  }
  focusNav(zone);
  return true;
}
