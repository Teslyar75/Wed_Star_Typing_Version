import { expect, test } from "@playwright/test";
import { skipCrewAsk } from "./helpers";

test("english hub from-book flow visible", async ({ page }) => {
  await skipCrewAsk(page);
  await page.goto("/");
  await page.locator('.nav-tab[data-zone="english"]').click();
  await expect(page.locator(".english")).toBeVisible();
  const nav = page.locator(".en-nav");
  await expect(nav.getByRole("button", { name: /обзор|overview|огляд|übersicht/i })).toBeVisible();
  /* на обзоре есть ещё «Из книги · карточки» — клик только вкладки .en-nav */
  await nav.getByRole("button", { name: /из книги|from book|з книжк|aus dem buch/i }).click();
  await expect(page.locator(".en-from-book")).toBeVisible();
});
