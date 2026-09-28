/**
 * A7.1 — PROPERTY-BASED + METAMORPHIC invariants on the financial kernel.
 *
 * Why this file (goal-anchored, the honesty-first FIRE promise): the existing
 * `headline-plausibility.spec.ts` proves the headline is domain-sane on FIVE fixed
 * fixtures. That catches example regressions but NOT the universe of inputs a real user
 * can produce. This file uses `fast-check` to generate THOUSANDS of randomized valid
 * perturbations and asserts the kernel's *metamorphic invariants* hold universally — the
 * properties that, if ever violated, are Tier-0 honesty bugs (an optimistic FIRE number
 * makes the accumulator UNDER-save — the worst failure mode for a planner).
 *
 * Metamorphic strategy: we start from the REAL seed personas (valid, fully-wired
 * households — far safer than synthesizing a Household from nothing) and apply random
 * VALID perturbations to the assumptions, asserting the directional/bound relationships
 * the math MUST obey. Direct module properties (tax, withdrawal) are generated free-form.
 *
 * Invariants locked here:
 *   (1) More savings (household step-up) ⇒ FIRE no later  [corpus monotonicity]
 *   (2) Higher returns ⇒ FIRE no later                    [return monotonicity]
 *   (3) For ANY valid perturbation: no NaN/−∞/negative-where-impossible reaches a user
 *   (4) Lens coherence: the default lens pools EVERY earner (the #22 class)
 *   (5) tax ≥ 0 and tax ≤ gross income, effective rate sane  [tax bounds]
 *   (6) Floor/Ceiling withdrawal: bounded, finite, downside-protective  [withdrawal bounds]
 *
 * See `.claude/rules/output-plausibility-verification.md` + the A7.1 contract clause.
 */
import fc from "fast-check";
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import { loadMehtasSeed } from "@/seeds/mehtas";
import { loadIyersSeed } from "@/seeds/iyers";
import { loadMauryasSeed } from "@/seeds/mauryas";
import { loadRaviSeed } from "@/seeds/ravi";
import { derive } from "@/lib/derive";
import { isEarningMember } from "@/lib/member-earning";
import { computeTax, AVAILABLE_FYS } from "@/lib/tax";
import { floorCeilingWithdrawal } from "@/lib/withdrawal-strategy";

const LENS = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" } as const;
const EPS = 1e-9;

type H = ReturnType<typeof useHouseholdStore>;
type A = ReturnType<typeof useAssumptionsStore>;
const PERSONAS: Array<{ name: string; load: (h: H, a: A) => void }> = [
  { name: "sharmas", load: (h, a) => loadSeedPersona(h, a) },
  { name: "mehtas", load: (h, a) => loadMehtasSeed(h, a) },
  { name: "iyers", load: (h, a) => loadIyersSeed(h, a) },
  { name: "mauryas", load: (h, a) => loadMauryasSeed(h, a) },
];

// Per-instrument return knobs (all zod-bounded [0, 0.5] in assumptions.ts).
const RETURN_KEYS = [
  "equityReturn", "debtReturn", "realEstateReturn", "goldReturn", "npsReturn",
  "ppfReturn", "epfReturn", "internationalReturn", "reitReturn", "cryptoReturn",
] as const;

