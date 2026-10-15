import { expect, test } from "@playwright/test";

test("вход (CockpitEntry) → набор → доска почёта", async ({ page }) => {
  const callsign = `PW${Date.now().toString(36).slice(-6)}`;

  await page.goto("/");
  // без пилота шлюз открывается сам: «первый запуск» (1) или ростер (кнопка «Новый пилот» / N)
  const entry = page.locator(".ce-first-row, .ce-grid").first();
  await expect(entry).toBeVisible({ timeout: 15_000 });
  if (await page.locator(".ce-first-row").isVisible()) await page.keyboard.press("1");
  else await page.getByRole("button", { name: /Новый пилот|Новий пілот|New pilot|Neuer Pilot/ }).click();

  // мастер: позывной → облик → корабль/PIN
  const call = page.getByPlaceholder(/Орёл-7|Орел-7|Eagle-7|Adler-7/);
  await call.fill(callsign);
  await call.press("Enter");
  await page.keyboard.press("Enter");
  const pins = page.locator('.ce-field input[type="password"]');
  await pins.nth(0).fill("4242");
  await pins.nth(1).fill("4242");
  await pins.nth(1).press("Enter");
  await expect(page.locator(".pilot-chip strong")).toHaveText(callsign, { timeout: 10_000 });

  // мостик: груз по умолчанию принимает ввод
  await page.getByRole("tab", { name: /Мостик|Bridge|Місток|Brücke/ }).click();
  await page.getByLabel("typing").focus();
  await page.keyboard.press("Enter"); // снять паузу «окно без фокуса»
  await page.keyboard.type("the ", { delay: 80 });
  await expect(page.locator(".route-progress")).toContainText(/\b4 \/ \d+/, { timeout: 10_000 });

  // доска почёта — из шлюза (кнопка ✪, клавиша H)
  await page.locator(".pilot-chip").click();
  await expect(page.locator(".ce-grid")).toBeVisible();
  await page.locator('button[title="H"]').click();
  await expect(page.getByRole("heading", { name: /Доска|Honor|пошани|Ehren/ })).toBeVisible();
  await expect(page.locator("table.honor")).toContainText(callsign);
});
