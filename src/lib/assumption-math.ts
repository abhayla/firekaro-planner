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
import { RETURN_BUCKET_VOLATILITY } from "@/lib/monte-carlo";

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
 * ADR-0006 Phase 1b — the documented SANITY BAND for the household expense basket.
 *
 * `healthcareInflation`, `educationInflation`, `housingInflation` and `inflationWeights` became
 * HEADLINE-MOVING knobs when the target started growing at the basket, and /preferences lets a
 * user edit all of them. Two settings are not merely aggressive, they are incoherent, and the
 * product should say so rather than silently plan on them:
 *
 *   - **basket < general CPI (g < 0)** — the FIRE target would FALL in today's rupees every year.
 *     `general` is the ALL-ITEMS CPI and the other three buckets are components of it, so a
 *     disjoint household blend can sit slightly above or level with it, never below: a household
 *     cannot spend on a cheaper-than-everything basket forever. This is the OPTIMISTIC direction —
 *     it shrinks the number the user is saving toward.
 *   - **basket > CPI + 300 bp** — the pre-ADR-0006 7.90% basket sat 190 bp above CPI and was
 *     already double-counting by construction (FinTech CRITICAL-1); by year 25 a 300 bp excess
 *     compounds to a target ~2.1x the base in real terms, which is the "FIRE at 115" regime the
 *     #20 collapse was a panicked response to. Above this the plan is not conservative, it is
 *     unusable.
 *
 * This CLAMPS NOTHING — the user's numbers are their own, and a silent clamp would be its own
 * dishonesty. It returns a verdict the UI discloses. Pure; no store, no DOM.
 */
export const BASKET_SANITY_MAX_EXCESS_BP = 300;

export interface BasketSanity {
  /** The blended household basket (decimal). */
  basket: number;
  /** General CPI (decimal) — the deflator every today's-rupee figure is quoted in. */
  generalInflation: number;
  /** basket − CPI, in basis points. Negative ⇒ the real target FALLS. */
  excessBasisPoints: number;
  /** True when the basket sits in [CPI, CPI + 300 bp]. */
  ok: boolean;
  /** Which side it is out on — `null` when `ok`. */
  verdict: "below-cpi" | "far-above-cpi" | null;
}

export function basketSanity(v: Assumptions): BasketSanity {
  const basket = resolveHouseholdInflation(v);
  const generalInflation = v.inflation;
  const excessBasisPoints = Math.round((basket - generalInflation) * 10_000);
  const verdict: BasketSanity["verdict"] =
    excessBasisPoints < 0
      ? "below-cpi"
      : excessBasisPoints > BASKET_SANITY_MAX_EXCESS_BP
        ? "far-above-cpi"
        : null;
  return { basket, generalInflation, excessBasisPoints, ok: verdict === null, verdict };
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

/**
 * Blended portfolio annual return volatility (stdev), value-weighted over the SAME
 * `PortfolioReturnWeights` buckets as `blendPortfolioReturn`, using
 * `RETURN_BUCKET_VOLATILITY`. Feeds the Monte Carlo headline confidence band (#18).
 * Empty/zero portfolio → equity σ (a sane default for a not-yet-invested accumulator).
 *
 * It is a value-weighted average of per-bucket stdevs and INTENTIONALLY omits the
 * cross-asset covariance term. For a long-horizon FIRE band that errs HIGH (assumes
 * perfect correlation = the widest, most honest band) rather than netting risk
 * away — the non-understatement direction the honesty goal requires.
 */
export function blendPortfolioVolatility(weights: PortfolioReturnWeights): number {
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
  if (total <= 0) return RETURN_BUCKET_VOLATILITY.equity;
  const weighted =
    weights.equity * RETURN_BUCKET_VOLATILITY.equity +
    weights.debt * RETURN_BUCKET_VOLATILITY.debt +
    weights.realEstate * RETURN_BUCKET_VOLATILITY.realEstate +
    weights.gold * RETURN_BUCKET_VOLATILITY.gold +
    weights.nps * RETURN_BUCKET_VOLATILITY.nps +
    weights.ppf * RETURN_BUCKET_VOLATILITY.ppf +
    weights.epf * RETURN_BUCKET_VOLATILITY.epf +
    weights.international * RETURN_BUCKET_VOLATILITY.international +
    weights.reit * RETURN_BUCKET_VOLATILITY.reit +
    weights.crypto * RETURN_BUCKET_VOLATILITY.crypto +
    weights.other * RETURN_BUCKET_VOLATILITY.other;
  return weighted / total;
}
