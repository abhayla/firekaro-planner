import { describe, it, expect } from "vitest";
import {
  computeTax,
  recommendRegime,
  marginalSlabRate,
  getTaxConfigForFY,
  oldRegimeSlabsForAge,
  type TaxSlabEntry,
} from "./tax";

describe("computeTax — New Regime FY 2024-25", () => {
  it("zero tax on income within rebate limit (₹7L)", () => {
    const r = computeTax({ grossIncome: 700000, regime: "NEW", fy: "2024-25" });
    // standardDeduction ₹75K → taxable ₹6.25L; rebate caps to zero
    expect(r.totalTax).toBe(0);
  });

  it("computes tax for ₹15L income", () => {
    const r = computeTax({ grossIncome: 1500000, regime: "NEW", fy: "2024-25" });
    expect(r.totalTax).toBeGreaterThan(0);
    expect(r.effectiveRate).toBeGreaterThan(0);
    expect(r.effectiveRate).toBeLessThan(20); // ~10-15% effective
  });

  it("surcharge applies above ₹50L (capped at 25% for New regime)", () => {
    const r = computeTax({ grossIncome: 10000000, regime: "NEW", fy: "2024-25" });
    expect(r.surcharge).toBeGreaterThan(0);
  });

  it("cess is 4% of (tax + surcharge)", () => {
    const r = computeTax({ grossIncome: 2000000, regime: "NEW", fy: "2024-25" });
    expect(r.cess).toBeGreaterThan(0);
    expect(r.cess).toBeCloseTo(Math.round((r.taxAfterRebate + r.surcharge) * 0.04), 0);
  });
});

describe("getTaxConfigForFY — nearest-FY fallback for unconfigured years (gh-issue #6 / ADR-0003)", () => {
  // Historical-year tax accuracy is out of scope (FIRE planner, not a tax-return tracker),
  // but an unconfigured FY must NOT silently get the NEWEST slabs — fall back to the nearest.
  it("a PAST unconfigured FY falls back to the OLDEST configured FY, not the newest", () => {
    expect(getTaxConfigForFY("2022-23")).toBe(getTaxConfigForFY("2024-25"));
  });
  it("a FUTURE unconfigured FY falls back to the NEWEST configured FY", () => {
    expect(getTaxConfigForFY("2099-00")).toBe(getTaxConfigForFY("2026-27"));
  });
  it("configured FYs are distinct (sanity — slab structure changed 2024-25 → 2025-26)", () => {
    expect(getTaxConfigForFY("2024-25")).not.toBe(getTaxConfigForFY("2025-26"));
  });
});

describe("computeTax — FY 2025-26 new regime exact-rupee locks (headline current-year regime)", () => {
  // Substance locks so a future slab-boundary/rate typo in the current-year new regime is
  // caught (previously only relational assertions existed — FinTech audit 2026-06-02).
  it("₹20L gross → ₹1,92,400 total tax (taxable 19.25L: 20k+40k+60k+65k slab, 4% cess)", () => {
    const r = computeTax({ grossIncome: 2_000_000, regime: "NEW", fy: "2025-26" });
    expect(r.taxableIncome).toBe(1_925_000); // 20L − 75k standard deduction
    expect(r.totalTax).toBe(192_400);
  });

  it("just above the ₹12L rebate cliff → marginal relief caps tax at the income over ₹12L", () => {
    // gross 12.85L − 75k SD = taxable 12.10L → tax capped at ₹10,000 (excess over ₹12L) + 4% cess.
    const r = computeTax({ grossIncome: 1_285_000, regime: "NEW", fy: "2025-26" });
    expect(r.taxableIncome).toBe(1_210_000);
    expect(r.totalTax).toBe(10_400);
  });

  it("at/below the ₹12L rebate limit → zero tax", () => {
    const r = computeTax({ grossIncome: 1_275_000, regime: "NEW", fy: "2025-26" }); // taxable 12.00L
    expect(r.taxableIncome).toBe(1_200_000);
    expect(r.totalTax).toBe(0);
  });
});

