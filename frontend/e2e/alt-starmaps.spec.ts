import { expect, test, type Page } from "@playwright/test";

/** Звёздные карты в alt: сетка по окну (порт 5897486), страница без прокрутки. */
async function boot(page: Page, skin: string) {
  await page.addInitScript(() => {
    localStorage.setItem("st_ask_crew_on_start", "0");
    localStorage.setItem("st_ui_variant", "alt");
  });
  await page.goto("/");
  await expect(page.getByTestId("cmp-header")).toBeVisible();
  if (skin !== "spaceship") {
    await page.locator('.nav-tab[data-zone="settings"]').click();
    await page.getByTestId("cmp-overview").click();
    await page.locator('.cmp-menu [data-screen="skins"]').click();
    await page.locator(".skin-card", { hasText: /стим|steam/i }).first().click();
  }
}

test.describe.configure({ timeout: 180000 });
for (const skin of ["spaceship", "steampunk"]) {
  for (const vp of [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
  ]) {
    test(`starmaps fit ${skin} ${vp.width}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await boot(page, skin);
      await page.locator('.nav-tab[data-zone="english"]').click();
      await page.getByTestId("cmp-overview").click();
      const item = page.locator('.cmp-menu [data-screen="sets"]').first();
      await expect(item).toBeVisible({ timeout: 60000 });
      await item.click();
      const grid = page.getByTestId("en-sm-grid");
      await expect(grid.locator(".en-sm-tile").first()).toBeVisible({ timeout: 30000 });
      await page.waitForTimeout(600);
      const m = await grid.evaluate((el) => ({
        cols: Number(el.getAttribute("data-cols")),
        rows: Number(el.getAttribute("data-rows")),
        tiles: el.querySelectorAll(".en-sm-tile").length,
        over: el.scrollHeight - el.clientHeight,
        page: document.scrollingElement!.scrollHeight - window.innerHeight,
      }));
      console.log(`[starmaps ${skin} ${vp.width}] ${JSON.stringify(m)}`);
      expect(m.cols).toBeGreaterThanOrEqual(2);
      expect(m.tiles).toBeLessThanOrEqual(m.cols * m.rows);
      expect(m.over).toBeLessThanOrEqual(1);
      expect(m.page).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `test-results/shots/alt_${skin}_starmaps_${vp.width}.png` });
    });
  }
}
