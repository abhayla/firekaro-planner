import { describe, it, expect } from "vitest";
import {
  deriveDeductions,
  isInMarginalReliefBand,
  marginalReliefMitigations,
  LIMIT_80C,
  LIMIT_80CCD_1B,
  LIMIT_SECTION_24,
} from "./tax-deductions";
import type { Household } from "@/types/household";

function emptyHH(): Household {
  return {
    name: "",
    setupMode: "Solo",
    profileComplete: false,
    wizardCompleted: false,
    members: [],
    businesses: [],
    otherIncome: [],
    investments: [],
    liabilities: [],
    insurance: [],
    expenses: { avgMonthly: 0, recurring: [], plannedFuture: [] },
  };
}

describe("deriveDeductions — 80C cap", () => {
  it("EPF + PPF + MF SIP + life premium aggregate but cap at ₹1.5L", () => {
    const hh = emptyHH();
    hh.investments = [
      { id: "i1", type: "EPF_VPF", value: 0, ownerId: "self", monthlyContribution: 10_000 },
      { id: "i2", type: "PPF", value: 0, ownerId: "self", monthlyContribution: 5_000 },
      { id: "i3", type: "MutualFunds", value: 0, ownerId: "self", monthlyContribution: 5_000 },
    ];
    hh.insurance = [
      { id: "p1", type: "Life", provider: "LIC", sumAssured: 0, annualPremium: 30_000, insuredPersonId: "self" },
    ];
    // total = 120k + 60k + 60k + 30k = 270k -> capped at 150k
    const result = deriveDeductions(hh);
    expect(result.section80C).toBe(LIMIT_80C);
  });

  it("zero when no relevant investments / insurance", () => {
    const result = deriveDeductions(emptyHH());
    expect(result.section80C).toBe(0);
  });

  it("returns under-cap value when contributions are small", () => {
    const hh = emptyHH();
    hh.investments = [
      { id: "i1", type: "EPF_VPF", value: 0, ownerId: "self", monthlyContribution: 2_000 },
    ];
    const result = deriveDeductions(hh);
    expect(result.section80C).toBe(24_000); // 2000 * 12
  });
});

describe("deriveDeductions — 80CCD(1B) NPS", () => {
  it("caps at ₹50k", () => {
    const hh = emptyHH();
    hh.investments = [
      { id: "i1", type: "NPS", value: 0, ownerId: "self", monthlyContribution: 8_000 },
    ];
    const result = deriveDeductions(hh);
    // 96k annual NPS -> capped at 50k
    expect(result.section80CCD1B).toBe(LIMIT_80CCD_1B);
  });

  it("zero when no NPS", () => {
    const result = deriveDeductions(emptyHH());
    expect(result.section80CCD1B).toBe(0);
  });
});

describe("deriveDeductions — 80CCD(2) employer NPS", () => {
  // gh-issue #2 finding #1: the prior `npsAnnual * 0.5` heuristic fabricated an
  // employer-NPS deduction from the EMPLOYEE's own NPS. 80CCD(2) is the employer's
  // actual contribution (up to 10% of basic), which this app does not yet track —
  // so we claim 0 rather than invent a figure (5W-PRINCIPLES: no fabricated values).
  it("returns 0 even when the member has personal NPS — employer NPS is not tracked yet", () => {
    const hh = emptyHH();
    hh.investments = [
      { id: "i1", type: "NPS", value: 200_000, ownerId: "self", monthlyContribution: 8_000 },
    ];
    const result = deriveDeductions(hh);
    expect(result.section80CCD2).toBe(0);
  });

  it("returns 0 when there is no NPS at all", () => {
    expect(deriveDeductions(emptyHH()).section80CCD2).toBe(0);
  });
});

describe("deriveDeductions — Sec 24 home loan interest", () => {
  it("caps at ₹2L for single borrower", () => {
    const hh = emptyHH();
    hh.liabilities = [{
      id: "l1",
      name: "Home Loan",
      type: "HomeLoan",
      outstandingBalance: 5_000_000,
      monthlyEMI: 50_000,
      interestRate: 8.0,
      ownerId: "self",
      isSharedWithSpouse: false,
    }];
    // interest = 50L * 0.08 = 4L; capped at 2L
    const result = deriveDeductions(hh);
    expect(result.section24).toBe(LIMIT_SECTION_24);
  });

  it("doubles cap when joint home loan with coBorrowers", () => {
    const hh = emptyHH();
    hh.liabilities = [{
      id: "l1",
      name: "Joint Home Loan",
      type: "HomeLoan",
      outstandingBalance: 5_000_000,
      monthlyEMI: 50_000,
      interestRate: 8.0,
      ownerId: "self",
      isSharedWithSpouse: true,
      coBorrowers: ["self", "spouse"],
    }];
    // interest = 4L; cap doubles to 4L; uses full interest
    const result = deriveDeductions(hh);
    expect(result.section24).toBe(400_000);
  });

  it("ignores non-home loans", () => {
    const hh = emptyHH();
    hh.liabilities = [{
      id: "l1",
      name: "Personal Loan",
      type: "PersonalLoan",
      outstandingBalance: 500_000,
      monthlyEMI: 15_000,
      interestRate: 14.0,
      ownerId: "self",
      isSharedWithSpouse: false,
    }];
    const result = deriveDeductions(hh);
    expect(result.section24).toBe(0);
  });
});

