import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * T-378 (QN-1) — the `/quick` express path, end to end.
 *
 * Fills EVERY field including the optional ones (ui-verification rule), exercises every control
 * (rule 32: chips, toggles, lakh inputs, back/next), then checks the result screen and — the point
 * of the whole stage — that the dashboard shows the SAME number afterwards (rule 26), because the
 * answers landed as real household data rather than a private quick-path store.
 */

const L = 1e5;
const CR = 1e7;

/** Parse an INR-compact string ("₹2.43 L", "₹10.60 Cr") to a number. */
function parseCompact(text: string): number {
  const m = text.replace(/[,\s]/g, "").match(/₹?([\d.]+)(Cr|L|K)?/i);
  if (!m) return NaN;
  const n = Number(m[1]);
  const unit = (m[2] ?? "").toLowerCase();
  return unit === "cr" ? n * 1e7 : unit === "l" ? n * 1e5 : unit === "k" ? n * 1e3 : n;
}

async function lakh(page: Page, testid: string, rupees: number) {
  const field = page.locator(`[data-testid="${testid}"] input`);
  await field.fill(String(rupees / L));
  await expect(page.locator(`[data-testid="${testid}-preview"]`)).not.toHaveText("—");
}

async function next(page: Page) {
  await page.locator('[data-testid="quick-next"]').click();
  await page.waitForTimeout(150);
}

/** Walk all ten cards with the reference household's answers, filling every optional field. */
export async function fillQuickPath(page: Page) {
  // 1 · gut feel (chip row)
  await expect(page.locator('[data-testid="quick-question"]')).toContainText("Gut feel");
  await page.locator(`[data-testid="quick-guess-${10 * CR}"]`).click();
  await next(page);

  // 2 · you
  await page.locator('[data-testid="quick-age"] input').fill("38");
  await page.locator('[data-testid="quick-target-age"] input').fill("50");
  await next(page);

  // 3 · spend + take-home (optional) → the sanity line must appear
  await lakh(page, "quick-spend", 1.8 * L);
  await lakh(page, "quick-income", 5 * L);
  await expect(page.locator('[data-testid="quick-sanity"]')).toContainText("take-home");
  await next(page);

  // 4 · all investments + the direct/regular chip row (optional)
  await lakh(page, "quick-corpus", 80 * L);
  await page.locator('[data-testid="quick-direct-not-sure"]').click();
  await next(page);

  // 5 · monthly investing
  await lakh(page, "quick-sip", 1.75 * L);
  await next(page);

  // 6 · spouse (toggle + amount)
  await page.locator('[data-testid="quick-spouse-toggle"] input').check();
  await lakh(page, "quick-spouse-corpus", 70 * L);
  await next(page);

  // 7 · kids (chip + age)
  await page.locator('[data-testid="quick-kids-2"]').click();
  await page.locator('[data-testid="quick-kids-age"] input').fill("6");
  await next(page);

  // 8 · their big costs — all three optional amounts
  await lakh(page, "quick-education", 75 * L);
  await lakh(page, "quick-postgrad", 1.5 * CR);
  await lakh(page, "quick-wedding", 50 * L);
  await next(page);

  // 9 · big purchase (toggle + amount + horizon) → the live delta hint must react
  await page.locator('[data-testid="quick-house-toggle"] input').check();
  await lakh(page, "quick-house", 1 * CR);
  await page.locator('[data-testid="quick-house-years"] input').fill("6");
  await expect(page.locator('[data-testid="quick-house-delta"]')).toContainText("Counted");
  await next(page);

  // 10 · home loan (toggle + EMI + rate + years)
  await page.locator('[data-testid="quick-loan-toggle"] input').check();
  await lakh(page, "quick-emi", 1 * L);
  await page.locator('[data-testid="quick-loan-rate"] input').fill("7.2");
  await page.locator('[data-testid="quick-loan-years"] input').fill("7");
  await next(page);
}

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
