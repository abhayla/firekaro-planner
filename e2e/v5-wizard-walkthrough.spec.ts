/**
 * v5 wizard walkthrough — drives every step of the 7-step wizard
 * (Profile + 6 gating questionnaire steps), screenshots each, asserts
 * the right content is rendered at each step.
 *
 * Phase 8 Stage W equivalent — what v4 ran as the tour walkthrough,
 * adapted for v5's Stage F gating flow.
 */
import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const OUTPUT = "test-results/v5-verification/wizard";
mkdirSync(OUTPUT, { recursive: true });

async function screenshot(page: Page, name: string) {
  await page.screenshot({
    path: join(OUTPUT, `${name}.png`),
    fullPage: true,
  });
}

test.describe("v5 — wizard walkthrough", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("complete wizard end-to-end with screenshots", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    await page.goto("/", { waitUntil: "networkidle" });
    await page.evaluate(() => {
      try { window.localStorage.clear(); } catch { /* ignore */ }
    });
    await page.reload();

    await screenshot(page, "00-splash");

    // Begin wizard
    await page.getByRole("button", { name: /Begin wizard/i }).click();
    await expect(page).toHaveURL(/\/wizard\/profile/);
    await page.waitForTimeout(500);
    await screenshot(page, "01-profile");

    // Save profile
    await page.getByRole("button", { name: /Save profile/i }).click();
    await page.waitForTimeout(500);
    await expect(page.getByText(/Profile saved/i).first()).toBeVisible();
    await screenshot(page, "01-profile-saved");

    // Advance through 6 gating steps
    const expectedSteps = [
      { url: "investments", title: /Which investments do you hold/i, name: "02-gating-investments" },
      { url: "liabilities", title: /loans|credit/i, name: "03-gating-liabilities" },
      { url: "insurance", title: /insurance policies/i, name: "04-gating-insurance" },
      { url: "family", title: /family situation/i, name: "05-gating-family" },
      { url: "tax", title: /Tax planning concerns/i, name: "06-gating-tax" },
      { url: "planning", title: /planning concerns/i, name: "07-gating-planning" },
    ];

    for (const step of expectedSteps) {
      await page.getByRole("button", { name: /^Next$/i }).click();
      await page.waitForURL(new RegExp(`/wizard/${step.url}`));
      await page.waitForTimeout(500);

      // Substance check — the step's heading must be visible
      const heading = page.getByText(step.title).first();
      await expect(heading, `Gating step "${step.url}" did not render expected heading`).toBeVisible({ timeout: 10000 });

      await screenshot(page, step.name);
    }

    // Final step → "Finish & view dashboard"
    const finish = page.getByRole("button", { name: /Finish & view dashboard/i });
    await expect(finish).toBeVisible();
    await finish.click();
    await page.waitForURL(/\/fire-goals\/dashboard/);
    await page.waitForTimeout(1000);
    await screenshot(page, "08-dashboard-from-wizard");

    // Page errors must be empty across the entire flow.
    expect(pageErrors, `wizard walkthrough page errors: ${pageErrors.join("; ")}`).toEqual([]);
  });
});
