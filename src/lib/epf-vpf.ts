/**
 * EPF / VPF threshold modeling — the ₹2.5L tax-on-excess-interest rule.
 *
 * Phase 2 Stage D per docs/goals/build-firekaro-mvp-v5.md §5.
 * Audit Entry #15 A15.1-3 — replaces v4's missing threshold model.
 *
 * Rules (per CBDT Notification + Budget 2021 onwards):
 *   - EPF + VPF contributions up to ₹2.5L / year are EEE (Exempt at
 *     contribution, accumulation, withdrawal).
 *   - Contributions ABOVE ₹2.5L are still allowed, but the INTEREST
 *     earned on the excess is taxed annually at the contributor's slab.
 *   - For "exempt from employer contribution" cases (govt employees
 *     without employer EPF), the threshold is ₹5L instead of ₹2.5L.
 *
 * This module computes the post-tax after-tax yield breakdown so the
 * /investments surface can warn high-basic earners that their VPF
 * top-up may be earning less effective yield than expected.
 */

export const EPF_VPF_TAX_FREE_THRESHOLD = 250_000;
export const EPF_VPF_TAX_FREE_THRESHOLD_NO_EMPLOYER = 500_000;

export interface EpfVpfYearInput {
  /** Annual EPF + VPF contribution from the employee (gross). */
  annualContribution: number;
  /** EPF interest rate as decimal (default 0.0825 = 8.25%). */
  epfRate?: number;
  /** Employee's marginal slab rate as decimal (e.g. 0.30). */
  marginalSlabRate: number;
  /** True when the employer contributes EPF (~all private sector). */
  employerContributes?: boolean;
}

export interface EpfVpfYearResult {
  /** Tax-free portion of the contribution. */
  taxFreeContribution: number;
  /** Excess contribution whose interest is taxed. */
  taxableContribution: number;
  /** Gross interest earned (on tax-free portion). */
  taxFreeInterest: number;
  /** Gross interest earned on the excess (will be taxed). */
  taxableInterest: number;
  /** Tax paid on the excess interest. */
  taxOnExcessInterest: number;
  /** Net (post-tax) interest from the excess. */
  netExcessInterest: number;
  /**
   * Effective yield (decimal) after tax — useful for the VPF
   * "is the extra contribution worth it?" surfacing.
   */
  effectiveYield: number;
}

/**
 * Compute one year's EPF/VPF tax breakdown.
 * Used by the /investments EPF/VPF threshold breakdown card (Stage K).
 *
 * Assumes the interest accrues on the FULL contribution (which is true
 * in EPF — the excess portion is real interest, just taxed). The tax
 * applies only to the interest on the excess.
 */
export function calculateEpfVpfYear(input: EpfVpfYearInput): EpfVpfYearResult {
  const epfRate = input.epfRate ?? 0.0825;
  const employerContributes = input.employerContributes ?? true;
  const threshold = employerContributes
    ? EPF_VPF_TAX_FREE_THRESHOLD
    : EPF_VPF_TAX_FREE_THRESHOLD_NO_EMPLOYER;

  const taxFreeContribution = Math.min(threshold, input.annualContribution);
  const taxableContribution = Math.max(0, input.annualContribution - threshold);

  const taxFreeInterest = taxFreeContribution * epfRate;
  const taxableInterest = taxableContribution * epfRate;
  const taxOnExcessInterest = taxableInterest * input.marginalSlabRate;
  const netExcessInterest = taxableInterest - taxOnExcessInterest;

  // Effective yield = (total post-tax interest) / total contribution
  const effectiveYield =
    input.annualContribution > 0
      ? (taxFreeInterest + netExcessInterest) / input.annualContribution
      : 0;

  return {
    taxFreeContribution: Math.round(taxFreeContribution),
    taxableContribution: Math.round(taxableContribution),
    taxFreeInterest: Math.round(taxFreeInterest),
    taxableInterest: Math.round(taxableInterest),
    taxOnExcessInterest: Math.round(taxOnExcessInterest),
    netExcessInterest: Math.round(netExcessInterest),
    effectiveYield: Math.round(effectiveYield * 10000) / 10000,
  };
}

/**
 * After-tax effective yield (decimal) for the EPF bucket in a blended-return
 * weighting (audit A15.3). Below the ₹2.5L threshold there is no interest tax,
 * so this returns the raw `epfRate` exactly (a no-op for small contributors) —
 * callers can therefore invoke it unconditionally. Above the threshold the
 * excess interest is taxed at the marginal slab, dragging the effective yield
 * down (matches {@link calculateEpfVpfYear}.effectiveYield).
 */
export function epfBucketAfterTaxReturn(input: {
  /** Annual EPF + VPF contribution (employee gross). */
  annualContribution: number;
  /** Household top marginal slab rate as decimal (e.g. 0.30). */
  marginalSlabRate: number;
  /** EPF interest rate as decimal (default 0.0825). */
  epfRate?: number;
  /** True when the employer contributes EPF (private sector). */
  employerContributes?: boolean;
}): number {
  const epfRate = input.epfRate ?? 0.0825;
  const employerContributes = input.employerContributes ?? true;
  const threshold = employerContributes
    ? EPF_VPF_TAX_FREE_THRESHOLD
    : EPF_VPF_TAX_FREE_THRESHOLD_NO_EMPLOYER;
  // Exact no-op below the threshold (avoids 4-dp rounding drift in effectiveYield).
  if (input.annualContribution <= threshold) return epfRate;
  return calculateEpfVpfYear({
    annualContribution: input.annualContribution,
    marginalSlabRate: input.marginalSlabRate,
    epfRate,
    employerContributes,
  }).effectiveYield;
}

/**
 * Project the long-run impact of staying above the threshold versus
 * capping at ₹2.5L. Used by the Dashboard nudge engine (Stage Q) when
 * a user's VPF top-up consistently exceeds the threshold but their
 * marginal slab makes the post-tax yield comparable to or worse than
 * equity alternatives.
 *
 * Returns the years until the after-tax yield gap (vs equity) sums to
 * ₹1L of foregone returns. A short payback period (<3 years) is the
 * trigger for the "cap your VPF" nudge.
 */
export function epfVpfOpportunityCostYears(
  excessAnnualContribution: number,
  marginalSlabRate: number,
  epfRate: number = 0.0825,
  alternativeEquityReturn: number = 0.12,
): number {
  if (excessAnnualContribution <= 0) return Infinity;
  const epfAfterTax = epfRate * (1 - marginalSlabRate);
  const gap = alternativeEquityReturn - epfAfterTax;
  if (gap <= 0) return Infinity;
  // Annual foregone return on the excess.
  const annualGap = excessAnnualContribution * gap;
  if (annualGap <= 0) return Infinity;
  return Math.round(100_000 / annualGap);
}
