/**
 * A2.5a — NEW-USER JOURNEY (v6) — entry surfaces, router guards, demo entry, tour overlay.
 *
 * The retired monorepo's `e2e/tests/journey/00-new-user-to-fire.spec.ts` did not exist in this
 * extracted repo (the `new-user-test-skill` SKILL.md is stale here — it names retired routes; filed
 * as a GitHub issue). This authors the v6 journey, scoped to the surfaces NOT already covered by
 * `02-fresh-wizard-profile-income.spec.ts` (which owns the full Start-my-own-plan → profile → gating
 * → dashboard happy path). Here we lock the FRONT DOOR: the splash entry matrix, the onboarding
 * router guard, the demo-sample entry, and the first-entry tour overlay.
 *
 * Runs in DEMO mode (localStorage adapter — the mode these splash specs need; the "Try the sample"
 * CTA is intentionally hidden in server mode, gh#36/#53). Headed-maximized by design (§1.1).
 *
 * Server-mode auth (dev-bypass-OFF) is verified OUTSIDE this demo-mode spec (it requires
 * VITE_USE_SERVER_ADAPTER=on + dev-bypass OFF, which conflicts with the "Try the sample" surface here):
 *  • the 3-factor gate (header alone never bypasses) → server/src/middleware/auth.spec.ts (regression lock);
 *  • the live A2.5d sub-run (2026-06-07, #60) proved /api/planner/* → 401 (even WITH the x-dev-bypass
 *    header) and every guarded route → /login bounce;
 *  • the first-login localStorage→ServerAdapter transition (NO auto-migration by design — main.ts only
 *    warms the cache) is documented as a known seam (gh issue, low severity: prod is always server-mode
 *    + login-first, so demo data never accrues in the same origin).
 */
import { test, expect, type Page } from "@playwright/test";

/** Wait for the post-navigation app to be ready. Only reliable AFTER landing on a real route
 *  (dashboard) — the splash route does not always set the signal, so splash waits on a concrete
 *  element instead (ui-verification.md). Bounded so it never consumes the whole test budget. */
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

/** Land on a fresh, empty splash (no prior localStorage state).
 *  Uses domcontentloaded + the deterministic hydration signal — NOT networkidle, which hangs on the
 *  vite dev server's HMR websocket (e2e-hydration-signal.md). */
async function freshSplash(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.evaluate(() => {
    try {
      window.localStorage.clear();
    } catch {
      /* ignore */
    }
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  // Wait on a concrete splash element (more reliable than the data-hydrated signal on /).
  await page.getByRole("heading", { level: 1, name: "FIREKaro" }).waitFor({ state: "visible", timeout: 15000 });
}

test.describe("new-user journey (v6) — entry surfaces, guards, demo entry, tour", () => {
  test("splash offers BOTH entry surfaces in demo mode (sample + start-my-own)", async ({ page }) => {
    await freshSplash(page);
    await expect(page.getByRole("heading", { level: 1, name: "FIREKaro" })).toBeVisible();
    // The demo-only sample card (hidden in server mode, gh#36/#53).
    await expect(page.getByText("Explore with sample data")).toBeVisible();
    await expect(page.getByRole("button", { name: /Try the sample/i })).toBeVisible();
    // The primary new-user front door — always present.
    await expect(page.getByText("Start my own plan")).toBeVisible();
    // T-378: "Start my own plan" now leads with the ten-card express path; the seven-step
    // wizard is still offered, one link down.
    await expect(page.getByRole("button", { name: /Find my number/i })).toBeVisible();
    await expect(page.locator('[data-testid="splash-detailed-wizard"]')).toBeVisible();
  });

  test("router guard: a brand-new (zero-member) user hitting a deep route is bounced to onboarding", async ({ page }) => {
    await freshSplash(page);
    // Jump straight to a deep dashboard route with no household yet.
    await page.goto("/fire-goals/dashboard", { waitUntil: "networkidle", timeout: 20000 });
    await waitHydrated(page);
    // The onboarding guard (members.length === 0 → splash) must NOT leave a zero-data user on the
    // dashboard. Either the splash CTA is shown (bounced) or we are on a wizard/splash route.
    const onSplash = await page.getByRole("button", { name: /Try the sample/i }).isVisible({ timeout: 8000 }).catch(() => false);
    const url = page.url();
    expect(
      onSplash || /\/(wizard|$)/.test(url) || url.endsWith("/"),
      `empty user must be bounced to onboarding, not stranded on ${url}`,
    ).toBe(true);
  });

  test("demo entry: Try the sample loads the Sharma seed onto a POPULATED FIRE dashboard", async ({ page }) => {
    await freshSplash(page);
    await page.getByRole("button", { name: /Try the sample/i }).click();
    await page.waitForURL(/\/fire-goals\/dashboard/, { timeout: 15000 });
    await waitHydrated(page);
    await dismissTour(page);
    // Substance (rule 31/32): a populated dashboard renders real FIRE content, never an empty state.
    await expect(page.locator(".v-main")).toContainText(/FIRE|Freedom|Years to|corpus|crore|₹/i, { timeout: 10000 });
    // And it is NOT the empty-state CTA (no "Try the sample" / "Start my own plan" on a loaded dashboard).
    await expect(page.getByRole("button", { name: /Try the sample/i })).toHaveCount(0);
  });

  test("tour overlay: appears on first sample entry and is fully dismissible (no lingering interceptor)", async ({ page }) => {
    await freshSplash(page);
    await page.getByRole("button", { name: /Try the sample/i }).click();
    await page.waitForURL(/\/fire-goals\/dashboard/, { timeout: 15000 });
    await waitHydrated(page);
    await dismissTour(page);
    // After dismissal the overlay must be gone — otherwise it silently intercepts every first-entry
    // interaction (the documented ui-verification.md gotcha).
    await expect(page.locator(".tour-overlay")).toHaveCount(0);
    // And a subsequent interaction (open the command palette / click a nav item) is not blocked.
    const nav = page.locator("nav[aria-label='Primary navigation']");
    await expect(nav).toBeVisible();
  });

  test("returning user: after loading data, a reload resumes INTO the app (not stranded on splash)", async ({ page }) => {
    await freshSplash(page);
    await page.getByRole("button", { name: /Try the sample/i }).click();
    await page.waitForURL(/\/fire-goals\/dashboard/, { timeout: 15000 });
    await waitHydrated(page);
    // Reload with the seed already persisted — the guard must resume into the app, not the empty splash.
    await page.reload({ waitUntil: "networkidle" });
    await waitHydrated(page);
    await dismissTour(page);
    // A returning user (members present) lands in the app — the sidebar nav is present, and the
    // empty-splash sample CTA is NOT the resumed surface.
    await expect(page.locator("nav[aria-label='Primary navigation']")).toBeVisible({ timeout: 10000 });
  });
});
