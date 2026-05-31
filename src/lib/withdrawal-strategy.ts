/**
 * Withdrawal strategy — the rule that determines how much you withdraw
 * each year of retirement.
 *
 * Phase 2 Stage C per docs/goals/build-firekaro-mvp-v5.md §5.
 * Audit Entry #9 A9.2 — Constant + Floor/Ceiling rules.
 *
 * Scope for MVP-1 (per audit Q5 lock):
 *  - Constant — withdraw a fixed % of starting corpus, inflation-adjusted
 *    each year. The v4-faithful baseline behavior.
 *  - Floor/Ceiling — withdraw constant unless the portfolio drops below
 *    the floor (then reduce) or rises above the ceiling (then keep flat
 *    rather than ratchet up). Audit-mandated for downside protection.
 *
 * DEFERRED to MVP-2 per Q5 lock:
 *  - Income-bucket method (Pattu) — separately tracked corpus per
 *    income tier with crossover dispatch.
 *  - Guyton-Klinger — full implementation with both guardrails (decisions
 *    on inflation freeze + capital preservation).
 *  - VPW (Variable Percentage Withdrawal) — annuity-style age-indexed
 *    withdrawal rate that increases with age.
 */

export type WithdrawalRuleKind = "Constant" | "FloorCeiling";

export interface ConstantWithdrawalConfig {
  kind: "Constant";
  /** Starting withdrawal as fraction of starting corpus (e.g. 0.035). */
  swr: number;
  /** Inflation to apply each year (decimal). */
  inflation: number;
}

export interface FloorCeilingWithdrawalConfig {
  kind: "FloorCeiling";
  /** Starting withdrawal as fraction of starting corpus. */
  swr: number;
  /** Inflation to apply each year (decimal). */
  inflation: number;
  /** Lower bound — if corpus < startingCorpus * floorMultiplier, reduce. */
  floorMultiplier: number;
  /** Upper bound — if corpus > startingCorpus * ceilingMultiplier, hold flat (do NOT ratchet). */
  ceilingMultiplier: number;
  /** Adjustment when floor breached (e.g. 0.9 = 10% cut). */
  floorAdjustment: number;
  /** Adjustment when ceiling exceeded (e.g. 1.0 = no change; ratchet OFF). */
  ceilingAdjustment: number;
}

export type WithdrawalConfig =
  | ConstantWithdrawalConfig
  | FloorCeilingWithdrawalConfig;

export interface WithdrawalYearResult {
  /** Year index from retirement start (0 = first year of retirement). */
  year: number;
  /** Amount withdrawn in this year's rupees. */
  withdrawal: number;
  /** Reason for the chosen withdrawal — useful for surface tooltips. */
  rule: "baseline" | "floor-triggered" | "ceiling-capped";
}

/**
 * Constant withdrawal rule — withdraw SWR * startingCorpus, then inflate
 * every subsequent year by the inflation rate. Ignores actual corpus
 * path (no downside protection).
 *
 * Used in: Dashboard projection charts as the v4-faithful baseline.
 */
export function constantWithdrawal(
  config: ConstantWithdrawalConfig,
  startingCorpus: number,
  year: number,
): WithdrawalYearResult {
  const baseline = startingCorpus * config.swr;
  const inflated = baseline * Math.pow(1 + config.inflation, year);
  return { year, withdrawal: inflated, rule: "baseline" };
}

/**
 * Floor/Ceiling rule — start at SWR, apply floor when corpus drops too
 * low (audit-mandated downside protection per Entry #9 A9.2).
 *
 * Inputs:
 *  - currentCorpus: the corpus at the START of this year
 *  - startingCorpus: the corpus at the START of retirement (year 0)
 *  - previousWithdrawal: the actual amount withdrawn in year-1 (so we
 *    apply the inflation cap to the prior year, not the baseline)
 *
 * Behavior:
 *  - Each year, propose `previousWithdrawal * (1 + inflation)` (baseline).
 *  - Compute the corpus-ratio = currentCorpus / startingCorpus.
 *  - If ratio < floorMultiplier: withdraw baseline * floorAdjustment
 *    (e.g. 0.9 = 10% spending cut).
 *  - If ratio > ceilingMultiplier: withdraw baseline * ceilingAdjustment
 *    (default ceilingAdjustment = 1.0 = hold flat, no ratchet).
 *  - Else: baseline.
 *
 * Returns the year's withdrawal + the rule that fired (useful for
 * surfacing "Floor triggered: spending cut 10%" in the Dashboard).
 */
export function floorCeilingWithdrawal(
  config: FloorCeilingWithdrawalConfig,
  startingCorpus: number,
  currentCorpus: number,
  year: number,
  previousWithdrawal: number,
): WithdrawalYearResult {
  // Year 0 = baseline SWR.
  if (year === 0) {
    return {
      year: 0,
      withdrawal: startingCorpus * config.swr,
      rule: "baseline",
    };
  }

  const baseline = previousWithdrawal * (1 + config.inflation);
  if (startingCorpus <= 0) {
    return { year, withdrawal: baseline, rule: "baseline" };
  }
  const ratio = currentCorpus / startingCorpus;

  if (ratio < config.floorMultiplier) {
    return {
      year,
      withdrawal: baseline * config.floorAdjustment,
      rule: "floor-triggered",
    };
  }
  if (ratio > config.ceilingMultiplier) {
    return {
      year,
      withdrawal: baseline * config.ceilingAdjustment,
      rule: "ceiling-capped",
    };
  }
  return { year, withdrawal: baseline, rule: "baseline" };
}

/**
 * Research-grounded default Floor/Ceiling config per audit Entry #9.
 * Floor at 80% (10% spending cut when triggered); Ceiling at 120%
 * (hold flat — no ratchet to avoid spending lock-in).
 *
 * These constants are exported so /preferences (Stage G) can render
 * them as the editable defaults.
 */
export const DEFAULT_FLOOR_CEILING: Omit<FloorCeilingWithdrawalConfig, "swr" | "inflation"> = {
  kind: "FloorCeiling",
  floorMultiplier: 0.8,
  ceilingMultiplier: 1.2,
  floorAdjustment: 0.9,
  ceilingAdjustment: 1.0,
};

/**
 * Single-dispatch driver — surface code calls this with a config and
 * a year/corpus pair; the function dispatches to the correct rule.
 *
 * Note on bookkeeping: Constant rule does NOT need previousWithdrawal
 * (it inflates from baseline). Floor/Ceiling DOES need it (inflates
 * from prior-year actual). The caller is responsible for tracking
 * previousWithdrawal across simulation iterations.
 */
export function applyWithdrawalRule(
  config: WithdrawalConfig,
  startingCorpus: number,
  currentCorpus: number,
  year: number,
  previousWithdrawal: number,
): WithdrawalYearResult {
  if (config.kind === "Constant") {
    return constantWithdrawal(config, startingCorpus, year);
  }
  return floorCeilingWithdrawal(
    config,
    startingCorpus,
    currentCorpus,
    year,
    previousWithdrawal,
  );
}
