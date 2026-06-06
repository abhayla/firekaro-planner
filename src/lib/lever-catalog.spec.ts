import { describe, it, expect } from "vitest";
import { buildAccelerationLevers, type AccelerationContext } from "./lever-catalog";
import { rankLeverImpacts, yearsToFire, type FireBaseline } from "./lever-impact";

const BASE: FireBaseline = {
  currentCorpus: 5_000_000,
  targetCorpus: 40_000_000,
  monthlySavings: 60_000,
  expectedReturn: 0.07,
};

const CTX: AccelerationContext = {
  baseline: BASE,
  monthlyExpenses: 100_000,
  realisticExpenseTrimPct: 0.1,
  swr: 0.035,
  currentEquityPct: 55,
  maxEquityPct: 75,
  realReturnPerEquityPoint: 0.0005, // +0.05% real return per +1pp equity
};

describe("buildAccelerationLevers — realistic max-effort catalog", () => {
  it("emits the expense-trim and allocation levers when each has headroom", () => {
    const keys = buildAccelerationLevers(CTX).map((l) => l.key);
    expect(keys).toContain("trim-expenses");
    expect(keys).toContain("risk-notch");
  });

  it("never emits an invest-surplus lever (moot — surplus is already invested per derive, D-11)", () => {
    expect(buildAccelerationLevers(CTX).map((l) => l.key)).not.toContain("invest-surplus");
  });

  it("every lever carries a transparent bound note (honesty requirement)", () => {
    for (const lever of buildAccelerationLevers(CTX)) {
      expect(lever.note, `${lever.key} must show its realistic bound`).toBeTruthy();
    }
  });

  it("trim-expenses BOTH lowers the FIRE target and raises savings (modeled via SWR)", () => {
    const lever = buildAccelerationLevers(CTX).find((l) => l.key === "trim-expenses")!;
    const perturbed = lever.apply(BASE);
    const monthlyCut = CTX.realisticExpenseTrimPct * CTX.monthlyExpenses; // 10k
    expect(perturbed.monthlySavings).toBe(BASE.monthlySavings + monthlyCut);
    // freed target = (annual cut) / SWR
    expect(perturbed.targetCorpus).toBeCloseTo(BASE.targetCorpus - (monthlyCut * 12) / CTX.swr, 0);
    expect(perturbed.targetCorpus).toBeLessThan(BASE.targetCorpus);
  });

  it("risk-notch raises expected real return by one bounded equity notch", () => {
    const lever = buildAccelerationLevers(CTX).find((l) => l.key === "risk-notch")!;
    const perturbed = lever.apply(BASE);
    const notch = Math.min(10, CTX.maxEquityPct - CTX.currentEquityPct); // 10
    expect(perturbed.expectedReturn).toBeCloseTo(BASE.expectedReturn + notch * CTX.realReturnPerEquityPoint, 6);
  });

  // HONESTY LOCK (FinTech review, 2026-06-06): the risk-notch lever raises return on a deterministic
  // yardstick, so without a caveat it reads as a free lunch next to the risk-neutral levers. Its note
  // MUST disclose the added market/volatility risk — assert the substance so it can't regress.
  it("risk-notch discloses the added market risk in its note (not a free lunch)", () => {
    const lever = buildAccelerationLevers(CTX).find((l) => l.key === "risk-notch")!;
    expect(lever.note).toMatch(/risk|volatil|range of outcomes/i);
  });

  it("every emitted lever is a genuine ACCELERATOR (saves years) on a reachable baseline", () => {
    const ranked = rankLeverImpacts(BASE, buildAccelerationLevers(CTX));
    expect(ranked.length).toBeGreaterThan(0);
    for (const r of ranked) {
      expect(r.deltaYears, `${r.key} should not delay FIRE`).toBeGreaterThan(0);
    }
    // sanity: a real accumulator with these levers reaches FIRE sooner than baseline
    expect(yearsToFire(BASE)).toBeGreaterThan(0);
  });
});

describe("buildAccelerationLevers — no-headroom levers are LOCKED, not faked", () => {
  it("omits risk-notch when already at the equity ceiling", () => {
    const keys = buildAccelerationLevers({ ...CTX, currentEquityPct: 75, maxEquityPct: 75 }).map((l) => l.key);
    expect(keys).not.toContain("risk-notch");
  });

  it("omits trim-expenses when there are no expenses to trim", () => {
    const keys = buildAccelerationLevers({ ...CTX, monthlyExpenses: 0 }).map((l) => l.key);
    expect(keys).not.toContain("trim-expenses");
  });

  it("guards against a non-positive SWR (no divide-by-zero in the expense lever)", () => {
    const levers = buildAccelerationLevers({ ...CTX, swr: 0 });
    // either omitted, or applied without producing a non-finite target
    const trim = levers.find((l) => l.key === "trim-expenses");
    if (trim) expect(Number.isFinite(trim.apply(BASE).targetCorpus)).toBe(true);
  });

  it("does not mutate the baseline", () => {
    const snapshot = JSON.stringify(BASE);
    buildAccelerationLevers(CTX).forEach((l) => l.apply(BASE));
    expect(JSON.stringify(BASE)).toBe(snapshot);
  });
});
