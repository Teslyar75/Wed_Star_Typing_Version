import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHOTS = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../docs/showcase/orion-link");

async function mockOrion(page: Page) {
  await page.route("**/api/orion/config", async (route) => {
    const available = await page.evaluate(() => (window as unknown as { __ocOk?: boolean }).__ocOk !== false);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        mode: "guide",
        modes: [{ id: "guide", available: true, reason: "", capabilities: { text: true, images: false } }],
        roles: [],
        logged_in: true,
        pilot: "E2E",
        byo_storage: "client",
        max_images: 3,
        max_image_bytes: 2_000_000,
        opencode: {
          available,
          cli: available ? "/bin/opencode" : "",
          model: "opencode/deepseek-v4.1-flash-free",
          reason: available ? "" : "bridge_down",
        },
      }),
    });
  });
  await page.route("**/api/orion/health**", async (route) => {
    const available = await page.evaluate(() => (window as unknown as { __ocOk?: boolean }).__ocOk !== false);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        available,
        reason: available ? "" : "bridge_down",
        state: available ? "ok" : "down",
        kind: "opencode",
        agent_id: "orion",
        cached: false,
      }),
    });
  });
  await page.route("**/api/orion/agents", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        active: "orion",
        items: [{
          id: 1, agent_id: "orion", name: "Орион", kind: "opencode", access: "commander",
          enabled: true, provider: "openai", base_url: "", model: "opencode/deepseek-v4.1-flash-free",
          vision: false, manners: "", note: "", voice: "ship", needs_key: false,
        }],
      }),
    });
  });
  await page.route("**/api/orion/messages**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ total: 0, items: [] }) });
  });
}

test.describe.configure({ timeout: 120000 });

test("orion link indicator green then red", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("st_ask_crew_on_start", "0");
    (window as unknown as { __ocOk?: boolean }).__ocOk = true;
  });
  await mockOrion(page);
  await page.goto("/");
  await expect(page.locator('.nav-tab[data-zone="orion"]').or(page.getByRole("tab", { name: /орион/i }))).toBeVisible({ timeout: 30000 });
  await page.locator('.nav-tab[data-zone="orion"]').click();
  await expect(page.getByTestId("orion-panel")).toBeVisible();
  const link = page.getByTestId("orion-link-chat");
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("data-tone", "ok");
  await page.screenshot({ path: path.join(SHOTS, "link-green.png"), fullPage: false });

  await page.evaluate(() => {
    (window as unknown as { __ocOk?: boolean }).__ocOk = false;
  });
  await link.click();
  await expect(link).toHaveAttribute("data-tone", "down", { timeout: 10000 });
  await expect(link).toHaveAttribute("data-reason", "bridge_down");
  await page.screenshot({ path: path.join(SHOTS, "link-red.png"), fullPage: false });
});
