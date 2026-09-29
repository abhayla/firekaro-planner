import { describe, it, expect } from "vitest";
import {
  monthsRemaining,
  derivedEndYear,
  amortize,
  annualInterestForYear,
  outstandingPrincipalFromEMI,
} from "./amortization";

describe("monthsRemaining", () => {
  it("returns 0 for zero balance", () => {
    expect(monthsRemaining(0, 10000, 8.5)).toBe(0);
  });

  it("returns 0 for non-positive EMI", () => {
    expect(monthsRemaining(100000, 0, 8.5)).toBe(0);
    expect(monthsRemaining(100000, -100, 8.5)).toBe(0);
  });

  it("handles zero interest rate as simple division", () => {
    expect(monthsRemaining(100000, 10000, 0)).toBe(10);
  });

  it("returns Infinity when EMI ≤ monthly interest (can never amortize)", () => {
    // 100L outstanding × 12% / 12 = ₹100K monthly interest; EMI ₹50K < interest
    expect(monthsRemaining(10000000, 50000, 12)).toBe(Infinity);
  });

  it("computes amortization period for a typical home loan", () => {
    // ₹38L outstanding @ 8.5%, EMI ₹42K — should be ~140 months
    const n = monthsRemaining(3800000, 42000, 8.5);
    expect(n).toBeGreaterThan(120);
    expect(n).toBeLessThan(180);
  });
});

describe("outstandingPrincipalFromEMI", () => {
  it("returns 0 for non-positive EMI or months", () => {
    expect(outstandingPrincipalFromEMI(0, 7.2, 84)).toBe(0);
    expect(outstandingPrincipalFromEMI(100000, 7.2, 0)).toBe(0);
  });

  // l.75 `if (monthlyEMI <= 0 || monthsRemaining <= 0) return 0` — the EXACT-ZERO boundary on
  // EACH side of the `||` independently, so a mutant that flips either operand to `<` (missing
  // the ==0 case) or swaps `||` for `&&` (requiring BOTH to be non-positive) is caught.
  it("EMI exactly 0 with a positive monthsRemaining still returns 0 (kills the `<` boundary mutant on the EMI side)", () => {
    expect(outstandingPrincipalFromEMI(0, 7.2, 84)).toBe(0);
  });

  it("monthsRemaining exactly 0 with a positive EMI still returns 0 (kills the `<` boundary mutant on the months side)", () => {
    expect(outstandingPrincipalFromEMI(100000, 7.2, 0)).toBe(0);
  });

  it("a negative EMI (only one side non-positive) still returns 0 (kills the `||` → `&&` LogicalOperator mutant)", () => {
    // monthsRemaining=84 is POSITIVE here — an `&&` mutant would require BOTH sides non-positive
    // and would fall through to compute a bogus principal from a negative EMI instead of 0.
    expect(outstandingPrincipalFromEMI(-5000, 7.2, 84)).toBe(0);
  });

  it("a negative monthsRemaining (only one side non-positive) still returns 0 (kills the `||` → `&&` LogicalOperator mutant, months side)", () => {
    expect(outstandingPrincipalFromEMI(100000, 7.2, -12)).toBe(0);
  });

  it("handles zero interest as simple multiplication", () => {
    expect(outstandingPrincipalFromEMI(10000, 0, 10)).toBe(100000);
  });

  it("computes the PV-annuity principal — NOT the undiscounted sum of payments", () => {
    // ₹1L EMI, 7.2%, 7 years (84 months) — true principal ≈ ₹65.8L, not ₹84L.
    const principal = outstandingPrincipalFromEMI(100000, 7.2, 84);
    expect(principal).toBeGreaterThan(6_500_000);
    expect(principal).toBeLessThan(6_650_000);
    expect(principal).not.toBeCloseTo(8_400_000, -4);
  });
});

describe("derivedEndYear", () => {
  it("returns null for non-amortizing loan", () => {
    expect(derivedEndYear(10000000, 50000, 12, 2026, 1)).toBeNull();
  });

  it("returns a year >= startYear for amortizing loan", () => {
    const y = derivedEndYear(3800000, 42000, 8.5, 2026, 1);
    expect(y).toBeGreaterThanOrEqual(2026);
    expect(y).toBeLessThan(2050);
  });

  // #176 round 2 — the exact witness the reviewers proved drifted: a ₹38L / ₹42,000 / 8.5% loan
  // starting FY 2025-26 (April 2025) amortizes to calendar year 2037.
  it("startYear=2025, startMonth=4 (April, FY start) pins the exact endYear to 2037", () => {
    expect(derivedEndYear(3800000, 42000, 8.5, 2025, 4)).toBe(2037);
  });

  // The defect round 1 missed: startMonth is NOT cosmetic — a loan with the SAME startYear but a
  // different startMonth can land in a DIFFERENT calendar endYear once (startMonth + n) crosses a
  // 12-month boundary. For THIS loan (146 months remaining) that boundary sits between month 10
  // (October) and month 11 (November) — proven by direct computation, not assumed — so January
  // and November are the two months that actually straddle it. Proves both params are
  // load-bearing, not just startYear.
  it("startMonth changes the resulting endYear when it shifts across a 12-month boundary", () => {
    const yJanuary = derivedEndYear(3800000, 42000, 8.5, 2025, 1);
    const yNovember = derivedEndYear(3800000, 42000, 8.5, 2025, 11);
    expect(yJanuary).toBe(2037);
    expect(yNovember).toBe(2038);
    expect(yNovember).toBeGreaterThan(yJanuary as number);
  });
});

