/**
 * Pure assumption-derivation helpers (Stage-T0 B-1 kernel prep).
 *
 * These were inline methods on the assumptions Pinia store. Extracting them as
 * pure functions over the flat `Assumptions` shape lets BOTH the store (thin
 * wrappers) and the pure derive() kernel call the same logic — no drift, and
 * the kernel stays free of any store dependency.
 */
import type { Assumptions } from "@/types/assumptions";
import { blendedInflation, getHorizonSWR } from "@/lib/fire-math";

/** Household 4-bucket blended inflation (audit Entry #3 A3.1 + A3.2 weights). */
export function resolveHouseholdInflation(v: Assumptions): number {
  return blendedInflation(
    {
      general: v.inflation,
      healthcare: v.healthcareInflation,
      education: v.educationInflation,
      housing: v.housingInflation,
    },
    v.inflationWeights,
  );
}

/**
 * Horizon-driven effective SWR (audit Entry #1 A1.1). A user `swrOverride`
 * still wins; otherwise the horizon bracket resolves from retire + plan-to age.
 */
export function resolveEffectiveSWRByHorizon(
  v: Assumptions,
  retirementAge?: number,
  planToAge?: number,
): number {
  if (v.swrOverride && v.swrOverride > 0) return v.swrOverride;
  return getHorizonSWR({ retirementAge, planToAge });
}

export interface PortfolioReturnWeights {
  equity: number;
  debt: number;
  realEstate: number;
  gold: number;
  nps: number;
  ppf: number;
  epf: number;
  international: number;
  reit: number;
  crypto: number;
  other: number;
}

/**
 * Blended expected return for the whole portfolio, weighted by asset values.
 * `epfReturnOverride` (audit A15.3) swaps the EPF bucket for its after-tax
 * effective yield when supplied.
 */
export function blendPortfolioReturn(
  v: Assumptions,
  weights: PortfolioReturnWeights,
  epfReturnOverride?: number,
): number {
  const total =
    weights.equity +
    weights.debt +
    weights.realEstate +
    weights.gold +
    weights.nps +
    weights.ppf +
    weights.epf +
    weights.international +
    weights.reit +
    weights.crypto +
    weights.other;
  if (total <= 0) return v.equityReturn;
  const epfRate = epfReturnOverride ?? v.epfReturn;
  const weighted =
    weights.equity * v.equityReturn +
    weights.debt * v.debtReturn +
    weights.realEstate * v.realEstateReturn +
    weights.gold * v.goldReturn +
    weights.nps * v.npsReturn +
    weights.ppf * v.ppfReturn +
    weights.epf * epfRate +
    weights.international * v.internationalReturn +
    weights.reit * v.reitReturn +
    weights.crypto * v.cryptoReturn +
    weights.other * v.debtReturn; // treat "other" as debt-like
  return weighted / total;
}
