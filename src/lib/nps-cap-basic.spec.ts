import { describe, it, expect } from "vitest";
import { deriveDeductions, computeEarnerTaxCard } from "./tax-deductions";
import { computeTax } from "./tax";
import { basicForNpsCap, resolveBasicAnnual } from "./salary-cash";
import type { Household, Member } from "@/types/household";

/**
 * gh #218 PR B fix round 1 — the 80CCD(2) employer-NPS cap with an UNRECORDED basic. The cap
 * reads 40% of CTC (lower basic ⇒ lower cap ⇒ tax never understated), not the EPF 50% base.
 * Fixture: CTC ₹20L, employer NPS ₹1.4L. No basic ⇒ basic ₹8L ⇒ New cap 14% = ₹1.12L,
 * Old private cap 10% = ₹80k. Recorded basic ₹10L ⇒ New ₹1.4L (the whole NPS), Old ₹1L.
 */
const FY = "2025-26";
const CTC = 2_000_000;
const NPS = 140_000;

function hhWith(member: Member): Household {
  return {
    name: "",
    setupMode: "Solo",
    profileComplete: false,
    wizardCompleted: false,
    members: [member],
    businesses: [],
    otherIncome: [],
    investments: [],
    liabilities: [],
    insurance: [],
    expenses: { avgMonthly: 0, recurring: [], plannedFuture: [] },
  };
}

function earner(basicAnnual?: number): Member {
  return {
    id: "a",
    name: "A",
    salary: { annualCTC: CTC, hikePercent: 8, employerNpsAnnual: NPS, ...(basicAnnual ? { basicAnnual } : {}) },
  } as Member;
}

/** The 80CCD(2) amount computeTax actually deducted, read as the taxable-income gap vs no NPS. */
function npsDeducted(member: Member, regime: "OLD" | "NEW"): number {
  const d = deriveDeductions(hhWith(member));
  const withNps = computeTax({ grossIncome: CTC, regime, fy: FY, employerNpsByMember: d.employerNpsByMember });
  const without = computeTax({ grossIncome: CTC, regime, fy: FY });
  return without.taxableIncome - withNps.taxableIncome;
}

describe("80CCD(2) cap basis — unrecorded basic falls back to 40% of CTC (gh #218)", () => {
  it("basicForNpsCap: stored basic wins; else 40% of CTC; the EPF base stays at 50%", () => {
    expect(basicForNpsCap({ annualCTC: CTC, basicAnnual: 1_000_000 })).toBe(1_000_000);
    expect(basicForNpsCap({ annualCTC: CTC })).toBe(800_000);
    expect(basicForNpsCap({ annualCTC: 0 })).toBe(0);
    expect(basicForNpsCap(undefined)).toBe(0);
    expect(resolveBasicAnnual({ annualCTC: CTC })).toBe(1_000_000);
  });

  it("deriveDeductions feeds the 40% basic into the per-member and household cap inputs", () => {
    const d = deriveDeductions(hhWith(earner()));
    expect(d.employerNpsByMember[0].basic).toBe(800_000);
    expect(d.employerNpsBasicTotal).toBe(800_000);
  });

  it("no recorded basic: New regime caps at 14% × ₹8L = ₹1.12L, Old private at 10% × ₹8L = ₹80k", () => {
    expect(npsDeducted(earner(), "NEW")).toBe(112_000);
    expect(npsDeducted(earner(), "OLD")).toBe(80_000);
  });

  it("recorded basic ₹10L: New allows the full ₹1.4L, Old private caps at ₹1L", () => {
    expect(npsDeducted(earner(1_000_000), "NEW")).toBe(140_000);
    expect(npsDeducted(earner(1_000_000), "OLD")).toBe(100_000);
  });

  it("the per-earner tax card applies the same 40% cap basis (tax-planning screen)", () => {
    const card = computeEarnerTaxCard(earner(), FY, 0, "NEW");
    const expected = computeTax({ grossIncome: CTC, regime: "NEW", fy: FY, employerNpsByMember: [{ nps: 112_000, basic: 0 }] });
    expect(card.tax).toBe(expected.totalTax);
    const uncapped = computeTax({ grossIncome: CTC, regime: "NEW", fy: FY, employerNpsByMember: [{ nps: NPS, basic: 0 }] });
    expect(card.tax).toBeGreaterThan(uncapped.totalTax);
  });
});
