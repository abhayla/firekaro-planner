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
    await expect(page.locator('[data-testid="quick-steps-list"] li')).toHaveCount(5);
    await expect(page.locator('[data-testid="quick-assumptions"]')).toContainText("drawdown");
    await expect(page.locator('[data-testid="quick-chart-card"]')).toBeVisible();

    // ---- the explainer must ADD UP to the headline beside it, before AND after the slider ----
    // (Blind verification finding 2: the components used to come from a different kernel run than
    // the headline, so dragging the age silently desynced them.)
    const stepFigures = async () => {
      const steps = await page.locator('[data-testid="quick-steps-list"] li').allInnerTexts();
      // Step 1 quotes the base corpus last, steps 2 and 3 quote the layer and the reservation.
      const lastMoney = (t: string) => {
        const all = [...t.matchAll(/₹[\d.]+ (?:Cr|L)/g)].map((m) => parseCompact(m[0]));
        return all[all.length - 1];
      };
      return [lastMoney(steps[0]), lastMoney(steps[1]), lastMoney(steps[2])];
    };
    const reconciles = async (expectedNeed: number) => {
      const [base, goals, medical] = await stepFigures();
      const sum = base + goals + medical;
      // 2-dp Cr rounding on four figures — half a percent is the honest tolerance.
      expect(
        Math.abs(sum - expectedNeed) / expectedNeed,
        `steps ${base}+${goals}+${medical}=${sum} must reconcile with the headline ${expectedNeed}`,
      ).toBeLessThan(0.005);
    };
    await reconciles(quickNeed);

    const slider = page
      .locator('[data-testid="hero-age-slider"]')
      .locator("[role='slider']")
      .first();
    await slider.focus();
    for (let i = 0; i < 3; i += 1) await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(1200);
    const movedNeed = parseCompact(
      await page.locator('[data-testid="fire-hero-need"]').innerText(),
    );
    expect(movedNeed, "dragging the age must actually move the number").not.toBe(quickNeed);
    await reconciles(movedNeed);

    // Put the age back so the cross-page check below compares like with like.
    await slider.focus();
    for (let i = 0; i < 3; i += 1) await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(1200);

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
