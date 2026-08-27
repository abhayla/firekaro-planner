import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { fillQuickPath } from "./quick-path-helper";

/**
 * T-378F fix-round evidence (F3, F4, F7) — screenshot proof that the VERDICT.md fix-round items
 * actually render, not just that the code changed. Scratch verification spec, not part of the
 * regression suite (excluded by playwright.config.ts's `t3??-*-verify.spec.ts` testIgnore unless
 * RUN_SCRATCH_VERIFY=1).
 */
const DIR = `verification-screenshots/T-378F-fixround-${new Date().toISOString().replace(/[:.]/g, "-")}`;

test("F4: two-column result layout is a real CSS grid at 1280px", async ({ page }) => {
  mkdirSync(DIR, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 1400 });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("Start my own plan").click();
  await expect(page).toHaveURL(/\/quick/, { timeout: 20000 });
  await fillQuickPath(page);
  await expect(page.locator('[data-testid="quick-result"]')).toBeVisible({ timeout: 20000 });

  const gridStyle = await page.evaluate(() => {
    const el = document.querySelector(".result-grid");
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { display: cs.display, cols: cs.gridTemplateColumns };
  });
  expect(gridStyle, "the .result-grid element must exist").toBeTruthy();
  expect(gridStyle!.display).toBe("grid");
  // Two tracks, not "none" (the F4 bug: SSOT pins 1.15fr 1fr, i.e. two numeric column widths).
  const trackCount = gridStyle!.cols.trim().split(/\s+/).length;
  expect(trackCount, `grid-template-columns was "${gridStyle!.cols}"`).toBe(2);

  await page.screenshot({ path: `${DIR}/1280-result-two-column.png`, fullPage: true });

  // F7: the QN-5 placeholder must be visible text, not only a source comment.
  await expect(page.locator('[data-testid="quick-levers-placeholder"]')).toBeVisible();
  await expect(page.locator('[data-testid="quick-levers-placeholder"]')).toContainText(
    "Coming soon",
  );
});

test("F3: the over-commitment warning renders when spend+sip+emi exceeds take-home", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1400 });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("Start my own plan").click();
  await expect(page).toHaveURL(/\/quick/, { timeout: 20000 });
  await fillQuickPath(page);
  await expect(page.locator('[data-testid="quick-result"]')).toBeVisible({ timeout: 20000 });

  // AMIT's own answers (1.8L spend + 1.75L sip + 1L emi = 4.55L of 5L) do NOT over-commit —
  // confirm the warning is silent for the honest case first (no false positives).
  await expect(page.locator('[data-testid="quick-overcommit-warning"]')).toHaveCount(0);

  // Now edit answers and push spend past the take-home to trigger the guard. "Edit answers"
  // lives inside a lazily-rendered v-expansion-panel — open it first (T-378C skip (e) finding).
  await page.locator('[data-testid="quick-answers-panel"] .v-expansion-panel-title').click();
  await page.waitForTimeout(300);
  await page.locator('[data-testid="quick-edit-answers"]').click();
  // "Edit answers" resets to card 1 — walk back to the spend card (index 2) and bump it.
  await page.locator('[data-testid="quick-next"]').click(); // 1 -> 2
  await page.waitForTimeout(120);
  await page.locator('[data-testid="quick-next"]').click(); // 2 -> 3 (spend)
  await page.waitForTimeout(120);
  await page.locator('[data-testid="quick-spend"] input').fill("4.5"); // 4.5L, was 1.8L
  // Walk to the last card (loan) to trigger the guard there too.
  for (let i = 0; i < 7; i += 1) {
    await page.locator('[data-testid="quick-next"]').click();
    await page.waitForTimeout(100);
  }
  await expect(page.locator('[data-testid="quick-overcommit-warning"]')).toBeVisible();
  await page.screenshot({ path: `${DIR}/overcommit-warning-last-card.png`, fullPage: true });

  await page.locator('[data-testid="quick-next"]').click(); // finish
  await expect(page.locator('[data-testid="quick-result"]')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('[data-testid="quick-overcommit-warning"]')).toBeVisible();
  await page.screenshot({ path: `${DIR}/overcommit-warning-result.png`, fullPage: true });
});
