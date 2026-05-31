/**
 * ESOP / RSU two-layer taxation modeling.
 *
 * Phase 2 Stage D per docs/goals/build-firekaro-mvp-v5.md §5.
 * Audit Entry #24 A24.3-4 — Layer 1 perquisite + Layer 2 capital gains.
 *
 * Indian ESOP/RSU taxation is a two-stage event under the Income Tax Act:
 *
 *   LAYER 1 — Perquisite at vest/exercise:
 *     - Indian-grantor stock options: tax at EXERCISE on (FMV - Exercise Price).
 *     - Foreign-grantor RSUs (Google/Meta/Microsoft etc.): tax at VEST on full FMV.
 *     - Taxed at the employee's marginal slab rate.
 *     - Employer typically withholds TDS at exercise/vest.
 *
 *   LAYER 2 — Capital gains at sale:
 *     - Long-term (>12 months for listed, >24 months for unlisted post-FY24-25):
 *       - Listed Indian: 12.5% LTCG above ₹1.25L exemption (post FY 24-25)
 *       - Foreign / unlisted: 12.5% LTCG with indexation gone (per Budget 2024)
 *     - Short-term: slab for unlisted / 20% for listed.
 *     - Cost basis = FMV at vest/exercise (where Layer 1 tax was paid).
 *
 * Per Entry #24 A24.1 (added in Stage B schema), the user now records
 * grantorCountry + exercisePrice + fmvAtVest on each ESOP holding, which
 * feeds this module.
 */

import type { Investment } from "@/types/household";

// ---------- Statutory constants (post FY 24-25) ----------

export const LTCG_LISTED_RATE = 0.125;
export const LTCG_LISTED_EXEMPTION = 125_000;
export const STCG_LISTED_RATE = 0.20;
export const LTCG_UNLISTED_RATE = 0.125;
export const LISTED_LTCG_HOLDING_MONTHS = 12;
export const UNLISTED_LTCG_HOLDING_MONTHS = 24;

// ---------- Layer 1 — Perquisite tax at vest/exercise ----------

export interface PerquisiteInput {
  /** ESOP investment record (must be type: 'ESOP'). */
  inv: Investment;
  /** Marginal slab rate as decimal (e.g. 0.30). */
  marginalSlabRate: number;
}

export interface PerquisiteResult {
  /** Taxable perquisite value (Layer 1 base). */
  perquisiteValue: number;
  /** Tax owed on the perquisite (slab * value). */
  perquisiteTax: number;
  /** Trigger event timing — "exercise" for Indian, "vest" for foreign. */
  triggerAt: "vest" | "exercise";
}

/**
 * Compute the Layer 1 perquisite tax. Returns zero for non-ESOP types.
 *
 * Indian ESOP: perquisite = vested value - (exercise price × shares).
 * Foreign RSU: perquisite = full vested value (no exercise price).
 *
 * The investment record stores aggregate vestedValueINR; for the
 * Indian path the perquisite is vestedValue - (shares × exercisePrice).
 * v4 didn't track shares separately, so we approximate via the ratio
 * (fmvAtVest - exercisePrice) / fmvAtVest applied to vestedValueINR.
 */
export function calculatePerquisite(input: PerquisiteInput): PerquisiteResult {
  const { inv, marginalSlabRate } = input;
  if (inv.type !== "ESOP") {
    return { perquisiteValue: 0, perquisiteTax: 0, triggerAt: "vest" };
  }

  const vestedValue = inv.vestedValueINR ?? inv.value;
  const grantor = inv.grantorCountry ?? "India";

  if (grantor === "India") {
    // Layer 1 = (FMV at exercise - exercise price) × shares.
    const fmv = inv.fmvAtVest ?? 0;
    const ep = inv.exercisePrice ?? 0;
    if (fmv > 0 && ep > 0 && ep < fmv) {
      const spread = (fmv - ep) / fmv;
      const perquisiteValue = Math.round(vestedValue * spread);
      return {
        perquisiteValue,
        perquisiteTax: Math.round(perquisiteValue * marginalSlabRate),
        triggerAt: "exercise",
      };
    }
    // Missing FMV/exercise data — assume full vested value (conservative).
    return {
      perquisiteValue: vestedValue,
      perquisiteTax: Math.round(vestedValue * marginalSlabRate),
      triggerAt: "exercise",
    };
  }

  // Foreign RSU — full vested value at vest.
  return {
    perquisiteValue: vestedValue,
    perquisiteTax: Math.round(vestedValue * marginalSlabRate),
    triggerAt: "vest",
  };
}

// ---------- Layer 2 — Capital gains at sale ----------

export interface CapitalGainsInput {
  /** Sale proceeds in INR. */
  salePriceINR: number;
  /** Cost basis = FMV at vest/exercise (where Layer 1 was paid). */
  costBasisINR: number;
  /** Holding period in months from vest/exercise to sale. */
  holdingMonths: number;
  /** True for listed Indian stocks; false for foreign / unlisted. */
  isListedIndian: boolean;
  /** User's marginal slab rate as decimal — used for STCG on unlisted. */
  marginalSlabRate: number;
}

export interface CapitalGainsResult {
  /** Raw gain (sale - basis). Can be negative (loss). */
  gain: number;
  /** Classification — LTCG / STCG / Loss. */
  classification: "LTCG" | "STCG" | "Loss";
  /** Tax owed on the gain (after exemption where applicable). */
  tax: number;
  /** The exemption applied (₹1.25L for listed LTCG, 0 otherwise). */
  exemption: number;
}

/**
 * Compute Layer 2 capital gains tax. Treats losses as zero-tax (offset
 * mechanics for set-off vs other gains are out of MVP-1 scope).
 *
 * Listed Indian post FY 24-25:
 *   - >12mo: 12.5% LTCG above ₹1.25L exemption
 *   - ≤12mo: 20% STCG
 *
 * Foreign / unlisted post FY 24-25:
 *   - >24mo: 12.5% LTCG (no exemption, indexation removed)
 *   - ≤24mo: slab rate (STCG = ordinary income)
 */
export function calculateEsopCapitalGains(input: CapitalGainsInput): CapitalGainsResult {
  const gain = input.salePriceINR - input.costBasisINR;
  if (gain <= 0) {
    return { gain, classification: "Loss", tax: 0, exemption: 0 };
  }

  const ltcgMonths = input.isListedIndian
    ? LISTED_LTCG_HOLDING_MONTHS
    : UNLISTED_LTCG_HOLDING_MONTHS;
  const isLongTerm = input.holdingMonths > ltcgMonths;

  if (isLongTerm) {
    if (input.isListedIndian) {
      const exemption = LTCG_LISTED_EXEMPTION;
      const taxable = Math.max(0, gain - exemption);
      return {
        gain,
        classification: "LTCG",
        tax: Math.round(taxable * LTCG_LISTED_RATE),
        exemption,
      };
    }
    // Foreign / unlisted LTCG — no exemption.
    return {
      gain,
      classification: "LTCG",
      tax: Math.round(gain * LTCG_UNLISTED_RATE),
      exemption: 0,
    };
  }

  // STCG
  if (input.isListedIndian) {
    return {
      gain,
      classification: "STCG",
      tax: Math.round(gain * STCG_LISTED_RATE),
      exemption: 0,
    };
  }
  // Foreign / unlisted STCG = slab.
  return {
    gain,
    classification: "STCG",
    tax: Math.round(gain * input.marginalSlabRate),
    exemption: 0,
  };
}
