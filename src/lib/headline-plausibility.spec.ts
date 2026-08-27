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
import { useUiStore } from "@/stores/ui";
import { loadSeedPersona } from "@/lib/seed-persona";
import { loadMehtasSeed } from "@/seeds/mehtas";
import { loadIyersSeed } from "@/seeds/iyers";
import { loadMauryasSeed } from "@/seeds/mauryas";
import { derive } from "@/lib/derive";
import { requiredMonthlyContributionFor } from "@/lib/required-contribution";
import { isEarningMember } from "@/lib/member-earning";
import { useFireDerive, deflateProjectionPoints } from "@/lib/useFireDerive";
import { calculateYearsToTarget } from "@/lib/fire-math";
import { computeRunway } from "@/lib/runway";
import { toMonthly } from "@/lib/cashflow";
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
      const householdEarners = h.data.members.filter((m) => isEarningMember(m, h.data.businesses)).length;
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
        // ADR-0006: the production band also carries the drifting today's-₹ target and the REAL
        // inflow SCHEDULE (step-up + age-50 taper). Omitting them here stopped this from mirroring
        // the production call — the p50 ran 2.5y behind a headline it is meant to bracket. Added,
        // not relaxed; the tight 2.0y bound below is what proves the band still tracks.
        targetGrowthRate: k.realTargetDriftRate,
        monthlySavings: k.monthlyContribution,
        monthlySavingsSchedule: k.householdContributionSchedule,
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
        targetGrowthRate: k.realTargetDriftRate,
        monthlySavings: k.monthlyContribution,
        monthlySavingsSchedule: k.householdContributionSchedule,
        meanReturn: k.realBlendedReturn,
        volatility: k.portfolioVolatility,
      });
      expect(
        mc.p50Years,
        `${ctx} — tapered p50 ${mc.p50Years.toFixed(1)} ≥ scalar p50 ${mcScalar.p50Years.toFixed(1)} (de-risking)`,
      ).toBeGreaterThanOrEqual(mcScalar.p50Years);
    });

    it(`${persona.name}: #139 real-terms projection is sane on the default lens (deflated, smaller, crossover unmoved)`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const k = derive(h.data, a.values, DEFAULT_PRODUCT_LENS);
      const nominal = k.projection;
      const real = deflateProjectionPoints(nominal, a.values.inflation, true);
      const last = nominal.length - 1;
      const ctx = `${persona.name} #139`;

      // Today's-₹ corpus must be positive, finite, and STRICTLY smaller than nominal far out
      // (the whole point — ₹Cr in 2050 buys far less today). No NaN/∞/negative reaching a user.
      expect(Number.isFinite(real[last].corpus), `${ctx} — real corpus finite`).toBe(true);
      expect(real[last].corpus, `${ctx} — real corpus > 0`).toBeGreaterThan(0);
      expect(real[last].corpus, `${ctx} — real corpus < nominal`).toBeLessThan(nominal[last].corpus);
      // The deflator MUST be exactly general CPI applied over the horizon — assert the real value
      // equals nominal ÷ (1+inflation)^lastIndex (within ₹ rounding). This catches an over-aggressive
      // deflator (the #20 householdInflation basket) WITHOUT a horizon-dependent false floor: a young
      // accumulator with a 51-60yr horizon legitimately deflates below a fixed 0.05 ratio, yet the
      // deflation is still correct (code-reviewer MEDIUM, 2026-06-10).
      const expectedReal = Math.round(
        nominal[last].corpus / Math.pow(1 + a.values.inflation, nominal.length - 1),
      );
      expect(real[last].corpus, `${ctx} — real corpus == nominal deflated at general CPI`).toBe(expectedReal);

      // Honesty invariant: deflating BOTH series by one shared factor must NOT move the FIRE date.
      const cross = (pts: typeof nominal) => pts.find((p) => p.corpus >= p.targetForRegular)?.year ?? null;
      expect(cross(real), `${ctx} — real crossover year unmoved`).toBe(cross(nominal));
    });

    it(`${persona.name}: #140 layoff runway is sane on the default lens (post-tax, conservative ≤ headline)`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const k = derive(h.data, a.values, DEFAULT_PRODUCT_LENS);
      const burn =
        h.data.expenses.avgMonthly +
        h.data.expenses.recurring.reduce((s, r) => s + toMonthly({ amount: r.amount, period: r.frequency }), 0);
      const r = computeRunway({
        investments: h.data.investments,
        monthlyBurn: burn,
        marginalRate: k.householdMarginalRate,
      });
      const ctx = `${persona.name} #140 runway=${r.runwayMonths.toFixed(1)}mo liquidNet=${r.liquidNet}`;

      // No NaN/∞/negative months reaching a user.
      expect(Number.isFinite(r.runwayMonths), `${ctx} — finite`).toBe(true);
      expect(r.runwayMonths, `${ctx} — runway >= 0`).toBeGreaterThanOrEqual(0);
      // A layoff runway over ~50 years (600 mo) for an accumulator with a salary would be absurd.
      expect(r.runwayMonths, `${ctx} — runway < 600 months (sane)`).toBeLessThan(600);
      // Honest invariants on the default lens: conservative floor ≤ headline; net never exceeds gross.
      expect(r.runwayMonthsConservative, `${ctx} — conservative ≤ headline`).toBeLessThanOrEqual(r.runwayMonths);
      const grossLiquid = h.data.investments
        .filter((i) => ["Stocks", "MutualFunds", "FD", "Gold", "Crypto", "International", "REIT", "ESOP"].includes(i.type))
        .reduce((s, i) => s + i.value, 0);
      expect(r.liquidNet, `${ctx} — post-tax net ≤ gross liquid`).toBeLessThanOrEqual(grossLiquid);
      expect(r.volatilePortion, `${ctx} — volatile share 0..1`).toBeGreaterThanOrEqual(0);
      expect(r.volatilePortion).toBeLessThanOrEqual(1);
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
      const earners = h.data.members.filter((m) => isEarningMember(m, h.data.businesses));
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
    it(`${persona.name}: 0% household step-up is the SCALAR path (no schedule resolver in play)`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      // RE-BASELINED (ADR-0006): `householdSavingsStepUpPercent`'s default moved 0 → 2, so a run
      // with an explicit 0 can no longer equal the DEFAULT run — the old assertion compared the
      // default against an override that is now a different plan, and asserting they match would
      // assert the new default does nothing. The #46 content that survives is the one that was
      // ever load-bearing: at 0% the schedule mechanism is INERT — the kernel falls back to a plain
      // scalar inflow (which is also what preserves the `<= 0 → Infinity` empty-state sentinel) —
      // and a positive step-up may only pull FIRE earlier.
      const zero = derive(h.data, { ...a.values, householdSavingsStepUpPercent: 0 }, DEFAULT_PRODUCT_LENS);
      expect(
        typeof zero.householdContributionSchedule,
        `${persona.name}: 0% step-up must leave the inflow a scalar, not a resolver`,
      ).toBe("number");
      expect(zero.householdContributionSchedule).toBe(zero.monthlyContribution);

      const base = derive(h.data, a.values, DEFAULT_PRODUCT_LENS);
      expect(zero.fireNumber, `${persona.name}: a step-up may never move the FIRE NUMBER`).toBe(
        base.fireNumber,
      );
      if (Number.isFinite(zero.corpusOnlyYearsToRegular)) {
        expect(
          base.corpusOnlyYearsToRegular,
          `${persona.name}: the default 2% step-up must be earlier-or-equal to 0%`,
        ).toBeLessThanOrEqual(zero.corpusOnlyYearsToRegular);
      }
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
      id: "you", name: "You", dateOfBirth: "1990-01-01", role: "ADULT",
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

// D-2026-06-13-02 — the FIRE hero LENSES to the selected member's individual FIRE (reverses the
// #81 hero-invariance). heroHeadline is the ONE selector FireHero consumes; these locks are the
// rule-31 sane-bounds gate for the new behavior:
//   (a) DEFAULT lens (viewingMemberId:null) → byte-identical to the household fields (the #22/#23
//       protection on the persona's default view is preserved);
//   (b) a selected member's headline SOURCES from individualFireByMember (the honest mini-household
//       FIRE — never the absurd household-target ÷ 1 #22 bug);
//   (c) a rendered lensed FIRE age is DOMAIN-SANE (≥ the member's current age, ≤ their planToAge);
//   (d) an unreachable individual FIRE yields fireAge null (the honest "—"), never a sentinel.
describe("member-lensed FIRE headline (heroHeadline) — D-2026-06-13-02 locks", () => {
  beforeEach(() => setActivePinia(createPinia()));

  for (const persona of PERSONAS) {
    it(`${persona.name}: (a) default-lens heroHeadline is BYTE-IDENTICAL to the household fields`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const fire = useFireDerive();
      const hh = fire.heroHeadline.value;
      expect(hh.isMember).toBe(false);
      expect(hh.memberName).toBeNull();
      expect(hh.fireAge).toBe(fire.householdFireAge.value);
      expect(hh.yearsToFire).toBe(fire.yearsToRegular.value);
      expect(hh.fireNumber).toBe(fire.fireNumber.value);
      expect(hh.corpusForProgress).toBe(fire.totalCorpus.value);
      expect(hh.fireTargetForProgress).toBe(fire.fireNumber.value);
      expect(hh.progressPercent).toBe(fire.progressPercent.value);
      expect(hh.annualSavings).toBe(fire.annualSavings.value);
      expect(hh.monthlyTakeHome).toBe(fire.monthlyTakeHome.value);
      expect(hh.reachable).toBe(Number.isFinite(fire.yearsToRegular.value));
    });

    it(`${persona.name}: (b)(c) member heroHeadline sources from individualFireByMember + sane age + household kernel invariant`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      const ui = useUiStore();
      persona.load(h, a);
      const fire = useFireDerive();
      const householdFireNumber = fire.fireNumber.value;
      const householdYears = fire.yearsToRegular.value;
      const adults = fire.individualFireByMember.value;
      expect(adults.length).toBeGreaterThan(0);
      for (const r of adults) {
        ui.viewingMemberId = r.memberId;
        const hh = fire.heroHeadline.value;
        const ctx = `${persona.name}/${r.memberId}: heroFireAge=${hh.fireAge} fireNo=${hh.fireNumber}`;
        expect(hh.isMember, ctx).toBe(true);
        expect(hh.memberName, ctx).toBe(r.name);
        // (b) sourced from the honest mini-household FIRE — never household ÷ 1.
        expect(hh.fireNumber, `${ctx} — number == individualFireNumber`).toBe(r.individualFireNumber);
        expect(hh.corpusForProgress, ctx).toBe(r.attributableCorpus);
        expect(hh.fireTargetForProgress, ctx).toBe(r.individualFireNumber);
        expect(hh.yearsToFire, `${ctx} — years sourced from yearsToIndividualFire`).toBe(r.yearsToIndividualFire);
        // The stats line is the SAME mini-household's savings (memberFinancials.surplus is
        // algebraically attributableAnnualSavings) — a rewiring to household values goes RED here.
        expect(hh.annualSavings, `${ctx} — savings == the member's attributable savings`).toBe(
          r.attributableAnnualSavings,
        );
        // Magnitude lock (FinTech): target ≈ expenses ÷ SWR, so the ratio must sit in the
        // 1/SWR band for SWR 2.5–8%. A 100× SWR-unit bug or a double-applied split passes the
        // bare bounds above but trips this.
        expect(
          r.individualFireNumber / r.attributableAnnualExpenses,
          `${ctx} — fireNumber/expenses within the 1/SWR band`,
        ).toBeGreaterThanOrEqual(12.5);
        expect(r.individualFireNumber / r.attributableAnnualExpenses, ctx).toBeLessThanOrEqual(40);
        const memberPlanTo = h.data.members.find((m) => m.id === r.memberId)?.planToAge ?? 90;
        if (Number.isFinite(r.yearsToIndividualFire)) {
          expect(hh.reachable, ctx).toBe(true);
          expect(hh.fireAge, `${ctx} — age == individualFireAge`).toBe(r.individualFireAge);
          // (c) domain-sane: within the member's own working life — the #22 age-81 class can never render.
          expect(hh.fireAge!, `${ctx} — age ≥ member's current age`).toBeGreaterThanOrEqual(r.anchorAge);
          expect(hh.fireAge!, `${ctx} — age ≤ member's planToAge`).toBeLessThanOrEqual(memberPlanTo);
        } else {
          // (d) honest "—" — never a sentinel/absurd number.
          expect(hh.reachable, ctx).toBe(false);
          expect(hh.fireAge, `${ctx} — unreachable renders null`).toBeNull();
        }
        expect(hh.progressPercent, ctx).toBeGreaterThanOrEqual(0);
        expect(hh.progressPercent, ctx).toBeLessThanOrEqual(100);
        // The household KERNEL stays invariant while lensed (the #22/#23 guardrail, unchanged).
        expect(fire.fireNumber.value, `${ctx} — household fireNumber invariant`).toBe(householdFireNumber);
        expect(fire.yearsToRegular.value, `${ctx} — household years invariant`).toBe(householdYears);
      }
      ui.viewingMemberId = null;
    });
  }

  it("a stale viewingMemberId falls back to the household branch (never crashes)", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    const ui = useUiStore();
    loadSeedPersona(h, a);
    const fire = useFireDerive();
    ui.viewingMemberId = "no-such-member-id";
    const hh = fire.heroHeadline.value;
    expect(hh.isMember).toBe(false);
    expect(hh.fireNumber).toBe(fire.fireNumber.value);
    expect(hh.fireAge).toBe(fire.householdFireAge.value);
  });

  it("an over-funded member's progress clamps to 100 (boundary — deleting the clamp goes RED)", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    const ui = useUiStore();
    h.addMember({
      id: "rich", name: "Rich", dateOfBirth: "1980-01-01", role: "ADULT",
      targetRetirementAge: 50, planToAge: 90, city: "Metro", health: "Healthy",
      riskAppetite: "Moderate", marital: "Married", employmentStatus: "Employed",
      salary: { annualCTC: 2_000_000 },
    } as never);
    h.addMember({
      id: "spouse", name: "Spouse", dateOfBirth: "1982-01-01", role: "ADULT",
      targetRetirementAge: 50, planToAge: 90, city: "Metro", health: "Healthy",
      riskAppetite: "Moderate", marital: "Married", employmentStatus: "Employed",
      salary: { annualCTC: 1_000_000 },
    } as never);
    h.data.expenses.avgMonthly = 30_000;
    // A corpus far beyond the small individual target → raw ratio ≫ 100%.
    h.addInvestment({ name: "Windfall", type: "Stocks", value: 100_000_000, ownerId: "rich" } as never);
    const fire = useFireDerive();
    ui.viewingMemberId = "rich";
    const hh = fire.heroHeadline.value;
    expect(hh.isMember).toBe(true);
    expect(hh.corpusForProgress).toBeGreaterThan(hh.fireTargetForProgress);
    expect(hh.progressPercent, "over-funded member clamps to exactly 100").toBe(100);
  });

  it("(d) an adult whose individual FIRE is unreachable gets fireAge null — the honest '—' path", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    const ui = useUiStore();
    // Two adults: an earner + a zero-income adult who still carries a split of the shared costs.
    // The non-earner's target is > 0 with zero savings → years = Infinity → honest null age.
    h.addMember({
      id: "earner", name: "Earner", dateOfBirth: "1990-01-01", role: "ADULT",
      targetRetirementAge: 50, planToAge: 90, city: "Metro", health: "Healthy",
      riskAppetite: "Moderate", marital: "Married", employmentStatus: "Employed",
      salary: { annualCTC: 3_000_000 },
    } as never);
    h.addMember({
      id: "nonearner", name: "NonEarner", dateOfBirth: "1992-01-01", role: "ADULT",
      targetRetirementAge: 50, planToAge: 90, city: "Metro", health: "Healthy",
      riskAppetite: "Moderate", marital: "Married", employmentStatus: "Homemaker",
    } as never);
    h.data.expenses.avgMonthly = 100_000;
    const fire = useFireDerive();
    ui.viewingMemberId = "nonearner";
    const hh = fire.heroHeadline.value;
    expect(hh.isMember).toBe(true);
    expect(hh.fireNumber, "shared split gives a real positive target").toBeGreaterThan(0);
    expect(hh.reachable, "zero income → unreachable").toBe(false);
    expect(hh.fireAge, "unreachable must render the honest null, never a sentinel age").toBeNull();
    expect(Number.isFinite(hh.yearsToFire)).toBe(false);
  });
});

