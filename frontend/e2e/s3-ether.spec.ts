import { expect, test, type Page } from "@playwright/test";
import { enrollPilot, skipCrewAsk } from "./helpers";

async function pageOverflow(page: Page) {
  return page.evaluate(() => document.scrollingElement!.scrollHeight - window.innerHeight);
}

test("S3 гость: эфир требует экипаж", async ({ page }) => {
  await skipCrewAsk(page);
  await page.goto("/");
  await page.locator('.nav-tab[data-zone="comm"]').click();
  await expect(page.getByTestId("comm-panel")).toBeVisible();
  await expect(page.getByTestId("comm-status")).toContainText(/экипаж|crew|екіпаж|Crew/i);
  await expect(page.getByTestId("comm-input")).toHaveCount(0);
});

test("S3 два тестовых пилота: отправка, получение, ответ", async ({ page, browser }) => {
  const a = `Ea${Date.now().toString(36).slice(-6)}`;
  const b = `Eb${Date.now().toString(36).slice(-6)}`;
  await enrollPilot(page, a);
  await page.locator('.nav-tab[data-zone="comm"]').click();
  await expect(page.getByTestId("comm-input")).toBeVisible();
  const ping = `ping-${Date.now().toString(36).slice(-6)}`;
  const pong = `pong-${Date.now().toString(36).slice(-6)}`;
  await page.getByTestId("comm-input").fill(ping);
  await page.getByTestId("comm-send").click();
  await expect(page.getByTestId("comm-msg").filter({ hasText: ping })).toBeVisible();

  const ctx = await browser.newContext();
  const pageB = await ctx.newPage();
  await enrollPilot(pageB, b);
  await pageB.locator('.nav-tab[data-zone="comm"]').click();
  await expect(pageB.getByTestId("comm-msg").filter({ hasText: ping })).toBeVisible({ timeout: 10_000 });
  const incoming = pageB.getByTestId("comm-msg").filter({ hasText: ping });
  await expect(incoming).toHaveAttribute("data-mine", "0");
  await pageB.getByTestId("comm-input").fill(pong);
  await pageB.getByTestId("comm-send").click();
  await expect(pageB.getByTestId("comm-msg").filter({ hasText: pong })).toBeVisible();

  await page.getByTestId("comm-refresh").click();
  await expect(page.getByTestId("comm-msg").filter({ hasText: pong })).toBeVisible({ timeout: 10_000 });
  const reply = page.getByTestId("comm-msg").filter({ hasText: pong });
  await expect(reply).toHaveAttribute("data-mine", "0");
  await ctx.close();
});

test("S3 радио-хост не сломан зоной Эфир", async ({ page }) => {
  await skipCrewAsk(page);
  await page.goto("/");
  await expect(page.locator("audio.radio-audio")).toHaveCount(1);
  await page.locator('.nav-tab[data-zone="radio"]').click();
  await expect(page.getByTestId("radio-panel")).toBeVisible();
  await page.locator('.nav-tab[data-zone="comm"]').click();
  await expect(page.getByTestId("comm-panel")).toBeVisible();
  await expect(page.locator("audio.radio-audio")).toHaveCount(1);
});

test("S3 radio WIP: избранное изолировано cookie-пилотом", async ({ page, browser }) => {
  const a = `Ra${Date.now().toString(36).slice(-6)}`;
  await enrollPilot(page, a);
  const put = await page.request.put("/api/radio/favs", {
    data: [{ stationuuid: "sec-a", name: "Secret A", url_resolved: "https://a.example/stream" }],
  });
  expect(put.ok()).toBeTruthy();
  expect((await (await page.request.get("/api/radio/favs")).json())[0].name).toBe("Secret A");

  const ctx = await browser.newContext();
  const pageB = await ctx.newPage();
  const b = `Rb${Date.now().toString(36).slice(-6)}`;
  await enrollPilot(pageB, b);
  expect(await (await pageB.request.get("/api/radio/favs")).json()).toEqual([]);
  await ctx.close();
});

for (const vp of [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
]) {
  test(`S3 эфир без прокрутки страницы ${vp.width}`, async ({ page }) => {
    await skipCrewAsk(page);
    await page.setViewportSize(vp);
    await page.goto("/");
    await page.locator('.nav-tab[data-zone="comm"]').click();
    await expect(page.getByTestId("comm-panel")).toBeVisible();
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
  });
}
