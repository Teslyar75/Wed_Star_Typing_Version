import { beforeAll, describe, expect, it } from "vitest";
import { initI18n, i18n } from "./setup";

beforeAll(async () => {
  globalThis.fetch = (async () => new Response("{}", { status: 404 })) as typeof fetch;
  await initI18n("ru");
});

/** Каждый ru-ключ обязан быть во всех базовых локалях (en/uk/de) — без исключений. */
describe("base locale keys", () => {
  const ru = () => Object.keys(i18n.getResourceBundle("ru", "ui"));

  it("every ru key exists in en", () => {
    const en = i18n.getResourceBundle("en", "ui");
    expect(ru().filter((k) => !(k in en))).toEqual([]);
  });

  it("every ru key exists in uk and de", () => {
    for (const l of ["uk", "de"]) {
      const b = i18n.getResourceBundle(l, "ui");
      expect(ru().filter((k) => !(k in b)), l).toEqual([]);
    }
  });

  it("placeholders match ru in en/uk/de", () => {
    const ph = (s: string) => (s.match(/\{\d\}/g) || []).sort().join(",");
    const r = i18n.getResourceBundle("ru", "ui");
    for (const l of ["uk", "de"]) {
      const b = i18n.getResourceBundle(l, "ui");
      const bad = ru().filter((k) => ph(b[k]) !== ph(r[k]));
      expect(bad, l).toEqual([]);
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
