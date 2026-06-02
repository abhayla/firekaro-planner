import { describe, it, expect } from "vitest";
import { evaluateLifecycle, financialYearOf, type LifecycleSignals } from "./lifecycle-evaluator";

/**
 * Pure lifecycle evaluator — maps a user's derived FIRE signals to the UTILITY
 * nudges (milestone / off-track / annual_review) with their per-period/threshold
 * dedupe keys. No DB, no clock read (now is passed in) → deterministic.
 */

const NOW = new Date("2026-06-02T00:00:00.000Z"); // FY 2026-27

function signals(over: Partial<LifecycleSignals> = {}): LifecycleSignals {
  return {
    progressPercent: 10,
    fireWithdrawableCorpus: 1_500_000,
    anchorAge: 35,
    targetRetirementAge: 50,
    yearsToRegular: 14, // on track (35 + 14 = 49 < 50)
    savingsRate: 30,
    ...over,
  };
}

describe("financialYearOf", () => {
  it("maps Apr–Mar to the Indian FY string", () => {
    expect(financialYearOf(new Date("2026-06-02"))).toBe("2026-27");
    expect(financialYearOf(new Date("2026-03-31"))).toBe("2025-26");
    expect(financialYearOf(new Date("2026-04-01"))).toBe("2026-27");
  });
});

describe("evaluateLifecycle", () => {
  it("always emits annual_review deduped by FY", () => {
    const out = evaluateLifecycle({ signals: signals(), now: NOW });
    const ann = out.find((n) => n.key === "annual_review");
    expect(ann).toBeDefined();
    expect(ann!.dedupeKey).toBe("annual_review:2026-27");
    expect(ann!.values).toEqual([]); // firstName prepended by the runner
  });

  it("does NOT emit milestone below the first band (25%)", () => {
    const out = evaluateLifecycle({ signals: signals({ progressPercent: 10 }), now: NOW });
    expect(out.find((n) => n.key === "milestone")).toBeUndefined();
  });

  it("emits the HIGHEST crossed milestone band with corpus + percent", () => {
    const out = evaluateLifecycle({
      signals: signals({ progressPercent: 62, fireWithdrawableCorpus: 12_500_000 }),
      now: NOW,
    });
    const m = out.find((n) => n.key === "milestone");
    expect(m).toBeDefined();
    expect(m!.dedupeKey).toBe("milestone:50"); // 62 → highest crossed band is 50
    expect(m!.values).toEqual(["₹1.25Cr", "62%"]);
  });

  it("treats 100% as the top milestone band", () => {
    const out = evaluateLifecycle({ signals: signals({ progressPercent: 100 }), now: NOW });
    expect(out.find((n) => n.key === "milestone")!.dedupeKey).toBe("milestone:100");
  });

  it("emits offtrack when projected FIRE age exceeds the target, deduped by projected year", () => {
    const out = evaluateLifecycle({
      signals: signals({ anchorAge: 40, targetRetirementAge: 50, yearsToRegular: 18, savingsRate: 12 }),
      now: NOW,
    });
    const o = out.find((n) => n.key === "offtrack");
    expect(o).toBeDefined();
    // Deduped per FY (at most one off-track/year), not per drifting projected year.
    expect(o!.dedupeKey).toBe("offtrack:2026-27");
    // The projected FIRE year (2026 + ceil(18) = 2044) is still shown in the copy.
    expect(o!.values[0]).toBe("2044");
    expect(o!.values[1]).toMatch(/savings/i); // low savings rate → savings-driver copy
  });

  it("does NOT emit offtrack when on track or yearsToRegular is non-finite", () => {
    expect(
      evaluateLifecycle({ signals: signals({ yearsToRegular: 5 }), now: NOW }).find((n) => n.key === "offtrack"),
    ).toBeUndefined();
    expect(
      evaluateLifecycle({ signals: signals({ yearsToRegular: Infinity }), now: NOW }).find(
        (n) => n.key === "offtrack",
      ),
    ).toBeUndefined();
  });
});
