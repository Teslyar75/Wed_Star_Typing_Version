/** Применяет JSON-тему (формат docs/skins/SKINS.md) к :root. */

export type SkinSounds = {
  click?: string;
  error?: string;
  finish?: string;
  ok?: string;
  start?: string;
  bell?: string;
};

export type SkinTheme = {
  id: string;
  name?: Record<string, string> | string;
  colors: Record<string, string>;
  fonts?: {
    ui?: string[];
    title?: string[];
    typing?: string[];
    /** Локальные OFL-файлы шрифтов скина (public/fonts/<id>/). */
    files?: { family: string; src: string; weight?: string; style?: string }[];
  };
  /** Shape kit: формы панелей/кнопок/карточек (CSS по data-shape-*). */
  shape?: {
    panel?: string;
    button?: string;
    card?: string;
    radius?: string;
    radius_btn?: string;
    border?: string;
  };
  /** Voice pack: lang → key → строка (ui-ключи, `entry.*`, `skin.help`). */
  voice?: Record<string, Record<string, string>>;
  ranks?: string[];
  ranks_i18n?: Record<string, string[]>;
  /** true — у скина полный свой набор звуков (иначе FX как у Звездолёта). */
  sounds_ready?: boolean;
  icon?: string;
  background?: { engine?: string; params?: Record<string, unknown> };
  assets?: { images?: string; icon?: string };
  sounds?: SkinSounds;
};

const COLOR_MAP: Record<string, string> = {
  bg: "--st-bg",
  bg2: "--st-bg2",
  panel: "--st-panel",
  panel_hi: "--st-panel-hi",
  panel_border: "--st-line",
  line: "--st-line",
  line_hi: "--st-line-hi",
  text: "--st-text",
  muted: "--st-muted",
  faint: "--st-faint",
  accent: "--st-accent",
  accent_dim: "--st-accent-dim",
  cyan: "--st-cyan",
  cyan_dim: "--st-cyan-dim",
  ok: "--st-ok",
  error: "--st-error",
  purple: "--st-purple",
};

export const SKIN_FONTS_ID = "st-skin-fonts";

function fontStack(list: string[] | undefined, fallback: string): string | null {
  if (!list?.length) return null;
  return [...list.map((f) => `"${f}"`), fallback].join(", ");
}

/**
 * Полный сброс визуальных артефактов прошлого скина:
 * все inline --st-*, data-skin/bgEngine, фоновые canvas от старых backdrop.
 */
export function clearSkinArtifacts(root: HTMLElement = document.documentElement): void {
  const toRemove: string[] = [];
  for (let i = 0; i < root.style.length; i++) {
    const name = root.style.item(i);
    if (name.startsWith("--st-")) toRemove.push(name);
  }
  for (const name of toRemove) root.style.removeProperty(name);

  delete root.dataset.skin;
  delete root.dataset.bgEngine;
  delete root.dataset.shapePanel;
  delete root.dataset.shapeButton;
  delete root.dataset.shapeCard;

  // снять возможные inline-фоны с body/html
  if (typeof document !== "undefined") {
    document.body?.style.removeProperty("background");
    document.body?.style.removeProperty("background-image");
    document.body?.style.removeProperty("background-color");
    document.documentElement.style.removeProperty("background");
    document.documentElement.style.removeProperty("background-image");

    document.getElementById(SKIN_FONTS_ID)?.remove();
    // старые canvas backdrop (если остались в DOM после прошлых версий)
    document.querySelectorAll("[data-skin-backdrop], .skin-backdrop-canvas").forEach((el) => el.remove());
  }
}

/** Сброс + чистая установка палитры/шрифтов нового скина. */
export function applyTheme(theme: SkinTheme): void {
  const root = document.documentElement;
  clearSkinArtifacts(root);

  for (const [key, cssVar] of Object.entries(COLOR_MAP)) {
    const hex = theme.colors[key];
    if (hex) root.style.setProperty(cssVar, hex);
  }

  const ui = theme.fonts?.ui?.[0];
  const mono = theme.fonts?.typing?.[0];
  root.style.setProperty(
    "--st-font-ui",
    ui ? `"${ui}", system-ui, sans-serif` : '"Bahnschrift", "Segoe UI", system-ui, sans-serif',
  );
  root.style.setProperty(
    "--st-font-mono",
    mono ? `"${mono}", Consolas, monospace` : '"Cascadia Mono", Consolas, monospace',
  );

  const title = fontStack(theme.fonts?.title, "serif");
  if (title) root.style.setProperty("--st-font-title", title);
  const uiStack = fontStack(theme.fonts?.ui, "system-ui, sans-serif");
  if (uiStack && theme.fonts?.files?.length) root.style.setProperty("--st-font-ui", uiStack);

  const files = theme.fonts?.files;
  if (files?.length && typeof document !== "undefined") {
    const st = document.createElement("style");
    st.id = SKIN_FONTS_ID;
    st.textContent = files
      .map(
        (f) =>
          `@font-face{font-family:"${f.family}";src:url("${f.src}") format("woff2");font-weight:${f.weight || "400"};font-style:${f.style || "normal"};font-display:swap}`,
      )
      .join("\n");
    document.head.appendChild(st);
  }

  const sh = theme.shape;
  if (sh) {
    if (sh.panel) root.dataset.shapePanel = sh.panel;
    if (sh.button) root.dataset.shapeButton = sh.button;
    if (sh.card) root.dataset.shapeCard = sh.card;
    if (sh.radius) root.style.setProperty("--st-shape-radius", sh.radius);
    if (sh.radius_btn) root.style.setProperty("--st-shape-radius-btn", sh.radius_btn);
    if (sh.border) root.style.setProperty("--st-shape-border", sh.border);
  }
  for (const [k, v] of Object.entries(theme.colors)) {
    if (!COLOR_MAP[k] && /^[a-z]+$/.test(k) && ["paper", "ink", "enamel"].includes(k)) {
      root.style.setProperty(`--st-${k}`, v);
    }
  }

  root.dataset.skin = theme.id;
}

/** @deprecated alias — используйте clearSkinArtifacts */
export const clearSkinCss = clearSkinArtifacts;
