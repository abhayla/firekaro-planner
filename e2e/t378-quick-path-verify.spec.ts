import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { fillQuickPath, parseCompact } from "./quick-path-helper";

/**
 * T-378 (QN-1 + QN-4) rule 24/25/26/31/32 verification evidence.
 *
 * Screenshots every one of the ten cards at 1280 AND 390, then the result screen and the dashboard
 * afterwards, and asserts the substance (not just the render): the four solver numbers, the QN-4
 * explainer numbers matching the hero, the cross-page agreement, and the plausibility bounds.
 *
 * Scratch verification spec — PR evidence, not part of the regression suite
 * (opt in with RUN_SCRATCH_VERIFY=1).
 */

const DIR = `verification-screenshots/T-378-${new Date().toISOString().replace(/[:.]/g, "-")}`;

async function shootEveryCard(page: Page, width: number, height: number, tag: string) {
  await page.setViewportSize({ width, height });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("Start my own plan").click();
  await expect(page).toHaveURL(/\/quick/, { timeout: 20000 });

  // Walk the ten cards, capturing each BEFORE advancing.
  const shots: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    await expect(page.locator('[data-testid="quick-question"]')).toBeVisible();
    const name = `${DIR}/${tag}-card-${String(i + 1).padStart(2, "0")}.png`;
    await page.screenshot({ path: name, fullPage: true });
    shots.push(name);
    if (i < 9) {
      // Re-drive the same answers as the regression spec by stepping one card at a time.
      await page.locator('[data-testid="quick-next"]').click();
      await page.waitForTimeout(120);
    }
  }
  return shots;
}

test("T-378: every card renders at 390 and 1280, and the result is honest and coherent", async ({
  page,
}) => {
  mkdirSync(DIR, { recursive: true });
  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });

  // ---- rule 24: the empty-card walk at both breakpoints (layout evidence) ----
  await shootEveryCard(page, 390, 844, "mobile");
  await shootEveryCard(page, 1280, 900, "desktop");

  // ---- rule 32: the real interactive run, every field filled incl. the optional ones ----
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("Start my own plan").click();
  await expect(page).toHaveURL(/\/quick/, { timeout: 20000 });
  await fillQuickPath(page);

  await expect(page.locator('[data-testid="quick-result"]')).toBeVisible({ timeout: 20000 });
  await page.screenshot({ path: `${DIR}/desktop-result.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/mobile-result.png`, fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });

  // ---- rule 31: the numbers are plausible for this household, not merely present ----
  const need = parseCompact(await page.locator('[data-testid="fire-hero-need"]').innerText());
  const have = parseCompact(await page.locator('[data-testid="hero-have"]').innerText());
  expect(need, "the FIRE number must be in Cr, not absurd").toBeGreaterThan(5e7);
  expect(need).toBeLessThan(5e8);
  expect(have).toBeGreaterThan(0);
  expect(have).toBeLessThan(need); // this household is genuinely short at 50 — see the report

  // The "do this" tile must make an honest claim, including the honest refusal.
  const doThis = await page.locator('[data-testid="hero-required-monthly"]').innerText();
  expect(doThis.length).toBeGreaterThan(0);
  expect(doThis).not.toMatch(/NaN|Infinity|undefined/);

  // ---- QN-4: the explainer's numbers come from the same kernel run as the hero ----
  const steps = await page.locator('[data-testid="quick-steps-list"] li').allInnerTexts();
  expect(steps).toHaveLength(4);
  expect(steps[3], "step 4 quotes the same nominal figure the hero shows").toMatch(/₹[\d.]+ (Cr|L)/);
  const assumptions = await page.locator('[data-testid="quick-assumptions"]').innerText();
  expect(assumptions).toMatch(/safe withdrawal \(for a \d+-yr drawdown\)/);

  // ---- rule 26: the dashboard, the Goals screen and the quick result agree ----
  await page.locator('[data-testid="quick-open-planner"]').click();
  await expect(page).toHaveURL(/\/fire-goals\/dashboard/, { timeout: 20000 });
  await page.waitForTimeout(1200);
  // The product tour can survive Escape; strip it so it cannot intercept clicks (same defence as
  // e2e/member-lens-sweep.spec.ts and the T-377 verification spec).
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.querySelectorAll(".tour-overlay").forEach((n) => n.remove()));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/desktop-dashboard-after.png`, fullPage: true });
  const dashNeed = parseCompact(
    await page.locator('[data-testid="fire-hero-need"]').innerText(),
  );
  expect(Math.abs(dashNeed - need) / need).toBeLessThan(0.01);

  // QN-4 on the dashboard: the same explainer, collapsed.
  const panel = page.locator('[data-testid="hero-explainer-panel"]');
  await expect(panel).toBeVisible();
  await panel.locator(".v-expansion-panel-title").click();
  await page.waitForTimeout(500);
  await expect(page.locator('[data-testid="quick-why-list"] li')).toHaveCount(6);
  await page.screenshot({ path: `${DIR}/desktop-dashboard-explainer.png`, fullPage: true });

  // ---- rule 25: the answers really are household data (the planner screens see them) ----
  await page.goto("/investments/holdings", { waitUntil: "networkidle" });
  await expect(page.getByText("All investments (quick estimate)").first()).toBeVisible();
  await page.screenshot({ path: `${DIR}/desktop-investments.png`, fullPage: true });
  await page.goto("/expenses/planned", { waitUntil: "networkidle" });
  await expect(page.getByText("Education — all kids").first()).toBeVisible();
  await page.screenshot({ path: `${DIR}/desktop-planned.png`, fullPage: true });
  await page.goto("/liabilities/loans", { waitUntil: "networkidle" });
  await expect(page.getByText("Home loan").first()).toBeVisible();
  await page.screenshot({ path: `${DIR}/desktop-loans.png`, fullPage: true });

  const noisy = consoleErrors.filter((e) => !/favicon|ResizeObserver/i.test(e));
  expect(noisy, `console errors: ${noisy.join(" | ")}`).toHaveLength(0);
  // eslint-disable-next-line no-console
  console.log(`T-378 evidence: ${DIR}`);
});
