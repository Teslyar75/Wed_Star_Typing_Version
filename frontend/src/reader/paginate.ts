/** Постраничная раскладка по sentence_id (1 или 2 колонки). */

export type Sent = { sentence_id: number; original: string; translation?: string };

export type Page = { index: number; fromId: number; toId: number; items: Sent[] };

/** ~charsPerPage символов на страницу (оригинал). */
export function paginate(rows: Sent[], charsPerPage = 900): Page[] {
  if (!rows.length) return [];
  const pages: Page[] = [];
  let buf: Sent[] = [];
  let chars = 0;
  let pageIndex = 0;

  const flush = () => {
    if (!buf.length) return;
    pages.push({
      index: pageIndex++,
      fromId: buf[0]!.sentence_id,
      toId: buf[buf.length - 1]!.sentence_id,
      items: buf,
    });
    buf = [];
    chars = 0;
  };

  for (const r of rows) {
    const len = (r.original || "").length + 1;
    if (buf.length && chars + len > charsPerPage) flush();
    buf.push(r);
    chars += len;
  }
  flush();
  return pages;
}

export function pageIndexForSentence(pages: Page[], sentenceId: number): number {
  const i = pages.findIndex((p) => sentenceId >= p.fromId && sentenceId <= p.toId);
  return i < 0 ? 0 : i;
}
