import { test, expect } from "@playwright/test";

test.describe("03 — Edit section → FIRE Dashboard headline recomputes", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("loads sample persona, edits an expense, FIRE Dashboard recomputes live", async ({ page }) => {
    // Load splash first, then ONE-SHOT clear localStorage (NOT via
    // addInitScript — that re-fires on every page.goto and wipes the
    // sample data we just loaded, which was the inherited test bug).
    await page.goto("/");
    await page.evaluate(() => {
      try { window.localStorage.clear(); } catch { /* ignore */ }
    });
    await page.reload();
    await page.getByRole("button", { name: /Try the sample/i }).click();
    await expect(page).toHaveURL(/\/fire-goals\/dashboard/);

    // v5 (Stage I) rewrote the Dashboard layout — SectionCard moved to
    // programmatic click navigation (no <a href>). Capture the whole-page
    // text snapshot before and after, then assert it CHANGED post-edit.
    const beforeText = await page.locator("body").innerText();
    expect(beforeText.length).toBeGreaterThan(100);

    // Navigate directly to expenses (sidebar interaction is layout-dependent
    // and the AppSidebar nav surface changed across v3/v4/v5).
    await page.goto("/expenses/overview");
    // Vue Router redirects /expenses to /expenses/overview; URL settles there.
    await expect(page).toHaveURL(/\/expenses\/overview/);

    // Edit avg monthly burn. Field label is 'Average / month' on the
    // expenses overview AvgMonthlyBurnField component.
    const avgField = page.getByLabel(/Average \/ month/i).first();
    await avgField.click();
    await avgField.fill("150000");
    await avgField.blur();

    // Wait for the localStorage write to flush + Vue reactivity to settle.
    await page.waitForTimeout(500);

    // Return to FIRE Dashboard and verify text changed.
    await page.goto("/fire-goals/dashboard");
    await expect(page).toHaveURL(/\/fire-goals\/dashboard/);
    await page.waitForTimeout(500);

    const afterText = await page.locator("body").innerText();
    expect(afterText.length).toBeGreaterThan(100);
    // FIRE math depends on annual expenses — the dashboard text must have
    // changed somewhere as a result of the avgMonthly edit. Loose match.
    expect(afterText).not.toBe(beforeText);
  });
});
