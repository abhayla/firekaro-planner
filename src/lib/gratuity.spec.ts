/**
 * Phase E (#13 gratuity) — gratuity + exit benefits as an exit lump.
 *
 * The OPPOSITE-direction error to the rest of this layer: gratuity is real cash
 * the app currently MISSES at job exit, so modelling it ADDS to the reachable
 * corpus at the FIRE age. Conservative here means UNDER-stating it (don't inflate
 * the corpus) — so when basic pay is unknown we assume a LOW basic fraction.
 *
 * Pins the current formula (15/26 × last-drawn monthly basic × completed years,
 * ₹20L tax-free cap, excess slab-taxed, ≥5yr eligibility) + disclosures.
 */
import { describe, it, expect } from "vitest";
import {
  calculateGratuity,
  deriveGratuityForMember,
  GRATUITY_TAX_FREE_CAP,
  GRATUITY_MIN_SERVICE_YEARS,
  ASSUMED_BASIC_FRACTION_OF_CTC,
} from "./gratuity";
import type { Member } from "@/types/household";

describe("calculateGratuity — the formula", () => {
  it("gratuity = 15/26 × monthly basic × completed years, tax-free under ₹20L", () => {
    // ₹1L basic × 27 yrs × 15/26 = ₹15,57,692 < ₹20L cap → fully tax-free.
    const r = calculateGratuity({ monthlyBasic: 100_000, yearsOfService: 27, marginalSlabRate: 0.3 });
    expect(r.gross).toBe(Math.round((15 / 26) * 100_000 * 27));
    expect(r.taxablePortion).toBe(0);
    expect(r.taxOwed).toBe(0);
    expect(r.net).toBe(r.gross);
    expect(r.eligible).toBe(true);
  });

  it("taxes only the excess over the ₹20L cap at slab (+cess)", () => {
    // ₹2L basic × 30 yrs × 15/26 = ₹34,61,538 → ₹14,61,538 over the ₹20L cap.
    const r = calculateGratuity({ monthlyBasic: 200_000, yearsOfService: 30, marginalSlabRate: 0.3 });
    const gross = Math.round((15 / 26) * 200_000 * 30);
    const taxable = gross - GRATUITY_TAX_FREE_CAP;
    expect(r.gross).toBe(gross);
    expect(r.taxablePortion).toBe(taxable);
    expect(r.taxOwed).toBe(Math.round(taxable * 0.3 * 1.04));
    expect(r.net).toBe(gross - r.taxOwed);
  });

  it("less than 5 years of service → no gratuity (not eligible) + note", () => {
    const r = calculateGratuity({ monthlyBasic: 100_000, yearsOfService: 4, marginalSlabRate: 0.3 });
    expect(r.gross).toBe(0);
    expect(r.net).toBe(0);
    expect(r.eligible).toBe(false);
    expect(r.assumptions.some((a) => /5 year|eligib/i.test(a.assumed + a.why))).toBe(true);
  });

  it("is defensive: NaN/negative inputs yield a clean zero", () => {
    const r = calculateGratuity({ monthlyBasic: NaN, yearsOfService: -3, marginalSlabRate: 0.3 });
    expect(r.gross).toBe(0);
    expect(r.net).toBe(0);
  });
});

describe("deriveGratuityForMember — derives basic + service, conservative + disclosed", () => {
  const asOf = new Date("2026-01-01T00:00:00Z");
  function earner(over: Partial<Member> = {}): Member {
    return {
      id: "m1",
      name: "Rohit",
      dateOfBirth: "1986-01-01",
      role: "ADULT",
      targetRetirementAge: 50,
      city: "Metro",
      health: "Healthy",
      riskAppetite: "Moderate",
      marital: "Married",
      salary: { annualCTC: 3_000_000, hikePercent: 8 },
      ...over,
    } as Member;
  }

  it("uses basic pay when present", () => {
    const r = deriveGratuityForMember(
      earner({ salary: { annualCTC: 3_000_000, hikePercent: 8, basicAnnual: 1_440_000 } }),
      0.3,
      asOf,
    );
    // basic ₹1.44L/yr... = ₹120,000/mo; service 50−23=27.
    expect(r!.gross).toBe(Math.round((15 / 26) * 120_000 * 27));
  });

  it("conservatively estimates basic as a LOW fraction of CTC when basic is unknown + discloses", () => {
    const r = deriveGratuityForMember(earner(), 0.3, asOf);
    const monthlyBasic = (3_000_000 * ASSUMED_BASIC_FRACTION_OF_CTC) / 12;
    expect(r!.gross).toBe(Math.round((15 / 26) * monthlyBasic * 27));
    expect(r!.assumptions.some((a) => /basic|CTC|fraction/i.test(a.assumed + a.why))).toBe(true);
    // Conservative for an ADDITION → under-state: fraction must sit at the LOW
    // end for the urban private-salaried persona (basic often 30-40% of CTC).
    expect(ASSUMED_BASIC_FRACTION_OF_CTC).toBeLessThanOrEqual(0.4);
  });

  it("returns null for a non-earner / no salary (no gratuity)", () => {
    expect(deriveGratuityForMember(earner({ role: "DEPENDENT", salary: undefined }), 0.3, asOf)).toBeNull();
  });

  it("GRATUITY_MIN_SERVICE_YEARS is the current 5-year floor", () => {
    expect(GRATUITY_MIN_SERVICE_YEARS).toBe(5);
  });
});
