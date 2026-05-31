import { test, expect } from "@playwright/test";

test.describe("01 — Splash → Sample → FIRE Dashboard", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("loads splash, clicks Sample, lands on FIRE Dashboard with content", async ({ page }) => {
    await page.goto("/");
    // One-shot localStorage clear (NOT via addInitScript — re-fires on
    // subsequent navs and would wipe the sample we're about to load).
    await page.evaluate(() => {
      try { window.localStorage.clear(); } catch { /* ignore */ }
    });
    await page.reload();

    // Splash visible (FIREKaro hero + two splash cards). v5 trust-pill body
    // copy also includes "FIREKaro" — scope to the H1 hero specifically.
    await expect(page.getByRole("heading", { level: 1, name: "FIREKaro" })).toBeVisible();
    await expect(page.getByText("Explore with sample data")).toBeVisible();

    // Click the Sample card's primary button
    await page.getByRole("button", { name: /Try the sample/i }).click();

    // Should land on /fire-goals/dashboard
    await expect(page).toHaveURL(/\/fire-goals\/dashboard/);

    // FIRE Dashboard renders the hero + section cards. v5 (Stage I) adds
    // NudgeStack + FireMilestonesCard + FamilyLayerCard ABOVE the section
    // cards row — multiple copy mentions of these labels can now appear
    // (e.g., a nudge body references 'Income'). Scope to first match.
    await expect(page.getByText(/Sections at a glance/i).first()).toBeVisible();
    await expect(page.getByText("Income", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Expenses", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Health", { exact: true }).first()).toBeVisible();
  });
});