describe("A7.1 kernel invariants — per-persona metamorphic (fast-check)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  for (const persona of PERSONAS) {
    // (1) MORE SAVINGS ⇒ FIRE NO LATER. The household real savings step-up is the live
    // lever (default 0). Raising it can only pull the corpus-accumulation date earlier.
    it(`${persona.name}: corpus FIRE is monotonic non-increasing in savings step-up`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const base = a.values;
      fc.assert(
        fc.property(fc.double({ min: 0, max: 15, noNaN: true }), fc.double({ min: 0, max: 15, noNaN: true }), (s1, s2) => {
          const lo = Math.min(s1, s2);
          const hi = Math.max(s1, s2);
          const kLo = derive(h.data, { ...base, householdSavingsStepUpPercent: lo }, LENS);
          const kHi = derive(h.data, { ...base, householdSavingsStepUpPercent: hi }, LENS);
          // A higher step-up must never reach the corpus target LATER.
          expect(kHi.corpusOnlyYearsToRegular).toBeLessThanOrEqual(kLo.corpusOnlyYearsToRegular + EPS);
        }),
        { numRuns: 60 },
      );
    });

    // (2) HIGHER RETURNS ⇒ FIRE NO LATER. Scale every per-instrument return by a factor
    // ≥ 1 (clamped to the zod ceiling). Faster-growing money can only reach FIRE sooner.
    it(`${persona.name}: corpus FIRE is monotonic non-increasing in returns`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const base = a.values;
      const scale = (f: number) => {
        const next = { ...base };
        for (const key of RETURN_KEYS) next[key] = Math.min(0.5, base[key] * f);
        return next;
      };
      fc.assert(
        fc.property(fc.double({ min: 1, max: 1.4, noNaN: true }), fc.double({ min: 1, max: 1.4, noNaN: true }), (f1, f2) => {
          const lo = Math.min(f1, f2);
          const hi = Math.max(f1, f2);
          const kLo = derive(h.data, scale(lo), LENS);
          const kHi = derive(h.data, scale(hi), LENS);
          expect(kHi.corpusOnlyYearsToRegular).toBeLessThanOrEqual(kLo.corpusOnlyYearsToRegular + EPS);
        }),
        { numRuns: 60 },
      );
    });

    // (#176) A RECURRING LINE ENDING BEFORE RETIREMENT ⇒ baseFireNumber NEVER RISES. Adding a
    // line whose `endYear` falls strictly before the household's own retirement calendar year
    // can only shrink (or leave unchanged) the retirement expense base — it must never CAPITALISE
    // spending the corpus will never have to fund. This is the property-level lock for the class
    // #176 fixed: before the fix, `derive()` ignored `endYear` entirely and every recurring line
    // inflated `baseFireNumber` forever, regardless of whether it had already ended.
    it(`${persona.name}: a recurring line ending before retirement never raises baseFireNumber`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const before = derive(h.data, a.values, LENS);
      // No `currentYear` override in this file (LENS.currentFY = "2025-26" resolves the kernel's
      // own currentCalendarYear to 2025) — match that here rather than hardcoding a wrong year.
      const retirementCalendarYear =
        2025 + Math.max(0, before.targetRetirementAge - before.anchorAge);
      fc.assert(
        fc.property(
          fc.double({ min: 1000, max: 100_000, noNaN: true }),
          fc.integer({ min: 1, max: 15 }),
          (monthlyAmount, yearsBeforeRetirement) => {
            const h2 = useHouseholdStore();
            const a2 = useAssumptionsStore();
            persona.load(h2, a2);
            h2.data.expenses.recurring.push({
              id: "prop-176-ending-line",
              label: "Property-test ending line",
              amount: monthlyAmount,
              frequency: "M",
              source: "manual",
              endYear: retirementCalendarYear - yearsBeforeRetirement,
            });
            const after = derive(h2.data, a2.values, LENS);
            // Relative epsilon: baseFireNumber is in the crores, so an absolute 1e-9 EPS is
            // tighter than float64 rounding on this scale of arithmetic (observed spurious
            // failures at the 8th significant digit with the fixed EPS).
            const relEps = Math.max(EPS, before.baseFireNumber * 1e-9);
            expect(after.baseFireNumber).toBeLessThanOrEqual(before.baseFireNumber + relEps);
          },
        ),
        { numRuns: 40 },
      );
    });

    // (#176) A RECURRING LINE WITH NO `endYear` ⇒ baseFireNumber NEVER FALLS. A perpetual line
    // (no endYear, or one at/after retirement) is retirement spending the corpus DOES have to
    // fund, so adding one can only raise (or leave unchanged) the retirement expense base — the
    // mirror-image guarantee that #176's fix is additive-only for lines that don't end early.
    it(`${persona.name}: a recurring line with no endYear never lowers baseFireNumber`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const before = derive(h.data, a.values, LENS);
      fc.assert(
        fc.property(fc.double({ min: 1000, max: 100_000, noNaN: true }), (monthlyAmount) => {
          const h2 = useHouseholdStore();
          const a2 = useAssumptionsStore();
          persona.load(h2, a2);
          h2.data.expenses.recurring.push({
            id: "prop-176-perpetual-line",
            label: "Property-test perpetual line",
            amount: monthlyAmount,
            frequency: "M",
            source: "manual",
          });
          const after = derive(h2.data, a2.values, LENS);
          const relEps = Math.max(EPS, before.baseFireNumber * 1e-9);
          expect(after.baseFireNumber).toBeGreaterThanOrEqual(before.baseFireNumber - relEps);
        }),
        { numRuns: 40 },
      );
    });

    // (T-376/gh-#165) ADDING A PLANNED-FUTURE GOAL (ANY kind) ⇒ FIRE NO EARLIER. A one-shot
    // today-rupee lump only ever grows the family-layer corpus, so the years-to-FIRE leg must
    // be monotonic non-decreasing in the added goal's `todayAmount` — regardless of `kind`
    // (general/education/marriage/medical/undefined). This is the property-level lock for the
    // Tier-0 honesty fix: a house-upgrade `general` goal silently NOT moving the FIRE age was
    // the exact bug (derive.ts previously summed only education+marriage kinds).
    it(`${persona.name}: adding a plannedFuture goal (any kind) never makes FIRE earlier`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const base = a.values;
      const kinds = ["general", "education", "marriage", "medical", undefined] as const;
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 50_000_000, noNaN: true }),
          fc.double({ min: 0, max: 50_000_000, noNaN: true }),
          fc.constantFrom(...kinds),
          (amt1, amt2, kind) => {
            const lo = Math.min(amt1, amt2);
            const hi = Math.max(amt1, amt2);
            const withGoal = (amount: number) => {
              const hh = JSON.parse(JSON.stringify(h.data));
              hh.expenses.plannedFuture.push({
                id: "prop-goal",
                label: "property-test goal",
                todayAmount: amount,
                targetYear: new Date().getFullYear() + 5,
                isMultiYear: false,
                kind,
              });
              return hh;
            };
            const kLo = derive(withGoal(lo), base, LENS);
            const kHi = derive(withGoal(hi), base, LENS);
            expect(kHi.corpusOnlyYearsToRegular).toBeGreaterThanOrEqual(kLo.corpusOnlyYearsToRegular - EPS);
            expect(kHi.fireNumber).toBeGreaterThanOrEqual(kLo.fireNumber - EPS);
          },
        ),
        { numRuns: 60 },
      );
    });

    // (3) NO ABSURD VALUE for ANY valid perturbation. Whatever step-up + returns a user
    // sets, the flagship numbers stay finite + in-range — or honestly non-finite (the
    // "not within horizon" signal), never NaN/−∞/negative.
    it(`${persona.name}: no NaN/−∞/negative reaches a user under any valid perturbation`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const base = a.values;
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 15, noNaN: true }),
          fc.double({ min: 1, max: 1.4, noNaN: true }),
          (stepUp, f) => {
            const perturbed = { ...base, householdSavingsStepUpPercent: stepUp };
            for (const key of RETURN_KEYS) perturbed[key] = Math.min(0.5, base[key] * f);
            const k = derive(h.data, perturbed, LENS);

            // Positive, finite FIRE target (every persona has real expenses).
            expect(Number.isFinite(k.fireNumber) && k.fireNumber > 0).toBe(true);
            // Corpus + savings are real money, never NaN/negative.
            expect(Number.isFinite(k.totalCorpus) && k.totalCorpus >= 0).toBe(true);
            expect(Number.isFinite(k.annualSavings)).toBe(true);
            // Savings rate is a sane percentage (it is income-driven, unaffected by these
            // levers, but we still assert it never degrades to NaN).
            expect(Number.isFinite(k.savingsRate) && k.savingsRate >= 0 && k.savingsRate <= 100).toBe(true);
            // Progress is a clamped 0–100 percentage — never NaN/∞.
            expect(k.progressPercent >= 0 && k.progressPercent <= 100).toBe(true);
            // Years-to-FIRE is EITHER a sane finite number OR honestly non-finite — never NaN,
            // never negative (a negative would render "already retired" falsely).
            for (const y of [k.yearsToRegular, k.corpusOnlyYearsToRegular, k.yearsToLean, k.yearsToFat]) {
              expect(Number.isNaN(y)).toBe(false);
              if (Number.isFinite(y)) expect(y).toBeGreaterThanOrEqual(0);
            }
          },
        ),
        { numRuns: 80 },
      );
    });

    // (4) LENS COHERENCE (the #22 class): the default lens MUST pool every earner, for any
    // perturbation. A silent scope-to-primary-earner is the exact bug that shipped age-81.
    it(`${persona.name}: default lens pools all earners under any perturbation`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const base = a.values;
      const earners = h.data.members.filter((m) => isEarningMember(m, h.data.businesses)).length;
      fc.assert(
        fc.property(fc.double({ min: 0, max: 15, noNaN: true }), (stepUp) => {
          const k = derive(h.data, { ...base, householdSavingsStepUpPercent: stepUp }, LENS);
          expect(k.lensedEarners.length).toBe(earners);
        }),
        { numRuns: 25 },
      );
    });

    // (5) ANTI-OPTIMISM (the Tier-0 honesty contract the bridge exists for): the bridge-adjusted
    // headline yearsToRegular may only push FIRE LATER than the pure corpus-accumulation leg, NEVER
    // earlier. An earlier headline would be optimistic — the exact under-save failure mode. (FinTech
    // independent review, 2026-06-07: this directly locks the anti-optimism promise.)
    it(`${persona.name}: headline FIRE is never more optimistic than the corpus-only leg`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const base = a.values;
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 15, noNaN: true }),
          fc.double({ min: 1, max: 1.4, noNaN: true }),
          (stepUp, f) => {
            const perturbed = { ...base, householdSavingsStepUpPercent: stepUp };
            for (const key of RETURN_KEYS) perturbed[key] = Math.min(0.5, base[key] * f);
            const k = derive(h.data, perturbed, LENS);
            if (Number.isFinite(k.yearsToRegular) && Number.isFinite(k.corpusOnlyYearsToRegular)) {
              expect(k.yearsToRegular).toBeGreaterThanOrEqual(k.corpusOnlyYearsToRegular - EPS);
            }
          },
        ),
        { numRuns: 50 },
      );
    });
  }
});

