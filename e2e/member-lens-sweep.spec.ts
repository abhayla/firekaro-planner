import { test, expect, type Page } from "@playwright/test";

/**
 * "Viewing as <member>" lens E2E sweep — the REAL-BROWSER substance gate (gh #86).
 *
 * Companion to the static `src/lib/lens-coverage-invariant.spec.ts` (which checks a screen
 * *references* a lensed output). This drives the ACTUAL AppBar dropdown across every
 * member-attributable route and asserts the on-screen ₹ figures genuinely RE-SCOPE per member —
 * exactly the prod symptom Abhay reported ("the dropdown does nothing on the tax / expenses screens").
 *
 * WHY THIS EXISTS (verification post-mortem, 2026-06-09): #66/#81 were verified only at the
 * kernel/composable layer + a manual spot-check of the section Overviews, then generalised to the
 * DoD screen-list. No test drove the real dropdown across the leaves. This sweep closes that hole.
 *
 * Seed-robust assertion: a CORRECTLY-wired member-attributable screen shows a DIFFERENT rendering
 * for at least ONE adult vs "Whole household" (that adult owns a strict subset). A DEAD screen shows
 * IDENTICAL figures for every selection → fails. We iterate all adults and require ≥1 to differ, so
 * the test does not depend on which specific member owns what in the sample seed.
 */

// Post-hydration ready signal. This extracted repo has NO `#app[data-hydrated]` attribute (that was
// a retired-monorepo pattern that never shipped here — the old selector silently timed out at 30s on
// every route, so this sweep could never actually run). The real universal signal is the AppBar
// "Viewing as" select painting — it's present on every member-attributable sidebar route once the
// app shell has mounted, and every test needs it anyway.
const HYDRATED = '.v-select:has(.mdi-eye)';

// EMPIRICALLY VERIFIED ON-SCREEN 2026-06-09 (gh #86) — driving the real "Viewing as" dropdown across a
// data-rich, member-balanced household (Sharmas: Rohit ₹25L + Priya ₹18L; investments rohit:6/priya:2/Joint:3).
// This replaced the original STATIC classification, which was wrong on 3 of ~6 calls — proving
// token-presence ≠ re-scopes (`liabilities/overview` HAS lensedLiabilities yet is broken;
// `insurance/policies`/`expenses/recurring` have NO page-level token yet re-scope via child components).
//
// These re-scope correctly per member (verified: figures differ for ≥1 member):
const WORKING = [
  "/income/overview", "/income/salary", "/income/business", "/income/other-sources",
  "/expenses/recurring",
  "/investments/overview", "/investments/holdings",
  "/insurance/overview", "/insurance/policies",
  // NB: the BARE /financial-health route is the Health SCORE page — it renders 0-100 scores
  // ("67 / 100", "25 / 25"), NOT ₹ figures, so the ₹-token `lensResponds` heuristic cannot assert
  // it (it correctly re-scopes — the header shows "Viewing <member>'s own finances" — but with
  // scores, not ₹). Its ₹-bearing SUB-routes below carry the ₹ lens assertions. (Excluded from the
  // ₹-sweep 2026-06-10 after the hydration-signal fix let the sweep actually run and surfaced that
  // the bare score route was mis-listed.)
  "/financial-health/net-worth", "/financial-health/cash-flow",
  "/financial-health/banking", "/financial-health/emergency-fund", "/financial-health/reports",
  "/fire-goals/dashboard",
  // FIXED (commit 15c08e8, gh #86) — now lenses income + deductions same-scope. Verified on-screen:
  // household ₹11.66L → Rohit ₹5.74L → Priya ₹1.85L.
  "/tax-planning",
];

// CODE-VERIFIED lens-correct, but the DEFAULT sample can't differentiate them (its single loan is
// `isSharedWithSpouse` and its planned items are `Household`-owned → they correctly show for EVERY member).
// `liabilities/Overview.vue` + `LoanForm.vue` consume `fire.lensedLiabilities`; `PlannedFutureForm.vue`
// consumes `fire.lensedPlannedExpenses`. Asserting these on-screen needs an OWNER-EXCLUSIVE fixture (a loan
// / planned item owned by ONE member, not Joint/shared/Household) — TODO. They are NOT in WORKING because
// they do not respond on the Sharmas sample; they are NOT broken either. (gh #86 second correction.)
//   /liabilities/overview, /liabilities/loans, /expenses/planned

