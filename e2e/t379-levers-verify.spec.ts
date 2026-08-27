import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { fillQuickPath } from "./quick-path-helper";

/**
 * QN-5 (T-379) rule-24/32 evidence — screenshots of the lever picker at 390 and 1280 with each
 * move toggled, on /quick and on the dashboard. Scratch verification spec (testIgnore'd unless
 * RUN_SCRATCH_VERIFY=1), not part of the regression suite.
 */
const DIR = `verification-screenshots/T-379-levers-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const KEYS = ["step-up-10", "delay-3", "trim-expenses", "direct-plans", "no-prepay-roll-emi"];

for (const width of [390, 1280]) {
  test(`levers at ${width}px — /quick result + dashboard`, async ({ page }) => {
    test.setTimeout(240_000); // ten cards + six solver-backed toggles + full-page shots
    mkdirSync(DIR, { recursive: true });
    await page.setViewportSize({ width, height: width < 600 ? 900 : 1400 });
    await page.goto("/", { waitUntil: "networkidle" });
    await page.evaluate(() => window.localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });
    await page.getByText("Start my own plan").click();
    await expect(page).toHaveURL(/\/quick/, { timeout: 20000 });
    await fillQuickPath(page);
    const picker = page.locator('[data-testid="lever-picker"]');
    await expect(picker).toBeVisible({ timeout: 20000 });
    await picker.scrollIntoViewIfNeeded();
    await picker.screenshot({ path: `${DIR}/${width}-quick-picker-none.png` });
    for (const k of KEYS) {
      await page.locator(`[data-testid="lever-toggle-${k}"]`).check();
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${DIR}/${width}-quick-on-${k}.png`, fullPage: true });
    }
    await picker.screenshot({ path: `${DIR}/${width}-quick-picker-all.png` });
    await page.locator('[data-testid="quick-open-planner"]').click();
    await expect(page).toHaveURL(/\/fire-goals\/dashboard/, { timeout: 20000 });
    await page.waitForTimeout(1500);
    const card = page.locator('[data-testid="acceleration-card"]');
    await expect(card).toBeVisible();
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: `${DIR}/${width}-dashboard-accel-card-all-on.png` });
    await page.screenshot({ path: `${DIR}/${width}-dashboard-full.png`, fullPage: true });
  });
}
