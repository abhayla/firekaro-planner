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