describe("computeTax — 80CCD(2) employer NPS (gh-issue #2 finding #2)", () => {
  // 80CCD(2) is the one Chapter VI-A deduction allowed in the NEW regime too. The
  // engine must subtract `employerNps` from taxable income in BOTH regimes.
  it("NEW regime: employerNps reduces taxable income and total tax", () => {
    const without = computeTax({ grossIncome: 2_000_000, regime: "NEW", fy: "2025-26" });
    const withNps = computeTax({ grossIncome: 2_000_000, regime: "NEW", fy: "2025-26", employerNps: 200_000 });
    expect(withNps.taxableIncome).toBe(without.taxableIncome - 200_000);
    expect(withNps.totalTax).toBeLessThan(without.totalTax);
  });

  it("OLD regime: employerNps stacks on top of other deductions", () => {
    const base = computeTax({ grossIncome: 2_000_000, regime: "OLD", fy: "2025-26", deductions: 150_000 });
    const withNps = computeTax({ grossIncome: 2_000_000, regime: "OLD", fy: "2025-26", deductions: 150_000, employerNps: 100_000 });
    expect(withNps.taxableIncome).toBe(base.taxableIncome - 100_000);
  });

  it("defaults to no employer-NPS deduction when the field is absent", () => {
    const a = computeTax({ grossIncome: 1_500_000, regime: "NEW", fy: "2025-26" });
    const b = computeTax({ grossIncome: 1_500_000, regime: "NEW", fy: "2025-26", employerNps: 0 });
    expect(a.totalTax).toBe(b.totalTax);
  });

  // gh-issue #3: 80CCD(2) is capped at 14% of basic (NEW) / 10% (OLD). When the basic
  // is provided via employerNpsBasic, the deduction is the LEAST of (entered, ceiling×basic).
  it("NEW regime: caps the deduction at 14% of basic", () => {
    const base = computeTax({ grossIncome: 2_000_000, regime: "NEW", fy: "2025-26" });
    const capped = computeTax({ grossIncome: 2_000_000, regime: "NEW", fy: "2025-26", employerNps: 200_000, employerNpsBasic: 800_000 });
    // 14% of ₹8L = ₹1.12L; entered ₹2L is clamped to ₹1.12L.
    expect(capped.taxableIncome).toBe(base.taxableIncome - 112_000);
  });

  it("OLD regime: caps the deduction at 10% of basic", () => {
    const base = computeTax({ grossIncome: 2_000_000, regime: "OLD", fy: "2025-26", deductions: 0 });
    const capped = computeTax({ grossIncome: 2_000_000, regime: "OLD", fy: "2025-26", deductions: 0, employerNps: 200_000, employerNpsBasic: 800_000 });
    // 10% of ₹8L = ₹80k.
    expect(capped.taxableIncome).toBe(base.taxableIncome - 80_000);
  });

  it("does not cap when employerNpsBasic is absent (entered figure trusted)", () => {
    const noBasic = computeTax({ grossIncome: 2_000_000, regime: "NEW", fy: "2025-26", employerNps: 200_000 });
    const withBasic = computeTax({ grossIncome: 2_000_000, regime: "NEW", fy: "2025-26", employerNps: 200_000, employerNpsBasic: 800_000 });
    // Uncapped subtracts the full ₹2L; capped subtracts only ₹1.12L → ₹88k difference.
    expect(withBasic.taxableIncome).toBe(noBasic.taxableIncome + 88_000);
  });

  it("caps 80CCD(2) PER MEMBER — an over-contributor can't borrow another's headroom (gh-issue #4)", () => {
    const base = computeTax({ grossIncome: 4_000_000, regime: "NEW", fy: "2025-26" });
    // Earner A: ₹1.5L NPS on ₹5L basic (own 14% cap = ₹70k). Earner B: ₹0 NPS on ₹15L basic (₹2.1L unused).
    const perMember = computeTax({
      grossIncome: 4_000_000, regime: "NEW", fy: "2025-26",
      employerNpsByMember: [{ nps: 150_000, basic: 500_000 }, { nps: 0, basic: 1_500_000 }],
    });
    // Per-member: min(150k,70k) + min(0,210k) = ₹70k deducted.
    expect(perMember.taxableIncome).toBe(base.taxableIncome - 70_000);
    // The old AGGREGATE path would wrongly allow min(150k, 0.14×20L=280k) = ₹150k.
    const aggregate = computeTax({
      grossIncome: 4_000_000, regime: "NEW", fy: "2025-26",
      employerNps: 150_000, employerNpsBasic: 2_000_000,
    });
    expect(aggregate.taxableIncome).toBe(base.taxableIncome - 150_000);
    expect(perMember.taxableIncome).toBeGreaterThan(aggregate.taxableIncome);
  });

  it("employerNpsBasic of 0 (the common blank-basic path) trusts the entered figure uncapped", () => {
    const base = computeTax({ grossIncome: 2_000_000, regime: "NEW", fy: "2025-26" });
    const r = computeTax({ grossIncome: 2_000_000, regime: "NEW", fy: "2025-26", employerNps: 200_000, employerNpsBasic: 0 });
    // basic === 0 → no cap → full ₹2L applies (matches callers' `?? 0` default when basic is blank).
    expect(r.taxableIncome).toBe(base.taxableIncome - 200_000);
  });

  it("entered figure below the cap is used as-is", () => {
    const base = computeTax({ grossIncome: 2_000_000, regime: "NEW", fy: "2025-26" });
    const r = computeTax({ grossIncome: 2_000_000, regime: "NEW", fy: "2025-26", employerNps: 50_000, employerNpsBasic: 800_000 });
    // ₹50k < ₹1.12L cap → full ₹50k applies.
    expect(r.taxableIncome).toBe(base.taxableIncome - 50_000);
  });
});