describe("T-377/QN-2 — solver precondition: FIRE is monotone in the real monthly contribution", () => {
  beforeEach(() => setActivePinia(createPinia()));

  // THE binary-search precondition. `required-contribution.ts` bisects the household real
  // monthly contribution through the REAL derive() path; bisection is only sound if the
  // predicate "reaches the target by age N" is monotone in that contribution. This property
  // asserts it across every seed + fast-check perturbation, on the HEADLINE `yearsToRegular`
  // — i.e. bridge/accessibility, horizon-SWR, the healthcare reservation and the NPS post-tax
  // offset all included, not just the corpus-only leg. A violation is NOT a test to relax:
  // per the contract the solver must fall back to a monotone-guaranteed scan.
  for (const persona of PERSONAS) {
    it(`${persona.name}: headline yearsToFire is non-increasing in the monthly contribution`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const base = a.values;
      const current = derive(h.data, base, LENS).monthlyContribution;
      const hi = Math.max(10 * current, 500_000);
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: hi, noNaN: true }),
          fc.double({ min: 0, max: hi, noNaN: true }),
          (c1, c2) => {
            const lo = Math.min(c1, c2);
            const up = Math.max(c1, c2);
            const kLo = derive(h.data, base, LENS, { monthlyContributionReal: lo });
            const kUp = derive(h.data, base, LENS, { monthlyContributionReal: up });
            expect(kUp.yearsToRegular).toBeLessThanOrEqual(kLo.yearsToRegular + EPS);
          },
        ),
        { numRuns: 60 },
      );
    });

    // The same predicate under a moved retirement target (the hero slider) — the solver
    // re-solves at every slider position, so monotonicity must hold there too.
    it(`${persona.name}: monotone in contribution at every slider target age`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const base = a.values;
      const current = derive(h.data, base, LENS).monthlyContribution;
      const hi = Math.max(10 * current, 500_000);
      fc.assert(
        fc.property(
          fc.integer({ min: 40, max: 70 }),
          fc.double({ min: 0, max: hi, noNaN: true }),
          fc.double({ min: 0, max: hi, noNaN: true }),
          (targetAge, c1, c2) => {
            const lo = Math.min(c1, c2);
            const up = Math.max(c1, c2);
            const kLo = derive(h.data, base, LENS, { monthlyContributionReal: lo, targetRetirementAge: targetAge });
            const kUp = derive(h.data, base, LENS, { monthlyContributionReal: up, targetRetirementAge: targetAge });
            expect(kUp.yearsToRegular).toBeLessThanOrEqual(kLo.yearsToRegular + EPS);
          },
        ),
        { numRuns: 40 },
      );
    });

    // The solver bisects on `individualFireAge` under a member lens, so THAT predicate needs
    // the same monotonicity guarantee — the household property does not cover the branch the
    // code actually takes when "Viewing as <member>" is active (code-review M5).
    it(`${persona.name}: individual FIRE age is non-increasing in the member's contribution`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const base = a.values;
      const adults = derive(h.data, base, LENS).individualFireByMember;
      for (const adult of adults) {
        const memberLens = { ...LENS, viewingMemberId: adult.memberId };
        fc.assert(
          fc.property(
            fc.integer({ min: 40, max: 70 }),
            fc.double({ min: 0, max: 500_000, noNaN: true }),
            fc.double({ min: 0, max: 500_000, noNaN: true }),
            (targetAge, c1, c2) => {
              const lo = Math.min(c1, c2);
              const up = Math.max(c1, c2);
              const pick = (c: number) =>
                derive(h.data, base, memberLens, {
                  monthlyContributionReal: c,
                  targetRetirementAge: targetAge,
                }).individualFireByMember.find((m) => m.memberId === adult.memberId)!;
              expect(pick(up).individualFireAge).toBeLessThanOrEqual(pick(lo).individualFireAge + EPS);
            },
          ),
          { numRuns: 25 },
        );
      }
    });

    // No perturbation may put a NaN on screen (rule 31) — the solver reads these fields.
    it(`${persona.name}: no NaN reaches the headline under any contribution override`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const base = a.values;
      fc.assert(
        fc.property(fc.double({ min: 0, max: 5_000_000, noNaN: true }), (c) => {
          const k = derive(h.data, base, LENS, { monthlyContributionReal: c });
          expect(Number.isNaN(k.yearsToRegular)).toBe(false);
          expect(Number.isNaN(k.fireNumber)).toBe(false);
          expect(k.fireNumber).toBeGreaterThanOrEqual(0);
          expect(k.householdFireAge == null || Number.isFinite(k.householdFireAge)).toBe(true);
        }),
        { numRuns: 40 },
      );
    });
  }
});