// #81 Phase 2 — the standalone individual FIRE per adult is a SECONDARY view; it must be
// domain-SANE on every persona (rule 31), and the HOUSEHOLD number must stay PRIMARY +
// invariant to member selection. An absurd individual figure (negative, zero, ₹0 corpus, age
// 110) is a CI failure, not a silently-rendered number.
describe("#81 individual FIRE plausibility — every adult, every persona", () => {
  beforeEach(() => setActivePinia(createPinia()));
  for (const persona of PERSONAS) {
    it(`${persona.name}: each adult's standalone FIRE is domain-sane + the household stays invariant`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      persona.load(h, a);
      const k = derive(h.data, a.values, DEFAULT_PRODUCT_LENS);

      for (const r of k.individualFireByMember) {
        const ctx = `${persona.name}/${r.memberId}: fireNo=${r.individualFireNumber} corpus=${r.attributableCorpus} age=${r.individualFireAge}`;
        // A real adult's personal FIRE number is positive and not absurd.
        expect(r.individualFireNumber, `${ctx} — individual FIRE > 0`).toBeGreaterThan(0);
        expect(r.individualFireNumber, `${ctx} — < ₹500 Cr (absurd ceiling)`).toBeLessThan(500_00_00_000);
        expect(r.attributableAnnualExpenses, `${ctx} — attributable expenses ≥ 0`).toBeGreaterThanOrEqual(0);
        expect(r.attributableCorpus, `${ctx} — attributable corpus ≥ 0`).toBeGreaterThanOrEqual(0);
        // The personal FIRE age is either UNREACHABLE (Infinity — honest) or a plausible age,
        // never an absurd finite value like 110.
        if (Number.isFinite(r.individualFireAge)) {
          // A finite individual FIRE age must land within the plan horizon (never an absurd 100+).
          expect(r.individualFireAge, `${ctx} — personal FIRE age ≤ plan horizon`).toBeLessThanOrEqual(k.planToAge);
          expect(r.individualFireAge, `${ctx} — personal FIRE age ≥ anchor`).toBeGreaterThanOrEqual(r.anchorAge);
        }
        // A single adult's slice cannot exceed the whole household FIRE target.
        expect(r.individualFireNumber, `${ctx} — individual ≤ household target`).toBeLessThanOrEqual(k.fireNumber + 1);
      }
      // The gap is non-negative (dependents + unsplit remainder), never negative.
      expect(k.individualFireExpenseGapAnnual, `${persona.name}: gap ≥ 0`).toBeGreaterThanOrEqual(0);

      // HONESTY LOCK: the household FIRE number is INVARIANT to viewing any adult.
      for (const r of k.individualFireByMember) {
        const lensed = derive(h.data, a.values, { ...DEFAULT_PRODUCT_LENS, viewingMemberId: r.memberId });
        expect(lensed.fireNumber, `${persona.name}: household FIRE invariant under lens=${r.memberId}`).toBe(k.fireNumber);
        expect(lensed.yearsToRegular, `${persona.name}: household years invariant under lens=${r.memberId}`).toBe(k.yearsToRegular);
      }
    });
  }
});

