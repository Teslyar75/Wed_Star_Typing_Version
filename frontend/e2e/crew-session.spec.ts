import { expect, test } from "@playwright/test";
import { enrollPilot } from "./helpers";

test("вход (CockpitEntry) → набор → доска почёта", async ({ page }) => {
  const callsign = `PW${Date.now().toString(36).slice(-6)}`;
  await enrollPilot(page, callsign);

  await page.getByRole("tab", { name: /Мостик|Bridge|Місток|Brücke/ }).click();
  await page.getByLabel("typing").focus();
  await page.keyboard.press("Enter");
  await page.keyboard.type("the ", { delay: 80 });
  await expect(page.locator(".route-progress")).toContainText(/\b4 \/ \d+/, { timeout: 10_000 });

  await page.locator(".pilot-chip").click();
  await expect(page.locator(".ce-grid")).toBeVisible();
  await page.locator('button[title="H"]').click();
  await expect(page.getByRole("heading", { name: /Доска|Honor|пошани|Ehren/ })).toBeVisible();
  await expect(page.locator("table.honor")).toContainText(callsign);
});
