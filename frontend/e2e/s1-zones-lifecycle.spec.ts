import { expect, test } from "@playwright/test";
import { skipCrewAsk } from "./helpers";

const ZONES = ["bridge", "english", "speed", "lounge", "radio", "comm", "docs", "orion", "lab", "settings"] as const;

test("зоны: 10 вкладок, lab перед settings, Ctrl+0 lab / Ctrl+9 настройки", async ({ page }) => {
  await skipCrewAsk(page);
  await page.goto("/");
  const tabs = page.locator(".top-nav .nav-tab");
  await expect(tabs).toHaveCount(10);
  for (const z of ZONES) {
    await expect(page.locator(`.nav-tab[data-zone="${z}"]`)).toBeVisible();
  }
  const order = await tabs.evaluateAll((els) => els.map((e) => e.getAttribute("data-zone")));
  expect(order.indexOf("comm")).toBeGreaterThan(order.indexOf("radio"));
  expect(order.indexOf("comm")).toBeLessThan(order.indexOf("docs"));
  expect(order.indexOf("docs")).toBeLessThan(order.indexOf("orion"));
  expect(order.indexOf("lab")).toBe(order.indexOf("settings") - 1);

  await page.locator(".brand-title").click();
  await page.keyboard.press("Control+6");
  await expect(page.locator('.nav-tab[data-zone="comm"]')).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Control+7");
  await expect(page.locator('.nav-tab[data-zone="docs"]')).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Control+0");
  await expect(page.locator('.nav-tab[data-zone="lab"]')).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Control+9");
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
