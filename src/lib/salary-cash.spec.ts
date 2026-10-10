/**
 * salary-cash — the one take-home formula (gh #218).
 *
 * These lock the TERMS, not a rendered number: PF read from the rows the corpus already
 * receives, the ₹2,500 professional-tax constant, and the invariant that take-home is
 * strictly below post-tax gross for any earner with an EPF row.
 */
import { describe, it, expect } from "vitest";
import {
  EPF_STATUTORY_RATE,
  PROFESSIONAL_TAX_ANNUAL_PER_EARNER,
  netCashSalary,
  pfFromInvestmentRows,
  pfFromRows,
  resolveBasicAnnual,
  statutoryPfFor,
  monthlyEpfContributionFor,
} from "./salary-cash";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_BASIC_PERCENT_OF_CTC } from "./salary-percent";
import type { Household, Investment } from "@/types/household";

const inv = (over: Partial<Investment>): Investment =>
  ({ id: "i", type: "EPF_VPF", value: 0, monthlyContribution: 0, ownerId: "a", ...over }) as Investment;

const hh = (investments: Investment[]) => ({ investments }) as Pick<Household, "investments">;

describe("pfFromInvestmentRows — PF is the rupees the corpus already receives", () => {
  it("sums the household's EPF_VPF rows × 12", () => {
    expect(
      pfFromInvestmentRows(hh([inv({ monthlyContribution: 20_000 }), inv({ monthlyContribution: 14_400, ownerId: "b" })]), null),
    ).toBe((20_000 + 14_400) * 12);
  });

  it("scopes to one member — EPF is never Joint", () => {
    const h = hh([inv({ monthlyContribution: 20_000, ownerId: "a" }), inv({ monthlyContribution: 14_400, ownerId: "b" })]);
    expect(pfFromInvestmentRows(h, "a")).toBe(240_000);
    expect(pfFromInvestmentRows(h, "b")).toBe(172_800);
  });

  // KNOWN LIMIT (recorded as a finding, not fixed): two EPF rows for ONE earner are SUMMED. A
  // dormant previous-employer row carrying a stale `monthlyContribution` would over-deduct
  // take-home — conservative (cash reads low, never high), and consistent with the corpus, which
  // grows from the same rows. See the `salary-cash.ts` header.
  it("sums MULTIPLE EPF rows owned by the same earner (documented limit)", () => {
    expect(
      pfFromInvestmentRows(hh([inv({ monthlyContribution: 20_000 }), inv({ id: "i2", monthlyContribution: 5_000 })]), "a"),
    ).toBe(300_000);
  });

  it("ignores every non-EPF row (a SIP is not a payslip deduction)", () => {
    expect(
      pfFromInvestmentRows(hh([inv({ type: "MutualFunds", monthlyContribution: 80_000 }), inv({ monthlyContribution: 5_000 })]), null),
    ).toBe(60_000);
  });

  it("is zero with no EPF row — nothing is auto-flowed, so nothing leaves the payslip", () => {
    expect(pfFromInvestmentRows(hh([]), null)).toBe(0);
    expect(pfFromInvestmentRows(hh([inv({ type: "PPF", monthlyContribution: 12_500 })]), "a")).toBe(0);
    expect(pfFromInvestmentRows(undefined, null)).toBe(0);
    expect(pfFromInvestmentRows(hh([inv({ monthlyContribution: undefined })]), null)).toBe(0);
  });

  it("never returns NaN on a junk row", () => {
    expect(
      Number.isFinite(pfFromInvestmentRows(hh([inv({ monthlyContribution: Number.NaN })]), null)),
    ).toBe(true);
  });
});

describe("pfFromRows — the same body over a pre-scoped array (derive.ts's entry point)", () => {
  it("agrees with pfFromInvestmentRows on the same rows", () => {
    const rows = [inv({ monthlyContribution: 20_000 }), inv({ monthlyContribution: 14_400, ownerId: "b" })];
    expect(pfFromRows(rows)).toBe(pfFromInvestmentRows(hh(rows), null));
    expect(pfFromRows(rows, "b")).toBe(pfFromInvestmentRows(hh(rows), "b"));
  });

  it("is zero for an absent array", () => {
    expect(pfFromRows(undefined)).toBe(0);
    expect(pfFromRows(null)).toBe(0);
  });
});

