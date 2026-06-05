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
