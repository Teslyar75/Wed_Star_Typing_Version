import { expect, test, type Page } from "@playwright/test";

/** Шаги 2–6 веб-порта: отсеки в «Пульт-кабине». Каждый экран — через ОБЗОР, без прокрутки страницы. */
const ZONES = ["bridge", "english", "speed", "radio", "settings"] as const;
const VPS = [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
];

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

async function pageOverflow(page: Page) {
  return page.evaluate(() => document.scrollingElement!.scrollHeight - window.innerHeight);
}

test.describe.configure({ timeout: 300000 });
for (const skin of ["spaceship", "steampunk"]) {
  for (const vp of VPS) {
    test(`compartments ${skin} ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await boot(page, skin);
      const report: string[] = [];
      for (const zone of ZONES) {
        await page.locator(`.nav-tab[data-zone="${zone}"]`).click();
        await page.getByTestId("cmp-overview").click();
        const items = page.locator(".cmp-menu [role=menuitemradio]");
        await expect(items.nth(1)).toBeVisible({ timeout: 60000 });
        const ids = await items.evaluateAll((els) => els.map((e) => e.getAttribute("data-screen") || ""));
        expect(ids.length).toBeGreaterThan(1);
        await page.getByTestId("cmp-overview").click();
        await expect(page.locator(".cmp-menu")).toHaveCount(0);
        for (const id of ids) {
          await page.getByTestId("cmp-overview").click();
          await page.locator(`.cmp-menu [data-screen="${id}"]`).click();
          await expect(page.locator(".cmp-menu")).toHaveCount(0);
          await expect(page.locator(`.cmp-title`)).toBeVisible();
          await page.waitForTimeout(250);
          const over = await pageOverflow(page);
          report.push(`${zone}/${id}: ${over}`);
          expect(over, `${zone}/${id} page scroll`).toBeLessThanOrEqual(1);
          if (vp.width === 1366) await page.screenshot({ path: `test-results/shots/alt_${skin}_${zone}_${id}.png` });
        }
        /* классическая навигация отсека в alt скрыта */
        await expect(page.locator(".sr-subs:visible, .settings-subs:visible, .radio-tabs:visible, .en-nav:visible")).toHaveCount(0);
      }
      console.log(`[${skin} ${vp.width}] ` + report.join(" | "));
    });
  }
}

test("classic keeps own sub-navigation", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("st_ask_crew_on_start", "0");
    localStorage.removeItem("st_ui_variant");
  });
  await page.goto("/");
  await page.locator('.nav-tab[data-zone="speed"]').click();
  await expect(page.locator(".sr-subs")).toBeVisible({ timeout: 60000 });
  await page.locator('.nav-tab[data-zone="settings"]').click();
  await expect(page.locator(".settings-subs")).toBeVisible({ timeout: 60000 });
  await expect(page.getByTestId("cmp-header")).toHaveCount(0);
});

test("ОБЗОР follows skin accent", async ({ page }) => {
  await boot(page, "spaceship");
  const a = await page.getByTestId("cmp-overview").evaluate((e) => getComputedStyle(e).backgroundColor);
  await page.locator('.nav-tab[data-zone="settings"]').click();
  await page.getByTestId("cmp-overview").click();
  await page.locator('.cmp-menu [data-screen="skins"]').click();
  await page.locator(".skin-card", { hasText: /стим|steam/i }).first().click();
  const b = await page.getByTestId("cmp-overview").evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(a).not.toBe(b);
});