// T-378 (QN-1) — `/quick` is ENUMERATED here and deliberately NOT swept, so its absence is a
// recorded decision rather than a silent omission (member-landscape-verification.md: never a
// subset by accident). Reason: `/quick` is a layout-LESS pre-setup intake route — it renders no
// AppBar, so it carries no "Viewing as <member>" control to drive, and a household that has only
// just answered ten questions has no second member to switch to. Its result screen embeds the
// SAME `<FireHero />` the dashboard uses, and `/fire-goals/dashboard` IS swept below — so the
// lensed surface the quick path exposes is covered where the control actually exists.

// (empty) — tax-planning, the only screen ever genuinely broken, is FIXED (commit 15c08e8) and moved to
// WORKING above. This list is the home for any future test.fixme'd regression.
const BROKEN: string[] = [];

async function bootstrapSample(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    try {
      window.localStorage.clear();
    } catch {
      /* ignore */
    }
  });
  await page.reload();
  // Wait for the splash to actually render before clicking (mirrors the working 01-splash spec —
  // clicking before the hero paints is the bootstrap flake). 30s tolerates a cold Vite dev server
  // compiling the route on first request. NOTE: this sweep needs DEMO mode (LocalStorageAdapter) —
  // a server-adapter dev server (.env.local VITE_USE_SERVER_ADAPTER=on) has no splash/sample flow.
  await expect(page.getByRole("heading", { level: 1, name: "FIREKaro" })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText("Explore with sample data")).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: /Try the sample/i }).click();
  await expect(page).toHaveURL(/\/fire-goals\/dashboard/);
  await page.waitForSelector(HYDRATED, { timeout: 30000 });
  // Dismiss the demo tour — its `.tour-overlay` intercepts pointer events on first dashboard entry
  // (documented in ui-verification.md), which otherwise blocks the "Viewing as" dropdown click on the
  // dashboard + financial-health routes. "Skip tour" sets the persistent tour-dismissed flag so it
  // never re-pops for the rest of the sweep.
  await dismissTour(page);
}

/** Dismiss the demo-tour overlay if present (idempotent — no-op when already dismissed). */
async function dismissTour(page: Page) {
  const skip = page.getByRole("button", { name: /skip tour/i });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click().catch(() => {});
    await page.waitForTimeout(200);
  }
}

/** The "Viewing as" v-select is the one with the unique mdi-eye prepend icon. */
function viewingSelect(page: Page) {
  return page.locator(".v-select").filter({ has: page.locator(".mdi-eye") });
}

/** Open the dropdown and return the option labels (the first is always "Whole household"). */
async function memberOptionLabels(page: Page): Promise<string[]> {
  await viewingSelect(page).click();
  await page.waitForTimeout(300); // Vuetify menu open
  const opts = page.locator('.v-overlay-container [role="option"]');
  await opts.first().waitFor({ state: "visible", timeout: 5000 });
  const labels = await opts.allInnerTexts();
  await page.keyboard.press("Escape"); // close without selecting
  await page.waitForTimeout(150);
  return labels.map((l) => l.trim()).filter(Boolean);
}

async function selectViewing(page: Page, label: string) {
  await viewingSelect(page).click();
  await page.waitForTimeout(300);
  await page.getByRole("option", { name: label, exact: true }).click();
  await page.waitForTimeout(400); // reactive re-scope (no reload) — let derived computeds settle
}

/** Normalised set of ₹ figures rendered in the main content region (excludes the AppBar). */
async function captureFigures(page: Page): Promise<string> {
  const text = await page.locator(".v-main").innerText();
  const tokens = text.match(/₹\s*[\d,]+(?:\.\d+)?\s*(?:Cr|L|K)?/g) ?? [];
  return tokens.map((t) => t.replace(/\s+/g, " ").trim()).sort().join("|");
}

