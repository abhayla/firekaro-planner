import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import { loadEmptySeed } from "@/seeds/empty";
import { getCurrentFinancialYear } from "@/lib/expense-history";
import { computeIndividualFire } from "@/lib/individual-fire";
import { deriveDeductions, computeEarnerTaxCard } from "@/lib/tax-deductions";
import {
  computeTax,
  recommendRegime,
  marginalSlabRate,
  getTaxConfigForFY,
  getTaxConfigCoverage,
  isProjectedTaxStale,
  fireProjectionTaxNote,
  getCurrentFYTaxStaleness,
  TAX_CONFIG_LAST_VERIFIED,
  oldRegimeSlabsForAge,
  singleEarnerNpsArgs,
  type TaxSlabEntry,
} from "./tax";

describe("fireProjectionTaxNote (#19 — Tier-0 honesty disclosure)", () => {
  it("discloses when a projection runs PAST the newest configured FY", () => {
    const note = fireProjectionTaxNote(2058);
    expect(note).toContain("assumes today's slabs held constant");
    expect(note).toContain("2026-27"); // the newest configured FY
    expect(isProjectedTaxStale("2058-59")).toBe(true); // engine agrees
  });
  it("is SILENT when the projection stays within configured years", () => {
    expect(fireProjectionTaxNote(2025)).toBeNull();
    expect(fireProjectionTaxNote(2026)).toBeNull();
  });
  it("guards a non-finite year", () => {
    expect(fireProjectionTaxNote(NaN)).toBeNull();
  });
});

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

  it("scalar fallback has NO sector channel → caps OLD at 10% (private); govt MUST use employerNpsByMember", () => {
    // The scalar employerNps/employerNpsBasic path can't carry sector, so it conservatively
    // under-caps a govt earner at 10% OLD. Documents the limitation (errs safe — never over-deducts).
    const scalar = computeTax({ ...base, employerNps: 140000, employerNpsBasic: 1000000 });
    expect(scalar.taxableIncome).toBe(1_900_000); // 20L − 10%×10L = 19L (private), not the 14% 18.6L
  });
});

describe("tax config coverage / staleness (gh-issue #19 — long-horizon honesty)", () => {
  it("a configured FY is not stale and applies its own slabs", () => {
    const cov = getTaxConfigCoverage("2026-27");
    expect(cov.isConfigured).toBe(true);
    expect(cov.isFutureUnconfigured).toBe(false);
    expect(cov.appliedFy).toBe("2026-27");
    expect(isProjectedTaxStale("2026-27")).toBe(false);
  });

  it("a FUTURE unconfigured FY is flagged stale and silently applies the newest (flat) slabs", () => {
    const cov = getTaxConfigCoverage("2035-36");
    expect(cov.isConfigured).toBe(false);
    expect(cov.isFutureUnconfigured).toBe(true);
    expect(cov.isPastUnconfigured).toBe(false);
    expect(cov.appliedFy).toBe(cov.newestConfiguredFy);
    expect(isProjectedTaxStale("2035-36")).toBe(true);
  });

  it("a PAST unconfigured FY is NOT projection-stale (historical tax is out of scope, ADR-0003)", () => {
    const cov = getTaxConfigCoverage("2010-11");
    expect(cov.isPastUnconfigured).toBe(true);
    expect(cov.isFutureUnconfigured).toBe(false);
    expect(isProjectedTaxStale("2010-11")).toBe(false);
  });

  it("regression: getTaxConfigForFY still falls back to the newest config for a future FY (behaviour preserved)", () => {
    expect(getTaxConfigForFY("2035-36")).toBe(getTaxConfigForFY("2026-27"));
  });
});

