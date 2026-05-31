/**
 * Ad-hoc one-off snapshot of /income/overview for UI redesign work.
 * Loads Sharmas seed, then full-page screenshot of the design-system roll-up
 * (StatDashboard + by-source donut/bars + IncomeVsExpenses chart + per-earner table).
 */
import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = "test-results/ui-overview";
mkdirSync(OUT, { recursive: true });

test("snapshot /income/overview", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.evaluate(() => { try { window.localStorage.clear(); } catch { /* */ } });
  await page.reload();
  await page.getByRole("button", { name: /Try the sample/i }).click();
  await page.waitForURL(/\/fire-goals\/dashboard/);
  await page.waitForTimeout(500);

  await page.goto("/income/overview", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  await page.screenshot({ path: join(OUT, "before.png"), fullPage: true });
  await expect(page.locator(".dash-card")).toBeVisible();
  expect(page.url()).toContain("/income/overview");
});
