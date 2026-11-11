import { expect, test, type Page } from "@playwright/test";

/** Страница без прокрутки: scrollHeight - innerHeight ≤ 1 (WEB_PORT_PLAN). */
async function pageOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.scrollingElement!.scrollHeight - window.innerHeight);
}

async function boot(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("st_ask_crew_on_start", "0");
  });
  await page.goto("/");
  await expect(page.getByTestId("cmp-header").or(page.locator(".nav-tab").first())).toBeVisible({
    timeout: 60000,
  });
}

const VIEWS = [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
] as const;

test.describe.configure({ timeout: 180000 });

for (const vp of VIEWS) {
  test(`no-scroll orion tabs ${vp.width}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await boot(page);
    await page.locator('.nav-tab[data-zone="orion"]').click();
    await expect(page.getByTestId("orion-panel")).toBeVisible();
    for (const tab of ["chat", "agents", "archive"] as const) {
      const btn = page.getByTestId("orion-tab-" + tab);
      if (await btn.count()) {
        await btn.click();
        await page.waitForTimeout(200);
        expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
      }
    }
  });

  test(`no-scroll cefr + en journal ${vp.width}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await boot(page);
    await page.locator('.nav-tab[data-zone="english"]').click();
    await expect(page.locator(".english")).toBeVisible();
    const overview = page.getByTestId("cmp-overview");
    if (await overview.count()) await overview.click();
    const sets = page.locator('.cmp-menu [data-screen="sets"]').first();
    if (await sets.count()) {
      await sets.click();
      const cefrTab = page.getByRole("button", { name: /CEFR/i }).first();
      if (await cefrTab.count()) await cefrTab.click();
      await expect(page.locator(".en-cefr, .en-starmaps")).toBeVisible({ timeout: 30000 });
      expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
    }
    const log = page.locator('.cmp-menu [data-screen="log"], .cmp-menu [data-screen="journal"]').first();
    if (await log.count()) {
      await log.click();
      await page.waitForTimeout(300);
      expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
    }
  });

  test(`no-scroll speed journal ${vp.width}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await boot(page);
    await page.locator('.nav-tab[data-zone="speed"]').click();
    const overview = page.getByTestId("cmp-overview");
    if (await overview.count()) await overview.click();
    const journal = page.locator('.cmp-menu [data-screen="journal"]').first();
    if (await journal.count()) {
      await journal.click();
      await page.waitForTimeout(300);
      expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
    } else {
      expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
    }
  });
}
