/**
 * Ad-hoc one-off snapshot of /income/salary for UI redesign work.
 * Loads Sharmas seed, captures the dashboard + earner rail, then opens the
 * click-to-edit dialog and captures that too.
 */
import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = "test-results/ui-salary";
mkdirSync(OUT, { recursive: true });

test("snapshot /income/salary", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.evaluate(() => { try { window.localStorage.clear(); } catch { /* */ } });
  await page.reload();
  await page.getByRole("button", { name: /Try the sample/i }).click();
  await page.waitForURL(/\/fire-goals\/dashboard/);
  await page.waitForTimeout(500);

  await page.goto("/income/salary", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  await page.screenshot({ path: join(OUT, "before.png"), fullPage: true });

  // Click the featured earner card → the rich EarnerSalaryForm opens in a dialog.
  await page.locator(".rail-featured").first().click();
  await page.waitForTimeout(400);
  await expect(page.locator(".v-dialog .entry-dialog")).toBeVisible();
  await page.screenshot({ path: join(OUT, "edit-dialog.png"), fullPage: true });

  expect(page.url()).toContain("/income/salary");
});
