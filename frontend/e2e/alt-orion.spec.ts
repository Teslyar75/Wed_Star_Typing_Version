import { expect, test, type Page } from "@playwright/test";

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

async function noScroll(page: Page) {
  const over = await page.evaluate(() => document.scrollingElement!.scrollHeight - window.innerHeight);
  expect(over).toBeLessThanOrEqual(1);
}

test.describe.configure({ timeout: 180000 });
const SHOTS = "C:/Users/mi/grok_x/shots2";
for (const skin of ["spaceship", "steampunk"]) {
  for (const vp of [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
  ]) {
    test(`orion ${skin} ${vp.width}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await boot(page, skin);
      await page.locator('.nav-tab[data-zone="orion"]').click();
      await expect(page.getByTestId("orion-panel")).toBeVisible();
      await expect(page.getByTestId("orion-chat")).toBeVisible();
      await page.getByTestId("orion-input").fill("как начать тренировку?");
      await page.getByTestId("orion-send").click();
      await expect(page.getByTestId("orion-msg").nth(1)).toBeVisible({ timeout: 15000 });
      await noScroll(page);
      await page.screenshot({ path: `${SHOTS}/orion-${skin}-${vp.width}-chat.png` });
      for (const s of ["tasks", "archive", "settings"]) {
        await page.getByTestId("cmp-overview").click();
        await page.locator(`.cmp-menu [data-screen="${s}"]`).click();
        await expect(page.getByTestId(`orion-${s}`)).toBeVisible();
        await noScroll(page);
        if (s === "settings") {
          await expect(page.getByTestId("orion-mode-guide")).toBeVisible();
          for (const m of ["hosted", "contributor"]) {
            const card = page.getByTestId(`orion-mode-${m}`);
            if (await card.count()) await expect(card).toHaveAttribute("data-locked", "1");
          }
        }
        await page.screenshot({ path: `${SHOTS}/orion-${skin}-${vp.width}-${s}.png` });
      }
    });
  }
}