describe("getCurrentFYTaxStaleness (current-FY honesty guard — obj-1 must-have)", () => {
  it("today (FY 2026-27 configured) is NOT stale", () => {
    const s = getCurrentFYTaxStaleness(new Date("2026-06-06"));
    expect(s.stale).toBe(false);
    expect(s.currentFy).toBe("2026-27");
    expect(s.reason).toBe("ok");
    expect(s.newestConfiguredFy).toBe("2026-27");
  });

  it("the April-2027 footgun: once the live current FY (2027-28) is unconfigured, it IS stale", () => {
    const s = getCurrentFYTaxStaleness(new Date("2027-05-01"));
    expect(s.stale).toBe(true);
    expect(s.reason).toBe("current-fy-unconfigured");
    expect(s.currentFy).toBe("2027-28");
    expect(s.newestConfiguredFy).toBe("2026-27");
  });

  it("a date still inside the newest configured FY (Mar 2027) is NOT stale", () => {
    // FY 2026-27 runs Apr 2026 → Mar 2027; a Mar-2027 date is still the configured current FY.
    const s = getCurrentFYTaxStaleness(new Date("2027-03-15"));
    expect(s.stale).toBe(false);
    expect(s.currentFy).toBe("2026-27");
    expect(s.reason).toBe("ok");
  });

  it("is bound on the injected `now`, never the real wall clock (purity)", () => {
    const a = getCurrentFYTaxStaleness(new Date("2027-05-01"));
    const b = getCurrentFYTaxStaleness(new Date("2027-05-01"));
    expect(a).toEqual(b);
  });

  it("TAX_CONFIG_LAST_VERIFIED is an ISO date string the guard can read", () => {
    expect(TAX_CONFIG_LAST_VERIFIED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("computeTax — scalar-vs-per-member coherence for government-sector 80CCD(2) (gh-issue #157)", () => {
  // RCA: EarnerSalaryForm.vue's take-home preview (via recommendRegime + computeTax) and
  // tax-planning/Index.vue's per-earner cards call computeTax with the SCALAR
  // employerNps/employerNpsBasic args, which the aggregate fallback hardcodes to the
  // "private" ceiling (tax.ts's aggregate fallback). The headline path (tax-deductions.ts →
  // derive.ts) uses employerNpsByMember with the earner's real sector. For a government
  // earner on the OLD regime this makes the two scalar consumers show DIFFERENT tax than the
  // headline for the SAME earner. `singleEarnerNpsArgs` is the sector-aware helper both
  // consumers must now build their args with — this spec locks it against the legacy scalar
  // shape (which the helper's OWN behaviour replaces) for both sectors and both regimes.
  const basic = 1_000_000;
  const nps = 140_000; // 14% of basic — exceeds the private 10% OLD ceiling
  const gross = 2_000_000;

  function scalarCallShape(regime: "OLD" | "NEW") {
    // The LEGACY (pre-fix) call shape still used directly by EarnerSalaryForm.vue /
    // tax-planning/Index.vue before this fix lands — sector is NOT threaded through.
    return computeTax({
      grossIncome: gross,
      regime,
      fy: "2025-26",
      isSalaried: false,
      deductions: 0,
      employerNps: nps,
      employerNpsBasic: basic,
    });
  }

  function memberCallShape(regime: "OLD" | "NEW", sector: "private" | "government") {
    // The sector-aware call shape both consumers MUST use post-fix, built via the shared
    // singleEarnerNpsArgs helper — not hand-rolled inline in either Vue file.
    return computeTax({
      grossIncome: gross,
      regime,
      fy: "2025-26",
      isSalaried: false,
      deductions: 0,
      ...singleEarnerNpsArgs(nps, basic, sector),
    });
  }

  it("government + OLD: singleEarnerNpsArgs('government') gives the 14% figure (₹18.6L taxable), diverging from the legacy scalar shape (₹19L)", () => {
    const member = memberCallShape("OLD", "government");
    expect(member.taxableIncome).toBe(1_860_000);
    // The legacy scalar call shape (no sector channel) is wrongly capped at 10% (private) —
    // this is the exact defect #157 fixes once both Vue consumers stop using it.
    const legacyScalar = scalarCallShape("OLD");
    expect(legacyScalar.taxableIncome).toBe(1_900_000);
    expect(member.taxableIncome).not.toBe(legacyScalar.taxableIncome);
  });

  it("private + OLD: singleEarnerNpsArgs('private') matches the legacy scalar shape (unaffected by the fix)", () => {
    const member = memberCallShape("OLD", "private");
    const legacyScalar = scalarCallShape("OLD");
    expect(member.taxableIncome).toBe(legacyScalar.taxableIncome);
    expect(member.taxableIncome).toBe(1_900_000);
  });

  it("private + NEW: singleEarnerNpsArgs('private') matches the legacy scalar shape (unaffected by the fix)", () => {
    const member = memberCallShape("NEW", "private");
    const legacyScalar = scalarCallShape("NEW");
    expect(member.taxableIncome).toBe(legacyScalar.taxableIncome);
  });

  it("government + NEW: singleEarnerNpsArgs('government') matches the legacy scalar shape (NEW regime is 14% regardless of sector)", () => {
    const member = memberCallShape("NEW", "government");
    const legacyScalar = scalarCallShape("NEW");
    expect(member.taxableIncome).toBe(legacyScalar.taxableIncome);
  });

  it("defaults to 'private' when sector is omitted (conservative)", () => {
    const defaulted = computeTax({
      grossIncome: gross,
      regime: "OLD",
      fy: "2025-26",
      isSalaried: false,
      deductions: 0,
      ...singleEarnerNpsArgs(nps, basic),
    });
    expect(defaulted.taxableIncome).toBe(1_900_000);
  });
});

describe("EarnerSalaryForm.vue / tax-planning/Index.vue use the sector-aware NPS path, not bare scalars (gh-issue #157 source lock)", () => {
  // The class this issue fixes is "a scalar consumer passes employerNps/employerNpsBasic
  // directly instead of routing through the sector-aware helper". A coherence spec at the
  // computeTax boundary can't observe what argument SHAPE the Vue files actually build (no
  // @vue/test-utils component-mount harness exists in this repo — every other spec in this
  // project is a pure-function unit spec, so this mirrors that convention) — so this reads the
  // source text directly as the enforcement mechanism, the same technique the sibling audit in
  // gh-issue #157 used to find both call sites in the first place.
  //
  // MUTATION-PROVED (code review round 1 finding): a whole-file `toContain("singleEarnerNpsArgs")`
  // is DEAD — it also matches the import statement, so reverting the actual call site to bare
  // scalars still passes. These locks instead extract the SPECIFIC function/computed body text
  // (deriveTakeHomeFor's block, perEarner's computed callback) and assert on that slice only.
  const root = path.resolve(fileURLToPath(import.meta.url), "../../..");

  /**
   * Extracts the body of the first `startPattern` match in `src`.
   * - Default mode: a brace-delimited `{ ... }` block (a normal function/statement body) —
   *   returns the FIRST balanced `{...}` found after the match.
   * - `endPattern` mode (for an implicit-return arrow expression with no `{}` body, e.g.
   *   `const x = computed(() => expr);`): returns everything from the match up to and
   *   including the first `endPattern` match.
   */
  function extractBlock(src: string, startPattern: RegExp, endPattern?: RegExp): string {
    const m = startPattern.exec(src);
    if (!m) throw new Error(`extractBlock: pattern not found: ${startPattern}`);
    if (endPattern) {
      const rest = src.slice(m.index);
      const endMatch = endPattern.exec(rest);
      if (!endMatch) throw new Error(`extractBlock: end pattern not found: ${endPattern}`);
      return rest.slice(0, endMatch.index + endMatch[0].length);
    }
    let depth = 0;
    let i = m.index;
    let bodyStart = -1;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (ch === "{") {
        if (bodyStart === -1) bodyStart = i;
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0 && bodyStart !== -1) return src.slice(bodyStart, i + 1);
      }
    }
    throw new Error(`extractBlock: unbalanced braces after ${startPattern}`);
  }

  it("EarnerSalaryForm.vue's deriveTakeHomeFor call-site body routes through the sector-aware helper, not bare scalars", () => {
    const src = fs.readFileSync(path.join(root, "src/components/forms/EarnerSalaryForm.vue"), "utf-8");
    const body = extractBlock(src, /function deriveTakeHomeFor\(/);
    expect(body).toMatch(/singleEarnerNpsArgs\(|\.\.\.npsArgs/);
    // The buggy (pre-fix) shape passed employerNps/employerNpsBasic as trailing SHORTHAND
    // object-literal properties directly to computeTax/recommendRegime, immediately followed by
    // the object's closing `}` — e.g. `{ ..., employerNps, employerNpsBasic }` /
    // `{ ..., employerNps, employerNpsBasic,\n  });`. The (correct) call
    // `singleEarnerNpsArgs(employerNps, employerNpsBasic, employerSector)` never has
    // `employerNpsBasic` immediately followed by `}` — a third argument (`employerSector`)
    // always comes next — so this pattern cannot match the fixed helper call.
    expect(body).not.toMatch(/\bemployerNps,\s*employerNpsBasic\s*,?\s*\}/);
  });

  it("tax-planning/Index.vue's perEarner call-site body routes through computeEarnerTaxCard, not bare scalars", () => {
    const src = fs.readFileSync(path.join(root, "src/pages/tax-planning/Index.vue"), "utf-8");
    // gh-issue #201: `perEarner`'s body now contains its own nested `deriveDeductions({...})`
    // call, so the naive `/\)\s*;/` endPattern (which matches the FIRST `);` after the start,
    // not the one balancing `computed(`'s own opening paren) would truncate the extraction at
    // that nested call — paren-balance instead (same technique as the #201 source lock below).
    const startMatch = /const perEarner = computed\(/.exec(src);
    if (!startMatch) throw new Error("perEarner computed not found");
    let depth = 0;
    let parenStart = -1;
    let end = -1;
    for (let i = startMatch.index; i < src.length; i++) {
      if (src[i] === "(") {
        if (parenStart === -1) parenStart = i;
        depth++;
      } else if (src[i] === ")") {
        depth--;
        if (depth === 0 && parenStart !== -1) {
          end = i + 1;
          break;
        }
      }
    }
    if (end === -1) throw new Error("perEarner computed end not found (unbalanced parens)");
    const body = src.slice(startMatch.index, end);
    expect(body).toMatch(/computeEarnerTaxCard\(/);
    expect(body).not.toMatch(/employerNps:\s*earnerNps/);
    expect(body).not.toMatch(/employerNpsBasic:\s*earnerBasic/);
  });
});

describe("government-earner preview === headline behaviour lock (gh-issue #157 — code review round 1, item 2)", () => {
  // The REAL defect class this issue fixes: for a government earner, the salary-form preview
  // and the tax-planning per-earner card must show the SAME tax as the headline
  // computeIndividualFire() path — built through the actual store/seed helpers (not a bespoke
  // fixture), exercising the exact functions each surface calls.
  //
  // Uses a MINIMAL single-adult household from the empty seed (loadEmptySeed + addMember),
  // not one of the 5-persona seeds — a persona seed's other income/investments feed into
  // computeIndividualFire's attributable-income split, which would make this a test of THAT
  // attribution logic (already covered elsewhere) rather than an isolated NPS-sector lock.
  function buildGovtEarnerHousehold(h: ReturnType<typeof useHouseholdStore>, a: ReturnType<typeof useAssumptionsStore>) {
    loadEmptySeed(h, a);
    h.addMember({
      id: "gov1",
      name: "Gov Earner",
      dateOfBirth: "1994-01-01",
      role: "ADULT",
      targetRetirementAge: 55,
      planToAge: 90,
      city: "Metro",
      health: "Healthy",
      riskAppetite: "Moderate",
      marital: "Single",
      employmentStatus: "Employed",
      salary: {
        annualCTC: 2_000_000,
        hikePercent: 8,
        basicAnnual: 1_000_000,
        employerNpsAnnual: 140_000, // 14% of basic — exceeds the private 10% OLD ceiling
        employerSector: "government",
      },
    });
  }

  it("computeEarnerTaxCard's OLD-regime tax matches computeIndividualFire's internal OLD-regime tax for a government earner", () => {
    setActivePinia(createPinia());
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    buildGovtEarnerHousehold(h, a);

    const fy = "2025-26";
    const member = h.data.members.find((m) => m.id === "gov1")!;
    const deductions = deriveDeductions(h.data);
    const headline = computeIndividualFire(h.data, a.values, "gov1", fy)!;
    expect(headline).not.toBeNull();

    // The NEW regime is 14%-of-basic for EVERY sector (npsCeilingFor), so it can never expose a
    // sector mismatch — force OLD explicitly on both sides (computeEarnerTaxCard's 4th arg picks
    // which regime's tax it DISPLAYS; forcing "OLD" exercises the exact `earnerOld` computeTax
    // call inside it). The headline's own recommendRegime happens to prefer NEW at this income,
    // so its OLD-regime tax is reconstructed the same way computeIndividualFire builds it
    // internally (same deduction basis, same taxpayerAge/isSalaried) — never re-deriving the
    // 80CCD(2) figure by hand, only calling the same functions each real surface calls.
    const card = computeEarnerTaxCard(member, fy, deductions.totalDeductions, "OLD");
    const headlineOld = computeTax({
      grossIncome: member.salary!.annualCTC,
      regime: "OLD",
      fy,
      deductions: deductions.totalDeductions,
      employerNpsByMember: deductions.employerNpsByMember,
      taxpayerAge: headline.anchorAge,
      isSalaried: true,
    });
    // Both surfaces must show the SAME OLD-regime tax for the same government earner — this is
    // the exact cross-screen figure-divergence class #157 fixes. (Pre-fix, computeEarnerTaxCard's
    // inline scalar call capped the 80CCD(2) deduction at 10% of basic instead of 14%,
    // overstating this earner's OLD-regime tax by the extra tax on ₹40k of taxable income.)
    expect(card.tax).toBe(headlineOld.totalTax);
  });

  it("EarnerSalaryForm.vue's take-home preview basis (recommendRegime + computeTax via singleEarnerNpsArgs) applies the SAME government 80CCD(2) cap as the headline path", () => {
    setActivePinia(createPinia());
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    h.updateMember("priya", { salary: { annualCTC: 0, hikePercent: 0 } });
    h.updateMember("rohit", {
      salary: {
        annualCTC: 2_000_000,
        hikePercent: 9,
        basicAnnual: 1_000_000,
        employerNpsAnnual: 140_000, // 14% of basic — exceeds the private 10% OLD ceiling
        employerSector: "government",
      },
    });
    const fy = "2025-26";

    // Mirrors EarnerSalaryForm.vue's deriveTakeHomeFor exactly: the sector-aware NPS args
    // (via singleEarnerNpsArgs) on the OLD regime, compared against the SAME regime on the
    // headline's own deduction basis (deriveDeductions — used by both computeIndividualFire and
    // tax-planning/Index.vue). Deduction TOTALS legitimately differ between the two paths (the
    // form hardcodes a flat ₹1.75L OLD estimate; the headline derives 80C/80D/etc from real
    // data) — so this isolates the 80CCD(2) NPS-CAP component specifically, which must agree.
    const npsArgs = singleEarnerNpsArgs(140_000, 1_000_000, "government");
    const formOld = computeTax({ grossIncome: 2_000_000, regime: "OLD", fy, deductions: 0, ...npsArgs });
    const formOldNoNps = computeTax({ grossIncome: 2_000_000, regime: "OLD", fy, deductions: 0 });
    const formNpsDeducted = formOldNoNps.taxableIncome - formOld.taxableIncome;

    const headlineDeductions = deriveDeductions(h.data);
    const headlineOld = computeTax({
      grossIncome: 2_000_000,
      regime: "OLD",
      fy,
      deductions: 0,
      employerNpsByMember: headlineDeductions.employerNpsByMember,
    });
    const headlineOldNoNps = computeTax({ grossIncome: 2_000_000, regime: "OLD", fy, deductions: 0 });
    const headlineNpsDeducted = headlineOldNoNps.taxableIncome - headlineOld.taxableIncome;

    // Both deduct the full ₹1.4L (14% of ₹10L basic) — the government ceiling, not the ₹1L
    // (10%) private default the pre-fix scalar call would have produced.
    expect(formNpsDeducted).toBe(140_000);
    expect(headlineNpsDeducted).toBe(140_000);
    expect(formNpsDeducted).toBe(headlineNpsDeducted);
  });
});

describe("per-earner tax-planning card uses the EARNER's attributed deductions, not the household total (gh-issue #201)", () => {
  // RCA: tax-planning/Index.vue passed derivedDeductions.value.totalDeductions (the WHOLE
  // household's 80C/80D/§24 sum) into computeEarnerTaxCard for EACH earner, so a two-earner
  // household double-claims the SHARED deductions (80D/Sec-24, which are pooled once per
  // household in deriveDeductions) — one earner's card claims deductions they have zero of.
  // NOTE: 80C is legitimately a PER-INDIVIDUAL ₹1.5L cap under Indian law, and
  // deriveDeductions already caps it per the SCOPE it's called with — so summing two
  // per-member 80C figures can legitimately EXCEED the household-wide 80C figure (each earner
  // has their own ₹1.5L room). This spec therefore locks the discriminating invariant: an
  // earner with ZERO of a given deduction (e.g. priya has no 80D health cover, no Sec-24 home
  // loan in her name) must show ZERO of it on HER card — not the other earner's amount.
  it("an earner with no 80D/Sec-24 deductions of their own does not inherit the other earner's (Sharmas — priya)", () => {
    setActivePinia(createPinia());
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a); // Sharmas: rohit + priya, both earners, deductions concentrated on rohit

    const rohit = h.data.members.find((m) => m.id === "rohit")!;
    const priya = h.data.members.find((m) => m.id === "priya")!;

    const rohitDeductions = deriveDeductions({
      ...h.data,
      members: [rohit],
      investments: h.data.investments.filter((i) => i.ownerId === "rohit"),
      liabilities: h.data.liabilities.filter((l) => l.ownerId === "rohit"),
      insurance: h.data.insurance.filter((p) => p.insuredPersonId === "rohit"),
    });
    const priyaDeductions = deriveDeductions({
      ...h.data,
      members: [priya],
      investments: h.data.investments.filter((i) => i.ownerId === "priya"),
      liabilities: h.data.liabilities.filter((l) => l.ownerId === "priya"),
      insurance: h.data.insurance.filter((p) => p.insuredPersonId === "priya"),
    });
    const householdDeductions = deriveDeductions(h.data);

    // Ground truth: rohit holds ALL the 80D health cover + the Sec-24 home loan; priya has
    // neither in the seed. Household 80D/Sec-24 come entirely from rohit's data.
    expect(rohitDeductions.section80D).toBe(householdDeductions.section80D);
    expect(rohitDeductions.section24).toBe(householdDeductions.section24);
    expect(rohitDeductions.section80D).toBeGreaterThan(0);
    expect(rohitDeductions.section24).toBeGreaterThan(0);

    // THE LOCK: priya's own attributable 80D + Sec-24 are ZERO — she must not inherit rohit's.
    // Pre-fix, the .vue passed householdDeductions.totalDeductions (which INCLUDES rohit's
    // ₹22,000 80D + ₹2,00,000 Sec-24) into BOTH earners' cards, so priya's card overstated her
    // own deductions by that exact amount (an optimistic, understated tax on her card).
    expect(priyaDeductions.section80D).toBe(0);
    expect(priyaDeductions.section24).toBe(0);
    expect(priyaDeductions.totalDeductions).toBeLessThan(householdDeductions.totalDeductions);
  });

  it("each earner's card tax equals the ACTUAL headline per-member tax (computeIndividualFire) — Sharmas both earners", () => {
    setActivePinia(createPinia());
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);

    const fy = getCurrentFinancialYear();
    const asOf = new Date();

    for (const memberId of ["rohit", "priya"]) {
      const member = h.data.members.find((m) => m.id === memberId)!;
      const headline = computeIndividualFire(h.data, a.values, memberId, fy, undefined, asOf)!;
      expect(headline).not.toBeNull();

      const attributableDeductions = deriveDeductions({
        ...h.data,
        members: [member],
        investments: h.data.investments.filter((i) => i.ownerId === memberId),
        liabilities: h.data.liabilities.filter((l) => l.ownerId === memberId),
        insurance: h.data.insurance.filter((p) => p.insuredPersonId === memberId),
      });

      // The card is rendered at the headline's own recommended regime for this member, so the
      // two surfaces show the SAME number for the SAME earner (headline uses `taxpayerAge` +
      // `isSalaried` internally; computeEarnerTaxCard's earnerOld/earnerNew do not take those
      // args, so this asserts card.tax against the fixed regime headline used — see fix below).
      const card = computeEarnerTaxCard(member, fy, attributableDeductions.totalDeductions, "OLD");
      const headlineOld = computeTax({
        grossIncome: member.salary!.annualCTC,
        regime: "OLD",
        fy,
        deductions: attributableDeductions.totalDeductions,
        employerNpsByMember: attributableDeductions.employerNpsByMember,
        taxpayerAge: headline.anchorAge,
        isSalaried: true,
      });
      expect(card.tax).toBe(headlineOld.totalTax);
    }
  });

  it("MUTATION LOCK: passing the household total (the pre-fix bug) makes priya's card inherit rohit's 80D/Sec-24", () => {
    setActivePinia(createPinia());
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    loadSeedPersona(h, a);
    const priya = h.data.members.find((m) => m.id === "priya")!;
    const householdDeductions = deriveDeductions(h.data);
    const priyaOwnDeductions = deriveDeductions({
      ...h.data,
      members: [priya],
      investments: h.data.investments.filter((i) => i.ownerId === "priya"),
      liabilities: h.data.liabilities.filter((l) => l.ownerId === "priya"),
      insurance: h.data.insurance.filter((p) => p.insuredPersonId === "priya"),
    });

    // Simulates the PRE-FIX behaviour: priya's card is built with the household total
    // (computeEarnerTaxCard's 3rd arg = totalDeductionsForOld), not her own attributable share.
    const buggyPriyaCard = computeEarnerTaxCard(priya, "2025-26", householdDeductions.totalDeductions, "OLD");
    const fixedPriyaCard = computeEarnerTaxCard(priya, "2025-26", priyaOwnDeductions.totalDeductions, "OLD");

    // Proves the lock DISCRIMINATES: the buggy card claims MORE deduction (rohit's 80D +
    // Sec-24, which priya has none of) and therefore shows LOWER (optimistic) tax than the
    // fixed card — the exact class #201 fixes. If this ever passed with buggy===fixed, the
    // coherence spec above would not actually be catching the regression (rule 33 mutation-proof).
    expect(householdDeductions.totalDeductions).toBeGreaterThan(priyaOwnDeductions.totalDeductions);
    expect(buggyPriyaCard.tax).toBeLessThan(fixedPriyaCard.tax);
  });

  it("tax-planning/Index.vue's perEarner call-site body passes the EARNER's own deductions, not the household total (source lock, gh-issue #201)", () => {
    // Mirrors the #157 source-text-lock technique — but extracts by PAREN balance (not the
    // sibling describe's brace-balance or `);`-endPattern helpers), because `perEarner`'s body
    // now contains its own nested `deriveDeductions({...})` call whose closing `);` would
    // otherwise truncate a naive `/\)\s*;/` end-match early (proved during this fix: the naive
    // pattern matched the nested call's close, not `computed(...)`'s own close).
    const root = path.resolve(fileURLToPath(import.meta.url), "../../..");
    const src = fs.readFileSync(path.join(root, "src/pages/tax-planning/Index.vue"), "utf-8");
    const startMatch = /const perEarner = computed\(/.exec(src);
    if (!startMatch) throw new Error("perEarner computed not found");
    let depth = 0;
    let parenStart = -1;
    let end = -1;
    for (let i = startMatch.index; i < src.length; i++) {
      const ch = src[i];
      if (ch === "(") {
        if (parenStart === -1) parenStart = i;
        depth++;
      } else if (ch === ")") {
        depth--;
        if (depth === 0 && parenStart !== -1) {
          end = i + 1;
          break;
        }
      }
    }
    if (end === -1) throw new Error("perEarner computed end not found (unbalanced parens)");
    const body = src.slice(startMatch.index, end);

    // THE LOCK: the pre-fix body called computeEarnerTaxCard(m, fy,
    // derivedDeductions.value.totalDeductions, ...) — the WHOLE household total, identical for
    // every earner. The fix must build each earner's OWN attributable deductions instead.
    expect(body).not.toMatch(/computeEarnerTaxCard\([^)]*derivedDeductions\.value\.totalDeductions/);
    expect(body).toMatch(/computeEarnerTaxCard\(/);
  });
});
