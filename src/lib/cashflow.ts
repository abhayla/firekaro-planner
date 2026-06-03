/**
 * Cashflow value object — single source of truth for monetary flows.
 *
 * Phase 0 Stage A1 per docs/goals/build-firekaro-mvp-v5.md §3
 * (Concern #3 from /improve-codebase-architecture: "Money has no type;
 * frequency string-conv").
 *
 * Before this module, the demo had two inline helper conventions
 * (`recurringToMonthly` taking 'M' | 'Q' | 'A' and `monthlyOrAnnualToAnnual`
 * taking 'monthly' | 'annual') duplicated across 6+ sites. The two
 * conventions disagreed on the period code which made cross-site
 * reasoning ("does this surface count business income correctly?") an
 * exercise in re-deriving the conversion at every call.
 *
 * Going forward:
 *   - Every monetary flow has period 'M' | 'Q' | 'A'.
 *   - Conversions ALWAYS go through this module.
 *   - No inline switch (freq) anywhere outside this file.
 */

export type Period = "M" | "Q" | "A";

export interface Cashflow {
  amount: number;
  period: Period;
}

const MONTHS_PER_YEAR = 12;
const MONTHS_PER_QUARTER = 3;

/**
 * Reduce a Cashflow to monthly equivalent.
 *
 * monthly  -> amount
 * quarterly -> amount / 3 months
 * annual   -> amount / 12 months
 */
export function toMonthly(cf: Cashflow): number {
  switch (cf.period) {
    case "M":
      return cf.amount;
    case "Q":
      return cf.amount / MONTHS_PER_QUARTER;
    case "A":
      return cf.amount / MONTHS_PER_YEAR;
    default:
      // #22: an unknown/legacy period must NEVER return undefined → NaN-poison the
      // FIRE number. Treat as annual (the conservative no-12×-blowup fallback).
      return cf.amount / MONTHS_PER_YEAR;
  }
}

/**
 * Lift a Cashflow to annual equivalent.
 *
 * monthly  -> amount * 12
 * quarterly -> amount * 4
 * annual   -> amount
 */
export function toAnnual(cf: Cashflow): number {
  switch (cf.period) {
    case "M":
      return cf.amount * MONTHS_PER_YEAR;
    case "Q":
      return cf.amount * (MONTHS_PER_YEAR / MONTHS_PER_QUARTER);
    case "A":
      return cf.amount;
    default:
      // #22: unknown/legacy period must NEVER return undefined → NaN. Treat as
      // already-annual (conservative — avoids a spurious 12× inflation).
      return cf.amount;
  }
}

/**
 * Compound inflate a Cashflow forward by `years` at `rate` (decimal).
 * Returns a NEW Cashflow with the same period; only `amount` is scaled.
 *
 * inflate({ amount: 1000, period: 'M' }, 2, 0.06) -> { amount: 1123.6, period: 'M' }
 *
 * `years` may be fractional. Negative years deflate.
 */
export function inflate(cf: Cashflow, years: number, rate: number): Cashflow {
  return {
    amount: cf.amount * Math.pow(1 + rate, years),
    period: cf.period,
  };
}

/**
 * Sum N Cashflows that may be in different periods.
 *
 * Strategy: lift every flow to annual, sum, then re-cast as annual.
 * Use toMonthly()/toAnnual() at the call site if a different period
 * is required for display.
 *
 * Returns a Cashflow with period: 'A' and amount = sum of annualized inputs.
 * add() of zero flows is { amount: 0, period: 'A' }.
 */
export function add(...cfs: Cashflow[]): Cashflow {
  const total = cfs.reduce((sum, cf) => sum + toAnnual(cf), 0);
  return { amount: total, period: "A" };
}

/**
 * Migration helper — translates the legacy 'monthly' | 'annual' tags used
 * in v4-shaped data (OtherIncomeLine, Business) to the new 'M' | 'Q' | 'A'
 * codes. Used by stores/household.ts hydrate() during the localStorage
 * read step.
 *
 * Unknown / undefined inputs default to 'A' (the v4 default for those two
 * shapes — see v4 schemas where the form's default is 'annual').
 */
export function legacyFreqToPeriod(legacy: unknown): Period {
  if (legacy === "M" || legacy === "Q" || legacy === "A") return legacy;
  if (legacy === "monthly") return "M";
  if (legacy === "annual" || legacy === "yearly") return "A";
  if (legacy === "quarterly") return "Q";
  return "A";
}