describe("A7.1 tax-engine invariants — free-form (fast-check)", () => {
  // (5) Tax is non-negative, never exceeds gross income, finite, with a sane effective rate
  // — for ANY income/deduction/regime/FY. A negative tax or tax-above-income is a sign bug
  // that would silently corrupt every downstream net-income / savings figure.
  it("computeTax: 0 ≤ tax ≤ gross, finite, effective rate < 50%", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 100_000_000, noNaN: true }),
        fc.double({ min: 0, max: 2_000_000, noNaN: true }),
        fc.constantFrom("OLD" as const, "NEW" as const),
        fc.constantFrom(...AVAILABLE_FYS),
        (grossIncome, deductions, regime, fy) => {
          const r = computeTax({ grossIncome, regime, fy, deductions });
          expect(Number.isFinite(r.totalTax)).toBe(true);
          expect(r.totalTax).toBeGreaterThanOrEqual(0);
          expect(r.totalTax).toBeLessThanOrEqual(grossIncome + 1); // tax never exceeds gross (+₹1 rounding slack)
          expect(Number.isFinite(r.effectiveRate)).toBe(true);
          expect(r.effectiveRate).toBeGreaterThanOrEqual(0);
          // effectiveRate is a PERCENTAGE (totalTax/gross*100). The average effective rate is
          // always below the top marginal (~42.7% incl. surcharge+cess), so < 45% is a real
          // runaway-catching bound. (45, not 0.5 — the field is percent, not a fraction.)
          expect(r.effectiveRate).toBeLessThan(45);
        },
      ),
      { numRuns: 200 },
    );
  });

  // Metamorphic: more deductions never INCREASE old-regime tax (a deduction can only reduce
  // taxable income). Catches a sign flip in the deduction wiring.
  it("computeTax: more old-regime deductions ⇒ tax no higher", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 500_000, max: 50_000_000, noNaN: true }),
        fc.double({ min: 0, max: 1_500_000, noNaN: true }),
        fc.double({ min: 0, max: 1_500_000, noNaN: true }),
        (grossIncome, d1, d2) => {
          const lo = Math.min(d1, d2);
          const hi = Math.max(d1, d2);
          const fy = AVAILABLE_FYS[AVAILABLE_FYS.length - 1];
          const taxLo = computeTax({ grossIncome, regime: "OLD", fy, deductions: lo }).totalTax;
          const taxHi = computeTax({ grossIncome, regime: "OLD", fy, deductions: hi }).totalTax;
          expect(taxHi).toBeLessThanOrEqual(taxLo + 1);
        },
      ),
      { numRuns: 120 },
    );
  });

  // MARGINAL RELIEF (FinTech independent review, 2026-06-07 — the highest-rupee-risk area of
  // Indian tax): post-tax income must be MONOTONIC NON-DECREASING in gross income. Earning ₹1
  // more must never leave you with less after tax. This is exactly what surcharge marginal relief
  // (₹50L/₹1Cr/₹2Cr/₹5Cr cliffs) + the ₹12L rebate marginal relief guarantee — a regression that
  // dropped either would create a take-home CLIFF, caught here for free across the whole range.
  it("computeTax: post-tax income is monotonic non-decreasing in gross (marginal relief holds)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 60_000_000, noNaN: true }),
        fc.double({ min: 0, max: 60_000_000, noNaN: true }),
        fc.constantFrom("OLD" as const, "NEW" as const),
        fc.constantFrom(...AVAILABLE_FYS),
        (g1, g2, regime, fy) => {
          const lo = Math.min(g1, g2);
          const hi = Math.max(g1, g2);
          const netLo = lo - computeTax({ grossIncome: lo, regime, fy }).totalTax;
          const netHi = hi - computeTax({ grossIncome: hi, regime, fy }).totalTax;
          // A higher gross must yield a higher-or-equal take-home (±₹1 rounding slack).
          expect(netHi).toBeGreaterThanOrEqual(netLo - 1);
        },
      ),
      { numRuns: 250 },
    );
  });

  // Targeted surcharge-cliff witnesses (₹50L, ₹1Cr) — a ₹1 raise across the cliff must not cost
  // more than ₹1 of take-home (the explicit marginal-relief contract at the boundary).
  it("computeTax: surcharge cliffs do not destroy take-home (₹50L, ₹1Cr witnesses)", () => {
    const fy = AVAILABLE_FYS[AVAILABLE_FYS.length - 1];
    for (const cliff of [5_000_000, 10_000_000]) {
      for (const regime of ["OLD", "NEW"] as const) {
        const below = cliff - 1000;
        const above = cliff + 1000;
        const netBelow = below - computeTax({ grossIncome: below, regime, fy }).totalTax;
        const netAbove = above - computeTax({ grossIncome: above, regime, fy }).totalTax;
        expect(netAbove, `${regime} ₹${cliff} cliff: +₹2000 gross must not reduce take-home`).toBeGreaterThanOrEqual(
          netBelow - 1,
        );
      }
    }
  });

  // NEW regime IGNORES chapter-VI-A deductions (tax.ts: ded = regime==='OLD' ? ... : 0). A bug that
  // started applying them under NEW would UNDERSTATE tax → overstate take-home → optimistically
  // earlier FIRE → under-save (a Tier-0 honesty error). Lock: NEW tax is invariant to `deductions`.
  it("computeTax: NEW-regime tax is invariant to the deductions arg", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 60_000_000, noNaN: true }),
        fc.double({ min: 0, max: 1_500_000, noNaN: true }),
        fc.constantFrom(...AVAILABLE_FYS),
        (grossIncome, deductions, fy) => {
          const withDed = computeTax({ grossIncome, regime: "NEW", fy, deductions }).totalTax;
          const without = computeTax({ grossIncome, regime: "NEW", fy, deductions: 0 }).totalTax;
          expect(withDed).toBe(without);
        },
      ),
      { numRuns: 120 },
    );
  });
});

