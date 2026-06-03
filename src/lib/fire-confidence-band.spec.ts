import { describe, it, expect } from "vitest";
import { describeFireConfidenceBand } from "./fire-confidence-band";
import { MAX_PROJECTION_YEARS, type MonteCarloFireResult } from "./monte-carlo";

const mk = (p10: number, p90: number, pNever = 0): MonteCarloFireResult => ({
  p10Years: p10,
  p50Years: (p10 + p90) / 2,
  p90Years: p90,
  medianYears: (p10 + p90) / 2,
  probabilityNeverReachFire: pNever,
  successProbabilityByYear: [],
  paths: 1000,
});

describe("describeFireConfidenceBand (#18)", () => {
  it("a reachable band shows the p10–p90 range + age range + illustrative disclosure", () => {
    const s = describeFireConfidenceBand(mk(12, 20), 16, 35)!;
    expect(s).toContain("12–20 years out");
    expect(s).toContain("age 47–55");
    expect(s).toContain("Illustrative model");
    expect(s).not.toMatch(/conservative/i); // engine-header constraint
  });

  it("returns null for an already-FIRE / non-positive headline", () => {
    expect(describeFireConfidenceBand(mk(1, 5), 0, 35)).toBeNull();
    expect(describeFireConfidenceBand(mk(1, 5), -2, 35)).toBeNull();
  });

  it("returns null when the headline years are not finite (unreachable / zero-savings)", () => {
    expect(describeFireConfidenceBand(mk(1, 5), Infinity, 35)).toBeNull();
    expect(describeFireConfidenceBand(null, 16, 35)).toBeNull();
  });

  it("NEVER renders the never-reached sentinel as a literal age (off-the-chart upper tail)", () => {
    const s = describeFireConfidenceBand(mk(10, MAX_PROJECTION_YEARS + 1), 30, 35)!;
    expect(s).toContain("may not come within your planning horizon");
    expect(s).toContain("~10 years");
    expect(s).not.toMatch(/age \d{3}/); // no 3-digit age leaks
    expect(s).not.toContain(String(MAX_PROJECTION_YEARS + 1)); // sentinel never printed
    expect(s).toContain("Illustrative model");
  });

  it("describes a mostly-unreachable plan in words when even the optimistic tail is off-chart", () => {
    const s = describeFireConfidenceBand(mk(MAX_PROJECTION_YEARS + 1, MAX_PROJECTION_YEARS + 1, 0.6), 60, 35)!;
    expect(s).toContain("most scenarios don't reach FIRE within a working lifetime");
    expect(s).toContain("60%"); // the P(never reach) note
    expect(s).not.toMatch(/\b\d{3}\b/); // no sentinel digits leak anywhere
  });

  it("appends the P(never reach) note only when material (>= 5%)", () => {
    expect(describeFireConfidenceBand(mk(12, 20, 0.1), 16, 35)!).toContain("About 10% of scenarios");
    expect(describeFireConfidenceBand(mk(12, 20, 0.02), 16, 35)!).not.toContain("scenarios don't reach");
  });

  it("omits the age range when anchorAge is unknown", () => {
    const s = describeFireConfidenceBand(mk(12, 20), 16, NaN)!;
    expect(s).toContain("12–20 years out");
    expect(s).not.toContain("≈ age"); // the parenthetical age range is omitted
  });
});
