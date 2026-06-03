import { describe, it, expect } from "vitest";
import {
  liquidity,
  expectedReturn,
  taxBucket,
  inflationRoute,
  assetClass,
  accessibilityClass,
  isEmergencyFundEligible,
  returnBucketKey,
  typeLabel,
  accumulationRule,
  withdrawalRule,
  type ReturnAssumptions,
} from "./investment-traits";
import type { Investment, InvestmentType } from "@/types/household";

function makeInv(type: InvestmentType, extras: Partial<Investment> = {}): Investment {
  return {
    id: `t-${type}`,
    type,
    value: 100000,
    ownerId: "self",
    ...extras,
  };
}

const defaultAssumptions: ReturnAssumptions = {
  equityReturn: 0.11,
  debtReturn: 0.07,
  realEstateReturn: 0.07,
  goldReturn: 0.08,
  npsReturn: 0.09,
  ppfReturn: 0.071,
  epfReturn: 0.0825,
};

describe("accessibilityClass (#15 bridge partition)", () => {
  it("liquid for sellable instruments incl. FD/Gold/ESOP", () => {
    for (const t of ["Stocks", "MutualFunds", "FD", "Gold", "Crypto", "International", "REIT", "ESOP"] as InvestmentType[]) {
      expect(accessibilityClass(makeInv(t))).toBe("liquid");
    }
  });
  it("routes the locked retirement vehicles to their own classes", () => {
    expect(accessibilityClass(makeInv("EPF_VPF"))).toBe("epf");
    expect(accessibilityClass(makeInv("PPF"))).toBe("ppf");
    expect(accessibilityClass(makeInv("NPS"))).toBe("nps");
    expect(accessibilityClass(makeInv("RealEstate"))).toBe("realEstate");
  });
});

describe("liquidity", () => {
  it("liquid for Stocks/MF/REIT/International/Crypto", () => {
    expect(liquidity(makeInv("Stocks"))).toBe("liquid");
    expect(liquidity(makeInv("MutualFunds"))).toBe("liquid");
    expect(liquidity(makeInv("REIT"))).toBe("liquid");
    expect(liquidity(makeInv("International"))).toBe("liquid");
    expect(liquidity(makeInv("Crypto"))).toBe("liquid");
  });

  it("Gold liquidity depends on subtype", () => {
    expect(liquidity(makeInv("Gold", { subtype: "ETF" }))).toBe("liquid");
    expect(liquidity(makeInv("Gold", { subtype: "SGB" }))).toBe("liquid");
    expect(liquidity(makeInv("Gold", { subtype: "Physical" }))).toBe("moderate");
  });

  it("moderate for FD / PPF / NPS / EPF_VPF (breakable with penalty or lock)", () => {
    expect(liquidity(makeInv("FD"))).toBe("moderate");
    expect(liquidity(makeInv("PPF"))).toBe("moderate");
    expect(liquidity(makeInv("NPS"))).toBe("moderate");
    expect(liquidity(makeInv("EPF_VPF"))).toBe("moderate");
  });

  it("illiquid for RealEstate / ESOP", () => {
    expect(liquidity(makeInv("RealEstate"))).toBe("illiquid");
    expect(liquidity(makeInv("ESOP"))).toBe("illiquid");
  });
});

describe("expectedReturn", () => {
  it("Stocks/MF/ESOP use equityReturn", () => {
    expect(expectedReturn(makeInv("Stocks"), defaultAssumptions)).toBe(0.11);
    expect(expectedReturn(makeInv("MutualFunds"), defaultAssumptions)).toBe(0.11);
    expect(expectedReturn(makeInv("ESOP"), defaultAssumptions)).toBe(0.11);
  });

  it("per-type retirement rates are wired", () => {
    expect(expectedReturn(makeInv("PPF"), defaultAssumptions)).toBe(0.071);
    expect(expectedReturn(makeInv("NPS"), defaultAssumptions)).toBe(0.09);
    expect(expectedReturn(makeInv("EPF_VPF"), defaultAssumptions)).toBe(0.0825);
  });

  it("International falls back to equityReturn - 2pp when not overridden", () => {
    const r = expectedReturn(makeInv("International"), defaultAssumptions);
    expect(r).toBeCloseTo(0.09, 6);
  });

  it("International uses internationalReturn when set", () => {
    const r = expectedReturn(makeInv("International"), {
      ...defaultAssumptions,
      internationalReturn: 0.085,
    });
    expect(r).toBe(0.085);
  });

  it("REIT default = 0.08 when reitReturn not set", () => {
    expect(expectedReturn(makeInv("REIT"), defaultAssumptions)).toBe(0.08);
  });

  it("FD falls back to debtReturn when fdReturn not set", () => {
    expect(expectedReturn(makeInv("FD"), defaultAssumptions)).toBe(0.07);
  });

  it("Crypto default = 0.08", () => {
    expect(expectedReturn(makeInv("Crypto"), defaultAssumptions)).toBe(0.08);
  });
});

describe("taxBucket", () => {
  it("PPF + EPF_VPF = EEE", () => {
    expect(taxBucket(makeInv("PPF"))).toBe("EEE");
    expect(taxBucket(makeInv("EPF_VPF"))).toBe("EEE");
  });
  it("NPS = EET", () => {
    expect(taxBucket(makeInv("NPS"))).toBe("EET");
  });
  it("equity + REIT + International + slab-class = slab", () => {
    expect(taxBucket(makeInv("Stocks"))).toBe("slab");
    expect(taxBucket(makeInv("MutualFunds"))).toBe("slab");
    expect(taxBucket(makeInv("ESOP"))).toBe("slab");
    expect(taxBucket(makeInv("REIT"))).toBe("slab");
    expect(taxBucket(makeInv("International"))).toBe("slab");
    expect(taxBucket(makeInv("FD"))).toBe("slab");
    expect(taxBucket(makeInv("Crypto"))).toBe("slab");
    expect(taxBucket(makeInv("Gold"))).toBe("slab");
    expect(taxBucket(makeInv("RealEstate"))).toBe("slab");
  });
});

