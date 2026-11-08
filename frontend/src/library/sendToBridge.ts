/**
 * Отправить книгу библиотеки в слепую печать (мостик): берётся подготовленный текст
 * (/prepared — те же фильтры подготовки: регистр, пробелы, пунктуация, склейка слов),
 * позиция печати сохраняется, если это та же книга. Возвращает текст ошибки или null.
 */
import { t } from "../i18n";
import { PENDING_CARGO_KEY, loadCargoBoard, saveCargoBoard } from "../cargo/processText";

export async function sendTextToBridge(it: {
  textId: number;
  title?: string;
  lang?: string;
}): Promise<string | null> {
  const r = await fetch(`/api/texts/${it.textId}/prepared`, { credentials: "include" });
  if (!r.ok) return (await r.text()) || t("lib_type_blocked");
  const prep = (await r.json()) as { body?: string; lang?: string; title?: string };
  const body = (prep.body || "").trim();
  if (!body) return t("cargo_empty");
  let original = "";
  try {
    const cr = await fetch(`/api/texts/${it.textId}/content`, { credentials: "include" });
    if (cr.ok) original = (((await cr.json()) as { body?: string }).body || "").trim();
  } catch {
    /* optional */
  }
  const board = loadCargoBoard();
  const sameBook = board?.textId === it.textId && board.text === body;
  const index = sameBook && board.index > 0 && board.index < body.length ? board.index : 0;
  const title = prep.title || it.title || "";
  saveCargoBoard({ text: body, original: original || body, index, textId: it.textId, title });
  sessionStorage.setItem(
    PENDING_CARGO_KEY,
    JSON.stringify({
      id: "cargo",
      text: body,
      lang: prep.lang || it.lang || "en",
      index,
      original: original || body,
      text_id: it.textId,
      title,
    }),
  );
  return null;
}
