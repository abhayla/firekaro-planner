/**
 * Lifecycle evaluator (D4) — the PURE mapping from a user's derived FIRE signals to
 * the UTILITY lifecycle nudges (milestone / off-track / annual_review) plus their
 * per-period/threshold dedupe keys. No DB, no IO, no clock read (now is passed in)
 * so it is deterministic + unit-testable. The runner loads each user's household,
 * runs the shared pure `derive()` (src/lib, via the @planner alias — no logic
 * duplication), maps the result to LifecycleSignals, and calls this.
 *
 * MARKETING nudges (monthly_digest / winback / salary_update) are Phase 2 and are
 * intentionally NOT emitted here — they stay gated behind marketingOptIn + A6.
 */

export type LifecycleNudgeKey = "milestone" | "offtrack" | "annual_review";

export interface LifecycleNudge {
  key: LifecycleNudgeKey;
  /** Idempotency key: the nudge fires once per period/threshold (D6). */
  dedupeKey: string;
  /**
   * Positional template values AFTER firstName — the runner prepends the user's
   * firstName (every UTILITY template's {{1}} is the name). Order matches the
   * approved template body (docs/whatsapp-templates.md).
   */
  values: string[];
}

export interface LifecycleSignals {
  /** FIRE progress, 0–100 (derive().progressPercent). */
  progressPercent: number;
  /** Withdrawable corpus today (derive().fireWithdrawableCorpus). */
  fireWithdrawableCorpus: number;
  /** Anchor (planning) age (derive().anchorAge). */
  anchorAge: number;
  /** Target retirement age (derive().targetRetirementAge). */
  targetRetirementAge: number;
  /** Years to the regular FIRE target (derive().yearsToRegular); may be Infinity. */
  yearsToRegular: number;
  /** Savings rate as a percentage 0–100 (derive().savingsRate). */
  savingsRate: number;
}

export interface LifecycleInput {
  signals: LifecycleSignals;
  /** "Now" — passed in (not read) so FY + projected-year math is deterministic. */
  now: Date;
}

/** Indian financial year (`YYYY-YY`, Apr–Mar) for a date. UTC so it is tz-stable. */
export function financialYearOf(date: Date): string {
  const y = date.getUTCFullYear();
  const startYear = date.getUTCMonth() >= 3 ? y : y - 1; // Apr (month 3) starts the FY
  const endYY = `${(startYear + 1) % 100}`.padStart(2, "0");
  return `${startYear}-${endYY}`;
}

/** Compact INR for nudge copy: ₹1.25Cr / ₹36.50L / ₹8k / ₹500. */
export function formatINRCompact(n: number): string {
  const v = Math.max(0, Math.round(n));
  if (v >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(2)}Cr`;
  if (v >= 1_00_000) return `₹${(v / 1_00_000).toFixed(2)}L`;
  if (v >= 1_000) return `₹${Math.round(v / 1_000)}k`;
  return `₹${v}`;
}

// Milestone bands (highest-crossed wins). A crossing fires once via dedupe key
// `milestone:<band>`, so a user who reaches 50% gets ONE 50% nudge, then nothing
// until they cross 75%.
const MILESTONE_BANDS = [100, 75, 50, 25] as const;

/**
 * ADR-0006 — the date ADR-0006's frame change reached production.
 *
 * The frame change moves EVERY user's projected FIRE age later, by construction and by an amount
 * that has nothing to do with what the user did. Two of the three nudges here are immune:
 *   - `milestone` keys on `progressPercent` = corpus ÷ fireNumber, and `fireNumber` is a today's-
 *     rupee figure that no inflation input can move — ADR-0006 left it byte-identical for every
 *     seed persona. No band is newly crossed, so no wave.
 *   - `annual_review` fires once per FY regardless of any signal.
 * `offtrack` is the one that would fire en masse: users cross
 * `projectedFireAge > targetRetirementAge + 0.5` together on the first daily run after deploy, and
 * the template ATTRIBUTES the slip to "a low savings rate" or "rising expenses". Both attributions
 * would be false — the cause was our model. Sending that to every consenting user is worse than
 * silence, so off-track is suppressed for the FY the change landed in.
 *
 * Scoped to that FY on purpose: the dedupe key is already `offtrack:<FY>`, so nothing is lost — a
 * user who is genuinely off-track still hears about it in the next FY, with an attribution that is
 * true. A shorter fixed window would only have moved the same false wave a few weeks later.
 */
export const ADR_0006_FRAME_CHANGE_AT = new Date("2026-08-27T00:00:00.000Z");
export const ADR_0006_FRAME_CHANGE_FY = financialYearOf(ADR_0006_FRAME_CHANGE_AT);

export function evaluateLifecycle(input: LifecycleInput): LifecycleNudge[] {
  const s = input.signals;
  const out: LifecycleNudge[] = [];

  // 1. Milestone — highest band the corpus has crossed.
  const band = MILESTONE_BANDS.find((b) => s.progressPercent >= b);
  if (band !== undefined) {
    out.push({
      key: "milestone",
      dedupeKey: `milestone:${band}`,
      values: [formatINRCompact(s.fireWithdrawableCorpus), `${Math.round(s.progressPercent)}%`],
    });
  }

  // 2. Off-track — the projected FIRE age slips past the target retirement age.
  // Deduped per FY (at most one off-track nudge per year), NOT per projected-year:
  // keying on the drifting projection would re-fire every time the projection
  // slips by a year, which is noisier than intended. `yearsToRegular > 0` excludes
  // users who have already reached the target (where "off-track" copy is incoherent).
  const offtrackFy = financialYearOf(input.now);
  const frameChangeFy = offtrackFy === ADR_0006_FRAME_CHANGE_FY;
  if (!frameChangeFy && Number.isFinite(s.yearsToRegular) && s.yearsToRegular > 0) {
    const projectedFireAge = s.anchorAge + s.yearsToRegular;
    if (projectedFireAge > s.targetRetirementAge + 0.5) {
      const projectedYear = input.now.getUTCFullYear() + Math.ceil(s.yearsToRegular);
      const driver = s.savingsRate < 20 ? "a low savings rate" : "rising expenses";
      out.push({
        key: "offtrack",
        dedupeKey: `offtrack:${offtrackFy}`,
        values: [String(projectedYear), driver],
      });
    }
  }

  // 3. Annual review — once per FY (a yearly prompt to revisit the plan).
  out.push({
    key: "annual_review",
    dedupeKey: `annual_review:${financialYearOf(input.now)}`,
    values: [],
  });

  return out;
}
