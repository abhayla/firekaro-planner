import { describe, it, expect } from "vitest";
import {
  calculateNpsWithdrawal,
  suggestNpsCap,
  NPS_FULL_WITHDRAWAL_THRESHOLD,
} from "./nps-withdrawal";

// PFRDA 2025 exit rules: corpus ≤ ₹5L → 100% lump sum; corpus > ₹5L →
// 60% tax-free lump sum + 40% mandatory annuity (taxed at slab). Tests pin
// the threshold, the 60/40 split, the annuity income, and the cap heuristic.

describe("calculateNpsWithdrawal — below the ₹5L threshold", () => {
  it("returns the full corpus as a lump sum with no annuity", () => {
    const r = calculateNpsWithdrawal({ totalCorpus: 400_000 });
    expect(r.lumpSum).toBe(400_000);
    expect(r.annuityCorpus).toBe(0);
    expect(r.annuityIncomeAnnual).toBe(0);
    expect(r.isBelowThreshold).toBe(true);
  });

  it("treats exactly ₹5L as below-threshold (full withdrawal)", () => {
    const r = calculateNpsWithdrawal({ totalCorpus: NPS_FULL_WITHDRAWAL_THRESHOLD });
    expect(r.isBelowThreshold).toBe(true);
    expect(r.lumpSum).toBe(500_000);
  });
});

describe("calculateNpsWithdrawal — above the threshold", () => {
  it("splits 60% lump sum / 40% annuity and computes annuity income at 6%", () => {
    const r = calculateNpsWithdrawal({ totalCorpus: 10_000_000 });
    expect(r.lumpSum).toBe(6_000_000);
    expect(r.annuityCorpus).toBe(4_000_000);
    expect(r.annuityIncomeAnnual).toBe(240_000); // 4,000,000 * 0.06
    expect(r.isBelowThreshold).toBe(false);
  });

  it("honors a custom annuity rate", () => {
    const r = calculateNpsWithdrawal({ totalCorpus: 10_000_000, annuityRate: 0.065 });
    expect(r.annuityIncomeAnnual).toBe(260_000); // 4,000,000 * 0.065
  });

  it("splits just above the threshold too (no special-casing)", () => {
    const r = calculateNpsWithdrawal({ totalCorpus: 600_000 });
    expect(r.lumpSum).toBe(360_000);
    expect(r.annuityCorpus).toBe(240_000);
    expect(r.isBelowThreshold).toBe(false);
  });
});

describe("suggestNpsCap", () => {
  it("fires when projected corpus exceeds the 5-years-of-expenses-via-lump-sum cap", () => {
    // suggestedCap = (annualExpenses * 5) / 0.6 = (1,200,000*5)/0.6 = 10,000,000
    const r = suggestNpsCap(12_000_000, 1_200_000);
    expect(r.suggestedCap).toBe(10_000_000);
    expect(r.suggestCap).toBe(true);
    expect(r.reason).toMatch(/annuity/i);
  });

  it("does not fire when projected corpus is within the sweet spot", () => {
    const r = suggestNpsCap(8_000_000, 1_200_000);
    expect(r.suggestCap).toBe(false);
    expect(r.reason).toMatch(/sweet spot/i);
  });

  it("scales the cap with annual expenses", () => {
    const lean = suggestNpsCap(0, 600_000).suggestedCap; // (600000*5)/0.6 = 5,000,000
    const rich = suggestNpsCap(0, 2_400_000).suggestedCap; // (2,400,000*5)/0.6 = 20,000,000
    expect(lean).toBe(5_000_000);
    expect(rich).toBe(20_000_000);
  });
});