describe("A7.1 withdrawal-rule invariants — free-form (fast-check)", () => {
  // (6) Floor/Ceiling withdrawal: bounded, finite, and DOWNSIDE-PROTECTIVE — a floor trigger
  // (low corpus) must CUT spending (≤ baseline), never raise it; a ceiling cap holds flat.
  // A NaN or a perverse spend-MORE-when-broke would betray the post-FIRE "stay free" promise.
  it("floorCeilingWithdrawal: withdrawal ≥ 0, finite, protective when floor triggers", () => {
    const config = {
      kind: "FloorCeiling" as const,
      swr: 0.035,
      inflation: 0.06,
      floorMultiplier: 0.8,
      ceilingMultiplier: 1.2,
      floorAdjustment: 0.9, // ≤ 1 ⇒ a cut
      ceilingAdjustment: 1.0,
    };
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 200_000_000, noNaN: true }), // startingCorpus > 0
        fc.double({ min: 0, max: 300_000_000, noNaN: true }), // currentCorpus ≥ 0
        fc.integer({ min: 1, max: 50 }), // year ≥ 1
        fc.double({ min: 0, max: 50_000_000, noNaN: true }), // previousWithdrawal ≥ 0
        (startingCorpus, currentCorpus, year, previousWithdrawal) => {
          const r = floorCeilingWithdrawal(config, startingCorpus, currentCorpus, year, previousWithdrawal);
          const baseline = previousWithdrawal * (1 + config.inflation);
          expect(Number.isFinite(r.withdrawal)).toBe(true);
          expect(r.withdrawal).toBeGreaterThanOrEqual(0);
          if (r.rule === "floor-triggered") {
            // Downside protection: floor cuts (floorAdjustment ≤ 1), never raises spending.
            expect(r.withdrawal).toBeLessThanOrEqual(baseline + EPS);
          }
          if (r.rule === "ceiling-capped") {
            // No ratchet: ceiling holds at baseline * ceilingAdjustment.
            expect(r.withdrawal).toBeCloseTo(baseline * config.ceilingAdjustment, 6);
          }
        },
      ),
      { numRuns: 200 },
    );

    // Deterministic branch witnesses (code-review 2026-06-07: the random property does not
    // GUARANTEE each branch fires + does not lock the floor magnitude). These force every branch
    // and pin the exact magnitude — non-flaky, no reliance on random coverage.
    const start = 10_000_000;
    const prev = 350_000;
    const base = prev * (1 + config.inflation);
    const floorR = floorCeilingWithdrawal(config, start, start * 0.5, 3, prev); // ratio 0.5 < floor 0.8
    expect(floorR.rule).toBe("floor-triggered");
    expect(floorR.withdrawal, "floor cut is exactly baseline*floorAdjustment").toBeCloseTo(base * config.floorAdjustment, 6);
    const ceilR = floorCeilingWithdrawal(config, start, start * 2, 3, prev); // ratio 2 > ceiling 1.2
    expect(ceilR.rule).toBe("ceiling-capped");
    expect(ceilR.withdrawal).toBeCloseTo(base * config.ceilingAdjustment, 6);
    const baseR = floorCeilingWithdrawal(config, start, start * 1.0, 3, prev); // ratio 1.0 in band
    expect(baseR.rule).toBe("baseline");
    expect(baseR.withdrawal).toBeCloseTo(base, 6);
  });

  // Year 0 is always exactly the starting SWR draw — a fixed, auditable anchor.
  it("floorCeilingWithdrawal: year 0 = startingCorpus * swr exactly", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 200_000_000, noNaN: true }), (startingCorpus) => {
        const config = {
          kind: "FloorCeiling" as const, swr: 0.035, inflation: 0.06,
          floorMultiplier: 0.8, ceilingMultiplier: 1.2, floorAdjustment: 0.9, ceilingAdjustment: 1.0,
        };
        const r = floorCeilingWithdrawal(config, startingCorpus, startingCorpus, 0, 0);
        expect(r.withdrawal).toBeCloseTo(startingCorpus * config.swr, 6);
        expect(r.rule).toBe("baseline");
      }),
      { numRuns: 40 },
    );
  });
});

/**
 * ADR-0006 Phase 1b (MEDIUM-5) — a BRIDGE-CONSTRAINED monotonicity witness.
 *
 * The four seeds are all corpus-limited, so the property tests above exercise the leg whose
 * monotonicity has an easy proof (`corpus_t` rises in `C`, `target_t` does not depend on it). The
 * headline is `max(corpusOnlyYears, bridge.effectiveFireAge − anchor)`, and the BRIDGE leg has no
 * such proof: `derive.ts` scales holdings by `driftedTargetReal / totalCorpus` at the ADEQUACY AGE,
 * and that age moves with `C`. A larger contribution therefore reaches adequacy earlier, at a
 * different scale, over a different bridge window — so the solver's bisection precondition needs a
 * witness on a household where the BRIDGE actually binds, not only where it is slack.
 *
 * The fixture parks almost the whole corpus in PPF + NPS, which unlock late, leaving very little
 * liquid runway for the early retirement years.
 */
