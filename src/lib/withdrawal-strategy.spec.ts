import { describe, it, expect } from "vitest";
import {
  constantWithdrawal,
  floorCeilingWithdrawal,
  applyWithdrawalRule,
  DEFAULT_FLOOR_CEILING,
  type ConstantWithdrawalConfig,
  type FloorCeilingWithdrawalConfig,
} from "./withdrawal-strategy";

const CONSTANT: ConstantWithdrawalConfig = {
  kind: "Constant",
  swr: 0.035,
  inflation: 0.06,
};

const FLOOR_CEILING: FloorCeilingWithdrawalConfig = {
  ...DEFAULT_FLOOR_CEILING,
  swr: 0.035,
  inflation: 0.06,
};

describe("constantWithdrawal", () => {
  it("year 0 = SWR * startingCorpus", () => {
    const r = constantWithdrawal(CONSTANT, 10_000_000, 0);
    expect(r.withdrawal).toBeCloseTo(350_000, 4);
    expect(r.rule).toBe("baseline");
  });

  it("year 5 = baseline * (1 + inflation)^5", () => {
    const r = constantWithdrawal(CONSTANT, 10_000_000, 5);
    // 350000 * 1.06^5 = ~468378.95
    expect(r.withdrawal).toBeCloseTo(468_379, 0);
  });

  it("zero starting corpus = zero withdrawal at all years", () => {
    expect(constantWithdrawal(CONSTANT, 0, 0).withdrawal).toBe(0);
    expect(constantWithdrawal(CONSTANT, 0, 10).withdrawal).toBe(0);
  });
});

describe("floorCeilingWithdrawal", () => {
  it("year 0 = baseline SWR (no prior year to inflate)", () => {
    const r = floorCeilingWithdrawal(FLOOR_CEILING, 10_000_000, 10_000_000, 0, 0);
    expect(r.withdrawal).toBeCloseTo(350_000, 4);
    expect(r.rule).toBe("baseline");
  });

  it("baseline when corpus stays inside the band", () => {
    // Year 1: corpus still ~= 10M (ratio 1.0), inside floor 0.8 and ceiling 1.2
    const r = floorCeilingWithdrawal(FLOOR_CEILING, 10_000_000, 10_000_000, 1, 350_000);
    // baseline = 350000 * 1.06 = 371000
    expect(r.withdrawal).toBeCloseTo(371_000, 0);
    expect(r.rule).toBe("baseline");
  });

  it("floor triggers when corpus drops below floorMultiplier * starting", () => {
    // Year 3: corpus is 7M, starting was 10M -> ratio 0.7 < 0.8
    const r = floorCeilingWithdrawal(FLOOR_CEILING, 10_000_000, 7_000_000, 3, 380_000);
    // baseline = 380000 * 1.06 = 402800; floor adjustment 0.9 -> 362520
    expect(r.withdrawal).toBeCloseTo(362_520, 0);
    expect(r.rule).toBe("floor-triggered");
  });

  it("ceiling caps when corpus exceeds ceilingMultiplier * starting", () => {
    // Year 3: corpus is 13M, starting was 10M -> ratio 1.3 > 1.2
    const r = floorCeilingWithdrawal(FLOOR_CEILING, 10_000_000, 13_000_000, 3, 380_000);
    // baseline = 380000 * 1.06 = 402800; ceiling adj 1.0 -> 402800 (held flat)
    expect(r.withdrawal).toBeCloseTo(402_800, 0);
    expect(r.rule).toBe("ceiling-capped");
  });

  it("falls through to baseline when startingCorpus is 0 (defensive)", () => {
    const r = floorCeilingWithdrawal(FLOOR_CEILING, 0, 0, 5, 100_000);
    expect(r.rule).toBe("baseline");
  });
});

describe("applyWithdrawalRule (dispatch)", () => {
  it("routes Constant config to constant rule", () => {
    const r = applyWithdrawalRule(CONSTANT, 10_000_000, 5_000_000, 1, 350_000);
    expect(r.rule).toBe("baseline");
    // Constant ignores currentCorpus
  });

  it("routes FloorCeiling config to floor/ceiling rule", () => {
    const r = applyWithdrawalRule(FLOOR_CEILING, 10_000_000, 7_000_000, 3, 380_000);
    expect(r.rule).toBe("floor-triggered");
  });
});

describe("DEFAULT_FLOOR_CEILING constants (research-grounded)", () => {
  it("floor at 80%, ceiling at 120%, floor cut 10%, ceiling flat", () => {
    expect(DEFAULT_FLOOR_CEILING.floorMultiplier).toBe(0.8);
    expect(DEFAULT_FLOOR_CEILING.ceilingMultiplier).toBe(1.2);
    expect(DEFAULT_FLOOR_CEILING.floorAdjustment).toBe(0.9);
    expect(DEFAULT_FLOOR_CEILING.ceilingAdjustment).toBe(1.0);
  });
});
