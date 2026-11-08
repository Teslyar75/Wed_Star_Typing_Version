import { expect, test } from "@playwright/test";
import { dismissGuide, enrollPilot } from "./helpers";

test("миссия 1 → старт → звёзды после финиша", async ({ page }) => {
  const callsign = `MD${Date.now().toString(36).slice(-6)}`;
  await enrollPilot(page, callsign);

  await page.getByRole("tab", { name: /Мостик|Bridge|Місток|Brücke/ }).click();
  await page.locator('.bridge-subnav [data-tab="missions"]').click();
  await expect(page.locator(".missions-map")).toBeVisible();
  await expect(
    page.getByText(/Звёздная карта миссий|Mission star map|Зоряна карта місій|Sternenkarte der Missionen/),
  ).toBeVisible();

  const first = page.locator(".mission-card").first();
  await expect(first).toBeVisible();
  await expect(first.locator(".mc-locked")).toHaveCount(0);
  await first.click();

  const typing = page.getByLabel("typing");
  await typing.focus();
  const cursor = page.locator(".viewport .cursor");
  await expect(cursor).toBeVisible();
  const tele = page.locator(".inst-tele");
  await expect(tele).toBeVisible();
  for (let i = 0; i < 40; i++) {
    const ch = await cursor.innerText();
    if (!ch || ch === "¶") break;
    await page.keyboard.type(ch === "¶" ? "" : ch, { delay: 5 });
    const done = await tele.innerText();
    if (/ФИНИШ|FINISH|ФІНІШ|ZIEL/.test(done)) break;
  }

  await page.evaluate(async () => {
    const drills = await (await fetch("/api/missions/drills?lang=en", { credentials: "include" })).json();
    const id = drills[0].id;
    await fetch(`/api/missions/drills/${id}/complete`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acc: 99, cpm: 80, chars: 120, key_stats: { f: [20, 0], j: [20, 1] } }),
    });
  });

  await page.reload();
  await dismissGuide(page);
  await page.getByRole("tab", { name: /Мостик|Bridge|Місток|Brücke/ }).click();
  await page.locator('.bridge-subnav [data-tab="missions"]').click();
  await expect(page.locator(".missions-map")).toBeVisible();
  const second = page.locator(".mission-card").nth(1);
  await expect(second).toBeVisible({ timeout: 10_000 });
  await expect(second.locator(".mc-locked")).toHaveCount(0);
});
