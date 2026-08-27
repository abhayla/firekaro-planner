/**
 * Stage A (Option-D dashboard) — the verdict-tone resolver for the FIRE-dashboard hero.
 *
 * Pure (no store/DOM). Maps the plan-variance state to the hero's tint + "Vs your plan"
 * KPI tone. Sign convention follows `plan-variance.ts`: + months = EARLIER than the locked
 * plan (ahead), − = LATER (behind).
 *
 * Honesty rule (rule 20/31): a non-finite delta makes NO claim — it returns the neutral
 * "no-baseline" tone rather than fabricating an "on track" verdict. ±Infinity IS a claim
 * (the plan became reachable/unreachable vs the baseline) and maps to ahead/behind.
 */

export type HeroTone = "ahead" | "on-track" | "behind" | "no-baseline";

export interface HeroToneInput {
  /** Whether a plan baseline has been locked (usePlanBaseline). */
  hasBaseline: boolean;
  /** plan-variance `fireDateDeltaMonths` (+ = earlier/ahead, − = later/behind); null when unknown. */
  fireDateDeltaMonths: number | null;
}

export function resolveHeroTone(input: HeroToneInput): HeroTone {
  if (!input.hasBaseline) return "no-baseline";
  const d = input.fireDateDeltaMonths;
  if (d == null || Number.isNaN(d)) return "no-baseline";
  if (d >= 1) return "ahead";
  if (d <= -1) return "behind";
  return "on-track";
}

/**
 * T-377 (QN-2) — the SECOND, independent hero signal: is the plan SHORT of the number, or past it?
 *
 * Deliberately NOT folded into `HeroTone` above. They answer different questions and are both
 * shown: `HeroTone` = "am I ahead of the plan I locked?" (plan-variance, #138); `GapTone` = "does
 * the money get there at all?" (need vs have at the target age). Two signals, two types.
 *
 * Honesty rule (20/31): a NaN or non-finite gap makes NO claim — `unknown` renders a neutral
 * "—", never a fabricated "you're on track". Unlike `resolveHeroTone`, ±Infinity is NOT a claim
 * here: an infinite gap means the projection broke down, not that the user is short by infinity.
 */
export type GapTone = "short" | "surplus" | "unknown";

/** @param gapReal needReal − haveAtTargetReal (₹, today's money). Positive = short. */
export function resolveGapTone(gapReal: number | null | undefined): GapTone {
  if (gapReal == null || !Number.isFinite(gapReal)) return "unknown";
  return gapReal > 0 ? "short" : "surplus";
}
