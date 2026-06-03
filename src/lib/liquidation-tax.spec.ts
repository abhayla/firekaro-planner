/**
 * Phase B (#15 bridge) — post-tax liquidation.
 *
 * "Reachable money" is net of the tax owed on liquidating it (principle 2),
 * never the gross market value. Pins: tax-free instruments pass through
 * unchanged; capital assets haircut on the GAIN (12.5% equity over ₹1.25L /
 * 12.5% non-equity no-exemption / 30% VDA); the unknown-cost-basis path is
 * conservative + disclosed (principle 1); the ₹1.25L equity exemption is
 * shared across holdings (not granted per-asset).
 */
import { describe, it, expect } from "vitest";
import {
  postTaxLiquidation,
  ASSUMED_GAIN_FRACTION,
  CESS_RATE,
  type LiquidationContext,
} from "./liquidation-tax";
import { LTCG_LISTED_RATE, LTCG_LISTED_EXEMPTION } from "./esop-tax";

/** Mandatory 4% Health & Education cess multiplier applied to every tax figure. */
const CESS = 1 + CESS_RATE;
import type { Investment, InvestmentType } from "@/types/household";

function makeInv(type: InvestmentType, extras: Partial<Investment> = {}): Investment {
  return { id: `t-${type}`, type, value: 1_000_000, ownerId: "self", ...extras };
}

const ctx = (over: Partial<LiquidationContext> = {}): LiquidationContext => ({
  marginalSlabRate: 0.3,
  ...over,
});

describe("postTaxLiquidation — tax-free instruments pass through unchanged", () => {
  it.each(["EPF_VPF", "PPF", "NPS"] as InvestmentType[])(
    "%s → net equals gross, zero tax",
    (type) => {
      const r = postTaxLiquidation(makeInv(type), 4_000_000, ctx());
      expect(r.taxOwed).toBe(0);
      expect(r.net).toBe(4_000_000);
      expect(r.taxTreatment).toBe("tax-free");
      expect(r.equityExemptionUsed).toBe(0);
    },
  );

  it("FD passes through (interest taxed annually — no liquidation gain tax)", () => {
    const r = postTaxLiquidation(makeInv("FD"), 1_000_000, ctx());
    expect(r.taxOwed).toBe(0);
    expect(r.net).toBe(1_000_000);
    expect(r.taxTreatment).toBe("pass-through");
  });
});

describe("postTaxLiquidation — equity LTCG (12.5% over the shared ₹1.25L exemption)", () => {
  it("haircuts equity on the assumed gain, net of the ₹1.25L exemption + 4% cess", () => {
    const r = postTaxLiquidation(makeInv("Stocks"), 2_000_000, ctx());
    const expectedGain = 2_000_000 * ASSUMED_GAIN_FRACTION;
    const expectedTaxable = expectedGain - LTCG_LISTED_EXEMPTION;
    expect(r.taxOwed).toBe(Math.round(expectedTaxable * LTCG_LISTED_RATE * CESS));
    expect(r.net).toBe(2_000_000 - r.taxOwed);
    expect(r.taxTreatment).toBe("equity-ltcg");
    expect(r.assumption).toBeDefined(); // unknown cost basis disclosed
    expect(r.equityExemptionUsed).toBe(LTCG_LISTED_EXEMPTION);
  });

  it("LAW ANCHOR (absolute ₹): ₹20L equity → ₹1,65,750 tax (catches a rate/cess/exemption drift)", () => {
    // Hand-computed against current law: gain = ₹20L × 0.7 = ₹14L; taxable =
    // ₹14L − ₹1.25L = ₹12.75L; LTCG 12.5% = ₹1,59,375; +4% cess = ₹1,65,750.
    // This absolute figure breaks if the rate, exemption, cess, OR the gain
    // fraction silently changes — unlike the formula-mirror tests above.
    const r = postTaxLiquidation(makeInv("Stocks"), 2_000_000, ctx());
    expect(r.taxOwed).toBe(165_750);
    expect(r.net).toBe(2_000_000 - 165_750);
  });

  it("the unknown-basis gain fraction stays conservative for the accumulator (≥ 0.7)", () => {
    // Lock against a future 'lower it to 0.5' regression: a multi-decade equity
    // accumulator's holdings carry a 60-90% embedded gain, so under-assuming the
    // gain would over-state spendable net (the optimistic FIRE-date error).
    expect(ASSUMED_GAIN_FRACTION).toBeGreaterThanOrEqual(0.7);
  });

  it("MutualFunds + REIT + ESOP all route as equity LTCG", () => {
    for (const t of ["MutualFunds", "REIT", "ESOP"] as InvestmentType[]) {
      expect(postTaxLiquidation(makeInv(t), 2_000_000, ctx()).taxTreatment).toBe("equity-ltcg");
    }
  });

  it("consumes only the REMAINING shared exemption (not a fresh ₹1.25L per holding)", () => {
    // Second equity holding sees only ₹25,000 exemption left.
    const r = postTaxLiquidation(
      makeInv("Stocks"),
      2_000_000,
      ctx({ equityLtcgExemptionRemaining: 25_000 }),
    );
    const gain = 2_000_000 * ASSUMED_GAIN_FRACTION;
    expect(r.taxOwed).toBe(Math.round((gain - 25_000) * LTCG_LISTED_RATE * CESS));
    expect(r.equityExemptionUsed).toBe(25_000);
  });

  it("a tiny gain below the remaining exemption owes zero tax", () => {
    // ₹1.5L value × 0.7 = ₹1.05L gain < ₹1.25L exemption → no tax.
    const r = postTaxLiquidation(makeInv("Stocks"), 150_000, ctx());
    expect(r.taxOwed).toBe(0);
    expect(r.net).toBe(150_000);
    expect(r.equityExemptionUsed).toBe(105_000); // the gain consumed that much exemption
  });
});