describe("deriveDeductions — 80D health insurance", () => {
  it("caps at ₹25k self when not senior", () => {
    const hh = emptyHH();
    hh.insurance = [
      { id: "p1", type: "Health", provider: "Star", sumAssured: 500_000, annualPremium: 30_000, insuredPersonId: "self" },
    ];
    const result = deriveDeductions(hh);
    expect(result.section80D).toBe(25_000);
  });

  it("caps at ₹50k self when senior flag set", () => {
    const hh = emptyHH();
    hh.insurance = [
      { id: "p1", type: "Health", provider: "Star", sumAssured: 500_000, annualPremium: 60_000, insuredPersonId: "self" },
    ];
    const result = deriveDeductions(hh, { isSelfSenior: true });
    expect(result.section80D).toBe(50_000);
  });
});

describe("deriveDeductions — totalDeductions aggregation", () => {
  it("sums all sections (audit Entry #12 A12.2)", () => {
    const hh = emptyHH();
    hh.investments = [
      { id: "i1", type: "PPF", value: 0, ownerId: "self", monthlyContribution: 12_500 }, // 1.5L = 80C cap
      { id: "i2", type: "NPS", value: 0, ownerId: "self", monthlyContribution: 5_000 }, // 60k > 50k cap
    ];
    hh.insurance = [
      { id: "p1", type: "Health", provider: "Star", sumAssured: 500_000, annualPremium: 25_000, insuredPersonId: "self" },
    ];
    const result = deriveDeductions(hh);
    expect(result.section80C).toBe(150_000);
    expect(result.section80CCD1B).toBe(50_000);
    expect(result.section80D).toBe(25_000);
    expect(result.totalDeductions).toBeGreaterThanOrEqual(225_000);
  });
});

describe("isInMarginalReliefBand", () => {
  it("FY 2025-26: 12.3L IS in band", () => {
    expect(isInMarginalReliefBand(1_230_000, "2025-26")).toBe(true);
  });

  it("FY 2025-26: 11.5L is NOT in band (below)", () => {
    expect(isInMarginalReliefBand(1_150_000, "2025-26")).toBe(false);
  });

  it("FY 2025-26: 13.5L is NOT in band (above)", () => {
    expect(isInMarginalReliefBand(1_350_000, "2025-26")).toBe(false);
  });

  // gh-issue #2 finding #4: relief stops at taxable ≈ ₹12,70,588 (60,000 / 0.85 over
  // ₹12L), not the previously-coded ₹12,75,000. Lock both edges of the true crossover.
  it("FY 2025-26: 12.70L is still in band (just below the ₹12,70,588 crossover)", () => {
    expect(isInMarginalReliefBand(1_270_000, "2025-26")).toBe(true);
  });

  it("FY 2025-26: 12.72L is NOT in band (above the ₹12,70,588 crossover)", () => {
    expect(isInMarginalReliefBand(1_272_000, "2025-26")).toBe(false);
  });

  it("FY 2026-27 inherits same band", () => {
    expect(isInMarginalReliefBand(1_250_000, "2026-27")).toBe(true);
  });

  it("FY 2024-25 has NO band (returns false even in same range)", () => {
    expect(isInMarginalReliefBand(1_230_000, "2024-25")).toBe(false);
  });
});

describe("marginalReliefMitigations", () => {
  it("returns suggestions when in band", () => {
    const m = marginalReliefMitigations(1_230_000, "2025-26");
    expect(m.length).toBeGreaterThanOrEqual(3);
    expect(m[0]).toContain("marginal-relief band");
  });

  it("returns empty array when not in band", () => {
    expect(marginalReliefMitigations(800_000, "2025-26")).toEqual([]);
    expect(marginalReliefMitigations(1_500_000, "2025-26")).toEqual([]);
  });
});
