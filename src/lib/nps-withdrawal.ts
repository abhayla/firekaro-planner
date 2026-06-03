/**
 * NPS withdrawal modeling — PFRDA exit splits (normal + premature).
 *
 * Phase 2 Stage D per docs/goals/build-firekaro-mvp-v5.md §5.
 * Audit Entry #14 A14.1 — replaces v4's missing NPS withdrawal model.
 * #15 bridge: extended with the premature-exit (before 60) split.
 *
 * PFRDA exit rules (per Master Direction):
 *   NORMAL exit (at/after 60 — the default):
 *   - Corpus ≤ ₹5L: 100% withdrawable lump sum (no annuity requirement).
 *   - Corpus > ₹5L: 60% lump sum tax-FREE + 40% MANDATORY annuity (slab-taxed).
 *
 *   PREMATURE exit (before 60 — `exitType: "early"`):
 *   - Corpus ≤ ₹2.5L: 100% withdrawable lump sum.
 *   - Corpus > ₹2.5L: 20% lump sum tax-FREE + 80% MANDATORY annuity (slab-taxed).
 *
 * For corpus in the special low-band (≤₹5L), the user can take it all
 * as lump-sum. Above the band, the 40% annuity is mandatory regardless
 * of user preference.
 */

export const NPS_FULL_WITHDRAWAL_THRESHOLD = 500_000;
export const NPS_LUMPSUM_PERCENT = 0.6;
export const NPS_ANNUITY_PERCENT = 0.4;

/**
 * Premature-exit rules (exit BEFORE 60 — the salaried accumulator who retires
 * early). Stricter than the normal 60/40 split: the corpus floor for a full
 * lump is half (₹2.5L), and above it only 20% comes out as cash while 80% is
 * forced into an annuity. This is the conservative, honest treatment for the
 * #15 accumulation bridge — touching NPS early strands far more of it.
 */
export const NPS_EARLY_EXIT_THRESHOLD = 250_000;
export const NPS_EARLY_LUMPSUM_PERCENT = 0.2;
export const NPS_EARLY_ANNUITY_PERCENT = 0.8;

export interface NpsWithdrawalSplit {
  totalCorpus: number;
  /** Tax-free lump sum at exit. */
  lumpSum: number;
  /** Corpus that MUST convert to annuity. */
  annuityCorpus: number;
  /**
   * Estimated annual annuity income (GROSS, at the assumed annuity rate).
   * A2 (#7): this is slab-taxable each year — see `annuityIncomeTaxable`.
   */
  annuityIncomeAnnual: number;
  /**
   * A2 (#7): the annuity income is taxed at the retiree's income-tax slab each
   * year. Only the 60% lump sum is tax-free; the 40% annuitised pension is NOT.
   * Consumers MUST NOT present `annuityIncomeAnnual` as net / tax-free income
   * (e.g. offsetting expenses by the gross figure over-credits the pension and
   * under-states the required FIRE corpus — an optimistic error). Apply
   * {@link postTaxAnnuityIncome} with the retiree's marginal rate first. True
   * whenever `annuityIncomeAnnual > 0`.
   */
  annuityIncomeTaxable: boolean;
  /** True when the corpus is below the ₹5L full-withdrawal threshold. */
  isBelowThreshold: boolean;
}

export interface NpsWithdrawalInput {
  totalCorpus: number;
  /** Annuity rate as decimal (e.g. 0.06 = 6% annual annuity payout). */
  annuityRate?: number;
  /**
   * "normal" = exit at/after 60 (60/40 split, ₹5L lump floor — the default).
   * "early"  = premature exit before 60 (20/80 split, ₹2.5L lump floor).
   * Absent ⇒ "normal" so every existing caller is byte-identical.
   */
  exitType?: "normal" | "early";
}

/**
 * Compute the lump-sum / annuity split per PFRDA 2025 rules.
 *
 * Normal exit (≥60, default):
 * - Below ₹5L: full lump sum, no annuity.
 * - Above ₹5L: 60% lump sum, 40% annuity.
 *
 * Early exit (<60, `exitType: "early"`):
 * - Below ₹2.5L: full lump sum, no annuity.
 * - Above ₹2.5L: 20% lump sum, 80% annuity.
 *
 * Annuity uses the assumed annuity rate (default 0.06 — research Ch 03 §3.7
 * cites Indian annuity rates typically 5.5-6.5%).
 */
export function calculateNpsWithdrawal(input: NpsWithdrawalInput): NpsWithdrawalSplit {
  const { totalCorpus } = input;
  const annuityRate = input.annuityRate ?? 0.06;
  const isEarly = input.exitType === "early";
  const fullWithdrawalThreshold = isEarly
    ? NPS_EARLY_EXIT_THRESHOLD
    : NPS_FULL_WITHDRAWAL_THRESHOLD;
  const lumpSumPercent = isEarly ? NPS_EARLY_LUMPSUM_PERCENT : NPS_LUMPSUM_PERCENT;
  const annuityPercent = isEarly ? NPS_EARLY_ANNUITY_PERCENT : NPS_ANNUITY_PERCENT;

  if (totalCorpus <= fullWithdrawalThreshold) {
    return {
      totalCorpus,
      lumpSum: totalCorpus,
      annuityCorpus: 0,
      annuityIncomeAnnual: 0,
      annuityIncomeTaxable: false,
      isBelowThreshold: true,
    };
  }

  const lumpSum = totalCorpus * lumpSumPercent;
  const annuityCorpus = totalCorpus * annuityPercent;
  const annuityIncomeAnnual = Math.round(annuityCorpus * annuityRate);

  return {
    totalCorpus,
    lumpSum: Math.round(lumpSum),
    annuityCorpus: Math.round(annuityCorpus),
    annuityIncomeAnnual,
    // Derive the marker so the documented invariant literally holds even at a
    // 0% annuity rate (above-threshold but annuityIncomeAnnual rounds to 0).
    annuityIncomeTaxable: annuityIncomeAnnual > 0,
    isBelowThreshold: false,
  };
}

/**
 * Post-tax annual annuity income — the NPS annuity is slab-taxable
 * (see {@link NpsWithdrawalSplit.annuityIncomeTaxable}). Returns the gross
 * annuity net of the retiree's marginal slab rate, so consumers that offset
 * retirement expenses with the pension use the honest (smaller) figure rather
 * than the gross amount. `marginalRate` is a decimal (e.g. 0.3) and is clamped
 * into [0, 1] defensively.
 */
export function postTaxAnnuityIncome(grossAnnuityIncome: number, marginalRate: number): number {
  const r = Math.min(Math.max(marginalRate, 0), 1);
  return Math.round(grossAnnuityIncome * (1 - r));
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
