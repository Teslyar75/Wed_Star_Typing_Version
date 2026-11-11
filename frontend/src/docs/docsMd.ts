/** Минимальный Markdown → безопасный HTML для превью/печати (без зависимостей). */

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(s: string): string {
  let t = esc(s);
  t = t.replace(/==(.+?)==/g, "<mark>$1</mark>");
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
  t = t.replace(/&lt;u&gt;(.+?)&lt;\/u&gt;/gi, "<u>$1</u>");
  t = t.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
    (_m, alt: string, src: string) => {
      const safe = /^(https?:|data:image\/|\/)/i.test(src) ? src : "#";
      return `<img alt="${alt}" src="${safe}" style="max-width:100%">`;
    },
  );
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => {
    const safe = /^(https?:|mailto:|#)/i.test(href) ? href : "#";
    return `<a href="${safe}" rel="noopener noreferrer">${label}</a>`;
  });
  return t;
}

/** Очень урезанный md→html; таблицы и списки построчно. */
export function mdToHtml(title: string, body: string): string {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  if (title.trim()) out.push(`<h1>${esc(title.trim())}</h1>`);
  let i = 0;
  while (i < lines.length) {
    const ln = lines[i];
    if (/^\|.+\|$/.test(ln.trim()) && i + 1 < lines.length && /^\|[-:\s|]+\|$/.test(lines[i + 1].trim())) {
      const rows: string[][] = [];
      while (i < lines.length && /^\|.+\|$/.test(lines[i].trim())) {
        rows.push(
          lines[i]
            .trim()
            .replace(/^\||\|$/g, "")
            .split("|")
            .map((c) => c.trim()),
        );
        i += 1;
        if (i < lines.length && /^\|[-:\s|]+\|$/.test(lines[i].trim())) i += 1;
      }
      if (rows.length) {
        const [head, ...rest] = rows;
        out.push("<table><thead><tr>" + head.map((c) => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>");
        for (const r of rest) out.push("<tr>" + r.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>");
        out.push("</tbody></table>");
      }
      continue;
    }
    const hm = /^(#{1,6})\s+(.*)$/.exec(ln);
    if (hm) {
      const lvl = hm[1].length;
      out.push(`<h${lvl}>${inline(hm[2])}</h${lvl}>`);
      i += 1;
      continue;
    }
    if (ln.startsWith("> ")) {
      out.push(`<blockquote><p>${inline(ln.slice(2))}</p></blockquote>`);
      i += 1;
      continue;
    }
    const task = /^[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(ln);
    if (task) {
      const checked = task[1].toLowerCase() === "x" ? " checked" : "";
      out.push(`<p><input type="checkbox" disabled${checked}> ${inline(task[2])}</p>`);
      i += 1;
      continue;
    }
    if (/^[-*+]\s+/.test(ln)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^[-*+]\s+/, ""))}</li>`);
        i += 1;
      }
      out.push("<ul>" + items.join("") + "</ul>");
      continue;
    }
    if (/^\d+\.\s+/.test(ln)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\d+\.\s+/, ""))}</li>`);
        i += 1;
      }
      out.push("<ol>" + items.join("") + "</ol>");
      continue;
    }
    if (!ln.trim()) {
      i += 1;
      continue;
    }
    const para = [ln];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6}\s|[>*+\-]|\d+\.)/.test(lines[i]) &&
      !/^\|.+\|$/.test(lines[i].trim())
    ) {
      para.push(lines[i]);
      i += 1;
    }
    out.push("<p>" + para.map(inline).join("<br>") + "</p>");
  }
  return out.join("\n");
}

/** Убрать маркеры Markdown для озвучки / plain paste. */
export function mdToPlain(body: string): string {
  let t = body.replace(/\r\n/g, "\n");
  t = t.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
  t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  t = t.replace(/`([^`]+)`/g, "$1");
  t = t.replace(/(\*\*|__)(.*?)\1/g, "$2");
  t = t.replace(/(\*|_)(.*?)\1/g, "$2");
  t = t.replace(/^#{1,6}\s+/gm, "");
  t = t.replace(/^>\s?/gm, "");
  t = t.replace(/^[-*+]\s+(\[[ xX]\]\s+)?/gm, "");
  t = t.replace(/^\d+\.\s+/gm, "");
  t = t.replace(/==([^=]+)==/g, "$1");
  t = t.replace(/<\/?u>/gi, "");
  return t;
}
