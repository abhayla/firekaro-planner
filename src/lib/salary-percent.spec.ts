import { describe, expect, it } from "vitest";
import {
  DEFAULT_BASIC_PERCENT_OF_CTC,
  basicAnnualFromPercent,
  defaultEmployerNpsPercent,
  employerNpsAnnualFromPercents,
  salaryEditPercents,
} from "./salary-percent";

describe("salary-percent — defaults (law-grounded, not heuristic)", () => {
  it("basic defaults to 50% of CTC — the Code on Wages wage floor (codes in force 21 Nov 2025)", () => {
    expect(DEFAULT_BASIC_PERCENT_OF_CTC).toBe(50);
  });

  it("employer NPS default is SECTOR-AWARE: government 14% (statutory mandatory), private 0% (corporate NPS is minority opt-in — a non-zero prefill would fabricate an 80CCD(2) deduction)", () => {
    expect(defaultEmployerNpsPercent("government")).toBe(14);
    expect(defaultEmployerNpsPercent("private")).toBe(0);
    expect(defaultEmployerNpsPercent(undefined)).toBe(0);
  });

  it("the government default never exceeds the 80CCD(2) deductible ceiling (14% new regime / 14% govt old regime) — safe-by-construction", () => {
    expect(defaultEmployerNpsPercent("government")).toBeLessThanOrEqual(14);
  });
});

describe("basicAnnualFromPercent", () => {
  it("computes basic = CTC × pct/100, rounded to whole rupees", () => {
    expect(basicAnnualFromPercent(4500000, 50)).toBe(2250000);
    expect(basicAnnualFromPercent(1234567, 40)).toBe(Math.round(1234567 * 0.4));
  });

  it("returns 0 for zero/negative CTC or pct", () => {
    expect(basicAnnualFromPercent(0, 50)).toBe(0);
    expect(basicAnnualFromPercent(-100, 50)).toBe(0);
    expect(basicAnnualFromPercent(4500000, 0)).toBe(0);
    expect(basicAnnualFromPercent(4500000, -5)).toBe(0);
  });

  it("never returns NaN/Infinity", () => {
    expect(Number.isFinite(basicAnnualFromPercent(Number.NaN, 50))).toBe(true);
    expect(Number.isFinite(basicAnnualFromPercent(4500000, Number.NaN))).toBe(true);
  });
});

describe("employerNpsAnnualFromPercents", () => {
  it("computes NPS off the COMPUTED basic, not off CTC", () => {
    // 45L CTC, 50% basic = 22.5L, 14% of basic = 3.15L
    expect(employerNpsAnnualFromPercents(4500000, 50, 14)).toBe(315000);
  });

  it("returns 0 when basic resolves to 0 or NPS pct is 0", () => {
    expect(employerNpsAnnualFromPercents(0, 50, 14)).toBe(0);
    expect(employerNpsAnnualFromPercents(4500000, 0, 14)).toBe(0);
    expect(employerNpsAnnualFromPercents(4500000, 50, 0)).toBe(0);
  });
});

describe("salaryEditPercents — FRESH entry (no stored salary / no CTC)", () => {
  it("prefills the law-grounded defaults for a brand-new private earner: 50% basic, 0% NPS", () => {
    expect(salaryEditPercents(undefined)).toEqual({ basicPercent: 50, employerNpsPercent: 0 });
    expect(salaryEditPercents({ annualCTC: 0 })).toEqual({ basicPercent: 50, employerNpsPercent: 0 });
  });

  it("prefills 14% NPS for a brand-new government earner (statutory employer contribution)", () => {
    expect(salaryEditPercents({ annualCTC: 0, employerSector: "government" })).toEqual({
      basicPercent: 50,
      employerNpsPercent: 14,
    });
  });
});

