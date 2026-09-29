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

  // FinTech drift-lock (D-2026-06-13-03, updated #162 part 1): Goals' member caveat and the
  // Dashboard hero caveat describe the SAME individual FIRE number, so both MUST disclose the
  // SAME omission set — and must NEVER claim an omission the code no longer has. Since #162 part 1
  // the individual target carries the household healthcare reservation, so only the locked-money
  // bridge check remains excluded; the old "skips the healthcare reserve" claim is now FALSE and
  // must not appear on either screen (an inaccurate-in-the-optimistic-direction disclosure is as
  // bad as a missing one — it tells the user their number is worse than it is, but a stale claim
  // that later flips silently is the drift class this lock exists to catch either direction of).
  it("Goals + hero member caveats disclose the CURRENT individual-FIRE omissions (no honesty drift)", () => {
    const goals = readFileSync(join(PAGES, "fire-goals", "Goals.vue"), "utf8");
    const hero = readFileSync(join(PAGES, "..", "components", "dashboard", "FireHero.vue"), "utf8");
    for (const phrase of ["locked-money bridge"]) {
      expect(hero.includes(phrase), `hero caveat (the precedent) must mention "${phrase}"`).toBe(true);
      expect(
        goals.includes(phrase),
        `Goals member caveat must mention "${phrase}" to match the hero's disclosure for the same individual FIRE number`,
      ).toBe(true);
    }
    // #162 part 1: the individual target now carries the healthcare reservation — neither screen's
    // USER-FACING copy may claim it still skips the reserve. FireHero keeps the phrase only inside
    // an HTML comment (dev-facing history, never rendered); Goals must not have it at all.
    const heroRenderedCopy = hero.replace(/<!--[\s\S]*?-->/g, "");
    expect(
      heroRenderedCopy.includes("skips the healthcare reserve"),
      "hero's RENDERED copy must not claim the healthcare reserve is skipped (#162 part 1 added it)",
    ).toBe(false);
    expect(
      goals.includes("skips the healthcare reserve"),
      "Goals copy must not claim the healthcare reserve is skipped (#162 part 1 added it)",
    ).toBe(false);
  });
  /**
   * gh #207 drift-lock (copy honesty). After #207 `requiredMonthlyReal` is no longer a FLAT amount
   * held for the whole horizon: it is the STARTING real contribution of a plan that rises with the
   * household's income (`contribution(t) = required x income(t)/income(0)`). The number was fixed in
   * one place (`derive.ts`) while FOUR surfaces kept the old flat sentence — "invest this every
   * month", "you need Rs X/month", "Step up to Rs X/mo", "your Rs X a month ... for 17 years" — each
   * of which understates what the later years actually ask for. A fixed number under stale copy is
   * still a lie to the user, so this lock pins the disclosure to every surface that PRINTS the
   * figure: add a fifth such surface without the clause and this test fails.
   *
   * Comment-stripped on purpose (the precedent above): a clause that survives only inside a `<!-- -->`
   * or `//` comment is dev-facing history and never reaches a user, so it must not satisfy the lock.
   */
  it("#207: every surface printing `requiredMonthlyReal` discloses that it RISES with income", () => {
    const SRC = join(PAGES, "..");
    // The exported single source of the wording — the surfaces must use IT, not a hand-typed copy
    // that can drift word by word.
    const clauseSrc = readFileSync(join(SRC, "lib", "required-contribution.ts"), "utf8");
    expect(
      clauseSrc.includes('export const PRESCRIPTION_GROWTH_CLAUSE'),
      "`PRESCRIPTION_GROWTH_CLAUSE` must stay exported from the module that PRODUCES the number, " +
        "so the copy cannot drift from its source",
    ).toBe(true);
    for (const token of ["rising with your income", "2%/yr real"]) {
      expect(
        clauseSrc.includes(token),
        `the exported clause must still say "${token}" — it is the whole disclosure`,
      ).toBe(true);
    }

    /** Every surface that renders the solved prescription to a user. */
    const PRESCRIPTION_SURFACES = [
      "components/dashboard/FireHero.vue",
      "components/quick/LeverPicker.vue",
      "pages/fire-goals/WhatIf.vue",
      "lib/quick-number-copy.ts",
    ] as const;
    /** Strip what never reaches a user: HTML comments, block comments, and line comments. */
    const renderedOnly = (src: string): string =>
      src
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^[ \t]*\/\/.*$/gm, "");

    for (const rel of PRESCRIPTION_SURFACES) {
      const file = join(SRC, ...rel.split("/"));
      expect(existsSync(file), `${rel} must exist — update this lock if the surface moved`).toBe(true);
      // The IMPORT line is stripped too: an unused import left behind after someone deletes the
      // clause from the template would otherwise satisfy this lock (found by mutation-testing this
      // very assertion — the first version of it passed with the clause removed from LeverPicker).
      // What must be present is a USE of the constant, not a mention of its name.
      const rendered = renderedOnly(readFileSync(file, "utf8")).replace(
        /^[ 	]*import[\s\S]*?from\s*["'][^"']+["'];?[ 	]*$/gm,
        "",
      );
      expect(
        rendered.includes("PRESCRIPTION_GROWTH_CLAUSE"),
        `${rel} prints \`requiredMonthlyReal\` but its RENDERED copy does not USE ` +
          "`PRESCRIPTION_GROWTH_CLAUSE` (an unused import does not count) — after #207 the figure " +
          "is a STARTING amount that rises with income, so copy implying a flat monthly amount " +
          "understates the later years",
      ).toBe(true);
      // And the old flat phrasings must be gone from rendered copy, in every surface's own words.
      for (const stale of ["invest this every month", "a month grow at"]) {
        expect(
          rendered.includes(stale),
          `${rel} still renders the pre-#207 flat phrasing "${stale}"`,
        ).toBe(false);
      }
    }
  });
});