describe("computeTax — Old Regime", () => {
  it("applies ₹50K standard deduction + deductions", () => {
    const r = computeTax({
      grossIncome: 1000000,
      regime: "OLD",
      fy: "2024-25",
      deductions: 150000, // 80C
    });
    // taxable = 1000000 - 50000 - 150000 = 800000
    expect(r.taxableIncome).toBe(800000);
  });

  it("ignores deductions in NEW regime", () => {
    const r = computeTax({
      grossIncome: 1000000,
      regime: "NEW",
      fy: "2024-25",
      deductions: 150000,
    });
    expect(r.estimatedDeductions).toBe(0);
  });
});

describe("computeTax — FY 2025-26 marginal relief", () => {
  it("zero tax exactly at ₹12L rebate limit", () => {
    const r = computeTax({ grossIncome: 1275000, regime: "NEW", fy: "2025-26" });
    // taxable ₹12L → full rebate
    expect(r.taxAfterRebate).toBe(0);
  });

  it("marginal relief applies just above ₹12L", () => {
    // At ₹13L gross (₹12.25L taxable) the slab tax would be higher than the income above rebate.
    // Marginal relief caps tax at the amount above rebate.
    const r = computeTax({ grossIncome: 1300000, regime: "NEW", fy: "2025-26" });
    expect(r.rebate).toBeGreaterThan(0);
  });
});

describe("computeTax — surcharge marginal relief (gh #1)", () => {
  it("caps surcharge via marginal relief just above ₹50L (old regime)", () => {
    // gross 50,60,000 − sd 50,000 = taxable 50,10,000 (₹10k over the ₹50L threshold)
    const r = computeTax({ grossIncome: 5060000, regime: "OLD", fy: "2024-25", deductions: 0 });
    expect(r.taxableIncome).toBe(5010000);
    // Raw 10% surcharge would be ₹1,31,550; marginal relief caps it to ₹7,000.
    expect(r.surcharge).toBe(7000);
    expect(r.surcharge).toBeLessThan(20000); // guard: NOT the un-relieved ₹1.31L
    expect(r.totalTax).toBe(1375400); // exact rupee — substance, not a range
  });

  it("does NOT apply relief well inside a band — ₹75L old → full 10%", () => {
    const r = computeTax({ grossIncome: 7550000, regime: "OLD", fy: "2024-25", deductions: 0 });
    expect(r.surcharge / r.taxAfterRebate).toBeCloseTo(0.1, 2);
  });

  it("applies the 25% band rate at ₹3Cr (old regime)", () => {
    const r = computeTax({ grossIncome: 30050000, regime: "OLD", fy: "2024-25", deductions: 0 });
    expect(r.surcharge / r.taxAfterRebate).toBeCloseTo(0.25, 2);
  });

  it("pins exact total tax at ₹15L gross (new regime FY2024-25)", () => {
    const r = computeTax({ grossIncome: 1500000, regime: "NEW", fy: "2024-25" });
    expect(r.totalTax).toBe(130000); // exact rupee substance assertion
  });
});

