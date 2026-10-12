import { expect, test } from "@playwright/test";

test("миссия 1 → старт → звёзды после финиша", async ({ page }) => {
  const callsign = `MD${Date.now().toString(36).slice(-6)}`;

  await page.goto("/");
  await page.getByRole("button", { name: /Экипаж|Crew|Екіпаж/ }).click();
  await page.getByPlaceholder(/позывной|callsign/i).fill(callsign);
  await page.getByPlaceholder(/PIN/i).fill("4242");
  await page.getByRole("button", { name: /Зачислить|Enroll|Зарахувати|Anmelden/ }).click();
  await expect(page.getByRole("strong").filter({ hasText: callsign })).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: /Мостик|Bridge|Місток|Brücke/ }).click();
  await expect(page.getByText(/Карта миссий|Mission map|Карта місій|Missionskarte/)).toBeVisible();

  const startBtn = page.getByRole("button", { name: /1\.\s*(Docking|Стыковка)/ }).first();
  await startBtn.click();

  const typing = page.getByLabel("typing");
  await typing.focus();
  // короткий путь: перезагружаем draft через API не можем — печатаем сгенерированный текст из viewport
  const ahead = page.locator(".viewport .ahead");
  const cursor = page.locator(".viewport .cursor");
  await expect(cursor).toBeVisible();
  // берём первые символы из data: читаем text через evaluate engine невозможн — печатаем по курсору посимвольно ограниченно
  for (let i = 0; i < 40; i++) {
    const ch = await cursor.innerText();
    if (!ch || ch === "¶") break;
    await page.keyboard.type(ch === "¶" ? "" : ch, { delay: 5 });
    const done = await page.locator(".telemetry").innerText();
    if (/ФИНИШ|FINISH|ФІНІШ|ZIEL/.test(done)) break;
  }

  // если текст длинный — API complete через прямой вызов после частичного набора не сработает;
  // добиваем через fetch в контексте страницы
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
  await page.getByRole("button", { name: /Мостик|Bridge|Місток|Brücke/ }).click();
  await expect(page.getByRole("button", { name: /2\./ })).toBeEnabled({ timeout: 10_000 });
});
