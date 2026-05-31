/**
 * NPS withdrawal modeling — PFRDA 2025 60/20/20 split.
 *
 * Phase 2 Stage D per docs/goals/build-firekaro-mvp-v5.md §5.
 * Audit Entry #14 A14.1 — replaces v4's missing NPS withdrawal model.
 *
 * PFRDA exit rules (per Master Direction 2025):
 *   - Corpus ≤ ₹5L: 100% withdrawable lump sum (no annuity requirement).
 *   - Corpus > ₹5L:
 *     - 60% lump sum, tax-FREE
 *     - 40% MUST go to annuity. Annuity income is taxed at slab.
 *
 * For corpus in the special low-band (≤₹5L), the user can take it all
 * as lump-sum. Above the band, the 40% annuity is mandatory regardless
 * of user preference.
 */

export const NPS_FULL_WITHDRAWAL_THRESHOLD = 500_000;
export const NPS_LUMPSUM_PERCENT = 0.6;
export const NPS_ANNUITY_PERCENT = 0.4;

export interface NpsWithdrawalSplit {
  totalCorpus: number;
  /** Tax-free lump sum at exit. */
  lumpSum: number;
  /** Corpus that MUST convert to annuity. */
  annuityCorpus: number;
  /** Estimated annual annuity income (at the assumed annuity rate). */
  annuityIncomeAnnual: number;
  /** True when the corpus is below the ₹5L full-withdrawal threshold. */
  isBelowThreshold: boolean;
}

export interface NpsWithdrawalInput {
  totalCorpus: number;
  /** Annuity rate as decimal (e.g. 0.06 = 6% annual annuity payout). */
  annuityRate?: number;
}

/**
 * Compute the lump-sum / annuity split per PFRDA 2025 rules.
 *
 * - Below ₹5L: full lump sum, no annuity.
 * - Above ₹5L: 60% lump sum, 40% annuity at the assumed annuity rate
 *   (default 0.06 — research Ch 03 §3.7 cites Indian annuity rates
 *   typically 5.5-6.5%).
 */
export function calculateNpsWithdrawal(input: NpsWithdrawalInput): NpsWithdrawalSplit {
  const { totalCorpus } = input;
  const annuityRate = input.annuityRate ?? 0.06;

  if (totalCorpus <= NPS_FULL_WITHDRAWAL_THRESHOLD) {
    return {
      totalCorpus,
      lumpSum: totalCorpus,
      annuityCorpus: 0,
      annuityIncomeAnnual: 0,
      isBelowThreshold: true,
    };
  }

  const lumpSum = totalCorpus * NPS_LUMPSUM_PERCENT;
  const annuityCorpus = totalCorpus * NPS_ANNUITY_PERCENT;
  const annuityIncomeAnnual = annuityCorpus * annuityRate;

  return {
    totalCorpus,
    lumpSum: Math.round(lumpSum),
    annuityCorpus: Math.round(annuityCorpus),
    annuityIncomeAnnual: Math.round(annuityIncomeAnnual),
    isBelowThreshold: false,
  };
}

/**
 * Suggested NPS contribution cap — audit Entry #14 A14.3. When the
 * projected NPS corpus at retirement exceeds the "sweet spot" (where
 * the mandatory 40% annuity becomes a yield-drag relative to alternative
 * instruments), Dashboard surfaces a "consider capping NPS at X" nudge.
 *
 * Sweet spot heuristic per research Ch 03 §3.9:
 *   - Annuity yield (~6%) < typical equity expected return (~10%)
 *   - 40% of corpus locked at lower yield = opportunity cost
 *   - Cap at the corpus level where lump-sum portion alone funds 5 years
 *     of expenses (industry guidance for retiree liquidity).
 */
export interface NpsCapSuggestion {
  /** True when user should consider redirecting future NPS contributions. */
  suggestCap: boolean;
  /** The corpus level above which the suggestion fires. */
  suggestedCap: number;
  /** Short reason copy for tooltip. */
  reason: string;
}

export function suggestNpsCap(
  projectedNpsCorpus: number,
  annualExpenses: number,
): NpsCapSuggestion {
  // Rule of thumb: cap NPS where the 60% lump-sum portion covers 5 years
  // of expenses. Above that, the 40% annuity becomes deadweight.
  const suggestedCap = (annualExpenses * 5) / NPS_LUMPSUM_PERCENT;
  const suggestCap = projectedNpsCorpus > suggestedCap;
  return {
    suggestCap,
    suggestedCap: Math.round(suggestedCap),
    reason: suggestCap
      ? `Your projected NPS corpus exceeds the point where the mandatory 40% annuity (~6% yield) becomes a drag versus equity (~10%). Consider redirecting new contributions to ELSS / VPF.`
      : "NPS corpus is within the sweet spot — 60% lump sum + 40% annuity remains efficient.",
  };
}
