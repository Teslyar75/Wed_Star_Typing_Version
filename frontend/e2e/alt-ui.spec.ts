import { expect, test } from "@playwright/test";

/** Шаг 1 веб-порта: шапка отсека alt + ОБЗОР ▾ + классика без изменений. Скриншоты spaceship/steampunk. */
for (const skin of ["spaceship", "steampunk"]) {
  test(`alt header ${skin}`, async ({ page }) => {
    await page.addInitScript(
      ([s]) => {
        localStorage.setItem("st_ask_crew_on_start", "0");
        localStorage.setItem("st_skin", s);
        localStorage.setItem("st_ui_variant", "alt");
      },
      [skin],
    );
    await page.goto("/");
    if (skin !== "spaceship") {
      /* гость стартует на базовом скине — переключаем через Настройки → Скины */
      await page.locator('.nav-tab[data-zone="settings"]').click();
      await page.getByTestId("cmp-overview").click();
      await page.locator('.cmp-menu [data-screen="skins"]').click();
      await page.locator(".skin-card", { hasText: /стим|steam/i }).first().click();
      await page.locator('.nav-tab[data-zone="bridge"]').click();
    }
    const hdr = page.getByTestId("cmp-header");
    await expect(hdr).toBeVisible();
    await expect(page.locator(".bridge-subnav")).toHaveCount(0);
    await page.getByTestId("cmp-overview").click();
    await expect(page.locator(".cmp-menu [role=menuitemradio]")).toHaveCount(5);
    await page.screenshot({ path: `test-results/shots/step1_${skin}_alt_menu.png` });
    await page.locator(".cmp-menu [role=menuitemradio]").nth(3).click();
    await expect(page.locator(".cmp-title")).toContainText(/журнал|log/i);
    await page.screenshot({ path: `test-results/shots/step1_${skin}_alt_log.png` });
  });
}

test("classic unchanged", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("st_ask_crew_on_start", "0");
    localStorage.removeItem("st_ui_variant");
  });
  await page.goto("/");
  await expect(page.getByTestId("cmp-header")).toHaveCount(0);
  await expect(page.locator(".bridge-subnav")).toBeVisible();
  await expect(page.locator(".path-crumbs")).toBeVisible();
  await page.screenshot({ path: "test-results/shots/step1_classic.png" });
});

/** Веб без прокрутки: шапка alt не должна вызывать скролл страницы. */
for (const vp of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
  test(`alt no page scroll ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.addInitScript(() => {
      localStorage.setItem("st_ask_crew_on_start", "0");
      localStorage.setItem("st_ui_variant", "alt");
    });
    await page.goto("/");
    await expect(page.getByTestId("cmp-header")).toBeVisible();
    const over = await page.evaluate(() => {
      const se = document.scrollingElement!;
      return se.scrollHeight - window.innerHeight;
    });
    expect(over).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `test-results/shots/step1_alt_${vp.width}.png` });
  });
}
