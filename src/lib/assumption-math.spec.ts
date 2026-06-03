import { describe, it, expect } from "vitest";
import { blendPortfolioReturn, blendPortfolioVolatility, type PortfolioReturnWeights } from "@/lib/assumption-math";
import { RETURN_BUCKET_VOLATILITY } from "@/lib/monte-carlo";
import { DEFAULT_ASSUMPTIONS } from "@/types/assumptions";

const v = DEFAULT_ASSUMPTIONS;
const zero: PortfolioReturnWeights = {
  equity: 0, debt: 0, realEstate: 0, gold: 0, nps: 0, ppf: 0, epf: 0,
  international: 0, reit: 0, crypto: 0, other: 0,
};

describe("blendPortfolioReturn — Intl/REIT/Crypto first-class buckets (B-3)", () => {
  it("a crypto-heavy portfolio's blended return drops toward 0%", () => {
    const allEquity = blendPortfolioReturn(v, { ...zero, equity: 100 });
    const cryptoHeavy = blendPortfolioReturn(v, { ...zero, equity: 10, crypto: 90 });
    expect(allEquity).toBeCloseTo(v.equityReturn, 6);
    expect(cryptoHeavy).toBeLessThan(allEquity);
    // 90% at 0% + 10% at 12% → ~1.2%
    expect(cryptoHeavy).toBeCloseTo(0.012, 4);
  });

  it("an international-heavy portfolio tracks the international rate", () => {
    const intlHeavy = blendPortfolioReturn(v, { ...zero, international: 100 });
    expect(intlHeavy).toBeCloseTo(v.internationalReturn, 6); // 10%, not the debt-like 7%
  });

  it("a REIT-heavy portfolio tracks the REIT rate (~8%), not the old debt-like 7%", () => {
    const reitHeavy = blendPortfolioReturn(v, { ...zero, reit: 100 });
    expect(reitHeavy).toBeCloseTo(v.reitReturn, 6);
    expect(reitHeavy).not.toBeCloseTo(v.debtReturn, 6);
  });

  it("ESOP (still routed to 'other') remains debt-like", () => {
    const esopAsOther = blendPortfolioReturn(v, { ...zero, other: 100 });
    expect(esopAsOther).toBeCloseTo(v.debtReturn, 6);
  });
});

describe("blendPortfolioVolatility (#18) — value-weighted portfolio σ for the MC band", () => {
  it("an all-equity portfolio blends to the equity σ", () => {
    expect(blendPortfolioVolatility({ ...zero, equity: 100 })).toBeCloseTo(RETURN_BUCKET_VOLATILITY.equity, 6);
  });
  it("an all-PPF portfolio blends to the ~cash σ", () => {
    expect(blendPortfolioVolatility({ ...zero, ppf: 100 })).toBeCloseTo(RETURN_BUCKET_VOLATILITY.ppf, 6);
  });
  it("an empty portfolio defaults to equity σ — a not-yet-invested saver still bears risk", () => {
    expect(blendPortfolioVolatility(zero)).toBeCloseTo(RETURN_BUCKET_VOLATILITY.equity, 6);
  });
  it("value-weights buckets — a 50/50 equity/PPF split sits exactly between the two", () => {
    const mix = blendPortfolioVolatility({ ...zero, equity: 50, ppf: 50 });
    expect(mix).toBeGreaterThan(RETURN_BUCKET_VOLATILITY.ppf);
    expect(mix).toBeLessThan(RETURN_BUCKET_VOLATILITY.equity);
    expect(mix).toBeCloseTo((RETURN_BUCKET_VOLATILITY.equity + RETURN_BUCKET_VOLATILITY.ppf) / 2, 6);
  });
});