describe("recommendRegime", () => {
  it("returns the regime with lower total tax", () => {
    const r = recommendRegime({
      grossIncome: 1500000,
      fy: "2024-25",
      deductions: 200000,
    });
    expect(["OLD", "NEW"]).toContain(r.recommended);
    expect(r.savings).toBeGreaterThanOrEqual(0);
  });

  it("New regime usually wins at ₹10L with low deductions", () => {
    const r = recommendRegime({ grossIncome: 1000000, fy: "2024-25", deductions: 0 });
    expect(r.recommended).toBe("NEW");
  });
});

describe("marginalSlabRate (A15.3 — EPF excess-interest tax rate)", () => {
  const oldSlabs = getTaxConfigForFY("2024-25").oldRegime.slabs;

  it("returns the top slab rate the taxable income reaches (old regime)", () => {
    expect(marginalSlabRate(1_500_000, oldSlabs)).toBe(0.3); // >10L → 30%
    expect(marginalSlabRate(800_000, oldSlabs)).toBe(0.2); // 5L–10L → 20%
    expect(marginalSlabRate(400_000, oldSlabs)).toBe(0.05); // 2.5L–5L → 5%
  });

  it("returns 0 below the first taxable slab", () => {
    expect(marginalSlabRate(0, oldSlabs)).toBe(0);
    expect(marginalSlabRate(250_000, oldSlabs)).toBe(0); // exactly at 2.5L min, not above
  });

  it("uses the New-regime slab table when given New slabs", () => {
    const newSlabs = getTaxConfigForFY("2025-26").newRegime.slabs;
    expect(marginalSlabRate(2_500_000, newSlabs)).toBe(0.3); // >24L → 30%
    expect(marginalSlabRate(900_000, newSlabs)).toBe(0.1); // 8L–12L → 10%
  });
});

describe("effectiveRate", () => {
  it("scales with income", () => {
    const lo = computeTax({ grossIncome: 800000, regime: "NEW", fy: "2024-25" });
    const hi = computeTax({ grossIncome: 5000000, regime: "NEW", fy: "2024-25" });
    expect(hi.effectiveRate).toBeGreaterThan(lo.effectiveRate);
  });

  it("returns 0 for zero income", () => {
    const r = computeTax({ grossIncome: 0, regime: "NEW", fy: "2024-25" });
    expect(r.effectiveRate).toBe(0);
    expect(r.totalTax).toBe(0);
  });
});