describe("netCashSalary — gross minus PF minus tax minus professional tax", () => {
  it("subtracts every term exactly once", () => {
    const r = netCashSalary({
      annualCTC: 2_500_000,
      annualPf: 300_000,
      annualTax: 300_000,
      professionalTax: PROFESSIONAL_TAX_ANNUAL_PER_EARNER,
    });
    expect(r.annual).toBe(2_500_000 - 300_000 - 300_000 - 2_500);
    expect(r.monthly).toBe(Math.round(r.annual / 12));
  });

  it("professional tax is the Article 276 ceiling, ₹2,500/earner/yr", () => {
    expect(PROFESSIONAL_TAX_ANNUAL_PER_EARNER).toBe(2_500);
  });

  it("collapses to gross − tax when there is no EPF row", () => {
    expect(
      netCashSalary({ annualCTC: 900_000, annualPf: 0, annualTax: 40_000, professionalTax: 0 }).annual,
    ).toBe(860_000);
  });

  it("is floored at zero and never NaN", () => {
    expect(
      netCashSalary({ annualCTC: 100_000, annualPf: 300_000, annualTax: 0, professionalTax: 2_500 }).annual,
    ).toBe(0);
    const junk = netCashSalary({
      annualCTC: Number.NaN,
      annualPf: Number.NaN,
      annualTax: Number.NaN,
      professionalTax: Number.NaN,
    });
    expect(Number.isFinite(junk.annual)).toBe(true);
    expect(Number.isFinite(junk.monthly)).toBe(true);
  });

  it("is STRICTLY below post-tax gross whenever an EPF row exists (the #218 honesty invariant)", () => {
    const cash = netCashSalary({
      annualCTC: 2_500_000,
      annualPf: 300_000,
      annualTax: 300_000,
      professionalTax: PROFESSIONAL_TAX_ANNUAL_PER_EARNER,
    }).annual;
    expect(cash).toBeLessThan(2_500_000 - 300_000);
  });
});

/**
 * gh #218 PR B — `resolveBasicAnnual` is the ONE basic base every consumer reads: the EPF
 * auto-flow, the quick path, the investment form's EPF hint and the 80CCD(2) employer-NPS cap.
 */
describe("resolveBasicAnnual — the ONE basic base", () => {
  it("uses the user's stored basicAnnual when present", () => {
    expect(resolveBasicAnnual({ annualCTC: 4_200_000, basicAnnual: 1_680_000 })).toBe(1_680_000);
  });

  it("falls back to the 50%-of-CTC Code-on-Wages default", () => {
    expect(DEFAULT_BASIC_PERCENT_OF_CTC).toBe(50);
    expect(resolveBasicAnnual({ annualCTC: 2_500_000 })).toBe(1_250_000);
  });

  it("is zero for no salary, no CTC, or junk; never negative", () => {
    expect(resolveBasicAnnual(undefined)).toBe(0);
    expect(resolveBasicAnnual({})).toBe(0);
    expect(resolveBasicAnnual({ annualCTC: Number.NaN })).toBe(0);
    expect(resolveBasicAnnual({ annualCTC: -100 })).toBe(0);
    expect(resolveBasicAnnual({ annualCTC: 1_000_000, basicAnnual: -5 })).toBe(500_000);
  });

  it("applies the statutory 12% rate to that base", () => {
    expect(EPF_STATUTORY_RATE).toBe(0.12);
  });
});

describe("statutoryPfFor / monthlyEpfContributionFor — PF off the ONE basic", () => {
  it("defaults to 12% + 12% of 50% of CTC (₹25L CTC → ₹1.5L + ₹1.5L/yr, ₹25,000/mo)", () => {
    expect(statutoryPfFor({ annualCTC: 2_500_000 })).toEqual({ employeePF: 150_000, vpf: 0, employerPF: 150_000 });
    expect(monthlyEpfContributionFor({ annualCTC: 2_500_000 })).toBe(25_000);
  });

  it("uses the user's own basic when recorded (₹42L CTC, ₹16.8L basic → ₹33,600/mo)", () => {
    expect(monthlyEpfContributionFor({ annualCTC: 4_200_000, basicAnnual: 1_680_000 })).toBe(33_600);
  });

  it("adds VPF as a % of the employee leg only", () => {
    expect(statutoryPfFor({ annualCTC: 1_000_000, vpfTopUpPercent: 50 })).toEqual({
      employeePF: 60_000,
      vpf: 30_000,
      employerPF: 60_000,
    });
  });

  it("is zero without a salary", () => {
    expect(monthlyEpfContributionFor(undefined)).toBe(0);
    expect(monthlyEpfContributionFor({ annualCTC: 0 })).toBe(0);
  });
});

/**
 * Class lock (detection for #218 PR B): no consumer re-derives basic from CTC locally. Three
 * copies of `0.4 × CTC` disagreed with the salary form's 50% for months with every gate green.
 * `gratuity.ts` is the one deliberate exception (a conservative 35% for a corpus ADDITION).
 */
describe("no local basic-pay formula outside salary-cash.ts", () => {
  const FILES = [
    "src/stores/household.ts",
    "src/lib/quick-number.ts",
    "src/components/forms/InvestmentForm.vue",
    "src/lib/tax-deductions.ts",
  ];
  for (const f of FILES) {
    it(`${f} reads basic only through salary-cash.ts`, () => {
      const src = readFileSync(resolve(__dirname, "../..", f), "utf8");
      expect(src).not.toMatch(/(annualCTC|ctc)\s*\*\s*0\.\d+/i);
      expect(src).not.toMatch(/basicAnnual\s*\?\?\s*0/);
    });
  }
});