describe("T-377/QN-2 — the precondition holds where the BRIDGE binds, not just the corpus leg", () => {
  beforeEach(() => setActivePinia(createPinia()));

  function loadBridgeConstrained(h: H, a: A) {
    loadSeedPersona(h, a); // Sharmas
    // Park the whole corpus in PPF + NPS (both unlock at 60) and make it large enough that the
    // ADEQUACY leg is satisfied immediately — so the headline is driven ENTIRELY by the bridge,
    // which is the leg with no target-independence argument behind it. Measured on this fixture:
    // corpusOnlyYearsToRegular = 0 while yearsToRegular = 26 (effective FIRE age 56, uncovered).
    h.data.investments = h.data.investments.map((inv, i) => ({
      ...inv,
      type: i % 2 === 0 ? ("PPF" as const) : ("NPS" as const),
      value: inv.value * 6,
    }));
  }

  it("the fixture really is bridge-constrained (else this witness proves nothing)", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadBridgeConstrained(h, a);
    const k = derive(h.data, a.values, LENS);
    expect(
      k.yearsToRegular,
      "the bridge must PUSH the headline past the corpus-only leg for this fixture to be a witness",
    ).toBeGreaterThan(k.corpusOnlyYearsToRegular + EPS);
  });

  it("headline yearsToFire is still non-increasing in the monthly contribution", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadBridgeConstrained(h, a);
    const base = a.values;
    const current = derive(h.data, base, LENS).monthlyContribution;
    const hi = Math.max(10 * current, 500_000);
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: hi, noNaN: true }),
        fc.double({ min: 0, max: hi, noNaN: true }),
        (c1, c2) => {
          const lo = Math.min(c1, c2);
          const up = Math.max(c1, c2);
          const kLo = derive(h.data, base, LENS, { monthlyContributionReal: lo });
          const kUp = derive(h.data, base, LENS, { monthlyContributionReal: up });
          expect(kUp.yearsToRegular).toBeLessThanOrEqual(kLo.yearsToRegular + EPS);
        },
      ),
      { numRuns: 60 },
    );
  });
});

// gh #185 — the income-path invariants (`docs/goals/2026-09-13-income-path-kernel.md` §4.5),
// written against the PUBLIC `derive()` interface.
//
// STEP 4 HAS LANDED (2026-09-29), SO THESE ARE LIVE, NOT VACUOUS. They were authored before the
// kernel read `salary.hikePercent` or the income-path assumption fields, at which point a non-strict
// `<=`/`>=` bound was trivially satisfied by an unchanged headline. `derive()` now grows each
// earner's income (`salaryGrowthRealPercent`, tapering at `salaryGrowthTaperAge`) and folds
// lifestyle creep into the household basket, so both properties below exercise real kernel logic
// and will fail if the direction is ever wrong. Because a non-strict bound still cannot distinguish
// "the invariant holds" from "the input went back to being ignored", the NON-VACUITY GUARD describe
// at the bottom of this file asserts STRICT movement on the same seed — that is the test that goes
// red if a refactor silently disconnects the income path.
describe("gh #185 income-path invariants — live since Step 4 (public derive() interface)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  // (7) INCOME MONOTONICITY — higher earner hikePercent ⇒ FIRE no later. Exercises the existing
  // `salary.hikePercent` field on the Ravi fixture (the seed this property is written for, per spec
  // §4.5) by perturbing every earning member's hike% upward and asserting the household FIRE date
  // never gets WORSE. Load-bearing since Step 4: `hikePercent` drives the EXPECTED band, so a
  // higher typed hike moves `expectedFireAge` earlier and must never move the headline later.
  it("ravi: higher salary.hikePercent never makes FIRE later", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadRaviSeed(h, a);
    const base = a.values;
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 25, noNaN: true }),
        fc.double({ min: 0, max: 25, noNaN: true }),
        (hike1, hike2) => {
          const lo = Math.min(hike1, hike2);
          const hi = Math.max(hike1, hike2);
          const withHike = (pct: number) => {
            const snapshot = JSON.parse(JSON.stringify(h.data)) as typeof h.data;
            for (const m of snapshot.members) {
              if (m.salary) m.salary = { ...m.salary, hikePercent: pct };
            }
            return snapshot;
          };
          const kLo = derive(withHike(lo), base, LENS);
          const kHi = derive(withHike(hi), base, LENS);
          expect(
            kHi.corpusOnlyYearsToRegular,
            "a higher hikePercent must never push the corpus-only FIRE leg later",
          ).toBeLessThanOrEqual(kLo.corpusOnlyYearsToRegular + EPS);
        },
      ),
      { numRuns: 60 },
    );
  });

  // (8) CREEP MONOTONICITY — higher lifestyle-creep (expense growth above inflation) ⇒ FIRE no
  // earlier. Live since Step 4: the field is declared on `Assumptions` and folded into the ONE
  // household basket (ADR-0007 (c)/(d)), so it grows the expense line AND the FIRE target.
  //
  // An EARLIER attempt used `assumptions.inflation` itself as a stand-in proxy. That was WRONG and
  // is recorded here so nobody re-tries it: raising general inflation also raises the real-return
  // deflator (ADR-0006's `toRealReturn`), which is not a clean monotonic stand-in for creep and
  // produced a real counterexample (fireAge 46.25 < 46.33) — an unsound proxy, not a kernel bug.
  it("ravi: higher expenseGrowthAboveInflationPercent never makes FIRE earlier", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadRaviSeed(h, a);
    const base = a.values;
    type WithCreep = typeof base & { expenseGrowthAboveInflationPercent: number };
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 5, noNaN: true }),
        fc.double({ min: 0, max: 5, noNaN: true }),
        (c1, c2) => {
          const lo = Math.min(c1, c2);
          const hi = Math.max(c1, c2);
          const kLo = derive(h.data, { ...base, expenseGrowthAboveInflationPercent: lo } as WithCreep, LENS);
          const kHi = derive(h.data, { ...base, expenseGrowthAboveInflationPercent: hi } as WithCreep, LENS);
          if (Number.isFinite(kLo.yearsToRegular) && Number.isFinite(kHi.yearsToRegular)) {
            expect(
              kHi.yearsToRegular,
              "higher lifestyle-creep must never pull FIRE earlier",
            ).toBeGreaterThanOrEqual(kLo.yearsToRegular - EPS);
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});