describe("amortize", () => {
  it("returns empty array for zero balance", () => {
    expect(amortize(0, 10000, 8.5)).toEqual([]);
  });

  it("balance decreases monotonically and reaches zero (typical case)", () => {
    const steps = amortize(500000, 10000, 8.5, 120);
    expect(steps.length).toBeGreaterThan(0);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].balance).toBeLessThanOrEqual(steps[i - 1].balance);
    }
    expect(steps[steps.length - 1].balance).toBe(0);
  });

  it("returns one step (then exit) for non-amortizing case", () => {
    const steps = amortize(10000000, 50000, 12, 600);
    // Interest exceeds EMI immediately, so loop break-exits after 1 step
    expect(steps.length).toBeLessThanOrEqual(1);
  });

  // Mutant-kill: l.55 `for (let i = 1; i <= maxMonths && balance > 0; i++)`. maxMonths bounds the
  // loop from ABOVE — a household whose EMI is too small to clear the balance inside maxMonths
  // must get exactly `maxMonths` steps, not `maxMonths - 1` (an off-by-one `<` mutant) and not
  // unlimited (a `true` mutant that would hang / run forever on a still-positive balance).
  it("maxMonths bounds the step count exactly, even when the loan is not yet paid off", () => {
    // A huge balance with an EMI barely above interest — amortizes, but not inside 12 months.
    const steps = amortize(10_000_000, 95_000, 8.5, 12);
    expect(steps.length).toBe(12);
    expect(steps[steps.length - 1].balance).toBeGreaterThan(0); // proves it did NOT finish early
  });

  it("i decrements would never terminate — a small maxMonths still produces a forward-indexed, finite array (kills the UpdateOperator i-- mutant)", () => {
    const steps = amortize(100000, 5000, 8.5, 5);
    expect(steps.length).toBe(5);
    expect(steps.map((s) => s.monthIndex)).toEqual([1, 2, 3, 4, 5]);
  });

  // l.57 `principal = Math.max(0, monthlyEMI - interest)` — kills the `+` ArithmeticOperator
  // mutant, which would make principal LARGER than the EMI itself (impossible: principal +
  // interest must equal the EMI for an amortizing month).
  it("principal + interest reconstructs the EMI exactly for a mid-amortization step (kills the EMI+interest ArithmeticOperator mutant)", () => {
    const steps = amortize(3_800_000, 42_000, 8.5, 5);
    for (const s of steps) {
      expect(s.principal + s.interest).toBeCloseTo(42_000, 6);
      expect(s.principal).toBeLessThan(42_000); // a `+` mutant would push principal > EMI
    }
  });

  // l.58 `balance = Math.max(0, balance - principal)` — kills the `Math.min` mutant, which would
  // clamp balance to be <= 0 always instead of >= 0, silently zeroing a loan mid-schedule.
  it("balance after step 1 equals outstanding minus principal, and never goes negative (kills the Math.min balance mutant)", () => {
    const steps = amortize(3_800_000, 42_000, 8.5, 3);
    const expectedBalance1 = 3_800_000 - steps[0].principal;
    expect(steps[0].balance).toBeCloseTo(expectedBalance1, 6);
    expect(steps[0].balance).toBeGreaterThan(0);
  });

  // l.60 `if (monthlyEMI <= interest) break` — the EXACT-EQUAL boundary must also break (an EMI
  // that only just covers interest can never reduce principal, so it must exit, not loop forever
  // pushing 0 principal). Kills the `<` EqualityOperator mutant.
  it("EMI exactly equal to first-month interest breaks immediately (kills the `<` EqualityOperator boundary mutant)", () => {
    // ₹1,00,00,000 @ 12%/yr ⇒ monthly interest = 1,00,00,000 * 0.01 = 1,00,000 exactly.
    const steps = amortize(10_000_000, 100_000, 12, 600);
    expect(steps.length).toBe(1);
    expect(steps[0].principal).toBe(0);
  });
});

describe("annualInterestForYear", () => {
  it("returns 0 for zero balance", () => {
    expect(annualInterestForYear(0, 10000, 8.5)).toBe(0);
  });

  it("returns positive value for home loan year-1", () => {
    const y1 = annualInterestForYear(3800000, 42000, 8.5, 0);
    expect(y1).toBeGreaterThan(0);
    expect(y1).toBeLessThan(3800000); // sanity
  });

  it("year-N interest decreases as principal pays down", () => {
    const y0 = annualInterestForYear(3800000, 42000, 8.5, 0);
    const y10 = annualInterestForYear(3800000, 42000, 8.5, 10);
    expect(y10).toBeLessThan(y0);
  });
});
