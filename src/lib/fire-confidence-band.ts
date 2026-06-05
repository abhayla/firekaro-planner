/**
 * Honest copy for the FIRE headline Monte Carlo confidence band (gh-issue #18).
 *
 * Pure (no store/DOM) so the off-the-chart logic is unit-testable. The load-bearing
 * honesty rule: NEVER render the never-reached SENTINEL (`MAX_PROJECTION_YEARS + 1`)
 * as a literal year/age — for a near-unreachable plan that would print "age 13x",
 * the exact false precision this feature exists to kill. When the slow tail runs
 * off the projection horizon, say so in words instead.
 *
 * The band is labelled "History-informed", NOT "conservative" (#24 Part 2): the v2
 * block-bootstrap is built on the REAL shape + serial structure of Indian-equity returns
 * since 1991 (instead of an idealized lognormal whose tail skew was a moment-matching
 * artifact). It is MORE-REAL, not "more conservative" — measured, the band is actually
 * a touch TIGHTER than the old IID model (real annual returns mean-revert, which is
 * stabilizing). So the copy makes NO conservatism claim; it discloses the real basis,
 * carries the REGIME caveat (a future downturn unlike the past could be worse — the only
 * residual optimism vector), and always keeps the P(never reach) clause (`monte-carlo.ts`
 * header; FinTech-adjudicated 2026-06-05). "Crash clustering" was REMOVED — the dominant
 * annual signal is mean-REVERSION, so that phrasing described a mechanism the model does
 * not exhibit. The earlier "Illustrative (assumes independent years)" copy described the
 * superseded IID model and is no longer accurate.
 */
import { MAX_PROJECTION_YEARS, type MonteCarloFireResult } from "@/lib/monte-carlo";

const DISCLOSURE =
  "History-informed model — built on the real pattern of Indian-equity returns since 1991 (deep crashes and the rebounds that have historically followed), not an idealized bell curve; a projection, not a guarantee — a downturn unlike the past could play out worse.";

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
