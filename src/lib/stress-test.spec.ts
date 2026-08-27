import { describe, it, expect } from "vitest";
import {
  runStressScenarios,
  baselineYearsToFire,
  STRESS_SCENARIOS,
  STRESS_TOLERANCE_YEARS,
  type StressRunArgs,
} from "@/lib/stress-test";

const base: StressRunArgs = {
  annualExpenses: 1_200_000,
  swr: 0.0325,
  expectedReturn: 0.11,
  totalCorpus: 10_000_000,
  annualIncomeTotal: 3_000_000,
};

describe("runStressScenarios (A27.3)", () => {
  it("runs all 10 audit scenarios", () => {
    expect(STRESS_SCENARIOS).toHaveLength(10);
    const { results, summary } = runStressScenarios(base);
    expect(results).toHaveLength(10);
    expect(summary.total).toBe(10);
    expect(summary.passed + summary.failed).toBe(10);
  });

  it("each scenario's delta is years over baseline; pass iff delta ≤ tolerance", () => {
    const { results } = runStressScenarios(base);
    for (const r of results) {
      expect(r.passed).toBe(r.delta <= STRESS_TOLERANCE_YEARS);
    }
  });

  it("a harsher baseline (lower corpus, higher expenses) fails more scenarios", () => {
    const easy = runStressScenarios(base).summary;
    const hard = runStressScenarios({
      ...base,
      totalCorpus: 1_000_000,
      annualExpenses: 2_400_000,
    }).summary;
    expect(hard.failed).toBeGreaterThanOrEqual(easy.failed);
  });

  it("baselineYearsToFire is finite for a saving household", () => {
    expect(Number.isFinite(baselineYearsToFire(base))).toBe(true);
  });

  // gh #39: a zero-data household (no expenses) has nothing to stress-test, but the
  // math reports scenarios as "survivable" (need ₹0 → 0 ≥ 0). This pins WHY the
  // dashboard stress chip is gated on `fire.fireNumber > 0` (Dashboard.vue) — the raw
  // summary here must NOT be surfaced for a brand-new zero-data user as a real plan.
  it("zero-expenses (no plan) yields a meaningless 'survivable' summary — callers MUST gate on a real FIRE target", () => {
    const zero = runStressScenarios({
      annualExpenses: 0, swr: 0.035, expectedReturn: 0.12, totalCorpus: 0, annualIncomeTotal: 0,
    }).summary;
    // ₹0 expenses → baseline 0 years → only the additive scenario "fails"; the rest
    // falsely "pass". Because this is meaningless, the dashboard chip is gated on
    // fireNumber>0 (verified there); this assertion documents the trap so it isn't
    // mistaken for a real plan in any new caller.
    expect(zero.passed).toBeGreaterThan(0);
    expect(baselineYearsToFire({ annualExpenses: 0, swr: 0.035, expectedReturn: 0.12, totalCorpus: 0, annualIncomeTotal: 0 })).toBe(0);
  });
});

/**
 * ADR-0006 Phase 1b (MEDIUM-7) — the KERNEL-TRIPLE path.
 *
 * Before this, the stress page ran a pre-ADR-0006 model of its own: an `expenses / swr` target
 * (no family layer, no medical reservation) held CONSTANT in today's rupees, a flat real return
 * and no savings step-up. Its per-scenario DELTA was still meaningful, but its ABSOLUTE
 * years-to-FIRE contradicted the FIRE age the dashboard printed for the same household. These
 * cases lock the migration: the legacy path is untouched when the triple is absent, and the
 * kernel path reproduces the headline solver exactly on an un-shifted baseline.
 */
