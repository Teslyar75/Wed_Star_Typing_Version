import { test, expect } from "@playwright/test";

test("english hub from-book flow visible", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /английский|english|англійськ|englisch/i }).click();
  await expect(page.getByRole("button", { name: /обзор|overview|огляд|übersicht/i })).toBeVisible();
  await page.getByRole("button", { name: /из книги|from book|з книги|aus buch/i }).click();
});
