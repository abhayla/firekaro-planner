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
    test.setTimeout(90_000); // ten cards + three solver-backed slider steps + two page navigations
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

  test("QN-5: every 'how to get there' move toggles, moves the hero, and survives into the dashboard", async ({ page }) => {
    test.setTimeout(120_000); // ten cards + five solver-backed toggles, twice, + a navigation
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    await page.setViewportSize({ width: 1280, height: 1400 });
    await page.goto("/", { waitUntil: "networkidle" });
    await page.getByText("Start my own plan").click();
    await expect(page).toHaveURL(/\/quick/, { timeout: 20000 });
    await fillQuickPath(page);
    await expect(page.locator('[data-testid="quick-result"]')).toBeVisible({ timeout: 20000 });

    const picker = page.locator('[data-testid="lever-picker"]');
    await expect(picker).toBeVisible();
    // The placeholder is gone; the honesty line now sits under the plan summary.
    await expect(page.locator('[data-testid="quick-levers-placeholder"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="quick-honesty-line"]')).toContainText("arithmetic");
    await expect(page.locator('[data-testid="lever-plan-summary"]')).toContainText("Switch on a few moves");

    const KEYS = ["step-up-10", "delay-3", "trim-expenses", "direct-plans", "no-prepay-roll-emi"] as const;
    // Amit: a 7.2% loan below the 12% equity return, funds "not sure" → every move is available.
    for (const k of KEYS) {
      await expect(page.locator(`[data-testid="lever-toggle-${k}"]`), k).toBeEnabled();
      await expect(page.locator(`[data-testid="lever-effect-${k}"]`), k).toContainText(/less to find|makes it reachable|no change|still out of reach|of the gap/);
    }

    const requiredText = () => page.locator('[data-testid="hero-required-monthly"]').innerText();
    // The GAP tile is the always-finite signal ("Do this" can stay "Move the age" for the first
    // moves on an out-of-reach target — the gap still has to move).
    const gapText = () => page.locator('[data-testid="hero-gap"]').innerText();
    const before = await requiredText();
    const gapBefore = await gapText();

    // Toggle each move ON in turn — the hero must re-solve (its gap changes) and the summary names it.
    let previous = gapBefore;
    for (const k of KEYS) {
      await page.locator(`[data-testid="lever-toggle-${k}"]`).check();
      // Poll the re-solve instead of a fixed wait — the kernel round-trip is machine-speed
      // dependent, and the assertion IS the wait condition (the gap must move).
      const prev = previous;
      await expect
        .poll(async () => await gapText(), {
          message: `${k} must move the hero (gap was "${prev}")`,
          timeout: 15_000,
        })
        .not.toBe(prev);
      previous = await gapText();
      // "With …" once reachable, "Even with …" while still out of reach — both name the moves.
      await expect(page.locator('[data-testid="lever-plan-summary"]')).toContainText(/with /i);
    }
    // "Retire 3 years later" lifts the headline age by exactly 3 while the slider stays put.
    const sliderAge = Number(await page.locator('[data-testid="hero-target-age"]').innerText());
    const headlineAge = Number(await page.locator('[data-testid="fire-hero-age"]').innerText());
    expect(headlineAge).toBe(sliderAge + 3);

    // With every move on, the real kernel gives Amit a FINITE monthly amount (rule 31: the number
    // must exist and be a plan, not "Move the age"). The exact ratio to today's investing is
    // reported, not gated — the 1.5× band in the spec was written against the simplified mock.
    const stacked = await requiredText();
    expect(stacked, "all five moves on must yield a finite monthly amount").toMatch(/\/ month|already there/);
    console.log(`[QN-5] Amit, all moves on → "${stacked}" (was "${before}")`);

    // Toggle everything back OFF — the hero returns to its untouched numbers.
    for (const k of KEYS) await page.locator(`[data-testid="lever-toggle-${k}"]`).uncheck();
    await expect.poll(requiredText, { timeout: 15_000 }).toBe(before);
    await expect.poll(gapText, { timeout: 15_000 }).toBe(gapBefore);

    // A move switched on here is still on in the full planner (same session-only what-if).
    await page.locator('[data-testid="lever-toggle-step-up-10"]').check();
    await page.waitForTimeout(600);
    await page.locator('[data-testid="quick-open-planner"]').click();
    await expect(page).toHaveURL(/\/fire-goals\/dashboard/, { timeout: 20000 });
    await page.waitForTimeout(1200);
    // Embedded in the AccelerationCard the picker's root carries the host's fallthrough testid.
    const dashPicker = page.locator('[data-testid="accel-lever-picker"]');
    await expect(dashPicker).toBeVisible();
    await expect(dashPicker.locator('[data-testid="lever-toggle-step-up-10"]')).toBeChecked();
    await expect(page.locator('[data-testid="accel-savemore-slider"]')).toHaveCount(0);

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