/** Core check: at least one adult selection differs from "Whole household". */
async function lensResponds(page: Page, route: string): Promise<{ responded: boolean; household: string; empty: boolean }> {
  await page.goto(route, { waitUntil: "networkidle" });
  await page.waitForSelector(HYDRATED, { timeout: 30000 });
  await dismissTour(page); // defensive — the tour can re-pop on a dashboard re-visit within the sweep

  const labels = await memberOptionLabels(page);
  expect(labels[0], `the "Viewing as" dropdown must render with ≥2 adults on the sample seed`).toMatch(
    /whole household/i,
  );
  const members = labels.slice(1);
  expect(members.length, "sample seed must have ≥1 adult besides Whole household").toBeGreaterThan(0);

  await selectViewing(page, labels[0]); // baseline = Whole household
  const household = await captureFigures(page);

  let responded = false;
  for (const m of members) {
    await selectViewing(page, m);
    if ((await captureFigures(page)) !== household) {
      responded = true;
      break;
    }
  }
  return { responded, household, empty: household === "" };
}

test.describe("Viewing-as lens — real-dropdown sweep across every member-attributable route (#86)", () => {
  for (const route of WORKING) {
    test(`lens re-scopes ${route}`, async ({ page }) => {
      await bootstrapSample(page);
      const { responded, empty } = await lensResponds(page, route);
      expect(empty, `${route} rendered no ₹ figures — cannot assert the lens (check the seed/route)`).toBe(false);
      expect(responded, `${route} shows IDENTICAL figures for every member — the "Viewing as" lens is dead here`).toBe(
        true,
      );
    });
  }

  // D-2026-06-13-02 — the FIRE hero now LENSES to the selected member's individual FIRE
  // (reverses the #81 hero-invariance). The generic ₹-sweep above can pass off other dashboard
  // figures, so this pins the HERO specifically: the big FIRE-age token must DIFFER from the
  // Whole-household rendering for ≥1 member, the member caveat must appear under the lens, and
  // the Whole-household selection must restore the household headline (no residue).
  test("dashboard FIRE-hero headline lenses per member (D-2026-06-13-02)", async ({ page }) => {
    await bootstrapSample(page);
    await page.goto("/fire-goals/dashboard", { waitUntil: "networkidle" });
    await page.waitForSelector(HYDRATED, { timeout: 30000 });
    await dismissTour(page);

    const heroAge = page.getByTestId("fire-hero-age");
    // T-377 (QN-2): the big number is now the TARGET age the user wants (the slider), which is
    // legitimately the same for two adults who share a target. The figure that must carry the
    // lens is the hero's NEED — the member's own individual FIRE number (#81). Asserting on the
    // need keeps this sweep testing REAL lensing instead of a coincidence of equal target ages.
    const heroNeed = page.getByTestId("fire-hero-need");
    const labels = await memberOptionLabels(page);
    expect(labels[0], 'the first "Viewing as" option must be Whole household').toMatch(/whole household/i);
    const members = labels.slice(1);
    expect(members.length, "sample seed must have ≥1 adult").toBeGreaterThan(0);

    await selectViewing(page, labels[0]);
    const householdAge = (await heroAge.innerText()).trim();
    const householdNeed = (await heroNeed.innerText()).trim();
    expect(householdAge, "household headline renders a real age").not.toBe("");
    expect(householdNeed, "household headline renders a real need figure").toMatch(/₹/);

    let differed = false;
    for (const m of members) {
      await selectViewing(page, m);
      // Auto-waiting caveat assertion FIRST proves the lensed re-render landed before the read.
      await expect(
        page.getByTestId("fire-hero-member-caveat"),
        `the member caveat must render under "Viewing as ${m}"`,
      ).toBeVisible();
      const memberNeed = (await heroNeed.innerText()).trim();
      if (memberNeed !== householdNeed) differed = true;
    }
    expect(
      differed,
      "the hero NEED figure must DIFFER for ≥1 member vs Whole household (the lensed headline)",
    ).toBe(true);

    // Switching back restores the household headline exactly — and the caveat disappears.
    await selectViewing(page, labels[0]);
    await expect(heroAge).toHaveText(householdAge);
    await expect(heroNeed).toHaveText(householdNeed);
    await expect(page.getByTestId("fire-hero-member-caveat")).toBeHidden();
  });

  // D-2026-06-13-03 — Goals.vue now LENSES to the selected member's individual FIRE (mirrors the
  // hero, reads the same heroHeadline selector). The retirement card's FIRE target (₹) must DIFFER
  // for ≥1 member vs Whole household, the member caveat must appear under the lens, and Whole
  // household must restore the household figures with the caveat gone (no residue).
  test("goals retirement card lenses to the member's individual FIRE (D-2026-06-13-03)", async ({ page }) => {
    await bootstrapSample(page);
    await page.goto("/fire-goals/goals", { waitUntil: "networkidle" });
    await page.waitForSelector(HYDRATED, { timeout: 30000 });
    await dismissTour(page);

    const labels = await memberOptionLabels(page);
    expect(labels[0], 'the first "Viewing as" option must be Whole household').toMatch(/whole household/i);
    const members = labels.slice(1);
    expect(members.length, "sample seed must have ≥1 adult").toBeGreaterThan(0);

    await selectViewing(page, labels[0]); // Whole household baseline
    await expect(page.getByTestId("goals-member-caveat")).toBeHidden();
    const householdFigures = await captureFigures(page);
    expect(householdFigures, "Goals renders ₹ figures on the household view").not.toBe("");

    let differed = false;
    for (const m of members) {
      await selectViewing(page, m);
      // Caveat is the auto-waiting anchor that proves the lensed re-render landed before the ₹ read.
      await expect(
        page.getByTestId("goals-member-caveat"),
        `the Goals member caveat must render under "Viewing as ${m}"`,
      ).toBeVisible();
      if ((await captureFigures(page)) !== householdFigures) differed = true;
    }
    expect(differed, "the Goals FIRE target must DIFFER for ≥1 member vs Whole household (lensed individual FIRE)").toBe(
      true,
    );

    // Back to Whole household — household figures restored, caveat gone (no residue).
    await selectViewing(page, labels[0]);
    await expect(page.getByTestId("goals-member-caveat")).toBeHidden();
  });

  // D-2026-06-13-03 — the 4 whole-household simulation screens render WholeHouseholdBadge under a
  // member lens (their figures stay household — correct — and the badge makes that explicit/honest).
  // The badge is visible under "Viewing as <member>" and hidden on Whole household (self-gating).
  const FIRE_BADGED = [
    "/fire-goals/readiness",
    "/fire-goals/stress-test",
    "/fire-goals/drawdown",
    "/fire-goals/what-if",
  ];
  for (const route of FIRE_BADGED) {
    test(`whole-household badge appears under the lens on ${route} (D-2026-06-13-03)`, async ({ page }) => {
      await bootstrapSample(page);
      await page.goto(route, { waitUntil: "networkidle" });
      await page.waitForSelector(HYDRATED, { timeout: 30000 });
      await dismissTour(page);

      const labels = await memberOptionLabels(page);
      const members = labels.slice(1);
      expect(members.length, "sample seed must have ≥1 adult").toBeGreaterThan(0);
      const badge = page.getByTestId("whole-household-badge").first();

      // Whole household → no badge (byte-identical default).
      await selectViewing(page, labels[0]);
      await expect(badge, `${route} must NOT show the badge on Whole household`).toBeHidden();

      // Member → badge visible.
      await selectViewing(page, members[0]);
      await expect(badge, `${route} must show the Whole-household badge under a member lens`).toBeVisible();

      // Back to Whole household → badge hidden again (no residue).
      await selectViewing(page, labels[0]);
      await expect(badge, `${route} must hide the badge again on Whole household`).toBeHidden();
    });
  }

  for (const route of BROKEN) {
    // gh #86 — these screens ignore "Viewing as" today (read household.data directly). Un-fixme as the
    // member-lens fix wires each one; each MUST go green before #86 closes.
    test.fixme(`lens re-scopes ${route} (gh #86 — currently DEAD)`, async ({ page }) => {
      await bootstrapSample(page);
      const { responded } = await lensResponds(page, route);
      expect(responded, `${route} must re-scope under "Viewing as"`).toBe(true);
    });
  }
});