describe("runStressScenarios — the kernel triple (ADR-0006 Phase 1b)", () => {
  /**
   * ADR-0006 Phase 1d re-baseline, and it is a TIGHTENING, not a relaxation.
   *
   * This ran on the Sharmas alone at a `<= 1 year` bound, and the Sharmas sat at EXACTLY 1.000 —
   * on the boundary, with the assertion passing by equality. Measured across all four seeds the
   * old basket-grown target was out by 1.000 / 0.583 / 1.167 / 0.750 years, so the Iyers were
   * already BREACHING the bound and no one could see it, because the lock only ever ran one
   * persona. Growing the target at `effectiveTargetGrowthNominal` — the rate the headline was
   * actually solved at, instead of the base leg's spending basket — brings the four to
   * 0.000 / 0.167 / 0.250 / 0.250. So the case now runs every persona and the bound comes DOWN
   * to 0.5, which the old model fails on two of them.
   */
  const AGREEMENT_BOUND_YEARS = 0.5;

  it.each([
    ["sharmas", async () => (await import("@/lib/seed-persona")).loadSeedPersona],
    ["mehtas", async () => (await import("@/seeds/mehtas")).loadMehtasSeed],
    ["iyers", async () => (await import("@/seeds/iyers")).loadIyersSeed],
    ["mauryas", async () => (await import("@/seeds/mauryas")).loadMauryasSeed],
  ])("%s: baselineYearsToFire == the kernel's own solve when the triple is supplied", async (name, getLoader) => {
    const { setActivePinia, createPinia } = await import("pinia");
    const { useHouseholdStore } = await import("@/stores/household");
    const { useAssumptionsStore } = await import("@/stores/assumptions");
    const { derive } = await import("@/lib/derive");
    setActivePinia(createPinia());
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    (await getLoader())(h, a);
    const k = derive(h.data, a.values, {
      isFamilyView: false,
      viewingMemberId: null,
      currentFY: "2025-26",
    });

    const args: StressRunArgs = {
      annualExpenses: k.annualExpensesToday,
      swr: k.effectiveSWR,
      expectedReturn: k.blendedReturn,
      totalCorpus: k.totalCorpus,
      annualIncomeTotal: k.annualIncome.total,
      fireNumberToday: k.fireNumber,
      targetGrowthNominal: k.effectiveTargetGrowthNominal,
      contributionSchedule: k.nominalContributionSchedule,
      expectedReturnSchedule: k.expectedReturnSchedule,
    };

    // The stress page starts from `totalCorpus` while the kernel solves from the
    // annuity-excluded `fireWithdrawableCorpus`, so allow that one documented difference —
    // but the two must now be within half a year of each other, not the many years the legacy
    // scalar model was out by.
    const gap = Math.abs(baselineYearsToFire(args) - k.corpusOnlyYearsToRegular);
    expect(
      gap,
      `${name}: the stress baseline must agree with the headline solver it sits beside (gap ${gap.toFixed(3)} y)`,
    ).toBeLessThanOrEqual(AGREEMENT_BOUND_YEARS);

    // …and growing the target at the raw spending BASKET — the base leg alone, which is what this
    // page did before Phase 1d — is measurably further out. This is the regression lock: pointing
    // the page back at `householdInflation` goes red here.
    const baseLegOnly = Math.abs(
      baselineYearsToFire({ ...args, targetGrowthNominal: k.householdInflation }) -
        k.corpusOnlyYearsToRegular,
    );
    expect(baseLegOnly, `${name}: the base-leg rate must be strictly worse`).toBeGreaterThan(gap);

    // …and the LEGACY path (no triple at all) is further away still — the original Phase-1b bug.
    const legacy = baselineYearsToFire({
      annualExpenses: args.annualExpenses,
      swr: args.swr,
      expectedReturn: args.expectedReturn,
      totalCorpus: args.totalCorpus,
      annualIncomeTotal: args.annualIncomeTotal,
    });
    expect(Math.abs(legacy - k.corpusOnlyYearsToRegular)).toBeGreaterThan(1);
  });

  it("omitting the triple is byte-identical to the pre-Phase-1b behaviour", () => {
    const withUndefined = runStressScenarios({
      ...base,
      fireNumberToday: undefined,
      targetGrowthNominal: undefined,
      contributionSchedule: undefined,
      expectedReturnSchedule: undefined,
    });
    const plain = runStressScenarios(base);
    expect(withUndefined.results.map((r) => r.yearsToFire)).toEqual(
      plain.results.map((r) => r.yearsToFire),
    );
    expect(withUndefined.results.map((r) => r.fireNumber)).toEqual(
      plain.results.map((r) => r.fireNumber),
    );
  });
});
