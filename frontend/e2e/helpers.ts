import { expect, type Page } from "@playwright/test";

/** Не открывать шлюз экипажа на старте (гость). Совпадает с alt-спеками. */
export async function skipCrewAsk(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("st_ask_crew_on_start", "0");
  });
}

/** Гид G1 после зачисления ловит Enter/Space (capture). Снять окно, не глушить продукт. */
export async function dismissGuide(page: Page) {
  const dlg = page.locator(".guide-dlg");
  try {
    await dlg.waitFor({ state: "visible", timeout: 4000 });
  } catch {
    return;
  }
  await page.keyboard.press("Escape");
  await expect(dlg).toHaveCount(0);
}

/**
 * Зачислить нового пилота через уже открытый шлюз или кнопку «Экипаж».
 * Не кликать шапку, пока поверх неё `crew-overlay-host` (aria-modal).
 */
export async function enrollPilot(page: Page, callsign: string) {
  await page.goto("/");
  const overlay = page.locator(".crew-overlay-host");
  const opened = await overlay.waitFor({ state: "visible", timeout: 4000 }).then(
    () => true,
    () => false,
  );
  if (!opened) {
    await page.getByRole("button", { name: /Экипаж|Crew|Екіпаж/ }).click();
    await expect(overlay).toBeVisible();
  }

  const entry = page.locator(".ce-first-row, .ce-grid").first();
  await expect(entry).toBeVisible({ timeout: 15_000 });
  if (await page.locator(".ce-first-row").isVisible()) {
    await page.locator(".ce-first-card").first().click();
  } else {
    await page.getByRole("button", { name: /Новый пилот|Новий пілот|New pilot|Neuer Pilot/ }).click();
  }

  const call = page.getByPlaceholder(/Орёл-7|Орел-7|Eagle-7|Adler-7/);
  await expect(call).toBeVisible();
  await call.fill(callsign);
  /* клик «Далее», не Enter на input: шаг меняет DOM, Playwright иначе ретраит press до таймаута */
  const primary = page.locator(".ce-wiz-nav .ce-btn.primary");
  await primary.click();
  await expect(page.locator(".ce-glyphs")).toBeVisible();
  await primary.click();
  await expect(page.locator(".ce-pinpair")).toBeVisible();
  const pins = page.locator('.ce-pinpair input[type="password"]');
  await pins.nth(0).fill("4242");
  await pins.nth(1).fill("4242");
  await primary.click();
  await expect(page.locator(".pilot-chip strong")).toHaveText(callsign, { timeout: 10_000 });
  await expect(overlay).toHaveCount(0);
  await dismissGuide(page);
}
