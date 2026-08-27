import { test, expect } from "@playwright/test";

test.describe("02 — Fresh wizard: Profile → Income → Dashboard", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("Start my own plan → Profile saved → Gating questionnaire → Dashboard", async ({ page }) => {
    await page.goto("/");
    // One-shot localStorage clear (NOT addInitScript — that re-fires on
    // every page.goto and wipes data persisted mid-test).
    await page.evaluate(() => {
      try { window.localStorage.clear(); } catch { /* ignore */ }
    });
    await page.reload();

    // T-378: the splash CTA now opens the /quick express path; the seven-step wizard moved to
    // the explicit "prefer the detailed wizard" link beneath it.
    await page.locator('[data-testid="splash-detailed-wizard"]').click();
    await expect(page).toHaveURL(/\/wizard\/profile/);

    // Profile step header. v5 may render the heading copy in two places
    // (heading + helper); scope to first match.
    await expect(page.getByText(/Profile is required/i).first()).toBeVisible();

    // Save profile with default Couple+Children draft
    await page.getByRole("button", { name: /Save profile/i }).click();
    await expect(page.getByText(/Profile saved/i).first()).toBeVisible();

    // v5 (Stage F) — wizard advances to the first gating step (investments)
    // NOT income. The 5 v4 intake steps were replaced by the 6 gating steps.
    await page.getByRole("button", { name: /^Next$/i }).click();
    await expect(page).toHaveURL(/\/wizard\/investments/);

    // Skip the 6 gating steps. The wizard STEPS array is:
    //   profile (required) + investments + liabilities + insurance + family +
    //   tax + planning (= 7 total). Profile is already past; 6 gating steps
    //   remain. Advance with Skip when present, else Next, until we reach the
    //   final Finish button or land on the dashboard.
    for (let i = 0; i < 10; i++) {
      const url = page.url();
      if (/\/fire-goals\/dashboard/.test(url)) break;
      const finish = page.getByRole("button", { name: /Finish & view dashboard/i });
      const skip = page.getByRole("button", { name: /Skip for now/i });
      const next = page.getByRole("button", { name: /^Next$/i });
      if (await finish.isVisible().catch(() => false)) {
        await finish.click();
        break;
      }
      if (await skip.isVisible().catch(() => false)) {
        await skip.click();
      } else if (await next.isVisible().catch(() => false)) {
        await next.click();
      } else {
        break;
      }
      await page.waitForTimeout(250);
    }

    // Lands on FIRE Dashboard
    await expect(page).toHaveURL(/\/fire-goals\/dashboard/, { timeout: 10000 });
  });
});
