/**
 * Honest copy for the FIRE headline Monte Carlo confidence band (gh-issue #18).
 *
 * Pure (no store/DOM) so the off-the-chart logic is unit-testable. The load-bearing
 * honesty rule: NEVER render the never-reached SENTINEL (`MAX_PROJECTION_YEARS + 1`)
 * as a literal year/age — for a near-unreachable plan that would print "age 13x",
 * the exact false precision this feature exists to kill. When the slow tail runs
 * off the projection horizon, say so in words instead.
 *
 * The band is labelled "Illustrative", NOT "conservative": the v1 IID model can
 * UNDER-state the bad tail (clustering/sequence-of-returns), so the disclosure must
 * own the direction of the error (`monte-carlo.ts` header, FinTech 2026-06-03).
 */
import { MAX_PROJECTION_YEARS, type MonteCarloFireResult } from "@/lib/monte-carlo";

const DISCLOSURE = "Illustrative model (assumes independent yearly returns; real downside may be larger).";

export function describeFireConfidenceBand(
  mc: MonteCarloFireResult | null | undefined,
  yearsToRegular: number,
  anchorAge: number,
): string | null {
  // No band when there is no finite, future FIRE date to put a spread around
  // (already-FIRE, or an unreachable Infinity headline).
  if (!Number.isFinite(yearsToRegular) || yearsToRegular <= 0) return null;
  if (!mc || !Number.isFinite(mc.p90Years) || !Number.isFinite(mc.p10Years)) return null;

  const p10 = Math.ceil(mc.p10Years);
  const p90 = Math.ceil(mc.p90Years);
  const hasAge = Number.isFinite(anchorAge);
  const never = mc.probabilityNeverReachFire ?? 0;
  const neverNote =
    never >= 0.05 ? ` About ${Math.round(never * 100)}% of scenarios don't reach FIRE at your current savings.` : "";

  // Off-the-chart guard — any percentile at/above the cap is the never-reached
  // sentinel; describe it in words, never as a year/age.
  if (p90 >= MAX_PROJECTION_YEARS) {
    if (p10 >= MAX_PROJECTION_YEARS) {
      return `Markets swing — at your current savings, most scenarios don't reach FIRE within a working lifetime.${neverNote} ${DISCLOSURE}`;
    }
    const optAge = hasAge ? ` (≈ age ${anchorAge + p10})` : "";
    return (
      `Markets swing — in lucky markets FIRE could arrive in ~${p10} years${optAge}, but in unlucky ones ` +
      `it may not come within your planning horizon.${neverNote} ${DISCLOSURE}`
    );
  }

  const ageRange = hasAge ? ` (≈ age ${anchorAge + p10}–${anchorAge + p90})` : "";
  return (
    `Markets swing — the age above is the midpoint. Allowing for that, FIRE most likely lands ` +
    `${p10}–${p90} years out${ageRange}.${neverNote} ${DISCLOSURE}`
  );
}
