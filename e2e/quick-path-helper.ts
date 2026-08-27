import { expect, type Page } from "@playwright/test";

/**
 * T-378 (QN-1) — the shared drive-the-ten-cards helper.
 *
 * Lives OUTSIDE a `.spec.ts` on purpose: Playwright refuses to let one test file import another
 * ("should not import test file"), which silently made the verification-evidence spec
 * uncollectable when this helper lived in quick-number.spec.ts (code-review H6).
 */
const L = 1e5;
const CR = 1e7;

/** Parse an INR-compact string ("₹2.43 L", "₹10.60 Cr") to a number. */
export function parseCompact(text: string): number {
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

/**
 * Enter the express path from the splash screen.
 *
 * The CTA is the BUTTON "Find my number"; "Start my own plan" is the section HEADING above it, so
 * clicking the heading text silently does nothing and the walk then fails on card 1 with a
 * confusing "quick-question not found" (T-379 found three specs doing exactly that). One helper
 * so a future CTA rename is a one-line fix.
 */
export async function gotoQuickPath(page: Page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Find my number/i }).click();
  await expect(page).toHaveURL(/\/quick/, { timeout: 20000 });
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

