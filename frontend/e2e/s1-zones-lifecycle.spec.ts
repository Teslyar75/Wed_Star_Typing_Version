import { expect, test } from "@playwright/test";
import { skipCrewAsk } from "./helpers";

const ZONES = ["bridge", "english", "speed", "lounge", "radio", "orion", "settings"] as const;

test("S1 зоны: 7 вкладок, без Docs/Comm, Ctrl+7 → настройки", async ({ page }) => {
  await skipCrewAsk(page);
  await page.goto("/");
  const tabs = page.locator(".top-nav .nav-tab");
  await expect(tabs).toHaveCount(7);
  for (const z of ZONES) {
    await expect(page.locator(`.nav-tab[data-zone="${z}"]`)).toBeVisible();
  }
  await expect(page.locator('.nav-tab[data-zone="docs"]')).toHaveCount(0);
  await expect(page.locator('.nav-tab[data-zone="comm"]')).toHaveCount(0);

  await page.locator(".brand-title").click();
  await page.keyboard.press("Control+7");
  await expect(page.locator('.nav-tab[data-zone="settings"]')).toHaveAttribute("aria-selected", "true");
});

test("S1 English: скрытая подстраница не остаётся в DOM", async ({ page }) => {
  await skipCrewAsk(page);
  await page.goto("/");
  await page.locator('.nav-tab[data-zone="english"]').click();
  const panel = page.getByTestId("en-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("data-en-page", "overview");
  await expect(page.locator(".en-overview-grid")).toBeVisible();
  await expect(page.locator(".en-starmaps")).toHaveCount(0);

  await page.locator('[data-en-nav="sets"]').click();
  await expect(panel).toHaveAttribute("data-en-page", "sets");
  await expect(page.locator(".en-starmaps")).toBeVisible();
  await expect(page.locator(".en-overview-grid")).toHaveCount(0);
  await expect(page.locator(".en-scanner")).toHaveCount(0);

  await page.locator('[data-en-nav="scanner"]').click();
  await expect(panel).toHaveAttribute("data-en-page", "scanner");
  await expect(page.locator(".en-scanner")).toBeVisible();
  await expect(page.locator(".en-starmaps")).toHaveCount(0);

  await page.locator('[data-en-nav="overview"]').click();
  await expect(page.locator(".en-overview-grid")).toBeVisible();
  await expect(page.locator(".en-scanner")).toHaveCount(0);
  await expect(page.locator(".en-starmaps")).toHaveCount(0);
});

test("S1 speed: тренажёр размонтируется при уходе со страницы", async ({ page }) => {
  await skipCrewAsk(page);
  await page.goto("/");
  await page.locator('.nav-tab[data-zone="speed"]').click();
  await expect(page.locator(".sr-hub")).toBeVisible();
  await page.locator('[data-sr-nav="trainers"]').click();
  await expect(page.locator(".sr-trainers-page")).toBeVisible();
  await page.locator(".sr-trainer.ready").first().click();
  await expect(page.locator(".ex-shell")).toBeVisible();
  await page.locator('[data-sr-nav="overview"]').click();
  await expect(page.locator(".ex-shell")).toHaveCount(0);
  await expect(page.locator(".sr-hub")).toHaveAttribute("data-sr-page", "overview");
});

test("S1 радио-хост живёт при смене зоны, панель радио — нет", async ({ page }) => {
  await skipCrewAsk(page);
  await page.goto("/");
  await expect(page.locator("audio.radio-audio")).toHaveCount(1);
  await page.locator('.nav-tab[data-zone="radio"]').click();
  await expect(page.locator("section.radio")).toBeVisible();
  await expect(page.locator("audio.radio-audio")).toHaveCount(1);
  await page.locator('.nav-tab[data-zone="orion"]').click();
  await expect(page.locator("section.radio")).toHaveCount(0);
  await expect(page.locator("audio.radio-audio")).toHaveCount(1);
});
