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
});
