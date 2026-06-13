import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * "Viewing as <member>" lens-coverage invariant (gh #66 / #81 — CI-enforced).
 *
 * ROOT CAUSE THIS GATE EXISTS TO KILL (verification post-mortem, 2026-06-09):
 * The member lens shipped in #66/#81 was verified ONLY at the kernel/composable layer —
 * `derive.spec.ts` / `useFireDerive.*.spec.ts` / `individual-fire.spec.ts` prove that
 * `derive()`/`useFireDerive()` PRODUCE correct lensed outputs (lensedInvestments 11→9,
 * lensed annualTax, memberFinancials). NOTHING asserted that each *.vue SCREEN actually
 * CONSUMES a lensed output. So screens that ignore the lens (tax-planning/Index.vue runs
 * its OWN computeTax over household.earners; the liabilities/insurance/expenses LEAF lists
 * read household.data directly) passed 100% of the suite + a manual spot-check that
 * exercised only the section OVERVIEW screens and generalised "lens works" to the rest.
 * Result: a must-have feature shipped "verified working" while dead on tax + every leaf.
 *
 * This static scan is the missing rung: it ENUMERATES every member-attributable screen and
 * asserts each references a lensed output / the member id — coverage that can no longer be
 * "generalised from a subset". Cheap + deterministic (no browser), mirroring the
 * `storage-invariant.spec.ts` guard pattern (a targeted scan, not a whole ESLint setup — YAGNI).
 *
 * It does NOT prove the figure visibly CHANGES (that is the follow-up component-mount substance
 * gate) — but a screen with ZERO lens reference provably cannot react, so this catches the exact
 * class that shipped. Run by `npm run test:unit`.
 *
 * ⚠️ PROVEN ONLY A WEAK HEURISTIC (empirical on-screen sweep 2026-06-09, gh #86): token-presence
 * ≠ re-scopes. `liabilities/Overview.vue` HAS `lensedLiabilities` yet is BROKEN on screen; and
 * `insurance/Policies.vue` / `expenses/Recurring.vue` have NO page-level token yet DO re-scope (via
 * child components). So this scan yields BOTH false-positives and false-negatives — the authoritative
 * gate is the full E2E `e2e/member-lens-sweep.spec.ts` (per `member-landscape-verification.md`). The
 * two proven-working-without-a-token screens are REMOVED from the list below to avoid false failures.
 *
 * SCOPE (v1): only the UNAMBIGUOUSLY member-attributable screens per the shipped #66/#81 design.
 * The household-only screens (expenses/Overview, investments/Buckets) must instead render
 * WholeHouseholdBadge, and the fire-goals analytical leaves are an OPEN design fork (badge-only
 * vs individual-FIRE) — both deliberately EXCLUDED here until that fork is resolved, to avoid
 * encoding a contested classification.
 */
const PAGES = join(process.cwd(), "src", "pages");

// Any of these = the screen is wired to the member lens (consumes a lensed output or the member id).
const LENS_TOKEN = /viewingMemberId|lensed[A-Z]|memberFinancials|ownerMatches|individualFire/;

// Member-attributable screens that MUST react to "Viewing as <member>" (#66 + #81 Phase 1/3).
const MEMBER_ATTRIBUTABLE = [
  "income/Overview.vue",
  "income/Salary.vue",
  "income/Business.vue",
  "income/OtherSources.vue",
  "investments/Overview.vue",
  "investments/Holdings.vue",
  "liabilities/Overview.vue",
  "insurance/Overview.vue",
  // REMOVED (re-scope via child FORM components, no page-level token — gh #86): insurance/Policies.vue,
  // expenses/Recurring.vue, liabilities/Loans.vue (LoanForm reads lensedLiabilities), expenses/Planned.vue
  // (PlannedFutureForm reads lensedPlannedExpenses). The ONLY truly-unwired page is tax-planning/Index.vue.
  "tax-planning/Index.vue",
  "financial-health/NetWorth.vue",
  "financial-health/Banking.vue",
  "financial-health/CashFlow.vue",
  "financial-health/EmergencyFund.vue",
  "financial-health/HealthScore.vue",
  "financial-health/Reports.vue",
];

describe("member-lens coverage invariant — every member-attributable screen consumes the lens (#66/#81)", () => {
  it("lists only real files (a typo'd path would silently make the gate vacuous)", () => {
    const missing = MEMBER_ATTRIBUTABLE.filter((rel) => !existsSync(join(PAGES, ...rel.split("/"))));
    expect(missing, `member-attributable screens listed but not found on disk:\n  ${missing.join("\n  ")}`).toEqual(
      [],
    );
  });

  // gh #86 — was RED on tax-planning/Index (the one genuinely-unwired page); now GREEN since the fix
  // (commit 15c08e8) wires it to fire.lensedEarners/Businesses/OtherIncome. Active regression lock.
  it("every member-attributable screen references a lensed output / viewingMemberId (gh #86)", () => {
    const offenders = MEMBER_ATTRIBUTABLE.filter(
      (rel) => !LENS_TOKEN.test(readFileSync(join(PAGES, ...rel.split("/")), "utf8")),
    );
    expect(
      offenders,
      `These member-attributable screens IGNORE the "Viewing as" lens (read household data directly) — ` +
        `wire them to a lensed output (fire.lensed* / memberFinancials / ownerMatches) or ui.viewingMemberId ` +
        `so switching member re-scopes them (#66/#81):\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("the LENS_TOKEN regex genuinely matches a known-lensed screen (proves the scan isn't a no-op)", () => {
    // financial-health/NetWorth.vue is a confirmed lens consumer (#81 Phase 3 — reads memberFinancials),
    // so it is the positive fixture: the regex MUST match it, confirming the scan would catch a real gap.
    const known = readFileSync(join(PAGES, "financial-health", "NetWorth.vue"), "utf8");
    expect(LENS_TOKEN.test(known), "NetWorth.vue should reference a lensed output").toBe(true);
  });
});

/**
 * D-2026-06-13-03 — the fire-goals analytical-leaves fork (badge-only vs individual-FIRE), left an
 * OPEN design fork in v1 above, is now RESOLVED ("lens where clean, badge the rest", Abhay 2026-06-13):
 *   - Goals.vue LENSES to the selected member's individual FIRE (reads the same `heroHeadline`
 *     member selector the Dashboard hero consumes — guarantees cross-screen coherence, rule 26).
 *   - Readiness/StressTest/Drawdown/WhatIf render WholeHouseholdBadge — they run WHOLE-HOUSEHOLD
 *     projections/simulations (no cheap per-member equivalent; per-member is the deferred #162 work),
 *     so the badge makes that household scope explicit + honest under a member lens.
 * This block encodes that resolution so a regression (Goals losing its lens, or a badge being dropped)
 * is a CI failure. Substance ("figure visibly changes" / "badge actually shows") is the E2E sweep's job
 * (e2e/member-lens-sweep.spec.ts); this is the cheap reference-presence rung that mirrors the scan above.
 */
describe("fire-goals member-lens coverage — Goals lenses, the 4 simulation screens badge (D-2026-06-13-03)", () => {
  const FIRE_LENSED = "fire-goals/Goals.vue";
  const FIRE_BADGED = [
    "fire-goals/Readiness.vue",
    "fire-goals/StressTest.vue",
    "fire-goals/Drawdown.vue",
    "fire-goals/WhatIf.vue",
  ];
  // Goals lenses via the hero's member selector (heroHeadline) + the member caveat computed.
  const FIRE_LENS_TOKEN = /heroHeadline|individualFire|memberCaveat|viewingMemberId/;
  const BADGE_TOKEN = /WholeHouseholdBadge/;

  it("lists only real files", () => {
    const all = [FIRE_LENSED, ...FIRE_BADGED];
    const missing = all.filter((rel) => !existsSync(join(PAGES, ...rel.split("/"))));
    expect(missing, `fire-goals screens listed but not found on disk:\n  ${missing.join("\n  ")}`).toEqual([]);
  });

  it("Goals.vue lenses to the member's individual FIRE (reads the heroHeadline selector)", () => {
    const src = readFileSync(join(PAGES, "fire-goals", "Goals.vue"), "utf8");
    expect(
      FIRE_LENS_TOKEN.test(src),
      "Goals.vue must consume the member-lensed FIRE (heroHeadline / individualFire / memberCaveat) so its " +
        "FIRE target re-scopes per member (D-2026-06-13-03)",
    ).toBe(true);
  });

  it("the 4 simulation screens each mount WholeHouseholdBadge", () => {
    const offenders = FIRE_BADGED.filter(
      (rel) => !BADGE_TOKEN.test(readFileSync(join(PAGES, ...rel.split("/")), "utf8")),
    );
    expect(
      offenders,
      `These whole-household FIRE screens must mount WholeHouseholdBadge so the household scope is explicit ` +
        `under a member lens (D-2026-06-13-03):\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  // FinTech drift-lock (D-2026-06-13-03): Goals' member caveat and the Dashboard hero caveat describe
  // the SAME individual FIRE number, so both MUST disclose that this number SKIPS the healthcare reserve
  // + locked-money bridge the household plan carries. Goals once dropped that clause (under-disclosure on
  // the commitment screen — caught by FinTech review); this pins both to parity so they can never drift.
  it("Goals member caveat discloses the same individual-FIRE omissions as the hero caveat (no honesty drift)", () => {
    const goals = readFileSync(join(PAGES, "fire-goals", "Goals.vue"), "utf8");
    const hero = readFileSync(join(PAGES, "..", "components", "dashboard", "FireHero.vue"), "utf8");
    for (const phrase of ["healthcare reserve", "locked-money bridge"]) {
      expect(hero.includes(phrase), `hero caveat (the precedent) must mention "${phrase}"`).toBe(true);
      expect(
        goals.includes(phrase),
        `Goals member caveat must mention "${phrase}" to match the hero's disclosure for the same individual FIRE number`,
      ).toBe(true);
    }
  });
});