// ADR-0007 / gh #185 step 4 — NON-VACUITY GUARD for the two invariants above.
//
// The two properties above were deliberately written to COMPILE and pass by VACUITY before Step 4
// (the kernel ignored `hikePercent` and the creep field, so a non-strict `<=`/`>=` bound was
// trivially satisfied by an unchanged headline). Step 4 has landed, so they must now be EXERCISING
// real kernel logic — and a non-strict bound cannot tell the difference between "the invariant
// holds" and "the input is still ignored". This lock closes that hole with STRICT inequalities on
// the real seed: if a future refactor silently disconnects the income path, the properties above go
// quietly vacuous again while THIS test goes red.
//
// It also locks the product rule the whole goal exists for (spec §3.2): the user's own
// `hikePercent` moves the SECOND number and NEVER the headline. An optimistic headline makes this
// persona under-save, which is the Tier-0 failure mode.
describe("gh #185 income-path NON-VACUITY — the new inputs genuinely move the kernel (Step 4 landed)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("ravi: hikePercent moves the EXPECTED number only; creep and salary growth both move the headline", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadRaviSeed(h, a);
    const withHike = (pct: number) => {
      const snapshot = JSON.parse(JSON.stringify(h.data)) as typeof h.data;
      for (const m of snapshot.members) {
        if (m.salary) m.salary = { ...m.salary, hikePercent: pct };
      }
      return snapshot;
    };

    // (1) hikePercent: the HEADLINE is immune (spec §3.2) and the EXPECTED number moves STRICTLY.
    const noHike = derive(withHike(0), a.values, LENS);
    const bigHike = derive(withHike(25), a.values, LENS);
    expect(
      bigHike.corpusOnlyYearsToRegular,
      "a hike% may NEVER move the conservative headline (Tier-0: optimism makes this persona under-save)",
    ).toBe(noHike.corpusOnlyYearsToRegular);
    expect(
      bigHike.expectedYearsToRegular,
      "a higher hike% MUST pull the EXPECTED number strictly earlier — else the field is inert",
    ).toBeLessThan(noHike.expectedYearsToRegular);
    // A hike ABOVE the conservative default beats the headline; the basis is then the typed hike.
    expect(bigHike.expectedYearsToRegular).toBeLessThan(bigHike.corpusOnlyYearsToRegular);
    expect(bigHike.expectedFireAgeBasis).toBe(25);

    // A hike of 0 means the user is telling us their income does not grow at all, and since the
    // FinTech review removed the floor-at-the-conservative-default clamp from
    // `expectedRealGrowthPercent` (it was a presentation rule enforced in a math function), the
    // expected run is now HONESTLY WORSE than the headline here. That is the point: the arithmetic
    // tells the truth, and `expectedFireAgeBasis` is NULL so the UI shows ONE number instead of
    // labelling a worse figure as the user's own expectation. Asserting `expected <= headline`
    // unconditionally would re-introduce the clamp through the test suite.
    expect(
      noHike.expectedYearsToRegular,
      "a 0% hike must produce an honestly WORSE expected run, not a clamped one",
    ).toBeGreaterThan(noHike.corpusOnlyYearsToRegular);
    expect(
      noHike.expectedFireAgeBasis,
      "a second number that is worse than the headline must NOT be offered to the UI",
    ).toBeNull();

    // A hike BELOW the conservative default (4% nominal vs 6% CPI = negative real) is the case the
    // clamp used to hide: the basis must still be null, so no user is ever shown a pessimistic
    // number presented as their own optimistic scenario.
    const lowHike = derive(withHike(4), a.values, LENS);
    expect(lowHike.expectedFireAgeBasis).toBeNull();

    // (2) creep: STRICTLY later. (3) salary growth: STRICTLY earlier.
    const creep0 = derive(h.data, { ...a.values, expenseGrowthAboveInflationPercent: 0 }, LENS);
    const creep5 = derive(h.data, { ...a.values, expenseGrowthAboveInflationPercent: 5 }, LENS);
    expect(
      creep5.yearsToRegular,
      "more lifestyle creep MUST push FIRE strictly later — else the creep field is inert",
    ).toBeGreaterThan(creep0.yearsToRegular);

    const growth0 = derive(h.data, { ...a.values, salaryGrowthRealPercent: 0 }, LENS);
    const growth5 = derive(h.data, { ...a.values, salaryGrowthRealPercent: 5 }, LENS);
    expect(
      growth5.yearsToRegular,
      "more real salary growth MUST pull FIRE strictly earlier — else the income path is inert",
    ).toBeLessThan(growth0.yearsToRegular);
  });
});

// ADR-0007 / gh #185 — the CREEP-COHERENCE invariant (the C1 guard).
//
// WHY THIS EXISTS. The first pass at the income path added lifestyle creep to the basket used for
// the SURPLUS's expense line but not to the one the FIRE TARGET grows at. Nothing in the suite
// noticed: every monotonicity property still held, every seed still produced a plausible number,
// and the golden master simply re-baselined. The kernel was declaring a household FIRE-ready on a
// corpus that funded ~₹2.73L/yr of real spending while its own projection had that household
// spending ~₹3.57L/yr — a 31% shortfall AT THE MOMENT OF THE VERDICT, in the optimistic direction.
// A FinTech review found it; no test could have.
//
// THE CLASS, stated generally: ANY rate that grows what the household SPENDS must also grow what
// the corpus must FUND. The two legs of an adequacy verdict cannot run on two different inflation
// models — that is not a tuning difference, it is the verdict comparing two different households.
// This property is the detection upgrade for that whole class, not just for creep: it would also
// catch a future bucket, weight or goal change that moved one leg without the other.
describe("gh #185 creep coherence — the spend leg and the fund leg grow at ONE rate", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("ravi: the real expense level at the verdict equals the real spend the base target funds, at EVERY creep", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadRaviSeed(h, a);
    for (const creep of [0, 1, 2.5, 5]) {
      const k = derive(h.data, { ...a.values, expenseGrowthAboveInflationPercent: creep }, LENS);
      if (!Number.isFinite(k.corpusOnlyYearsToRegular)) continue;
      const T = k.corpusOnlyYearsToRegular;
      // What the household is projected to be SPENDING, in today's rupees, at the verdict.
      const realDrift = (1 + k.householdInflation) / (1 + a.values.inflation) - 1;
      const spendAtVerdict = k.annualExpensesToday * Math.pow(1 + realDrift, T);
      // What the BASE leg of the target funds at the resolved SWR, in today's rupees, at the verdict.
      const fundedAtVerdict = k.regularTargetComponentsRealAt(T).base * k.effectiveSWR;
      // Within 1%: the two are the same quantity computed through two different code paths (the
      // expense schedule vs the target schedule), so they must agree to arithmetic noise, not to a
      // loose band. A creep that rides only one leg blows this out by tens of percent.
      expect(
        Math.abs(fundedAtVerdict - spendAtVerdict) / spendAtVerdict,
        `creep=${creep}%: at the verdict (T=${T.toFixed(2)}y) the household spends ₹${Math.round(spendAtVerdict)}/yr real ` +
          `but the base target funds ₹${Math.round(fundedAtVerdict)}/yr real — the two legs are on different inflation models`,
      ).toBeLessThan(0.01);
    }
  });
});

