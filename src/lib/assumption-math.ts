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
import { generalInflationWithCreep } from "@/lib/income-path";
import { RETURN_BUCKET_VOLATILITY } from "@/lib/monte-carlo";

/**
 * The ONE household expense basket every surface must show and the kernel must plan with
 * (ADR-0006 "one basket" + ADR-0007 (c)/(d)).
 *
 * The 4-bucket blend WITH lifestyle creep folded into the `general` bucket. Creep is a permanent
 * lifestyle ratchet: it grows the expense line AND the FIRE target the corpus has to fund, so it
 * belongs to the basket itself rather than being a second term some consumers apply and others
 * forget. The FinTech review of gh #185 caught exactly that asymmetry inside `derive()`; the
 * REVIEW OF THE REVIEW caught it one layer out — `derive()` folded creep in, the store's
 * `householdInflation()` did not, so with creep > 0 the expense-trend chart and the /preferences
 * basket readout quoted a DIFFERENT rate from the one the plan used. That is the gh #180 class:
 * two numbers on one screen from one store.
 *
 * This function is the single formula. `resolveHouseholdInflation` below is the creep-FREE blend,
 * kept for the two places that genuinely need the price-only basket (the basket-sanity verdict,
 * which compares priced buckets against all-items CPI, and the internal drift computation in
 * `derive()` that already supplies its own creep-adjusted `inflation`).
 */
export function resolveHouseholdBasket(v: Assumptions): number {
  return resolveHouseholdInflation({
    ...v,
    inflation: generalInflationWithCreep(v.inflation, v.expenseGrowthAboveInflationPercent),
  });
}

/** Household 4-bucket blended inflation, creep-FREE (audit Entry #3 A3.1 + A3.2 weights). */
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

function portfolioWeightTotal(weights: PortfolioReturnWeights): number {
  return (
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
    weights.other
  );
}

/**
 * gh #194 — the shared fallback-selection helper for `blendPortfolioReturn` and
 * `blendPortfolioVolatility`.
 *
 * RCA: both functions used to key their "is the portfolio empty?" check off VALUE weights alone
 * and, when the value total was ≤ 0, fell back to the all-equity rate/σ. That is correct for a
 * TRULY empty household (no assets, no savings), but every new user and the whole ₹2.5L-₹10L
 * accumulator band carries a non-zero `monthlyContribution` against an auto-flowed EPF line that
 * starts at `value: 0` (`household.ts`) — so their honest EPF-only savings stream was projected
 * at an optimistic all-equity 12% nominal instead of the EPF rate they actually earn.
 *
 * Resolution order, never falling back to equity as a DEFAULT:
 *   1. Value weights, when their total is positive (unchanged — households with holdings).
 *   2. Contribution weights, when supplied and their total is positive (the CONTRIBUTION mix —
 *      what the household is actually funding, before any value has accumulated).
 *   3. The conservative-of-types present in EITHER weight map (never equity by default); when
 *      neither map has anything to blend, `debt` — the fixed-income floor, not equity.
 */
function resolvePortfolioWeights(
  valueWeights: PortfolioReturnWeights,
  contributionWeights?: PortfolioReturnWeights,
): { weights: PortfolioReturnWeights; total: number } {
  const valueTotal = portfolioWeightTotal(valueWeights);
  if (valueTotal > 0) return { weights: valueWeights, total: valueTotal };

  if (contributionWeights) {
    const contributionTotal = portfolioWeightTotal(contributionWeights);
    if (contributionTotal > 0) return { weights: contributionWeights, total: contributionTotal };
  }

  // Truly empty (no value, no contribution in either map) — fall back to a single debt-weighted
  // "portfolio" rather than equity. Debt is the conservative, honesty-safe floor for a household
  // with nothing yet committed to any instrument.
  return {
    weights: { ...ZERO_PORTFOLIO_WEIGHTS, debt: 1 },
    total: 1,
  };
}

const ZERO_PORTFOLIO_WEIGHTS: PortfolioReturnWeights = {
  equity: 0, debt: 0, realEstate: 0, gold: 0, nps: 0, ppf: 0, epf: 0,
  international: 0, reit: 0, crypto: 0, other: 0,
};

/**
 * Blended expected return for the whole portfolio, weighted by asset values.
 * `epfReturnOverride` (audit A15.3) swaps the EPF bucket for its after-tax
 * effective yield when supplied.
 *
 * `contributionWeights` (gh #194) is the optional fallback mix used when the household's VALUE
 * weights total zero — see `resolvePortfolioWeights` above. Omitting it preserves the truly-empty
 * fallback (debt, not equity) for existing callers that have no contribution mix to hand.
 */
export function blendPortfolioReturn(
  v: Assumptions,
  weights: PortfolioReturnWeights,
  epfReturnOverride?: number,
  contributionWeights?: PortfolioReturnWeights,
): number {
  const { weights: w, total } = resolvePortfolioWeights(weights, contributionWeights);
  const epfRate = epfReturnOverride ?? v.epfReturn;
  const weighted =
    w.equity * v.equityReturn +
    w.debt * v.debtReturn +
    w.realEstate * v.realEstateReturn +
    w.gold * v.goldReturn +
    w.nps * v.npsReturn +
    w.ppf * v.ppfReturn +
    w.epf * epfRate +
    w.international * v.internationalReturn +
    w.reit * v.reitReturn +
    w.crypto * v.cryptoReturn +
    w.other * v.debtReturn; // treat "other" as debt-like
  return weighted / total;
}

/**
 * Blended portfolio annual return volatility (stdev), value-weighted over the SAME
 * `PortfolioReturnWeights` buckets as `blendPortfolioReturn`, using
 * `RETURN_BUCKET_VOLATILITY`. Feeds the Monte Carlo headline confidence band (#18).
 *
 * gh #194: the empty-portfolio fallback used to be the equity σ (the widest band, argued as
 * "a not-yet-invested saver still bears risk"). That argument doesn't hold once the household DOES
 * have a committed contribution mix — a household saving only into EPF is not bearing equity risk.
 * Fallback order mirrors `blendPortfolioReturn` via `resolvePortfolioWeights`: value weights, then
 * `contributionWeights` when supplied, then debt σ (never equity) for a truly empty household.
 *
 * It is a value-weighted average of per-bucket stdevs and INTENTIONALLY omits the
 * cross-asset covariance term. For a long-horizon FIRE band that errs HIGH (assumes
 * perfect correlation = the widest, most honest band) rather than netting risk
 * away — the non-understatement direction the honesty goal requires.
 */
export function blendPortfolioVolatility(
  weights: PortfolioReturnWeights,
  contributionWeights?: PortfolioReturnWeights,
): number {
  const { weights: w, total } = resolvePortfolioWeights(weights, contributionWeights);
  const weighted =
    w.equity * RETURN_BUCKET_VOLATILITY.equity +
    w.debt * RETURN_BUCKET_VOLATILITY.debt +
    w.realEstate * RETURN_BUCKET_VOLATILITY.realEstate +
    w.gold * RETURN_BUCKET_VOLATILITY.gold +
    w.nps * RETURN_BUCKET_VOLATILITY.nps +
    w.ppf * RETURN_BUCKET_VOLATILITY.ppf +
    w.epf * RETURN_BUCKET_VOLATILITY.epf +
    w.international * RETURN_BUCKET_VOLATILITY.international +
    w.reit * RETURN_BUCKET_VOLATILITY.reit +
    w.crypto * RETURN_BUCKET_VOLATILITY.crypto +
    w.other * RETURN_BUCKET_VOLATILITY.other;
  return weighted / total;
}