describe("old-regime senior basic-exemption variant (gh-issue #6 LOW)", () => {
  // Indian law (OLD regime only): basic exemption is ₹2.5L (<60), ₹3L (60–79 senior),
  // ₹5L (80+ super-senior). The NEW regime is age-agnostic.
  const BASE_OLD: TaxSlabEntry[] = [
    { min: 0, max: 250000, rate: 0 },
    { min: 250000, max: 500000, rate: 0.05 },
    { min: 500000, max: 1000000, rate: 0.2 },
    { min: 1000000, max: Infinity, rate: 0.3 },
  ];

  describe("oldRegimeSlabsForAge", () => {
    it("leaves slabs unchanged below 60 (and when age is omitted)", () => {
      expect(oldRegimeSlabsForAge(BASE_OLD, 45)).toEqual(BASE_OLD);
      expect(oldRegimeSlabsForAge(BASE_OLD, undefined)).toEqual(BASE_OLD);
    });

    it("raises the 0% bracket to ₹3L for a senior (60–79)", () => {
      expect(oldRegimeSlabsForAge(BASE_OLD, 65)).toEqual([
        { min: 0, max: 300000, rate: 0 },
        { min: 300000, max: 500000, rate: 0.05 },
        { min: 500000, max: 1000000, rate: 0.2 },
        { min: 1000000, max: Infinity, rate: 0.3 },
      ]);
    });

    it("raises the 0% bracket to ₹5L and absorbs the 5% band for a super-senior (80+)", () => {
      expect(oldRegimeSlabsForAge(BASE_OLD, 82)).toEqual([
        { min: 0, max: 500000, rate: 0 },
        { min: 500000, max: 1000000, rate: 0.2 },
        { min: 1000000, max: Infinity, rate: 0.3 },
      ]);
    });

    it("treats the 60 and 80 boundaries inclusively", () => {
      expect(oldRegimeSlabsForAge(BASE_OLD, 60)[0]).toEqual({ min: 0, max: 300000, rate: 0 });
      expect(oldRegimeSlabsForAge(BASE_OLD, 80)[0]).toEqual({ min: 0, max: 500000, rate: 0 });
      expect(oldRegimeSlabsForAge(BASE_OLD, 59)[0]).toEqual({ min: 0, max: 250000, rate: 0 });
    });
  });

  describe("computeTax applies the age exemption in the OLD regime", () => {
    // gross ₹7L, non-salaried (no SD), no deductions → above the ₹5L rebate limit so
    // the rebate does not mask the slab-tax difference. Exact-rupee locks:
    const common = { grossIncome: 700000, regime: "OLD" as const, fy: "2025-26", isSalaried: false };

    it("under-60: 5% on 2.5–5L + 20% on 5–7L = ₹52,500 slab tax", () => {
      const r = computeTax({ ...common, taxpayerAge: 40 });
      expect(r.slabTax).toBe(52500);
    });

    it("senior (65): ₹3L exemption → ₹50,000 slab tax (saves ₹2,500)", () => {
      const r = computeTax({ ...common, taxpayerAge: 65 });
      expect(r.slabTax).toBe(50000);
    });

    it("super-senior (82): ₹5L exemption, no 5% band → ₹40,000 slab tax (saves ₹12,500)", () => {
      const r = computeTax({ ...common, taxpayerAge: 82 });
      expect(r.slabTax).toBe(40000);
    });

    it("omitting taxpayerAge is identical to under-60 (no regression)", () => {
      const withAge = computeTax({ ...common, taxpayerAge: 40 });
      const noAge = computeTax(common);
      expect(noAge.totalTax).toBe(withAge.totalTax);
    });
  });

  it("NEW regime is age-agnostic — super-senior pays the same as a 30-year-old", () => {
    const young = computeTax({ grossIncome: 700000, regime: "NEW", fy: "2025-26", taxpayerAge: 30 });
    const superSenior = computeTax({ grossIncome: 700000, regime: "NEW", fy: "2025-26", taxpayerAge: 82 });
    expect(superSenior.totalTax).toBe(young.totalTax);
  });
});

describe("computeTax — 80CCD(2) govt-sector 14% ceiling, OLD regime (gh-issue #4)", () => {
  // Govt employees get 14%-of-basic under the OLD regime too (private = 10% old / 14% new).
  const base = { grossIncome: 2_000_000, regime: "OLD" as const, fy: "2025-26", isSalaried: false, deductions: 0 };

  it("government member: OLD 80CCD(2) capped at 14% of basic, not 10%", () => {
    const govt = computeTax({ ...base, employerNpsByMember: [{ nps: 140000, basic: 1000000, sector: "government" }] });
    const priv = computeTax({ ...base, employerNpsByMember: [{ nps: 140000, basic: 1000000, sector: "private" }] });
    // govt deducts the full ₹1.4L (14%); private is capped at ₹1L (10%) → govt taxable lower by ₹40k.
    expect(priv.taxableIncome - govt.taxableIncome).toBe(40000);
    expect(govt.taxableIncome).toBe(1_860_000);
    expect(priv.taxableIncome).toBe(1_900_000);
  });

  it("defaults to private (10%) when sector is omitted (conservative — no over-deduction)", () => {
    const omitted = computeTax({ ...base, employerNpsByMember: [{ nps: 140000, basic: 1000000 }] });
    const priv = computeTax({ ...base, employerNpsByMember: [{ nps: 140000, basic: 1000000, sector: "private" }] });
    expect(omitted.taxableIncome).toBe(priv.taxableIncome);
  });

  it("NEW regime is 14% for everyone — sector makes no difference", () => {
    const govtNew = computeTax({ ...base, regime: "NEW", employerNpsByMember: [{ nps: 140000, basic: 1000000, sector: "government" }] });
    const privNew = computeTax({ ...base, regime: "NEW", employerNpsByMember: [{ nps: 140000, basic: 1000000, sector: "private" }] });
    expect(govtNew.taxableIncome).toBe(privNew.taxableIncome);
  });
});