// gh #194 — zero-value portfolio never blends to a rate ABOVE the max of its instruments' returns,
// and adding a zero-value/zero-contribution line never moves an already-positive-value blend.
//
// These are the two invariants the #194 issue's detection upgrade calls for: (1) an all-zero-value
// portfolio's fallback (contribution mix, or debt when even contribution is zero) can never exceed
// the single highest per-bucket rate/σ present in EITHER weight map — so the fallback can never
// silently reproduce the all-equity optimism the issue fixes; (2) a positive-value household's
// blend is unaffected by a line that carries neither value nor contribution (a closed/dormant
// instrument, or a not-yet-funded goal placeholder).
import {
  blendPortfolioReturn,
  blendPortfolioVolatility,
  type PortfolioReturnWeights,
} from "@/lib/assumption-math";
import { RETURN_BUCKET_VOLATILITY } from "@/lib/monte-carlo";
import { DEFAULT_ASSUMPTIONS } from "@/types/assumptions";

const ZERO_WEIGHTS: PortfolioReturnWeights = {
  equity: 0, debt: 0, realEstate: 0, gold: 0, nps: 0, ppf: 0, epf: 0,
  international: 0, reit: 0, crypto: 0, other: 0,
};

const BUCKET_KEYS = Object.keys(ZERO_WEIGHTS) as Array<keyof PortfolioReturnWeights>;

function weightsFrom(entries: Partial<Record<keyof PortfolioReturnWeights, number>>): PortfolioReturnWeights {
  return { ...ZERO_WEIGHTS, ...entries };
}

const returnRateOf = (bucket: keyof PortfolioReturnWeights): number => {
  const v = DEFAULT_ASSUMPTIONS;
  switch (bucket) {
    case "equity": return v.equityReturn;
    case "debt": return v.debtReturn;
    case "realEstate": return v.realEstateReturn;
    case "gold": return v.goldReturn;
    case "nps": return v.npsReturn;
    case "ppf": return v.ppfReturn;
    case "epf": return v.epfReturn;
    case "international": return v.internationalReturn;
    case "reit": return v.reitReturn;
    case "crypto": return v.cryptoReturn;
    case "other": return v.debtReturn;
  }
};

describe("gh #194 — zero-value portfolio fallback never exceeds the max instrument rate/σ present", () => {
  it("blendPortfolioReturn on an all-zero-value portfolio never exceeds the max rate across value+contribution buckets", () => {
    fc.assert(
      fc.property(
        fc.record(Object.fromEntries(BUCKET_KEYS.map((k) => [k, fc.double({ min: 0, max: 100_000, noNaN: true })]))) as fc.Arbitrary<
          Record<keyof PortfolioReturnWeights, number>
        >,
        (contributionEntries) => {
          const contributionWeights = weightsFrom(contributionEntries);
          const blended = blendPortfolioReturn(DEFAULT_ASSUMPTIONS, ZERO_WEIGHTS, undefined, contributionWeights);
          const presentBuckets = BUCKET_KEYS.filter((k) => contributionWeights[k] > 0);
          const maxRate =
            presentBuckets.length > 0
              ? Math.max(...presentBuckets.map(returnRateOf))
              : DEFAULT_ASSUMPTIONS.debtReturn; // truly empty ⇒ debt fallback, its own ceiling
          expect(blended).toBeLessThanOrEqual(maxRate + 1e-9);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("blendPortfolioVolatility on an all-zero-value portfolio never exceeds the max σ across value+contribution buckets", () => {
    fc.assert(
      fc.property(
        fc.record(Object.fromEntries(BUCKET_KEYS.map((k) => [k, fc.double({ min: 0, max: 100_000, noNaN: true })]))) as fc.Arbitrary<
          Record<keyof PortfolioReturnWeights, number>
        >,
        (contributionEntries) => {
          const contributionWeights = weightsFrom(contributionEntries);
          const blended = blendPortfolioVolatility(ZERO_WEIGHTS, contributionWeights);
          const presentBuckets = BUCKET_KEYS.filter((k) => contributionWeights[k] > 0);
          const maxSigma =
            presentBuckets.length > 0
              ? Math.max(...presentBuckets.map((k) => RETURN_BUCKET_VOLATILITY[k]))
              : RETURN_BUCKET_VOLATILITY.debt;
          expect(blended).toBeLessThanOrEqual(maxSigma + 1e-9);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("a positive-value blend is UNCHANGED by adding a zero-value, zero-contribution line", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...BUCKET_KEYS),
        fc.double({ min: 1, max: 1_000_000, noNaN: true }),
        (bucket, value) => {
          const base = weightsFrom({ [bucket]: value });
          const before = blendPortfolioReturn(DEFAULT_ASSUMPTIONS, base);
          // Adding a zero-value/zero-contribution line changes nothing about the weight totals —
          // simulated here as the SAME weights map (a dormant/closed instrument contributes 0 to
          // both), so the blend must be byte-identical.
          const after = blendPortfolioReturn(DEFAULT_ASSUMPTIONS, base, undefined, ZERO_WEIGHTS);
          expect(after).toBeCloseTo(before, 9);
        },
      ),
      { numRuns: 100 },
    );
  });
});
