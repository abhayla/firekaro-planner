import { describe, it, expect } from "vitest";
import { retirementGoalAgeYear } from "./retirement-goal";

describe("retirementGoalAgeYear (gh-issue #33 — age/year coherence)", () => {
  it("displayed age and year ALWAYS correspond (year-currentYear === age-anchorAge)", () => {
    const cases: Array<[number, number, number]> = [
      [33, 23, 2026],
      [44, 24, 2026],
      [29, 11, 2026],
      [50, 0.4, 2030],
    ];
    for (const [anchorAge, ytr, currentYear] of cases) {
      const { age, year } = retirementGoalAgeYear(anchorAge, ytr, currentYear);
      expect(year - currentYear, `coherence for anchorAge=${anchorAge} ytr=${ytr}`).toBe(
        age - Math.round(anchorAge),
      );
    }
  });

  it("regression #33: a 33-yr-old with ~23y to FIRE → age 56 / 2049, NOT a stray target age like 47", () => {
    const { age, year } = retirementGoalAgeYear(33, 23, 2026);
    expect(age).toBe(56); // 33 + 23 — the COMPUTED FIRE age, coherent with the year
    expect(year).toBe(2049); // 2026 + 23
    // the bug juxtaposed an aspirational age (e.g. 47) with this computed year (2049) — forbid that drift
    expect(age).not.toBe(47);
  });

  it("ceil()s a fractional years-to-FIRE so age and year round together", () => {
    const { age, year } = retirementGoalAgeYear(40, 5.2, 2026);
    expect(age).toBe(46); // 40 + ceil(5.2)=6
    expect(year).toBe(2032); // 2026 + 6
  });

  it("falls back to a 30y horizon (coherently) when years-to-FIRE is not finite", () => {
    const { age, year } = retirementGoalAgeYear(35, Infinity, 2026);
    expect(age).toBe(65); // 35 + 30
    expect(year).toBe(2056); // 2026 + 30
    expect(year - 2026).toBe(age - 35);
  });
});
