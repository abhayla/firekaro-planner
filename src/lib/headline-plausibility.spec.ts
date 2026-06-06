/**
 * FOOLPROOF GATE — headline plausibility on the DEFAULT PRODUCT LENS (gh-issue #22).
 *
 * Why this file exists (the root-cause lesson): the FIRE headline was wrong THREE
 * times (#18/#20/#22) and every existing gate stayed green — type-check passed, the
 * component rendered, the console was clean, and the unit tests asserted the headline
 * *matched the current computation* (shape) instead of *being domain-sane* (substance).
 * The #22 lens bug specifically hid because the seed test exercised `isFamilyView:true`
 * (the coherent path) while the app DEFAULT is `isFamilyView:false` — test and product
 * diverged.
 *
 * This gate closes that hole. For EVERY seed persona, on the EXACT lens a user sees by
 * default (`isFamilyView:false`, `viewingMemberId:null`), it asserts the flagship
 * numbers fall in DOMAIN-SANE bounds. "FIRE at age 81" (the #22 symptom) is now a CI
 * FAILURE, not a silently-rendered number. A new absurd-but-rendering value trips a
 * red test instead of reaching a user.
 *
 * RULE: any new headline/output field that a user reads MUST get a plausibility bound
 * here, asserted on the DEFAULT product lens. See `.claude/rules/output-plausibility-verification.md`.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import { loadMehtasSeed } from "@/seeds/mehtas";
import { loadIyersSeed } from "@/seeds/iyers";
import { loadMauryasSeed } from "@/seeds/mauryas";
import { derive } from "@/lib/derive";
import { useFireDerive } from "@/lib/useFireDerive";
import { calculateYearsToTarget } from "@/lib/fire-math";
import { buildContributionResolver } from "@/lib/contribution-schedule";
import { runMonteCarloFire } from "@/lib/monte-carlo";
import { captureSnapshot, milestoneBandFor } from "@/lib/lifecycle-digest";

type Loader = (h: ReturnType<typeof useHouseholdStore>, a: ReturnType<typeof useAssumptionsStore>) => void;

// The EXACT lens FireHero + the ~20 dashboard FIRE consumers render by default.
const DEFAULT_PRODUCT_LENS = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" } as const;

const PERSONAS: Array<{ name: string; load: Loader }> = [
  { name: "sharmas", load: (h, a) => loadSeedPersona(h, a) },
  { name: "mehtas", load: (h, a) => loadMehtasSeed(h, a) },
  { name: "iyers", load: (h, a) => loadIyersSeed(h, a) },
  { name: "mauryas", load: (h, a) => loadMauryasSeed(h, a) },
];

describe("headline plausibility — DEFAULT product lens (#22 foolproof gate)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  for (const persona of PERSONAS) {
    it(`${persona.name}: the default-lens FIRE headline is domain-SANE (not just rendering)`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const k = derive(h.data, a.values, DEFAULT_PRODUCT_LENS);
      const fireAge = k.anchorAge + k.yearsToRegular;
      const ctx = `${persona.name} default-lens: fireAge=${fireAge.toFixed(1)} savings%=${k.savingsRate} earners=${k.lensedEarners.length}`;

      // (1) FIRE must be REACHABLE within a human lifetime — and not absurdly late.
      // The #22 bug produced age 81 (household target ÷ one earner). 70 is the ceiling.
      expect(Number.isFinite(k.yearsToRegular), `${ctx} — yearsToRegular finite`).toBe(true);
      expect(fireAge, `${ctx} — FIRE age must be ≤ 70 (caught the #22 age-81 bug)`).toBeLessThanOrEqual(70);
      // …and not earlier than the retirement TARGET (that would be optimistic nonsense).
      expect(fireAge, `${ctx} — FIRE age not absurdly early`).toBeGreaterThanOrEqual(
        Math.min(k.targetRetirementAge, k.anchorAge + 1),
      );

      // (2) Savings rate must be a believable accumulator band (the #22 bug halved it to ~26%).
      expect(k.savingsRate, `${ctx} — savings rate in 15-70%`).toBeGreaterThanOrEqual(15);
      expect(k.savingsRate, `${ctx} — savings rate in 15-70%`).toBeLessThanOrEqual(70);

      // (3) The default lens MUST count EVERY household earner — the #22 bug silently
      // scoped a dual-income household to the primary earner only.
      const householdEarners = h.data.members.filter((m) => m.role === "EARNER").length;
      expect(k.lensedEarners.length, `${ctx} — default lens pools all ${householdEarners} earners`).toBe(
        householdEarners,
      );

      // (4) Progress + FIRE number sanity (no NaN/∞/negative reaching a user).
      expect(k.progressPercent, `${ctx} — progress 0-100`).toBeGreaterThanOrEqual(0);
      expect(k.progressPercent, `${ctx} — progress 0-100`).toBeLessThanOrEqual(100);
      expect(k.fireNumber, `${ctx} — fireNumber positive + finite`).toBeGreaterThan(0);
      expect(Number.isFinite(k.fireNumber)).toBe(true);

      // (5) #18 MC band tracks the deterministic headline — on EVERY persona, INCLUDING
      // the glide-ON Iyers. Earlier this invariant was asserted only on the glide-OFF
      // Sharmas (where MC's scalar return == the headline schedule, so the gap is
      // structurally zero) — a shape-vs-substance gap: the lock ran on the one persona
      // that COULDN'T violate it (FinTech consolidated review, 2026-06-03).
      // #24 Part 1: the MC now TAPERS its per-year MEAN along the glide schedule
      // (`meanReturnSchedule`), so a glide-ON persona's p50 CONVERGES to the headline
      // instead of running fast off a scalar pre-glide return (Iyers gap 2.50y → 1.50y).
      // The residual gap is just IID-vs-headline discretization noise (the glide-OFF
      // personas show the same ~0.8–1.4y), NOT the glide asymmetry — so the bound is now
      // TIGHT (≤ 2.5y across all personas). It trips RED if the convergence ever regresses.
      const mc = runMonteCarloFire({
        currentCorpus: k.fireWithdrawableCorpus,
        targetCorpus: k.fireNumber,
        monthlySavings: k.monthlyContribution,
        meanReturn: k.realBlendedReturn,
        meanReturnSchedule: k.realReturnSchedule,
        volatility: k.portfolioVolatility,
      });
      expect(mc.p10Years, `${ctx} — MC ordered p10≤p50≤p90`).toBeLessThanOrEqual(mc.p50Years);
      expect(mc.p50Years).toBeLessThanOrEqual(mc.p90Years);
      expect(
        Math.abs(mc.p50Years - k.corpusOnlyYearsToRegular),
        `${ctx} — MC p50 ${mc.p50Years.toFixed(1)} must track tapered headline ${k.corpusOnlyYearsToRegular.toFixed(1)} (IID-vs-headline noise only, glide asymmetry removed)`,
      ).toBeLessThan(2.0); // tightened from 2.5 (FinTech #24) — deterministic seed, max measured gap 1.5y

      // #24 directional lock: the taper de-risks, so the tapered p50 is LATER (≥) than the scalar
      // pre-glide p50. Glide-OFF personas are equal (scalar schedule); glide-ON (Iyers) is strictly
      // later — pins the #24 intent without depending on the synthetic monte-carlo.spec inputs.
      const mcScalar = runMonteCarloFire({
        currentCorpus: k.fireWithdrawableCorpus,
        targetCorpus: k.fireNumber,
        monthlySavings: k.monthlyContribution,
        meanReturn: k.realBlendedReturn,
        volatility: k.portfolioVolatility,
      });
      expect(
        mc.p50Years,
        `${ctx} — tapered p50 ${mc.p50Years.toFixed(1)} ≥ scalar p50 ${mcScalar.p50Years.toFixed(1)} (de-risking)`,
      ).toBeGreaterThanOrEqual(mcScalar.p50Years);
    });

    it(`${persona.name}: the default lens is BYTE-IDENTICAL to family view on FIRE adequacy`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const def = derive(h.data, a.values, DEFAULT_PRODUCT_LENS);
      const fam = derive(h.data, a.values, { ...DEFAULT_PRODUCT_LENS, isFamilyView: true });
      // The lens-coherence invariant: with no member explicitly selected, FIRE adequacy
      // is the whole household either way — numerator and denominator from the same set.
      expect(def.yearsToRegular).toBe(fam.yearsToRegular);
      expect(def.fireNumber).toBe(fam.fireNumber);
      expect(def.annualSavings).toBe(fam.annualSavings);
      expect(def.totalCorpus).toBe(fam.totalCorpus);
    });

    it(`${persona.name}: an explicit member lens keeps FIRE adequacy HOUSEHOLD — only income/tax lens (#23)`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const earners = h.data.members.filter((m) => m.role === "EARNER");
      if (earners.length < 2) return; // a member lens is only meaningful for a multi-earner household
      const household = derive(h.data, a.values, DEFAULT_PRODUCT_LENS);
      const lensed = derive(h.data, a.values, { ...DEFAULT_PRODUCT_LENS, viewingMemberId: earners[0].id });

      // FIRE adequacy is inherently household — the family funds one shared corpus and retires
      // together — so selecting one earner must NOT move the FIRE number/corpus/savings/age. Only
      // the income/tax DISPLAY lenses (issue #23, FinTech-validated).
      const householdFields = [
        "fireNumber",
        "baseFireNumber",
        "totalCorpus",
        "annualSavings",
        "savingsRate",
        "monthlyContribution",
        "monthlyTakeHome",
        "yearsToRegular",
        "progressPercent",
      ] as const;
      for (const f of householdFields) {
        expect(lensed[f], `#23: ${persona.name} — lensed.${f} must stay household`).toBe(household[f]);
      }
      // ...but the income/tax DISPLAY still lenses to the selected member (strictly less income).
      expect(lensed.annualIncome.total).toBeLessThan(household.annualIncome.total);

      // #23 HIGH follow-up — the cashflow / financial-health charts read householdAnnualIncome /
      // householdAnnualTax, which MUST NOT lens (else a one-member income over a household expense
      // base renders a spurious negative surplus). Coherence lock: the household income the charts
      // read equals the whole-household income (matching the household expenses they pair it with),
      // while the lensed DISPLAY income is strictly less.
      expect(
        lensed.householdAnnualIncome,
        `#23: ${persona.name} — householdAnnualIncome must NOT lens (= whole-household income)`,
      ).toBe(household.annualIncome.total);
      expect(
        lensed.householdAnnualTax,
        `#23: ${persona.name} — householdAnnualTax must NOT lens (= whole-household tax)`,
      ).toBe(household.annualTax);
      // The new household income is strictly greater than the lensed display income — the exact
      // gap that previously produced the spurious deficit.
      expect(lensed.householdAnnualIncome).toBeGreaterThan(lensed.annualIncome.total);
    });

    it(`${persona.name}: on the DEFAULT lens householdAnnualIncome/Tax equal the display fields (byte-identical)`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const k = derive(h.data, a.values, DEFAULT_PRODUCT_LENS);
      // With no member selected, householdScope === lensedScope, so the chart-facing household
      // fields are byte-identical to the existing display fields — nothing changes by default.
      expect(k.householdAnnualIncome).toBe(k.annualIncome.total);
      expect(k.householdAnnualTax).toBe(k.annualTax);
    });

    it(`${persona.name}: the lifecycle-digest snapshot is domain-SANE on the default lens`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const k = derive(h.data, a.values, DEFAULT_PRODUCT_LENS);
      const snap = captureSnapshot(k, [], new Date("2026-06-03T00:00:00.000Z"));
      const ctx = `${persona.name} digest snapshot`;

      // The ceil(fireAge)==anchorAge+ceil(years) parity below RESTS on anchorAge being
      // an integer (whole-year age). Lock that invariant so a future age-in-months change
      // can't silently break the FireHero/digest parity (FinTech review 2026-06-03).
      expect(Number.isInteger(k.anchorAge), `${ctx} — anchorAge is a whole year`).toBe(true);

      // The displayed "now age" (ceil) MUST equal the FireHero headline age (Rule 26
      // parity) AND clear the #22 sanity ceiling — an absurd snapshot age is a CI fail.
      const displayedAge = Math.ceil(snap.fireAge);
      expect(displayedAge, `${ctx} — ceil(fireAge) equals headline age`).toBe(
        k.anchorAge + Math.ceil(k.yearsToRegular),
      );
      expect(displayedAge, `${ctx} — displayed FIRE age ≤ 70 (#22 bound)`).toBeLessThanOrEqual(70);

      // The milestone band is coherent with the corpus/target ratio (no off-by-band).
      expect(snap.milestoneBand, `${ctx} — band matches corpus ratio`).toBe(
        milestoneBandFor(snap.currentCorpus, snap.fireNumber),
      );
      // JSON-safe (no Infinity/NaN reaching the persisted ui blob).
      expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
    });
  }
});

// Temporal contributions Phase 1 (gh-issue #46) — the headline-honesty CI locks, asserted on the
// DEFAULT product lens for EVERY seed persona. These keep the #11 corpus-inflow lock + the REAL
// step-up monotonicity impossible to silently regress (a future edit that re-routes per-investment
// SIPs into corpus, or flips the step-up direction, trips a RED test here).
describe("headline plausibility — temporal contributions (#46 locks, DEFAULT lens)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  for (const persona of PERSONAS) {
    it(`${persona.name}: 0% household step-up is a NO-OP (default-path byte-identity)`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const base = derive(h.data, a.values, DEFAULT_PRODUCT_LENS);
      const zero = derive(h.data, { ...a.values, householdSavingsStepUpPercent: 0 }, DEFAULT_PRODUCT_LENS);
      expect(zero.yearsToRegular, `${persona.name}: 0% step-up must not move yearsToRegular`).toBe(
        base.yearsToRegular,
      );
      expect(zero.corpusOnlyYearsToRegular).toBe(base.corpusOnlyYearsToRegular);
      expect(zero.fireNumber).toBe(base.fireNumber);
    });

    it(`${persona.name}: per-investment contributionSchedule does NOT leak into corpus (#11 coherence)`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const base = derive(h.data, a.values, DEFAULT_PRODUCT_LENS);
      const planted = JSON.parse(JSON.stringify(h.data)) as typeof h.data;
      // An aggressive per-investment schedule that, IF summed into corpus, would slash the FIRE
      // date — the exact ~10× double-count gh #11 fixed. The headline MUST be unmoved.
      if (planted.investments[0]) {
        planted.investments[0].contributionSchedule = [
          { amount: 1000000, startAtAge: 30, stepUpPercentPerYear: 15 },
        ];
      }
      const withSchedule = derive(planted, a.values, DEFAULT_PRODUCT_LENS);
      expect(
        withSchedule.yearsToRegular,
        `${persona.name}: #11 lock — per-investment schedule must not move corpus headline`,
      ).toBe(base.yearsToRegular);
      expect(withSchedule.monthlyContribution).toBe(base.monthlyContribution);
    });

    it(`${persona.name}: a positive household step-up is earlier-or-equal (step-up monotonicity)`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const base = derive(h.data, a.values, DEFAULT_PRODUCT_LENS);
      const stepped = derive(h.data, { ...a.values, householdSavingsStepUpPercent: 8 }, DEFAULT_PRODUCT_LENS);
      // Only meaningful when the base headline is reachable (every seed persona qualifies).
      if (Number.isFinite(base.corpusOnlyYearsToRegular)) {
        expect(
          stepped.corpusOnlyYearsToRegular,
          `${persona.name}: +8% step-up must be earlier-or-equal, never later`,
        ).toBeLessThanOrEqual(base.corpusOnlyYearsToRegular);
      }
    });

    it(`${persona.name}: the default-lens FIRE age sits in [anchorAge, planToAge] or is non-finite`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const k = derive(h.data, a.values, DEFAULT_PRODUCT_LENS);
      if (Number.isFinite(k.yearsToRegular)) {
        const fireAge = k.anchorAge + k.yearsToRegular;
        expect(fireAge, `${persona.name}: FIRE age never before the anchor age`).toBeGreaterThanOrEqual(
          k.anchorAge,
        );
        expect(fireAge, `${persona.name}: FIRE age within the plan horizon`).toBeLessThanOrEqual(
          k.planToAge,
        );
      }
      // A non-finite result is the honest "not within horizon" signal — never an absurd age.
    });
  }

  it("stop/reduction monotonicity: a savings schedule that STOPS reaches the target later-or-equal", () => {
    // The household step-up can't go negative, so the stop/pause direction is locked at the
    // calculateYearsToTarget level: a contribution schedule that stops contributing at age 50
    // can never reach a target SOONER than the equivalent always-on contribution.
    const anchor = 30;
    const target = 30_000_000;
    const monthly = 60_000;
    const constant = calculateYearsToTarget(0, target, monthly, 0.05);
    const stops = buildContributionResolver([{ amount: monthly, startAtAge: anchor, endAtAge: 50 }], anchor);
    const stopped = calculateYearsToTarget(0, target, stops, 0.05);
    expect(stopped).toBeGreaterThanOrEqual(constant);
  });
});

// gh #39 — the EMPTY / zero-data boundary the populated personas above never covered
// (the RCA: input-state blindness — every persona here has full data). A brand-new
// user (profile only, no income/expenses/investments) must NOT be told they've achieved
// FIRE. Bug: expenses=0 → fireNumber=0 → years-to-FIRE=0 → "You're already at Regular
// FIRE — congratulations!" on ₹0.
describe("headline plausibility — EMPTY state (gh #39: no 'achieved' on zero data)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("profile-only household: years-to-FIRE are non-finite → FireHero shows the empty-state, never 'achieved'", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    h.addMember({
      id: "you", name: "You", dateOfBirth: "1990-01-01", role: "EARNER",
      targetRetirementAge: 50, planToAge: 90, city: "Metro", health: "Healthy",
      riskAppetite: "Moderate", marital: "Married", employmentStatus: "Employed",
    } as never);
    const k = derive(h.data, a.values, DEFAULT_PRODUCT_LENS);

    expect(k.fireNumber, "zero expenses → zero FIRE target").toBe(0);
    // FireHero: !Number.isFinite(yearsToRegular) → "Increase income or savings…".
    // A FINITE (≤ 0) value here is the bug — it renders "already at Regular FIRE".
    expect(Number.isFinite(k.yearsToRegular), "Regular: must be non-finite, not 0").toBe(false);
    expect(Number.isFinite(k.yearsToLean), "Lean: must be non-finite, not 0").toBe(false);
    expect(Number.isFinite(k.yearsToFat), "Fat: must be non-finite, not 0").toBe(false);
  });
});

// gh-48 — the AccelerationCard ("biggest achievable wins") is a flagship default-lens output, so it
// gets a plausibility bound here too (rule 31). The bug it locks (caught in independent review
// 2026-06-06): the card showed the SCALAR corpus-only years, which on a bridge-limited household
// (Iyers) is 1–2yr MORE OPTIMISTIC than the honest bridge-adjusted FireHero headline. The action
// surface must NEVER show a FIRE date sooner than the truth.
describe("acceleration card plausibility — never more optimistic than the headline (gh-48, rule 31)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  for (const persona of PERSONAS) {
    it(`${persona.name}: the card baseline == the bridge-adjusted headline, never the rosier scalar`, async () => {
      const { useAcceleration } = await import("@/composables/useAcceleration");
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const fire = useFireDerive();
      const accel = useAcceleration();
      // The card renders headlineYears: it must equal the FireHero headline AND never be earlier
      // (more optimistic) than the scalar corpus model — i.e. headline = max(scalar, bridge runway).
      expect(accel.headlineYears.value).toBeCloseTo(fire.yearsToRegular.value, 5);
      expect(
        accel.headlineYears.value,
        `${persona.name}: card baseline must not be more optimistic than the headline`,
      ).toBeGreaterThanOrEqual(accel.baselineYears.value - 0.01);
    });
  }
});
