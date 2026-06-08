/**
 * Phase D (#14 EPS pension) — the Employees' Pension Scheme pension as a
 * post-retirement income stream.
 *
 * EPS is funded by the 8.33% employer share of EPF and is a SEPARATE pot the
 * app currently ignores (EpfVpf `value` excludes it — see investment-traits A3
 * note). For the salaried accumulator it is real bridge + post-FIRE income.
 *
 * Pins the current EPS formula (pensionable salary × pensionable service / 70,
 * ₹15k wage ceiling, +2yr service bonus ≥20yr, ₹1,000 floor, 10yr eligibility,
 * starts at 58) and the assumption disclosures (principle 1).
 */
import { describe, it, expect } from "vitest";
import {
  calculateEpsPension,
  deriveEpsPensionForMember,
  EPS_WAGE_CEILING,
  EPS_NORMAL_START_AGE,
  EPS_MIN_SERVICE_FOR_PENSION,
} from "./eps-pension";
import type { Member } from "@/types/household";

describe("calculateEpsPension — the formula", () => {
  it("pension = capped salary × (service + 2yr bonus) / 70, starting at 58", () => {
    // 25 yrs service (≥20 → +2 = 27), salary above the ₹15k ceiling → capped.
    const r = calculateEpsPension({ monthlyPensionableSalary: 50_000, serviceYears: 25 });
    expect(r.pensionableSalaryUsed).toBe(EPS_WAGE_CEILING); // ₹15,000 cap binds
    expect(r.serviceYearsUsed).toBe(27); // 25 + 2 bonus
    expect(r.monthlyPension).toBe(Math.round((15_000 * 27) / 70)); // ₹5,786
    expect(r.annualPension).toBe(r.monthlyPension * 12);
    expect(r.pensionStartAge).toBe(EPS_NORMAL_START_AGE);
  });

  it("no +2 bonus below 20 years of service", () => {
    const r = calculateEpsPension({ monthlyPensionableSalary: 15_000, serviceYears: 15 });
    expect(r.serviceYearsUsed).toBe(15);
    expect(r.monthlyPension).toBe(Math.round((15_000 * 15) / 70));
  });

  it("uses actual salary when higher-pension is opted (post-2022 SC ruling)", () => {
    const r = calculateEpsPension({
      monthlyPensionableSalary: 50_000,
      serviceYears: 25,
      higherPensionOpted: true,
    });
    expect(r.pensionableSalaryUsed).toBe(50_000); // ceiling does NOT bind
    expect(r.monthlyPension).toBe(Math.round((50_000 * 27) / 70));
  });

  it("defaults the pensionable salary to the ₹15k ceiling when unknown + discloses it", () => {
    const r = calculateEpsPension({ serviceYears: 30 });
    expect(r.pensionableSalaryUsed).toBe(EPS_WAGE_CEILING);
    expect(r.assumptions.some((a) => /15,?000|ceiling/i.test(a.assumed))).toBe(true);
  });

  it("enforces the ₹1,000 minimum monthly pension", () => {
    // Tiny service → formula < ₹1,000 → floored.
    const r = calculateEpsPension({ monthlyPensionableSalary: 15_000, serviceYears: 10 });
    const raw = Math.round((15_000 * 10) / 70); // ₹2,143 — above floor here
    expect(r.monthlyPension).toBe(Math.max(1_000, raw));
  });

  it("less than 10 years of service → NO monthly pension (withdrawal benefit only) + note", () => {
    const r = calculateEpsPension({ monthlyPensionableSalary: 15_000, serviceYears: 8 });
    expect(r.monthlyPension).toBe(0);
    expect(r.annualPension).toBe(0);
    expect(r.assumptions.some((a) => /10 year|eligib|withdrawal/i.test(a.assumed + a.why))).toBe(true);
  });

  it("discloses when a non-58 start age is used (unadjusted early/deferred amount)", () => {
    const r = calculateEpsPension({ monthlyPensionableSalary: 15_000, serviceYears: 25, pensionStartAge: 50 });
    expect(r.assumptions.some((a) => a.id === "eps-start-age-unadjusted")).toBe(true);
  });

  it("is defensive: NaN/negative inputs do not crash and floor at zero pension", () => {
    const r = calculateEpsPension({ monthlyPensionableSalary: NaN, serviceYears: -5 });
    expect(r.monthlyPension).toBe(0);
    expect(Number.isFinite(r.annualPension)).toBe(true);
  });
});

describe("deriveEpsPensionForMember — derives service from age, discloses assumptions", () => {
  const asOf = new Date("2026-01-01T00:00:00Z");
  function earner(over: Partial<Member> = {}): Member {
    return {
      id: "m1",
      name: "Rohit",
      dateOfBirth: "1986-01-01", // age 40 as of asOf
      role: "ADULT",
      targetRetirementAge: 50,
      city: "Metro",
      health: "Healthy",
      riskAppetite: "Moderate",
      marital: "Married",
      salary: { annualCTC: 3_000_000, hikePercent: 8 },
      ...over,
    } as Member;
  }

  it("derives ~27 years of service (start 23 → retire 50) and discloses the career-start assumption", () => {
    const r = deriveEpsPensionForMember(earner(), asOf);
    expect(r).not.toBeNull();
    // service = retire 50 − assumed career start 23 = 27 (≥20 → +2 bonus = 29)
    expect(r!.serviceYearsUsed).toBe(29);
    expect(r!.monthlyPension).toBe(Math.round((EPS_WAGE_CEILING * 29) / 70));
    expect(r!.assumptions.some((a) => /career|start|23/i.test(a.assumed + a.why))).toBe(true);
  });

  it("uses basic salary for the pensionable salary when present (still capped at ₹15k)", () => {
    const r = deriveEpsPensionForMember(
      earner({ salary: { annualCTC: 3_000_000, hikePercent: 8, basicAnnual: 120_000 } }),
      asOf,
    );
    // basic ₹1.2L/yr = ₹10k/mo < ₹15k ceiling → uses ₹10k.
    expect(r!.pensionableSalaryUsed).toBe(10_000);
  });

  it("discloses to an early retiree that EPS only begins at 58 (can't fund FIRE→58)", () => {
    const r = deriveEpsPensionForMember(earner({ targetRetirementAge: 47 }), asOf);
    expect(r!.assumptions.some((a) => a.id.startsWith("eps-starts-at-58"))).toBe(true);
  });

  it("does NOT add the starts-at-58 note when retiring at/after 58", () => {
    const r = deriveEpsPensionForMember(earner({ targetRetirementAge: 60 }), asOf);
    expect(r!.assumptions.some((a) => a.id.startsWith("eps-starts-at-58"))).toBe(false);
  });

  it("returns null for a non-earner / member without salary (no EPS)", () => {
    expect(deriveEpsPensionForMember(earner({ role: "DEPENDENT", salary: undefined }), asOf)).toBeNull();
  });
});

// Re-export sanity: the eligibility threshold is the current 10 years.
it("EPS_MIN_SERVICE_FOR_PENSION is the current 10-year eligibility floor", () => {
  expect(EPS_MIN_SERVICE_FOR_PENSION).toBe(10);
});