describe("inflationRoute", () => {
  it("RealEstate routes to housing", () => {
    expect(inflationRoute(makeInv("RealEstate"))).toBe("housing");
  });
  it("All other types route to general", () => {
    expect(inflationRoute(makeInv("Stocks"))).toBe("general");
    expect(inflationRoute(makeInv("PPF"))).toBe("general");
    expect(inflationRoute(makeInv("Gold"))).toBe("general");
    expect(inflationRoute(makeInv("International"))).toBe("general");
    expect(inflationRoute(makeInv("REIT"))).toBe("general");
  });
});

describe("assetClass", () => {
  it("equity bin: Stocks, MutualFunds, ESOP, International", () => {
    expect(assetClass(makeInv("Stocks"))).toBe("equity");
    expect(assetClass(makeInv("MutualFunds"))).toBe("equity");
    expect(assetClass(makeInv("ESOP"))).toBe("equity");
    expect(assetClass(makeInv("International"))).toBe("equity");
  });
  it("debt bin: PPF, NPS, EPF_VPF, FD", () => {
    expect(assetClass(makeInv("PPF"))).toBe("debt");
    expect(assetClass(makeInv("NPS"))).toBe("debt");
    expect(assetClass(makeInv("EPF_VPF"))).toBe("debt");
    expect(assetClass(makeInv("FD"))).toBe("debt");
  });
  it("RealEstate / Gold / alternative bins", () => {
    expect(assetClass(makeInv("RealEstate"))).toBe("realEstate");
    expect(assetClass(makeInv("Gold"))).toBe("gold");
    expect(assetClass(makeInv("REIT"))).toBe("alternative");
    expect(assetClass(makeInv("Crypto"))).toBe("alternative");
  });
});

describe("isEmergencyFundEligible", () => {
  it("FD eligible (v4-faithful)", () => {
    expect(isEmergencyFundEligible(makeInv("FD"))).toBe(true);
  });
  it("Crypto eligible (v4-faithful — to be refined in Phase 4 Stage M)", () => {
    expect(isEmergencyFundEligible(makeInv("Crypto"))).toBe(true);
  });
  it("Other types not eligible", () => {
    expect(isEmergencyFundEligible(makeInv("Stocks"))).toBe(false);
    expect(isEmergencyFundEligible(makeInv("MutualFunds"))).toBe(false);
    expect(isEmergencyFundEligible(makeInv("PPF"))).toBe(false);
    expect(isEmergencyFundEligible(makeInv("REIT"))).toBe(false);
  });
});

describe("returnBucketKey", () => {
  it("routes to the 8-bucket assumption store keys", () => {
    expect(returnBucketKey(makeInv("Stocks"))).toBe("equity");
    expect(returnBucketKey(makeInv("MutualFunds"))).toBe("equity");
    expect(returnBucketKey(makeInv("FD"))).toBe("debt");
    expect(returnBucketKey(makeInv("PPF"))).toBe("ppf");
    expect(returnBucketKey(makeInv("EPF_VPF"))).toBe("epf");
    expect(returnBucketKey(makeInv("NPS"))).toBe("nps");
    expect(returnBucketKey(makeInv("RealEstate"))).toBe("realEstate");
    expect(returnBucketKey(makeInv("Gold"))).toBe("gold");
  });
  it("B-3 — Intl/REIT/Crypto get first-class buckets; ESOP stays 'other'", () => {
    expect(returnBucketKey(makeInv("Crypto"))).toBe("crypto");
    expect(returnBucketKey(makeInv("International"))).toBe("international");
    expect(returnBucketKey(makeInv("REIT"))).toBe("reit");
    expect(returnBucketKey(makeInv("ESOP"))).toBe("other");
  });
});

describe("typeLabel", () => {
  it("returns user-facing strings for all 12 types", () => {
    expect(typeLabel("Stocks")).toBe("Stocks");
    expect(typeLabel("MutualFunds")).toBe("Mutual Funds");
    expect(typeLabel("PPF")).toBe("PPF");
    expect(typeLabel("NPS")).toBe("NPS");
    expect(typeLabel("RealEstate")).toBe("Real Estate");
    expect(typeLabel("Gold")).toBe("Gold");
    expect(typeLabel("FD")).toBe("Fixed Deposit");
    expect(typeLabel("Crypto")).toBe("Crypto");
    expect(typeLabel("EPF_VPF")).toBe("EPF / VPF");
    expect(typeLabel("ESOP")).toBe("ESOP");
    expect(typeLabel("International")).toBe("International Equity");
    expect(typeLabel("REIT")).toBe("REIT");
  });
});

describe("accumulationRule / withdrawalRule (Phase 0 stubs)", () => {
  it("accumulationRule returns Phase 2 stub", () => {
    const r = accumulationRule(makeInv("PPF"));
    expect(r.kind).toBe("stub-phase-2");
    expect(r.description).toContain("Phase 2 Stage C");
  });
  it("withdrawalRule returns Phase 2 stub", () => {
    const r = withdrawalRule(makeInv("PPF"));
    expect(r.kind).toBe("stub-phase-2");
    expect(r.description).toContain("Phase 2 Stage C");
  });
});
