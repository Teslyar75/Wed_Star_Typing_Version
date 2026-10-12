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
  fonts?: { ui?: string[]; title?: string[]; typing?: string[] };
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

  // снять возможные inline-фоны с body/html
  if (typeof document !== "undefined") {
    document.body?.style.removeProperty("background");
    document.body?.style.removeProperty("background-image");
    document.body?.style.removeProperty("background-color");
    document.documentElement.style.removeProperty("background");
    document.documentElement.style.removeProperty("background-image");

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

  root.dataset.skin = theme.id;
}

/** @deprecated alias — используйте clearSkinArtifacts */
export const clearSkinCss = clearSkinArtifacts;
