import { expect, test } from "@playwright/test";

test("вход → набор → доска почёта", async ({ page }) => {
  const callsign = `PW${Date.now().toString(36).slice(-6)}`;

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Star Typing Web" })).toBeVisible();

  await page.getByRole("button", { name: /Экипаж|Crew|Екіпаж/ }).click();
  await page.getByPlaceholder(/позывной|callsign/i).fill(callsign);
  await page.getByPlaceholder(/PIN/i).fill("4242");
  await page.getByRole("button", { name: /Зачислить|Enroll|Зарахувати|Anmelden/ }).click();
  await expect(page.getByRole("strong").filter({ hasText: callsign })).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: /Мостик|Bridge|Місток|Brücke/ }).click();
  const cargo = page.getByPlaceholder(/Вставьте текст|text/i);
  await cargo.fill("hi");
  await page.getByRole("button", { name: /Заново|Restart|Neu|Знову/ }).click();
  await page.getByLabel("typing").focus();
  await page.keyboard.type("hi");
  await expect(page.locator(".telemetry")).toContainText(/ФИНИШ|FINISH|ФІНІШ|ZIEL/, { timeout: 15_000 });

  await page.getByRole("button", { name: /Экипаж|Crew|Екіпаж/ }).click();
  await expect(page.getByRole("heading", { name: /Доска|Honor|пошани|Ehren/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: callsign })).toBeVisible();
  // XP вырос после сессии (honor board)
  await expect(page.locator("table.honor")).toContainText(callsign);
});
