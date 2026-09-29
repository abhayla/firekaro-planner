/**
 * salary-cash — the one take-home formula (gh #218).
 *
 * These lock the TERMS, not a rendered number: one basic base, both PF legs, the ₹2,500
 * professional-tax constant, and the invariant that take-home is strictly below post-tax
 * gross for any salaried earner.
 */
import { describe, it, expect } from "vitest";
import {
  EPF_STATUTORY_RATE,
  PROFESSIONAL_TAX_ANNUAL_PER_EARNER,
  netCashSalary,
  resolveBasicAnnual,
  statutoryPfFor,
  sumPf,
  totalPf,
} from "./salary-cash";
import { DEFAULT_BASIC_PERCENT_OF_CTC } from "./salary-percent";

describe("resolveBasicAnnual — ONE basic base", () => {
  it("uses the user's stored basicAnnual when present", () => {
    expect(resolveBasicAnnual({ annualCTC: 4_200_000, basicAnnual: 1_680_000 })).toBe(1_680_000);
  });

  it("falls back to the 50%-of-CTC Code-on-Wages default", () => {
    expect(DEFAULT_BASIC_PERCENT_OF_CTC).toBe(50);
    expect(resolveBasicAnnual({ annualCTC: 2_500_000 })).toBe(1_250_000);
  });

  it("is zero for no salary, no CTC, or junk", () => {
    expect(resolveBasicAnnual(undefined)).toBe(0);
    expect(resolveBasicAnnual({})).toBe(0);
    expect(resolveBasicAnnual({ annualCTC: 0 })).toBe(0);
    expect(resolveBasicAnnual({ annualCTC: Number.NaN })).toBe(0);
    expect(resolveBasicAnnual({ annualCTC: -100 })).toBe(0);
  });

  it("ignores a zero/negative stored basic and falls back (never returns a negative base)", () => {
    expect(resolveBasicAnnual({ annualCTC: 1_000_000, basicAnnual: 0 })).toBe(500_000);
    expect(resolveBasicAnnual({ annualCTC: 1_000_000, basicAnnual: -5 })).toBe(500_000);
  });
});

describe("statutoryPfFor — 12% + 12% (+ VPF top-up)", () => {
  it("both legs are 12% of the resolved basic", () => {
    expect(EPF_STATUTORY_RATE).toBe(0.12);
    const pf = statutoryPfFor({ annualCTC: 2_500_000 }); // basic 12.5L
    expect(pf.employeePF).toBe(150_000);
    expect(pf.employerPF).toBe(150_000);
    expect(pf.vpf).toBe(0);
  });

  it("VPF tops up the EMPLOYEE leg only, never the employer match", () => {
    const pf = statutoryPfFor({ annualCTC: 2_500_000, vpfTopUpPercent: 50 });
    expect(pf.employeePF).toBe(150_000);
    expect(pf.vpf).toBe(75_000);
    expect(pf.employerPF).toBe(150_000);
  });

  it("is all-zero with no basic to compute against", () => {
    expect(statutoryPfFor(undefined)).toEqual({ employeePF: 0, vpf: 0, employerPF: 0 });
  });

  it("a negative vpfTopUpPercent cannot ADD income back", () => {
    expect(statutoryPfFor({ annualCTC: 1_000_000, vpfTopUpPercent: -50 }).vpf).toBe(0);
  });
});

describe("netCashSalary — CTC minus PF minus tax minus professional tax", () => {
  const pf = statutoryPfFor({ annualCTC: 2_500_000 });

  it("subtracts every term exactly once", () => {
    const r = netCashSalary({
      annualCTC: 2_500_000,
      pf,
      annualTax: 300_000,
      professionalTax: PROFESSIONAL_TAX_ANNUAL_PER_EARNER,
    });
    expect(r.annual).toBe(2_500_000 - 150_000 - 150_000 - 300_000 - 2_500);
    expect(r.monthly).toBe(Math.round(r.annual / 12));
  });

  it("professional tax is the Article 276 ceiling, ₹2,500/earner/yr", () => {
    expect(PROFESSIONAL_TAX_ANNUAL_PER_EARNER).toBe(2_500);
  });

  it("collapses to gross − tax when there is no salary (so no PF)", () => {
    const r = netCashSalary({
      annualCTC: 900_000,
      pf: { employeePF: 0, vpf: 0, employerPF: 0 },
      annualTax: 40_000,
      professionalTax: 0,
    });
    expect(r.annual).toBe(860_000);
  });

  it("is floored at zero and never NaN", () => {
    const r = netCashSalary({ annualCTC: 100_000, pf, annualTax: 0, professionalTax: 2_500 });
    expect(r.annual).toBe(0);
    expect(r.monthly).toBe(0);
    const junk = netCashSalary({
      annualCTC: Number.NaN,
      pf: { employeePF: Number.NaN, vpf: 0, employerPF: 0 },
      annualTax: Number.NaN,
      professionalTax: Number.NaN,
    });
    expect(Number.isFinite(junk.annual)).toBe(true);
    expect(Number.isFinite(junk.monthly)).toBe(true);
  });

  it("is STRICTLY below post-tax gross for any salaried earner (the #218 honesty invariant)", () => {
    const gross = 2_500_000;
    const tax = 300_000;
    const cash = netCashSalary({
      annualCTC: gross,
      pf,
      annualTax: tax,
      professionalTax: PROFESSIONAL_TAX_ANNUAL_PER_EARNER,
    }).annual;
    expect(cash).toBeLessThan(gross - tax);
  });
});

describe("sumPf / totalPf", () => {
  it("sums each leg across earners", () => {
    const s = sumPf([statutoryPfFor({ annualCTC: 2_500_000 }), statutoryPfFor({ annualCTC: 1_800_000 })]);
    expect(s.employeePF).toBe(150_000 + 108_000);
    expect(s.employerPF).toBe(150_000 + 108_000);
    expect(totalPf(s)).toBe(s.employeePF + s.vpf + s.employerPF);
  });

  it("sums an empty roster to zero", () => {
    expect(totalPf(sumPf([]))).toBe(0);
  });
});
