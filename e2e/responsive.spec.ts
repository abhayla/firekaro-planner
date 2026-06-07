/**
 * A3 (layer 9) — RESPONSIVE breakpoints.
 *
 * The other 8 functional layers of the A3 sweep are covered across the suite (render/console = A5
 * evidence; api = A7.3/A7.4; persistence = A7.4; cross-page = headline-plausibility + 25-* specs;
 * interactive = interactive-coverage + keyboard-a11y + journey; three-state = empty-partial sweep;
 * negative/boundary = A7.1/A7.5; a11y = v5-a11y-audit + keyboard-a11y + Lighthouse). This closes the
 * remaining layer: the dashboard must render coherently across mobile/tablet/desktop breakpoints
 * without horizontal overflow.
 *
 * NOTE: dark mode is intentionally NOT tested — it was REMOVED from the product in v3 (`stores/ui.ts`:
 * "Q10.1 (v3) — dark mode removed"). The app is light-mode only, so there is no dark theme to verify
 * (the pinia-store-conventions.md `darkMode` reference is stale). Demo mode, headed-maximized (§1.1).
 */
import { test, expect, type Page } from "@playwright/test";

async function waitHydrated(page: Page) {
  await page.waitForSelector("#app[data-hydrated='true']", { state: "visible", timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(200);
}

async function dismissTour(page: Page) {
  const overlay = page.locator(".tour-overlay");
  if (await overlay.first().isVisible({ timeout: 1500 }).catch(() => false)) {
    await overlay.first().click({ position: { x: 5, y: 5 }, force: true }).catch(() => {});
    await page.waitForTimeout(200);
  }
  await page.getByRole("button", { name: /Skip tour/i }).click({ timeout: 800 }).catch(() => {});
  await page.evaluate(() => document.querySelectorAll(".tour-overlay").forEach((n) => n.remove()));
}

async function loadSample(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.evaluate(() => {
    try {
      window.localStorage.clear();
    } catch {
      /* ignore */
    }
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Try the sample/i }).click();
  await page.waitForURL(/\/fire-goals\/dashboard/, { timeout: 15000 });
  await waitHydrated(page);
  await dismissTour(page);
}

test.describe("A3 layer 9 — responsive", () => {
  test("responsive: the dashboard renders without horizontal overflow at mobile / tablet / desktop", async ({ page }) => {
    await loadSample(page);
    const breakpoints: Array<[number, number, string]> = [
      [375, 812, "mobile"],
      [768, 1024, "tablet"],
      [1440, 900, "desktop"],
    ];
    for (const [w, h, name] of breakpoints) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(500); // let the responsive layout reflow
      // No horizontal scrollbar — content fits the viewport width (the core responsive property).
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${name} (${w}px): no horizontal overflow (got ${overflow}px)`).toBeLessThanOrEqual(4);
      // The main content region is present + non-empty at this breakpoint.
      await expect(page.locator(".v-main"), `${name}: main content visible`).toBeVisible();
    }
  });
});
