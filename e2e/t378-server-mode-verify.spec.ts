import { test, expect } from "@playwright/test";
import { fillQuickPath } from "./quick-path-helper";

/**
 * T-378F fix-round item 5 — close the server-mode gap T-378C's checker left open (skip b):
 * complete `/quick` under VITE_USE_SERVER_ADAPTER and prove by an INDEPENDENT
 * `GET /api/planner/*` (x-dev-bypass header, never through the UI) that the real backend
 * persisted the quick investment lines (quickSource), the members, the plannedFuture rows, the
 * liability, and `ui.quick`.
 *
 * Scratch verification spec for this PR's evidence — run via:
 *   npx playwright test --config=playwright.server-mode.config.ts
 * Requires server/.env (DATABASE_URL + DEV_BYPASS_AUTH=true) and .env.local
 * (VITE_USE_SERVER_ADAPTER=on) at the repo root — both already gitignored.
 */
test("server mode: /quick round-trips through the real backend (rule 25)", async ({ page }) => {
  // Wipe any prior dev-bypass user's data so this run starts clean.
  const wipe = await page.request.delete("http://localhost:3100/api/planner/all", {
    headers: { "x-dev-bypass": "true" },
  });
  expect([200, 204, 404]).toContain(wipe.status());

  await page.goto("/", { waitUntil: "networkidle" });
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });

  // Server-adapter mode has no seed-switcher splash — /quick is reachable directly, same as demo.
  await page.goto("/quick", { waitUntil: "networkidle" });
  await expect(page.locator('[data-testid="quick-question"]')).toBeVisible({ timeout: 20000 });
  await fillQuickPath(page);
  await expect(page.locator('[data-testid="quick-result"]')).toBeVisible({ timeout: 20000 });

  // Give the write-behind ServerAdapter a moment to flush the PUT before the independent read
  // (default debounce is 1500ms — pad well past it for the actual network round trip too).
  await page.waitForTimeout(4000);

  const householdRes = await page.request.get("http://localhost:3100/api/planner/household", {
    headers: { "x-dev-bypass": "true" },
  });
  expect(householdRes.ok(), `GET /api/planner/household -> ${householdRes.status()}`).toBeTruthy();
  const envelope = await householdRes.json();
  const household = envelope.data ?? envelope;

  // 4 members: self, spouse, 2 kids (AMIT-shaped answers from fillQuickPath).
  expect(household.members.length).toBe(4);
  const quickInvestments = household.investments.filter(
    (i: { quickSource?: boolean }) => i.quickSource === true,
  );
  expect(quickInvestments.length).toBe(2);
  // quickSource must survive the round trip via subtypeData, not a Prisma schema change.
  for (const inv of quickInvestments) {
    expect(inv.quickSource).toBe(true);
  }
  expect(household.expenses.plannedFuture.length).toBe(4); // education, postgrad, wedding, purchase
  expect(household.liabilities.length).toBe(1);
  expect(household.liabilities[0].type).toBe("HomeLoan");

  const uiRes = await page.request.get("http://localhost:3100/api/planner/ui", {
    headers: { "x-dev-bypass": "true" },
  });
  expect(uiRes.ok(), `GET /api/planner/ui -> ${uiRes.status()}`).toBeTruthy();
  const uiEnvelope = await uiRes.json();
  const ui = uiEnvelope.data ?? uiEnvelope;
  expect(ui.quick, "ui.quick must survive the strip-mode Zod object").toBeTruthy();
  expect(Array.isArray(ui.quick.createdIds)).toBe(true);
  expect(ui.quick.createdIds.length).toBeGreaterThan(0);

  // eslint-disable-next-line no-console
  console.log("T-378F server-mode rule-25 proof: PASS", {
    members: household.members.length,
    quickInvestments: quickInvestments.length,
    plannedFuture: household.expenses.plannedFuture.length,
    liabilities: household.liabilities.length,
    uiQuickCreatedIds: ui.quick.createdIds.length,
  });
});
