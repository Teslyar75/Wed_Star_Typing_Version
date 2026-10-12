/** Применяет JSON-тему (формат docs/skins/SKINS.md) к :root. */

export type SkinTheme = {
  id: string;
  colors: Record<string, string>;
  fonts?: { ui?: string[]; title?: string[]; typing?: string[] };
};

const COLOR_MAP: Record<string, string> = {
  bg: "--st-bg",
  panel: "--st-panel",
  panel_border: "--st-line",
  line: "--st-line",
  text: "--st-text",
  muted: "--st-muted",
  accent: "--st-accent",
  cyan: "--st-cyan",
  ok: "--st-ok",
  error: "--st-error",
};

export function applyTheme(theme: SkinTheme): void {
  const root = document.documentElement;
  for (const [key, cssVar] of Object.entries(COLOR_MAP)) {
    const hex = theme.colors[key];
    if (hex) root.style.setProperty(cssVar, hex);
  }
  const ui = theme.fonts?.ui?.[0];
  const mono = theme.fonts?.typing?.[0];
  if (ui) root.style.setProperty("--st-font-ui", `"${ui}", system-ui, sans-serif`);
  if (mono) root.style.setProperty("--st-font-mono", `"${mono}", Consolas, monospace`);
}
