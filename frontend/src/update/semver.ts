/** Сравнение версий semver (без префикса v). */

export function normalizeVersion(v: string): string {
  const t = (v || "").trim();
  return t.toLowerCase().startsWith("v") ? t.slice(1) : t;
}

export function parseSemver(v: string): [number, number, number] {
  const t = normalizeVersion(v);
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(t);
  if (!m) return [0, 0, 0];
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function isNewer(remote: string, local: string): boolean {
  const a = parseSemver(remote);
  const b = parseSemver(local);
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

export function markdownToPlain(md: string, limit = 900): string {
  let text = md || "";
  text = text.replace(/```[\s\S]*?```/g, "");
  text = text.replace(/`([^`]+)`/g, "$1");
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  text = text.replace(/^#+\s*/gm, "");
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  text = text.replace(/^\s*[-*]\s+/gm, "• ");
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  if (text.length > limit) text = `${text.slice(0, limit - 1).trimEnd()}…`;
  return text;
}
