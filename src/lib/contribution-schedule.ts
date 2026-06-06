/**
 * Time-varying contribution model (Temporal Phase 1, gh-issue #46).
 *
 * Mirrors the `ReturnSchedule`/`resolveReturn` shape in `fire-math.ts` (the #9 glide-path
 * change): a contribution that changes over time is expressed as a list of age-relative
 * segments, flattened to a per-year resolver. A single open segment from age 0 (see
 * {@link scalarToSegments}) resolves to a constant — byte-identical to the prior
 * single-scalar projection loop.
 *
 * Two deliberate honesty invariants (FinTech review, #46):
 *  - Amounts and the step-up are **REAL** (today's-rupee, net of general inflation). The
 *    headline corpus compounds in the real frame (`derive.ts`), so a nominal step-up that
 *    merely tracks ~6% inflation is ALREADY baked into the constant-real baseline; expressing
 *    step-up nominally would double-count inflation → an optimistically early FIRE date.
 *  - Segments are **age-relative** (`startAtAge`/`endAtAge`), never absolute dates, so a plan
 *    does not silently drift year-to-year against the wall clock.
 *
 * Pure module (no store/DOM/IO) per `.claude/rules/calculation-modules.md`.
 */

/** A contiguous span of a contribution plan. `amount` is REAL ₹/month; ages are age-relative. */
export interface ContributionSegment {
  /** REAL ₹/month contributed while this segment is active. */
  amount: number;
  /** Age (whole years) at which this segment starts contributing (inclusive). */
  startAtAge: number;
  /** Age at which it stops (exclusive). Omitted ⇒ open-ended (contributes forever). */
  endAtAge?: number;
  /**
   * REAL step-up as a PERCENTAGE per year (e.g. `10` = +10%/yr above inflation), compounded
   * from `startAtAge`. Optional; treated as 0 when absent and clamped to [0, 15] — a real
   * step-up above ~15%/yr is implausible and would optimistically pull the FIRE date in.
   */
  stepUpPercentPerYear?: number;
}

export type ContributionSegments = ContributionSegment[];

/** Real step-up cap (percentage points per year). Above this is implausible (#46 FinTech). */
export const STEP_UP_MAX_PERCENT = 15;

/** Clamp a step-up percentage to [0, STEP_UP_MAX_PERCENT] and convert to a decimal rate. */
function clampStepUpRate(stepUpPercentPerYear: number | undefined): number {
  const pct = Number.isFinite(stepUpPercentPerYear) ? (stepUpPercentPerYear as number) : 0;
  const clamped = Math.min(Math.max(pct, 0), STEP_UP_MAX_PERCENT);
  return clamped / 100;
}

/**
 * Flatten a set of segments into a per-year resolver: `(yearIndex) => monthly contribution`
 * active at `anchorAge + yearIndex`.
 *
 * Selection: the segment whose `[startAtAge, endAtAge ?? ∞)` contains the year's age; on
 * overlap the **latest-starting** matching segment wins; outside every segment → 0. The
 * step-up compounds over `age − startAtAge`. Defensive (`defensive-coding.md`): a non-finite
 * year, a non-finite/negative amount, or a non-finite result resolves to 0 — never NaN, which
 * would silently poison the corpus projection (Tier-0 math).
 */
export function buildContributionResolver(
  segments: ContributionSegments,
  anchorAge: number,
): (yearIndex: number) => number {
  // Ascending by start so a forward scan lets the latest-starting match overwrite earlier ones.
  const sorted = [...segments].sort((a, b) => a.startAtAge - b.startAtAge);
  return (yearIndex: number): number => {
    if (!Number.isFinite(yearIndex)) return 0;
    const age = anchorAge + yearIndex;
    let chosen: ContributionSegment | undefined;
    for (const seg of sorted) {
      const end = seg.endAtAge ?? Number.POSITIVE_INFINITY;
      if (age >= seg.startAtAge && age < end) chosen = seg;
    }
    if (!chosen) return 0;
    const base = Number.isFinite(chosen.amount) && chosen.amount > 0 ? chosen.amount : 0;
    if (base === 0) return 0;
    const rate = clampStepUpRate(chosen.stepUpPercentPerYear);
    const yearsSinceStart = age - chosen.startAtAge;
    const value = base * (1 + rate) ** yearsSinceStart;
    return Number.isFinite(value) && value > 0 ? value : 0;
  };
}

/**
 * The migration-on-hydrate / read-path backfill helper: a scalar `monthlyContribution` maps to
 * one open segment from age 0 (always-on, behaviour-identical to a constant scalar). `undefined`
 * maps to an empty schedule (no contribution).
 */
export function scalarToSegments(monthly: number | undefined): ContributionSegments {
  return monthly == null ? [] : [{ amount: monthly, startAtAge: 0 }];
}

/**
 * Canonicalise a schedule into a stably-sorted, number-rounded array. Call this at the WRITE
 * boundary (the InvestmentForm save is the sole writer of a persisted schedule today) so a re-save
 * with no real change does not trip the household-diff `deepEqual` (idempotent PUT → zero writes,
 * Stage E). The diff engine itself does NOT canonicalize — it relies on the writer having done so;
 * if a future non-form writer (a seed persona, a programmatic edit) ever persists a raw schedule,
 * canonicalize it there too, or move this into the diff comparison. Amounts rounded to the rupee;
 * step-up rounded to 4 dp; sorted by `startAtAge`.
 */
export function canonicalizeSegments(segments: ContributionSegments): ContributionSegments {
  return [...segments]
    .map((s) => ({
      amount: Math.round(s.amount),
      startAtAge: Math.round(s.startAtAge),
      ...(s.endAtAge != null ? { endAtAge: Math.round(s.endAtAge) } : {}),
      ...(s.stepUpPercentPerYear != null
        ? { stepUpPercentPerYear: Math.round(s.stepUpPercentPerYear * 1e4) / 1e4 }
        : {}),
    }))
    .sort((a, b) => a.startAtAge - b.startAtAge);
}
