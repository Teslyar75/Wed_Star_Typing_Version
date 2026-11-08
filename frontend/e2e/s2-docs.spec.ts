import { expect, test, type Page } from "@playwright/test";
import { enrollPilot, skipCrewAsk } from "./helpers";

async function pageOverflow(page: Page) {
  return page.evaluate(() => document.scrollingElement!.scrollHeight - window.innerHeight);
}

test("S2 guest: документы требуют экипаж", async ({ page }) => {
  await skipCrewAsk(page);
  await page.goto("/");
  await page.locator('.nav-tab[data-zone="docs"]').click();
  await expect(page.getByTestId("docs-panel")).toBeVisible();
  await expect(page.getByTestId("docs-status")).toContainText(/экипаж|crew|екіпаж|Crew/i);
  await expect(page.getByTestId("docs-row")).toHaveCount(0);
});

test("S2 CRUD, autosave, conflict, print markup, без window.print", async ({ page }) => {
  const cs = `D2${Date.now().toString(36).slice(-8)}`;
  await enrollPilot(page, cs);
  await page.locator('.nav-tab[data-zone="docs"]').click();
  await expect(page.getByTestId("docs-panel")).toBeVisible();
  await page.getByTestId("docs-new").click();
  await expect(page.getByTestId("docs-editor")).toBeVisible();
  await page.getByTestId("docs-title").fill("Журнал полёта");
  await page.getByTestId("docs-body").fill("раз два три");
  await expect(page.getByTestId("docs-status")).toHaveText(/Сохран/i, { timeout: 8000 });

  const id = Number(await page.getByTestId("docs-editor").getAttribute("data-doc-id"));
  expect(id).toBeGreaterThan(0);

  const sheet = page.getByTestId("docs-print-sheet");
  await expect(sheet).toContainText("Журнал полёта");
  await expect(sheet).toContainText("раз два три");
  const printCss = await page.evaluate(() => {
    return [...document.styleSheets].some((ss) => {
      try {
        return [...ss.cssRules].some((r) => /print/i.test(r.cssText) && /docs-print/i.test(r.cssText));
      } catch {
        return false;
      }
    });
  });
  expect(printCss).toBe(true);

  await page.getByTestId("docs-back").click();
  await expect(page.getByTestId("docs-row").first()).toContainText("Журнал");
  await page.getByTestId("docs-row").first().click();
  await expect(page.getByTestId("docs-body")).toHaveValue("раз два три");

  const rev = Number(await page.getByTestId("docs-editor").getAttribute("data-rev"));
  const hijack = await page.request.put(`/api/docs/${id}`, {
    data: { title: "Журнал полёта", body: "сервер выиграл", rev },
  });
  expect(hijack.ok()).toBeTruthy();
  await page.getByTestId("docs-body").fill("локальный текст не должен молча победить");
  await expect(page.getByTestId("docs-status")).toHaveText(/другом сеансе|another session|іншому|anderer/i, {
    timeout: 8000,
  });
  await page.getByTestId("docs-reload").click();
  await expect(page.getByTestId("docs-body")).toHaveValue("сервер выиграл");

  const got = await page.request.get(`/api/docs/${id}`);
  expect((await got.json()).body).toBe("сервер выиграл");
});

test("S2 изоляция: чужой пилот не видит документ", async ({ page, browser }) => {
  const a = `A${Date.now().toString(36).slice(-8)}`;
  await enrollPilot(page, a);
  await page.locator('.nav-tab[data-zone="docs"]').click();
  await page.getByTestId("docs-new").click();
  await page.getByTestId("docs-title").fill("секрет A");
  await page.getByTestId("docs-body").fill("только A");
  await expect(page.getByTestId("docs-status")).toHaveText(/Сохран/i, { timeout: 8000 });
  const id = Number(await page.getByTestId("docs-editor").getAttribute("data-doc-id"));

  const ctx = await browser.newContext();
  const pageB = await ctx.newPage();
  const b = `B${Date.now().toString(36).slice(-8)}`;
  await enrollPilot(pageB, b);
  const listed = await pageB.request.get("/api/docs");
  expect((await listed.json()).items).toEqual([]);
  const foreign = await pageB.request.get(`/api/docs/${id}`);
  expect(foreign.status()).toBe(404);
  const steal = await pageB.request.put(`/api/docs/${id}`, {
    data: { title: "hack", body: "stolen", rev: 1, pilot_id: 1 },
  });
  expect(steal.status()).toBe(404);
  await ctx.close();
});

for (const vp of [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
]) {
  test(`S2 размеры ${vp.width}x${vp.height} без прокрутки страницы`, async ({ page }) => {
    await page.setViewportSize(vp);
    const cs = `V${vp.width}${Date.now().toString(36).slice(-5)}`;
    await enrollPilot(page, cs);
    await page.locator('.nav-tab[data-zone="docs"]').click();
    await expect(page.getByTestId("docs-panel")).toBeVisible();
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
    await page.getByTestId("docs-new").click();
    await expect(page.getByTestId("docs-editor")).toBeVisible();
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `test-results/s2-docs-${vp.width}.png` });
  });
}

test("S2 classic и alt: зона docs в шапке", async ({ page }) => {
  await skipCrewAsk(page);
  await page.addInitScript(() => {
    localStorage.setItem("st_ui_variant", "alt");
  });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  await page.locator('.nav-tab[data-zone="docs"]').click();
  await expect(page.getByTestId("docs-panel")).toBeVisible();
  await expect(page.getByTestId("cmp-header")).toBeVisible();
  expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "test-results/s2-docs-alt-1366.png" });
});
