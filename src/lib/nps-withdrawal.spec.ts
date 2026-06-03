import { describe, it, expect } from "vitest";
import {
  calculateNpsWithdrawal,
  suggestNpsCap,
  postTaxAnnuityIncome,
  NPS_FULL_WITHDRAWAL_THRESHOLD,
  NPS_EARLY_EXIT_THRESHOLD,
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
    // A2 (#7): no annuity below the threshold → nothing slab-taxable.
    expect(r.annuityIncomeTaxable).toBe(false);
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
    // A2 (#7): the annuity income is slab-taxable each year (only the 60% lump
    // sum is tax-free). The marker forbids any consumer treating it as net.
    expect(r.annuityIncomeTaxable).toBe(true);
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

describe("calculateNpsWithdrawal — early exit (premature, before 60)", () => {
  // PFRDA premature-exit rules (exit before 60): corpus ≤ ₹2.5L → 100% lump;
  // corpus > ₹2.5L → 20% lump (tax-free) + 80% MANDATORY annuity (slab-taxed).
  // The accumulation bridge (#15) needs this for the salaried accumulator who
  // retires at, e.g., 47 and cannot take the normal 60/40 NPS exit.
  it("returns the full corpus as lump below the ₹2.5L early-exit threshold", () => {
    const r = calculateNpsWithdrawal({ totalCorpus: 200_000, exitType: "early" });
    expect(r.lumpSum).toBe(200_000);
    expect(r.annuityCorpus).toBe(0);
    expect(r.annuityIncomeAnnual).toBe(0);
    expect(r.isBelowThreshold).toBe(true);
    expect(r.annuityIncomeTaxable).toBe(false);
  });

  it("treats exactly ₹2.5L as below the early-exit threshold (full lump)", () => {
    const r = calculateNpsWithdrawal({ totalCorpus: NPS_EARLY_EXIT_THRESHOLD, exitType: "early" });
    expect(r.isBelowThreshold).toBe(true);
    expect(r.lumpSum).toBe(250_000);
  });

  it("splits 20% lump / 80% annuity above ₹2.5L on early exit", () => {
    const r = calculateNpsWithdrawal({ totalCorpus: 10_000_000, exitType: "early" });
    expect(r.lumpSum).toBe(2_000_000); // 20%
    expect(r.annuityCorpus).toBe(8_000_000); // 80%
    expect(r.annuityIncomeAnnual).toBe(480_000); // 8,000,000 * 0.06
    expect(r.isBelowThreshold).toBe(false);
    expect(r.annuityIncomeTaxable).toBe(true);
  });

  it("early exit annuitises FAR more than normal exit (conservative: less cash now)", () => {
    const normal = calculateNpsWithdrawal({ totalCorpus: 10_000_000 });
    const early = calculateNpsWithdrawal({ totalCorpus: 10_000_000, exitType: "early" });
    // Touching NPS before 60 strands 80% in an annuity vs 40% at/after 60 — the
    // honest, conservative direction for an early-retiring accumulator.
    expect(early.lumpSum).toBeLessThan(normal.lumpSum);
    expect(early.annuityCorpus).toBeGreaterThan(normal.annuityCorpus);
  });

  it("defaults to normal exit (exitType absent) — byte-identical to before", () => {
    const a = calculateNpsWithdrawal({ totalCorpus: 10_000_000 });
    const b = calculateNpsWithdrawal({ totalCorpus: 10_000_000, exitType: "normal" });
    expect(a).toEqual(b);
    expect(a.lumpSum).toBe(6_000_000);
  });
});

describe("postTaxAnnuityIncome (A2 — annuity is slab-taxable, #7)", () => {
  it("haircuts the gross annuity by the marginal slab rate", () => {
    // ₹2.4L gross annuity at a 30% retirement slab → ₹1.68L net.
    expect(postTaxAnnuityIncome(240_000, 0.3)).toBe(168_000);
  });

  it("returns the gross amount at a 0% rate (annuity below the exemption)", () => {
    expect(postTaxAnnuityIncome(120_000, 0)).toBe(120_000);
  });

  it("clamps a nonsensical rate into [0,1] (defensive)", () => {
    expect(postTaxAnnuityIncome(100_000, -0.5)).toBe(100_000);
    expect(postTaxAnnuityIncome(100_000, 2)).toBe(0);
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
