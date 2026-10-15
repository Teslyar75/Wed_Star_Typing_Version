import { beforeAll, describe, expect, it } from "vitest";
import { initI18n, i18n } from "./setup";

beforeAll(async () => {
  globalThis.fetch = (async () => new Response("{}", { status: 404 })) as typeof fetch;
  await initI18n("ru");
});

/**
 * Каждый ru-ключ должен быть в en (fallbackLng = en, иначе на экране сырой ключ вроде SPEED_LABEL).
 * Исключение (задокументировано): uk/de пока переведены частично (~455 ключей — Журнал, Скорочтение,
 * Свой текст, Библиотека, Английский, Чаепитие). Для них отсутствующий ключ показывается на английском
 * через fallback — поэтому для uk/de проверяем «есть в uk/de или в en», а не строгое наличие.
 */
describe("base locale keys", () => {
  const ru = () => Object.keys(i18n.getResourceBundle("ru", "ui"));

  it("every ru key exists in en", () => {
    const en = i18n.getResourceBundle("en", "ui");
    expect(ru().filter((k) => !(k in en))).toEqual([]);
  });

  it("every ru key resolves in uk/de (own string or en fallback)", () => {
    const en = i18n.getResourceBundle("en", "ui");
    for (const l of ["uk", "de"]) {
      const b = i18n.getResourceBundle(l, "ui");
      expect(ru().filter((k) => !(k in b) && !(k in en)), l).toEqual([]);
    }
  });

  it("speed gauge strings are translated in every base locale", () => {
    for (const l of ["ru", "uk", "en", "de"]) {
      const b = i18n.getResourceBundle(l, "ui");
      expect(b.speed_label, l).toBeTruthy();
      expect(b.cpm_unit, l).toBeTruthy();
      expect(b.queue_loading, l).toBeTruthy();
    }
  });
});
