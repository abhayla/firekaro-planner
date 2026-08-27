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

import { fillQuickPath, gotoQuickPath, parseCompact } from "./quick-path-helper";

test.describe("QN-1 — the /quick express path", () => {
  test("ten cards produce one honest number, and the dashboard agrees", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });

    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoQuickPath(page);

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

/**
 * T-379 (QN-5) — the "How to get there — pick your moves" card, exercised for real.
 *
 * Rule 32: it is not enough that the card RENDERS. Each lever must be toggled and each toggle must
 * visibly change the plan summary — a card of dead checkboxes would pass a render-only check.
 */
test.describe("QN-5 — how to get there: the lever picker", () => {
  test("every lever toggles, and each toggle moves the plan summary", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });

    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoQuickPath(page);
    await fillQuickPath(page);

    const picker = page.locator('[data-testid="lever-picker"]').first();
    await expect(picker).toBeVisible();

    // The honesty line is verbatim, under the plan summary (design SSOT / contract DoD 3).
    await expect(page.locator('[data-testid="lever-honesty-line"]').first()).toContainText(
      "This part is arithmetic — it can't go wrong. What can go wrong is whether the monthly amount actually happens",
    );

    const summary = page.locator('[data-testid="lever-plan-summary"]').first();
    await expect(summary).toContainText("Switch on a few moves");

    const KEYS = [
      "step-up-10",
      "delay-3",
      "trim-expenses",
      "direct-plans",
      "no-prepay-roll-emi",
    ] as const;

    // Every catalog row is present — available ones with an effect figure, unavailable ones with
    // the reason they cannot be used (never a silent blank).
    for (const key of KEYS) {
      const row = page.locator(`[data-testid="lever-${key}"]`).first();
      await expect(row, `row ${key} must render`).toBeVisible();
      const effect = page.locator(`[data-testid="lever-effect-${key}"]`);
      const reason = page.locator(`[data-testid="lever-unavailable-${key}"]`);
      expect(
        (await effect.count()) + (await reason.count()),
        `${key} must show either an effect or a reason`,
      ).toBeGreaterThan(0);
    }

    // Toggle each AVAILABLE lever on, one at a time, and assert the summary actually responds.
    let toggled = 0;
    for (const key of KEYS) {
      const toggle = page.locator(`[data-testid="lever-toggle-${key}"] input`).first();
      if (!(await toggle.count())) continue;
      if (await toggle.isDisabled()) continue; // greyed rows are inert by design
      const before = await summary.innerText();
      await page.locator(`[data-testid="lever-toggle-${key}"]`).first().click();
      await expect(toggle).toBeChecked();
      await page.waitForTimeout(400); // the toggle re-solves the whole plan through derive()
      const after = await summary.innerText();
      expect(after, `toggling ${key} must change the plan summary`).not.toBe(before);
      toggled += 1;
    }
    expect(toggled, "at least the three contract levers must be togglable").toBeGreaterThanOrEqual(3);

    // With moves on, the summary names the chosen moves and states either a real monthly figure
    // or — when the moves rescue an otherwise-unreachable target — that it becomes reachable.
    await expect(summary).toContainText(/^\s*With .+(you need|is enough|becomes)/s);

    const noisy = consoleErrors.filter((e) => !/favicon|ResizeObserver/i.test(e));
    expect(noisy, `console errors: ${noisy.join(" | ")}`).toHaveLength(0);
  });

  test("the same picker drives the dashboard acceleration card", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoQuickPath(page);
    await fillQuickPath(page);
    await page.locator('[data-testid="quick-open-planner"]').click();
    await page.waitForLoadState("networkidle");

    // The product tour mounts on first dashboard entry and its `.tour-overlay` intercepts every
    // pointer event (documented in ui-verification.md / interactive-coverage.spec.ts). Dismiss it
    // before touching a control, or the click lands on the overlay instead.
    const overlay = page.locator(".tour-overlay");
    if (await overlay.first().isVisible({ timeout: 1500 }).catch(() => false)) {
      await overlay.first().click({ position: { x: 5, y: 5 }, force: true }).catch(() => {});
      await page.waitForTimeout(200);
    }
    await page.evaluate(() => {
      document.querySelectorAll(".tour-overlay").forEach((n) => n.remove());
    });

    const card = page.locator('[data-testid="acceleration-card"]');
    await expect(card).toBeVisible();
    // The QN-5 body is present …
    await expect(card.locator('[data-testid="lever-picker"]')).toBeVisible();
    // … and the retained years-saved KPI chip is STILL there (DoD 4 retention contract).
    await expect(card.getByText(/FIRE in ~/)).toBeVisible();

    // Toggling on the dashboard moves the summary here too.
    const summary = card.locator('[data-testid="lever-plan-summary"]');
    const before = await summary.innerText();
    // Click the Vuetify control itself — check({force}) on the underlying input skips the
    // actionability wait and can land before the component's own handler is bound.
    await card.locator('[data-testid="lever-toggle-step-up-10"]').first().click();
    await expect(card.locator('[data-testid="lever-toggle-step-up-10"] input').first()).toBeChecked();
    expect(await summary.innerText()).not.toBe(before);
  });

  test("the lever card renders on a 390px phone without losing its figures", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoQuickPath(page);
    await fillQuickPath(page);
    const picker = page.locator('[data-testid="lever-picker"]').first();
    await expect(picker).toBeVisible();
    await expect(page.locator('[data-testid="lever-step-up-10"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="lever-plan-summary"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="lever-honesty-line"]').first()).toBeVisible();
  });
});
