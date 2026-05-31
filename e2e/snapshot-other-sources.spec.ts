/**
 * Ad-hoc one-off snapshot of /income/other-sources for UI redesign work.
 * Loads Sharmas seed (so the page shows actual income lines), then
 * takes a full-page screenshot.
 */
import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = "test-results/ui-other-sources";
mkdirSync(OUT, { recursive: true });

test("snapshot /income/other-sources", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.evaluate(() => { try { window.localStorage.clear(); } catch { /* */ } });
  await page.reload();
  await page.getByRole("button", { name: /Try the sample/i }).click();
  await page.waitForURL(/\/fire-goals\/dashboard/);
  await page.waitForTimeout(500);

  await page.goto("/income/other-sources", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  await page.screenshot({ path: join(OUT, "before.png"), fullPage: true });
  expect(page.url()).toContain("/income/other-sources");
});
