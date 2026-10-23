import { expect, test, type Page } from "@playwright/test";

/** Обои отсеков в alt (порт stamina/assets/alt_wallpapers). */
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
const PROF: Record<string, string> = { spaceship: "starship", steampunk: "steampunk" };
for (const skin of ["spaceship", "steampunk"]) {
  for (const vp of [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
  ]) {
    test(`wallpaper ${skin} ${vp.width}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await boot(page, skin);
      for (const [zone, file] of [
        ["bridge", "bridge"],
        ["speed", "speedread"],
        ["radio", "radio"],
      ]) {
        await page.locator(`.nav-tab[data-zone="${zone}"]`).click();
        const wp = page.getByTestId("alt-wallpaper");
        await expect(wp).toHaveAttribute("data-zone", zone);
        const bg = await wp.evaluate((el) => getComputedStyle(el).backgroundImage);
        expect(bg).toContain(`/alt_wallpapers/${PROF[skin]}/${file}.jpg`);
        const ok = await page.evaluate(async (u) => (await fetch(u)).ok, `/alt_wallpapers/${PROF[skin]}/${file}.jpg`);
        expect(ok).toBe(true);
        const over = await page.evaluate(() => document.scrollingElement!.scrollHeight - window.innerHeight);
        expect(over).toBeLessThanOrEqual(1);
        await page.screenshot({ path: `test-results/wp-${skin}-${vp.width}-${zone}.png` });
      }
    });
  }
}