describe("T-377/QN-2 — the 'do this' monthly amount is plausible (rule 31 flinch test)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  // The hero's biggest new claim is "invest Rs X every month". An absurd X (negative,
  // NaN, or several times the household's entire income) is exactly the optimism/despair
  // error this gate exists to catch — asserted on the DEFAULT product lens.
  const PERSONAS: Array<{ name: string; load: (h: ReturnType<typeof useHouseholdStore>, a: ReturnType<typeof useAssumptionsStore>) => void }> = [
    { name: "sharmas", load: (h, a) => loadSeedPersona(h, a) },
    { name: "mehtas", load: (h, a) => loadMehtasSeed(h, a) },
    { name: "iyers", load: (h, a) => loadIyersSeed(h, a) },
    { name: "mauryas", load: (h, a) => loadMauryasSeed(h, a) },
  ];

  for (const persona of PERSONAS) {
    it(`${persona.name}: required monthly at the household target age is within [0, 3x monthly income]`, () => {
      const h = useHouseholdStore();
      const a = useAssumptionsStore();
      const ui = useUiStore();
      persona.load(h, a);
      const lens = { isFamilyView: ui.isFamilyView, viewingMemberId: ui.viewingMemberId, currentFY: ui.currentFY };
      const k = derive(h.data, a.values, lens);

      const r = requiredMonthlyContributionFor({
        snapshot: h.data,
        assumptions: a.values,
        lens,
        targetAge: k.targetRetirementAge,
      });

      expect(Number.isNaN(r.requiredMonthlyReal)).toBe(false);
      expect(r.requiredMonthlyReal).toBeGreaterThanOrEqual(0);
      // Infinity is an HONEST answer ("beyond any realistic monthly amount - move the age");
      // a finite answer must be inside a band a salaried household could recognise.
      if (Number.isFinite(r.requiredMonthlyReal)) {
        const monthlyIncome = Math.max(1, Math.round((k.householdAnnualIncome ?? 0) / 12));
        expect(r.requiredMonthlyReal).toBeLessThanOrEqual(3 * monthlyIncome);
      }
      // Need/have/gap must be internally coherent and never negative-where-impossible.
      expect(r.needReal).toBeGreaterThan(0);
      expect(r.haveAtTargetReal).toBeGreaterThanOrEqual(0);
      expect(r.gapReal).toBe(r.needReal - r.haveAtTargetReal);
      expect(r.needNominal).toBeGreaterThanOrEqual(r.needReal);
    });
  }
});