describe("salaryEditPercents — EXISTING record (no default resurrection)", () => {
  it("derives both percentages from stored amounts", () => {
    const r = salaryEditPercents({ annualCTC: 4500000, basicAnnual: 2250000, employerNpsAnnual: 315000 });
    expect(r.basicPercent).toBe(50);
    expect(r.employerNpsPercent).toBe(14);
  });

  it("rounds derived percentages to 1 decimal", () => {
    const r = salaryEditPercents({ annualCTC: 4500000, basicAnnual: 2000000, employerNpsAnnual: 250000 });
    expect(r.basicPercent).toBeCloseTo(44.4, 5);
    expect(r.employerNpsPercent).toBeCloseTo(12.5, 5);
  });

  it("BLOCKER lock: absent NPS on an existing record shows 0% — NEVER the default (a no-edit save must not manufacture a deduction)", () => {
    const r = salaryEditPercents({ annualCTC: 4500000, employerSector: "government" });
    expect(r.employerNpsPercent).toBe(0);
  });

  it("absent basic with no NPS shows 0% basic — a no-edit save must not write a default basic (gratuity/EPS disclosures depend on basic staying unrecorded)", () => {
    const r = salaryEditPercents({ annualCTC: 4500000 });
    expect(r.basicPercent).toBe(0);
    expect(r.employerNpsPercent).toBe(0);
  });

  it("legacy 'NPS stored, basic absent' (uncapped-trust state): default basic becomes the basis so the NPS ₹ round-trips intact", () => {
    // 45L CTC, default-basis basic 22.5L → stored NPS 2.25L reads as 10%
    const r = salaryEditPercents({ annualCTC: 4500000, employerNpsAnnual: 225000 });
    expect(r.basicPercent).toBe(DEFAULT_BASIC_PERCENT_OF_CTC);
    expect(r.employerNpsPercent).toBe(10);
    // round-trip: saving these percents reproduces the stored NPS exactly
    expect(employerNpsAnnualFromPercents(4500000, r.basicPercent, r.employerNpsPercent)).toBe(225000);
  });

  it("junk legacy data deriving >100% is surfaced UNCLAMPED (the form's 0-100 rule blocks save until the user fixes it)", () => {
    // NPS 1.4L vs basic 1L — the screenshot junk case
    const r = salaryEditPercents({ annualCTC: 4500000, basicAnnual: 100000, employerNpsAnnual: 140000 });
    expect(r.employerNpsPercent).toBe(140);
  });

  it("zero CTC with stored amounts yields defaults without NaN/Infinity", () => {
    const r = salaryEditPercents({ annualCTC: 0, basicAnnual: 100000, employerNpsAnnual: 140000 });
    expect(Number.isFinite(r.basicPercent)).toBe(true);
    expect(Number.isFinite(r.employerNpsPercent)).toBe(true);
    expect(r.basicPercent).toBe(DEFAULT_BASIC_PERCENT_OF_CTC);
  });

  it("round-trips: amounts → percents → amounts is identity for grid-clean data", () => {
    const ctc = 3600000;
    const basic = basicAnnualFromPercent(ctc, 50);
    const nps = employerNpsAnnualFromPercents(ctc, 50, 14);
    const back = salaryEditPercents({ annualCTC: ctc, basicAnnual: basic, employerNpsAnnual: nps });
    expect(basicAnnualFromPercent(ctc, back.basicPercent)).toBe(basic);
    expect(employerNpsAnnualFromPercents(ctc, back.basicPercent, back.employerNpsPercent)).toBe(nps);
  });

  it("off-grid amounts snap once to the 0.1% grid with drift bounded by 0.05% of the basis, then stay stable", () => {
    // Mauryas-like: CTC 42L, basic 16.8L (40.0%), NPS 1.2L (7.1428…% → snaps to 7.1%)
    const ctc = 4200000;
    const first = salaryEditPercents({ annualCTC: ctc, basicAnnual: 1680000, employerNpsAnnual: 120000 });
    const basic1 = basicAnnualFromPercent(ctc, first.basicPercent);
    const nps1 = employerNpsAnnualFromPercents(ctc, first.basicPercent, first.employerNpsPercent);
    expect(Math.abs(basic1 - 1680000)).toBeLessThanOrEqual(ctc * 0.0005);
    expect(Math.abs(nps1 - 120000)).toBeLessThanOrEqual(basic1 * 0.0005);
    // second open→save is a fixed point
    const second = salaryEditPercents({ annualCTC: ctc, basicAnnual: basic1, employerNpsAnnual: nps1 });
    expect(basicAnnualFromPercent(ctc, second.basicPercent)).toBe(basic1);
    expect(employerNpsAnnualFromPercents(ctc, second.basicPercent, second.employerNpsPercent)).toBe(nps1);
  });
});
