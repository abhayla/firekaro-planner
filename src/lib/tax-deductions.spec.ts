import { describe, it, expect } from "vitest";
import {
  deriveDeductions,
  deductionsForMember,
  isInMarginalReliefBand,
  marginalReliefMitigations,
  LIMIT_80C,
  LIMIT_80D_SELF,
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

  // gh-issue #2 finding #2: 80CCD(2) is now sourced from the actual employer-NPS
  // contribution entered per member, summed across the household.
  it("sums members' salary.employerNpsAnnual into section80CCD2", () => {
    const hh = emptyHH();
    hh.members = [
      { id: "a", salary: { annualCTC: 2_000_000, hikePercent: 8, employerNpsAnnual: 120_000 } },
      { id: "b", salary: { annualCTC: 1_500_000, hikePercent: 8, employerNpsAnnual: 80_000 } },
    ] as Household["members"];
    expect(deriveDeductions(hh).section80CCD2).toBe(200_000);
  });

  it("sums members' basicAnnual into employerNpsBasicTotal (gh-issue #3 — drives the cap)", () => {
    const hh = emptyHH();
    hh.members = [
      { id: "a", salary: { annualCTC: 2_000_000, hikePercent: 8, basicAnnual: 800_000 } },
      { id: "b", salary: { annualCTC: 1_500_000, hikePercent: 8, basicAnnual: 600_000 } },
    ] as Household["members"];
    expect(deriveDeductions(hh).employerNpsBasicTotal).toBe(1_400_000);
  });

  it("propagates Member.salary.employerSector into employerNpsByMember[].sector (gh-issue #4)", () => {
    const hh = emptyHH();
    hh.members = [
      { id: "a", salary: { annualCTC: 2_000_000, hikePercent: 8, employerNpsAnnual: 140_000, basicAnnual: 1_000_000, employerSector: "government" } },
      { id: "b", salary: { annualCTC: 1_500_000, hikePercent: 8, employerNpsAnnual: 80_000, basicAnnual: 600_000 } },
    ] as Household["members"];
    const byMember = deriveDeductions(hh).employerNpsByMember;
    expect(byMember.find((m) => m.nps === 140_000)?.sector).toBe("government");
    expect(byMember.find((m) => m.nps === 80_000)?.sector).toBe("private"); // omitted ⇒ private default
  });

  it("EXCLUDES section80CCD2 from totalDeductions (it is applied separately in both regimes)", () => {
    const hh = emptyHH();
    hh.members = [
      { id: "a", salary: { annualCTC: 2_000_000, hikePercent: 8, employerNpsAnnual: 120_000 } },
    ] as Household["members"];
    hh.investments = [
      { id: "i1", type: "PPF", value: 0, ownerId: "a", monthlyContribution: 12_500 }, // 1.5L → 80C max
    ];
    const r = deriveDeductions(hh);
    expect(r.section80CCD2).toBe(120_000);
    // totalDeductions = 80C only (150k); 80CCD(2) is NOT folded in.
    expect(r.totalDeductions).toBe(150_000);
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

  // gh-issue #2 finding #3 (Abhay's NISM-XV ruling, 2026-06-01): a joint loan only
  // doubles the Sec 24 cap to ₹4L when ≥2 co-borrowers are TRACKED members of this
  // household (their income is in the same computation). A single filer whose spouse
  // is not a tracked member claims only their own ₹2L share.
  it("caps at the filer's ₹2L share when co-borrowers are NOT tracked members", () => {
    const hh = emptyHH(); // members: []
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
    // interest = 4L, but neither co-borrower is a tracked member → only the ₹2L share.
    const result = deriveDeductions(hh);
    expect(result.section24).toBe(LIMIT_SECTION_24);
  });

  it("doubles to ₹4L only when ≥2 co-borrowers are tracked household members", () => {
    const hh = emptyHH();
    // Only `id` is read by deriveDeductions; cast a minimal member array.
    hh.members = [{ id: "ashwin" }, { id: "lakshmi" }] as Household["members"];
    hh.liabilities = [{
      id: "l1",
      name: "Joint Home Loan",
      type: "HomeLoan",
      outstandingBalance: 5_000_000,
      monthlyEMI: 50_000,
      interestRate: 8.0,
      ownerId: "ashwin",
      isSharedWithSpouse: true,
      coBorrowers: ["ashwin", "lakshmi"],
    }];
    // interest = 4L; both co-borrowers tracked → cap doubles to 4L.
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

  // gh #38: a commercial / business-property (shop) loan is NOT a residential house
  // property, so its interest must NOT receive the §24(b) ₹2L residential deduction.
  // Before the dedicated type existed, such a loan had to be filed as "HomeLoan" and
  // wrongly claimed ₹2L → optimistic tax understatement. A CommercialPropertyLoan must
  // contribute ₹0 to section24 even with large interest. (The legitimate §36(1)(iii)
  // business-interest deduction needs business-income modelling — out of scope here.)
  it("gh #38: a commercial/business-property loan gets ₹0 §24(b) (no phantom residential deduction)", () => {
    const hh = emptyHH();
    hh.liabilities = [{
      id: "l1",
      name: "Shop Loan",
      type: "CommercialPropertyLoan",
      outstandingBalance: 5_000_000,
      monthlyEMI: 50_000,
      interestRate: 11.0, // interest ≈ 5.5L — would be capped to ₹2L IF wrongly treated as a home loan
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

  it("routes a parent's health policy to the 80D parents bucket (gh-issue #6 — was hard-0)", () => {
    const hh = emptyHH();
    hh.members = [
      { id: "self", relation: "" },
      { id: "dad", relation: "Father" },
    ] as Household["members"];
    hh.insurance = [
      { id: "p1", type: "Health", provider: "Star", sumAssured: 500_000, annualPremium: 20_000, insuredPersonId: "self" },
      { id: "p2", type: "Health", provider: "Niva", sumAssured: 500_000, annualPremium: 30_000, insuredPersonId: "dad" },
    ];
    // self ₹20k (≤₹25k cap) + parents min(₹25k, ₹30k) = ₹25k → ₹45k
    expect(deriveDeductions(hh).section80D).toBe(45_000);
  });

  it("auto-detects senior parents from age — 65+ parent gets the ₹50k cap with no explicit flag (gh-issue #6)", () => {
    const hh = emptyHH();
    hh.members = [{ id: "mom", relation: "Mother", dateOfBirth: "1958-06-01" }] as Household["members"];
    hh.insurance = [
      { id: "p1", type: "Health", provider: "Niva", sumAssured: 500_000, annualPremium: 45_000, insuredPersonId: "mom" },
    ];
    // ~68yo parent → senior 80D cap ₹50k → full ₹45k (without auto-detect it would cap at ₹25k).
    expect(deriveDeductions(hh).section80D).toBe(45_000);
  });

  it("parents bucket honours the senior cap when hasSeniorParents is set", () => {
    const hh = emptyHH();
    hh.members = [{ id: "mom", relation: "Mother" }] as Household["members"];
    hh.insurance = [
      { id: "p1", type: "Health", provider: "Niva", sumAssured: 500_000, annualPremium: 45_000, insuredPersonId: "mom" },
    ];
    // parents senior cap ₹50k → full ₹45k; self bucket empty
    expect(deriveDeductions(hh, { hasSeniorParents: true }).section80D).toBe(45_000);
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

// gh #204 — a Joint-owned 80C/80D/§24 source is attributed to EACH earner by
// householdSplitPercent, then each earner's totalDeductions is capped INDEPENDENTLY. Before this
// fix, `ownerId === memberId`-only filtering at every per-member call site dropped a Joint source
// from BOTH earners.
describe("deductionsForMember — #204 Joint-owned 80C/80D/§24 attribution", () => {
  function twoEarnerHH(): Household {
    return {
      name: "",
      setupMode: "Couple",
      profileComplete: false,
      wizardCompleted: false,
      members: [
        { id: "a", name: "A", role: "ADULT", dateOfBirth: "1985-01-01" } as Household["members"][number],
        { id: "b", name: "B", role: "ADULT", dateOfBirth: "1986-01-01" } as Household["members"][number],
      ],
      businesses: [],
      otherIncome: [],
      investments: [],
      liabilities: [],
      insurance: [],
      expenses: { avgMonthly: 0, recurring: [], plannedFuture: [] },
    };
  }

  it("a Joint PPF (80C) and a Joint family-floater premium (80D) split 50/50, summing to the household's claim", () => {
    const hh = twoEarnerHH();
    hh.investments = [
      { id: "i1", type: "PPF", value: 0, ownerId: "Joint", monthlyContribution: 10_000 }, // 1.2L/yr
    ];
    hh.insurance = [
      { id: "p1", type: "Health", provider: "Star Family Floater", sumAssured: 0, annualPremium: 40_000, insuredPersonId: "a" },
    ];

    const a = deductionsForMember(hh, "a", 50);
    const b = deductionsForMember(hh, "b", 50);

    // 80C: 1.2L Joint PPF × 50% = 60k each.
    expect(a.section80C).toBe(60_000);
    expect(b.section80C).toBe(60_000);
    expect(a.section80C + b.section80C).toBe(120_000); // sums to the household's true 80C claim

    // 80D: insurance has NO "Joint" sentinel in this schema (insuredPersonId is always a member
    // id) — the ₹40k floater is A's own policy, so only A claims it. This is the honest answer:
    // there is no Joint-insurance CLASS to split until the schema grows one.
    expect(a.section80D).toBe(Math.min(LIMIT_80D_SELF, 40_000));
    expect(b.section80D).toBe(0);
  });

  it("a Joint ₹4L PPF caps EACH earner's 80C share at ₹1.5L independently (never ₹2L, never pooled to ₹3L)", () => {
    const hh = twoEarnerHH();
    hh.investments = [
      { id: "i1", type: "PPF", value: 0, ownerId: "Joint", monthlyContribution: 400_000 / 12 }, // ≈4L/yr
    ];
    const a = deductionsForMember(hh, "a", 50);
    const b = deductionsForMember(hh, "b", 50);
    // Each earner's raw share is ~2L (half of 4L) — over the ₹1.5L 80C cap, so each caps
    // independently at 1.5L, never at a doubled 2L, and the two shares never pool into one 3L claim.
    expect(a.section80C).toBe(LIMIT_80C);
    expect(b.section80C).toBe(LIMIT_80C);
  });

  // Round 3 (#204 review CRITICAL finding): a Joint 80C share must be COMPLEMENTARY across the two
  // adults — the anchor (first earning adult in member order; here neither "a" nor "b" earns, so
  // `deductionsForMember` falls back to the first adult, "a") gets `split`, the OTHER gets
  // `1 − split`. Before this fix both calls read the same `split`, so at split=60 A+B claimed
  // ₹1.44L on a ₹1.2L PPF — ₹24k nobody contributed.
  it("Joint PPF ₹1.2L at split=60: anchor A gets 60% (₹72k), B gets the complementary 40% (₹48k), summing to ₹1.2L", () => {
    const hh = twoEarnerHH();
    hh.investments = [
      { id: "i1", type: "PPF", value: 0, ownerId: "Joint", monthlyContribution: 10_000 }, // 1.2L/yr
    ];
    const a = deductionsForMember(hh, "a", 60);
    const b = deductionsForMember(hh, "b", 60);
    expect(a.section80C).toBe(72_000);
    expect(b.section80C).toBe(48_000);
    expect(a.section80C + b.section80C).toBe(120_000);
  });

  it("Joint PPF ₹1.2L at split=50 is unchanged (50% each, as before round 3)", () => {
    const hh = twoEarnerHH();
    hh.investments = [
      { id: "i1", type: "PPF", value: 0, ownerId: "Joint", monthlyContribution: 10_000 }, // 1.2L/yr
    ];
    const a = deductionsForMember(hh, "a", 50);
    const b = deductionsForMember(hh, "b", 50);
    expect(a.section80C).toBe(60_000);
    expect(b.section80C).toBe(60_000);
  });

  it("Joint PPF ₹4L at 60/40 split: A's 60% share (₹2.4L) caps at ₹1.5L, B's 40% share (₹1.6L) caps at ₹1.5L, summing to ₹3L", () => {
    const hh = twoEarnerHH();
    hh.investments = [
      { id: "i1", type: "PPF", value: 0, ownerId: "Joint", monthlyContribution: 400_000 / 12 }, // 4L/yr
    ];
    const a = deductionsForMember(hh, "a", 60);
    const b = deductionsForMember(hh, "b", 60);
    expect(a.section80C).toBe(LIMIT_80C); // 2.4L raw → capped 1.5L
    expect(b.section80C).toBe(LIMIT_80C); // 1.6L raw → capped 1.5L
    expect(a.section80C + b.section80C).toBe(300_000);
  });

  it("a single-adult household claims 100% of a Joint 80C source (no one else to split with)", () => {
    const hh = twoEarnerHH();
    hh.members = [hh.members[0]];
    hh.investments = [
      { id: "i1", type: "PPF", value: 0, ownerId: "Joint", monthlyContribution: 10_000 }, // 1.2L/yr
    ];
    const a = deductionsForMember(hh, "a", 60);
    expect(a.section80C).toBe(120_000);
  });

  // Round 2 (#204 review finding): a shared home loan is a PAYMENT split, not an ownership split.
  // Each co-borrower claims ONLY their own share of the interest, each capped at the per-assessee
  // ₹2L — the shares must sum to the interest actually paid, never more (the round-1 fixture was
  // an OVER-claim: owner ₹4L + spouse ₹2L = ₹6L on ₹4L of interest paid).
  function sharedHomeLoan(interestRate: number): Household["liabilities"][number] {
    return {
      id: "l1",
      name: "Joint Home Loan",
      type: "HomeLoan",
      outstandingBalance: 5_000_000,
      monthlyEMI: 50_000,
      interestRate, // interest = outstandingBalance × interestRate / 100
      ownerId: "a",
      isSharedWithSpouse: true,
      coBorrowers: ["a", "b"],
    };
  }

  it("shared ₹4L interest: each co-borrower's own share is already ≥ ₹2L → both cap at ₹2L, summing to ₹4L (never ₹6L)", () => {
    const hh = twoEarnerHH();
    hh.liabilities = [sharedHomeLoan(8.0)]; // 50L × 8% = 4L interest; 50/50 share = 2L each
    const a = deductionsForMember(hh, "a", 50);
    const b = deductionsForMember(hh, "b", 50);
    expect(a.section24).toBe(200_000);
    expect(b.section24).toBe(200_000);
    expect(a.section24 + b.section24).toBe(400_000); // sums to interest paid, never doubled to 6L
    expect(a.section24 + b.section24).toBeLessThanOrEqual(Math.min(400_000, 2 * LIMIT_SECTION_24));
  });

  it("shared ₹3L interest: each co-borrower's share (₹1.5L) is under the ₹2L cap → claims their real share", () => {
    const hh = twoEarnerHH();
    hh.liabilities = [sharedHomeLoan(6.0)]; // 50L × 6% = 3L interest; 50/50 share = 1.5L each
    const a = deductionsForMember(hh, "a", 50);
    const b = deductionsForMember(hh, "b", 50);
    expect(a.section24).toBe(150_000);
    expect(b.section24).toBe(150_000);
    expect(a.section24 + b.section24).toBe(300_000);
    expect(a.section24 + b.section24).toBeLessThanOrEqual(Math.min(300_000, 2 * LIMIT_SECTION_24));
  });

  it("shared ₹5L interest: each co-borrower's share (₹2.5L) exceeds ₹2L → both cap at ₹2L, summing to ₹4L, never ₹5L", () => {
    const hh = twoEarnerHH();
    hh.liabilities = [sharedHomeLoan(10.0)]; // 50L × 10% = 5L interest; 50/50 share = 2.5L each
    const a = deductionsForMember(hh, "a", 50);
    const b = deductionsForMember(hh, "b", 50);
    expect(a.section24).toBe(200_000);
    expect(b.section24).toBe(200_000);
    expect(a.section24 + b.section24).toBe(400_000); // capped sum < actual 5L interest paid
    expect(a.section24 + b.section24).toBeLessThanOrEqual(Math.min(500_000, 2 * LIMIT_SECTION_24));
  });

  it("a NON-shared home loan is 100% the owner's, 0% the spouse's, capped at ₹2L", () => {
    const hh = twoEarnerHH();
    hh.liabilities = [
      {
        id: "l2",
        name: "Solo Home Loan",
        type: "HomeLoan",
        outstandingBalance: 5_000_000,
        monthlyEMI: 50_000,
        interestRate: 8.0, // 4L interest
        ownerId: "a",
        isSharedWithSpouse: false,
      },
    ];
    const a = deductionsForMember(hh, "a", 50);
    const b = deductionsForMember(hh, "b", 50);
    expect(a.section24).toBe(LIMIT_SECTION_24);
    expect(b.section24).toBe(0);
  });

  it("own-owned sources are UNCHANGED — a member's own PPF/health/loan still yields exactly its own value", () => {
    const hh = twoEarnerHH();
    hh.investments = [{ id: "i1", type: "PPF", value: 0, ownerId: "a", monthlyContribution: 5_000 }]; // 60k/yr
    hh.insurance = [
      { id: "p1", type: "Health", provider: "X", sumAssured: 0, annualPremium: 15_000, insuredPersonId: "a" },
    ];
    const a = deductionsForMember(hh, "a", 50);
    const b = deductionsForMember(hh, "b", 50);
    expect(a.section80C).toBe(60_000);
    expect(a.section80D).toBe(15_000);
    expect(b.section80C).toBe(0);
    expect(b.section80D).toBe(0);
  });

  it("a household with NO Joint 80C/80D/§24 source is byte-identical to the pre-fix own-only filter", () => {
    const hh = twoEarnerHH();
    hh.investments = [
      { id: "i1", type: "Gold", value: 100_000, ownerId: "Joint" }, // Joint but not 80C-eligible
    ];
    hh.liabilities = [
      { id: "l1", name: "Car Loan", type: "CarLoan", outstandingBalance: 300_000, monthlyEMI: 8_000, interestRate: 9, ownerId: "a", isSharedWithSpouse: false },
    ];
    const a = deductionsForMember(hh, "a", 50);
    const b = deductionsForMember(hh, "b", 50);
    expect(a.totalDeductions).toBe(0);
    expect(b.totalDeductions).toBe(0);
  });
});
