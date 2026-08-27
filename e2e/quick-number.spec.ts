import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * T-378 (QN-1) — the `/quick` express path, end to end.
 *
 * Fills EVERY field including the optional ones (ui-verification rule), exercises every control
 * (rule 32: chips, toggles, lakh inputs, back/next), then checks the result screen and — the point
 * of the whole stage — that the dashboard shows the SAME number afterwards (rule 26), because the
 * answers landed as real household data rather than a private quick-path store.
 */

import { fillQuickPath, parseCompact } from "./quick-path-helper";

test.describe("QN-1 — the /quick express path", () => {
  test("ten cards produce one honest number, and the dashboard agrees", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/", { waitUntil: "networkidle" });
    await page.getByText("Start my own plan").click();
    await expect(page).toHaveURL(/\/quick/, { timeout: 20000 });

    // The "so far" strip makes no claim before there is anything to say (rule 31).
    await expect(page.locator('[data-testid="quick-so-far"]')).toContainText("Answer a few more");

    await fillQuickPath(page);

    // ---- the result screen ----
    const result = page.locator('[data-testid="quick-result"]');
    await expect(result).toBeVisible({ timeout: 20000 });
    const hero = page.locator('[data-testid="fire-hero"]');
    await expect(hero).toBeVisible();

    const needText = await page.locator('[data-testid="fire-hero-need"]').innerText();
    const quickNeed = parseCompact(needText);
    expect(Number.isFinite(quickNeed) && quickNeed > 0, `need must be a real number: ${needText}`).toBe(
      true,
    );

    // The gut-feel comparison only exists because card 1 recorded a guess.
    await expect(page.locator('[data-testid="fire-hero-guess"]')).toContainText("Your gut said");

    // QN-4 explainers, rendered from the same kernel outputs.
    await expect(page.locator('[data-testid="quick-why-list"] li')).toHaveCount(6);
    await expect(page.locator('[data-testid="quick-steps-list"] li')).toHaveCount(4);
    await expect(page.locator('[data-testid="quick-assumptions"]')).toContainText("drawdown");
    await expect(page.locator('[data-testid="quick-chart-card"]')).toBeVisible();

    // ---- rule 26: the full planner shows the same number ----
    await page.locator('[data-testid="quick-open-planner"]').click();
    // SPA pushState fires no `load` event, so waitForURL's default wait never resolves here.
    await expect(page).toHaveURL(/\/fire-goals\/dashboard/, { timeout: 20000 });
    await page.waitForTimeout(1200);
    const dashNeed = parseCompact(
      await page.locator('[data-testid="fire-hero-need"]').innerText(),
    );
    expect(Math.abs(dashNeed - quickNeed) / quickNeed).toBeLessThan(0.01);

    // The quick answers are REAL household data — the investments screen can see them.
    await page.goto("/investments/holdings", { waitUntil: "networkidle" });
    await expect(page.getByText("All investments (quick estimate)").first()).toBeVisible();

    const noisy = consoleErrors.filter((e) => !/favicon|ResizeObserver/i.test(e));
    expect(noisy, `console errors: ${noisy.join(" | ")}`).toHaveLength(0);
  });

  test("the express path has no critical or serious accessibility violations", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/quick", { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(
      blocking,
      blocking.map((v) => `${v.id}: ${v.help}`).join(" | "),
    ).toHaveLength(0);
  });
});
