import { expect, test } from "@playwright/test";
import { skipCrewAsk } from "./helpers";

test.describe.configure({ timeout: 120000 });

test("Лаборатория: зона, Ctrl+0, три уровня, без прокрутки", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("st_lab_demo", "1");
  });
  await skipCrewAsk(page);
  await page.goto("/");

  await expect(page.locator(".top-nav .nav-tab")).toHaveCount(10);
  await expect(page.locator('.nav-tab[data-zone="lab"]')).toBeVisible();

  await page.locator(".brand-title").click();
  await page.keyboard.press("Control+0");
  await expect(page.locator('.nav-tab[data-zone="lab"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("lab-panel")).toBeVisible();
  await expect(page.getByTestId("lab-panel")).toHaveAttribute("data-lab-mode", "visual");
  await expect(page.getByTestId("lab-canvas")).toBeVisible();

  const over = await page.evaluate(() => document.scrollingElement!.scrollHeight - window.innerHeight);
  expect(over).toBeLessThanOrEqual(1);

  // settings still Ctrl+9
  await page.keyboard.press("Control+9");
  await expect(page.locator('.nav-tab[data-zone="settings"]')).toHaveAttribute("aria-selected", "true");

  await page.locator('.nav-tab[data-zone="lab"]').click();
  await expect(page.getByTestId("lab-panel")).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: "test-results/lab-visual.png", fullPage: false });

  // enter work: click roughly center-left cluster area then rely on demo graph
  const canvas = page.getByTestId("lab-canvas");
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  // try a few click points until work mode
  let work = false;
  for (const [fx, fy] of [
    [0.35, 0.45],
    [0.55, 0.4],
    [0.42, 0.55],
    [0.62, 0.52],
    [0.28, 0.58],
  ]) {
    await canvas.click({ position: { x: box!.width * fx, y: box!.height * fy } });
    await page.waitForTimeout(500);
    const mode = await page.getByTestId("lab-panel").getAttribute("data-lab-mode");
    if (mode === "work") {
      work = true;
      break;
    }
  }
  expect(work).toBeTruthy();
  await page.screenshot({ path: "test-results/lab-work.png", fullPage: false });

  // full snapshot
  await page.getByRole("button", { name: /слепок|snapshot|зліпок|Vollabdruck/i }).click();
  await expect(page.getByTestId("lab-snapshot-json").or(page.getByTestId("lab-snapshot-progress"))).toBeVisible({
    timeout: 60000,
  });
  await expect(page.getByTestId("lab-snapshot-json")).toBeVisible({ timeout: 60000 });
  await page.screenshot({ path: "test-results/lab-full.png", fullPage: false });

  // F1 help with lab tabs
  await page.keyboard.press("F1");
  await expect(page.locator(".help-overlay")).toBeVisible();
  await expect(page.locator(".help-lab-tabs")).toBeVisible();
  await page.locator(".help-lab-tabs .hud-btn").nth(1).click();
  await expect(page.locator(".help-modal-body")).toContainText(/Ctrl|колёс|wheel|орбит/i);
});