describe("postTaxLiquidation — non-equity LTCG (12.5%, no exemption, no indexation)", () => {
  it.each(["Gold", "International", "RealEstate"] as InvestmentType[])(
    "%s → 12.5% on the assumed gain, no ₹1.25L exemption",
    (type) => {
      const r = postTaxLiquidation(makeInv(type), 2_000_000, ctx());
      const gain = 2_000_000 * ASSUMED_GAIN_FRACTION;
      expect(r.taxOwed).toBe(Math.round(gain * 0.125 * CESS));
      expect(r.taxTreatment).toBe("ltcg-no-exemption");
      expect(r.equityExemptionUsed).toBe(0); // does NOT touch the equity exemption
      expect(r.assumption).toBeDefined();
      // Discloses both the unknown basis AND that CII indexation is not modelled.
      expect(r.assumption!.assumed.toLowerCase()).toMatch(/gain|indexation|basis/);
    },
  );
});

describe("postTaxLiquidation — crypto / VDA flat 30%", () => {
  it("taxes the assumed gain at a flat 30% (no exemption, no set-off)", () => {
    const r = postTaxLiquidation(makeInv("Crypto"), 1_000_000, ctx());
    const gain = 1_000_000 * ASSUMED_GAIN_FRACTION;
    expect(r.taxOwed).toBe(Math.round(gain * 0.3 * CESS));
    expect(r.taxTreatment).toBe("vda-flat");
    expect(r.assumption).toBeDefined();
  });
});

describe("postTaxLiquidation — conservative + defensive", () => {
  it("a zero gross liquidation is a clean zero (illiquid property reaches here as 0)", () => {
    const r = postTaxLiquidation(makeInv("RealEstate"), 0, ctx());
    expect(r.net).toBe(0);
    expect(r.taxOwed).toBe(0);
  });

  it("guards a NaN gross to zero (defensive — pure lib)", () => {
    const r = postTaxLiquidation(makeInv("Stocks"), NaN, ctx());
    expect(r.net).toBe(0);
    expect(r.taxOwed).toBe(0);
  });

  it("never returns a net above the gross (tax is a haircut, never a credit)", () => {
    for (const t of ["Stocks", "Gold", "Crypto", "International"] as InvestmentType[]) {
      const r = postTaxLiquidation(makeInv(t), 5_000_000, ctx());
      expect(r.net).toBeLessThanOrEqual(5_000_000);
      expect(r.net).toBeGreaterThanOrEqual(0);
    }
  });

  it("is pure: same inputs → deep-equal result", () => {
    const inv = makeInv("Stocks");
    expect(postTaxLiquidation(inv, 2_000_000, ctx())).toEqual(
      postTaxLiquidation(inv, 2_000_000, ctx()),
    );
  });
});
