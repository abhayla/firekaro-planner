/**
 * Lever-impact engine (objective 2 — "help them get there faster", gh-issue #48).
 *
 * Pure, policy-free core: given a resolved FIRE baseline and a set of LEVERS (each a named,
 * bounded perturbation of the baseline inputs), compute how many YEARS each lever moves the
 * FIRE date and rank them biggest-saver-first. It reuses the ONE tested kernel
 * `calculateYearsToTarget` (no FIRE-math duplication) so a lever's impact is always frame-coherent
 * with the headline.
 *
 * DELIBERATELY out of scope here (the consequential, no-clear-winner forks — converge before adding):
 *   - HOW each lever defines its "realistic comparable increment" (the comparability policy that
 *     makes a ranking honest — you cannot compare "+₹5k SIP" to "+1% return" by raw delta unless
 *     the increments are made comparable). That lives in the lever DEFINITIONS the caller supplies,
 *     NOT in this engine.
 *   - The India-specific tax/financial levers (regime arbitrage, 80CCD(1B)/employer-NPS,
 *     prepay-vs-invest) whose impact flows through tax → investable → contribution and needs a
 *     modelling decision. They become `Lever.apply` functions once that modelling is agreed.
 *   - Per-lever confidence bands (objective-1 parity via monte-carlo.ts).
 *
 * Keep this module pure (no store/DOM access) per `.claude/rules/calculation-modules.md`.
 */
import { calculateYearsToTarget } from "./fire-math";
import { MAX_PROJECTION_YEARS } from "./monte-carlo";

/**
 * Honest reachability test. `calculateYearsToTarget` caps its loop at MAX_PROJECTION_YEARS (100yr)
 * and returns a FINITE `100` when the target is never reached within that horizon — it only emits
 * `Infinity` for the narrow constant-non-positive-contribution guard. So `Number.isFinite()` alone
 * would treat a capped-out 100-year baseline as "reaches FIRE", producing a meaningless delta off a
 * clamped value — exactly the optimistic-honesty trap for a struggling accumulator (the persona most
 * likely to act on a nudge). A path "reaches" only if it crosses STRICTLY before the cap — the same
 * `raw < MAX_PROJECTION_YEARS` convention `monte-carlo.ts` uses for its `reached` flag.
 */
function reachesFire(years: number): boolean {
  return Number.isFinite(years) && years < MAX_PROJECTION_YEARS;
}

/** The resolved scalar inputs to the years-to-FIRE computation — exactly what `derive()` produces. */
export interface FireBaseline {
  /** Withdrawable corpus today (the bridge-adjusted liquid base the headline uses). */
  currentCorpus: number;
  /** The FIRE number (real-terms target corpus). */
  targetCorpus: number;
  /** Monthly contribution today (real ₹). */
  monthlySavings: number;
  /** Expected REAL return (matches the headline's real frame — the #20 invariant). */
  expectedReturn: number;
}

/** A single lever = a named, bounded perturbation of the baseline inputs. */
export interface Lever {
  key: string;
  label: string;
  /**
   * The realistic-effort BOUND this lever represents, in plain words (e.g. "Invest your ₹40k/mo
   * surplus"). Honesty requirement: the ranking is only fair if the bound behind each lever is
   * shown, so the user reads "rank #1" as "biggest *achievable* win", not a hidden assumption.
   */
  note?: string;
  /** Return the perturbed baseline this lever produces. MUST be pure (no mutation of `b`). */
  apply: (b: FireBaseline) => FireBaseline;
}

export interface LeverImpact {
  key: string;
  label: string;
  /** The realistic-effort bound behind this lever, carried through for the UI (see Lever.note). */
  note?: string;
  baselineYears: number;
  perturbedYears: number;
  /** Years SAVED (positive = earlier FIRE). `NaN` when either path never reaches FIRE. */
  deltaYears: number;
  /** False when the baseline OR the perturbed path never reaches FIRE (delta is undefined). */
  reachable: boolean;
}

/** Years-to-FIRE for a resolved baseline — thin wrapper over the ONE kernel. */
export function yearsToFire(b: FireBaseline): number {
  return calculateYearsToTarget(b.currentCorpus, b.targetCorpus, b.monthlySavings, b.expectedReturn);
}

/** Compute one lever's impact: baseline vs perturbed years-to-FIRE. */
export function computeLeverImpact(baseline: FireBaseline, lever: Lever): LeverImpact {
  const baselineYears = yearsToFire(baseline);
  const perturbedYears = yearsToFire(lever.apply(baseline));
  // Both paths must reach FIRE within the projection horizon for "years saved" to be defined.
  // A lever that RESCUES an otherwise-unreachable baseline reports reachable=false (delta is
  // genuinely undefined) — the caller can still detect the rescue via the exposed perturbedYears.
  const reachable = reachesFire(baselineYears) && reachesFire(perturbedYears);
  // years SAVED = baseline − perturbed (positive ⇒ the lever brings FIRE earlier).
  const deltaYears = reachable ? baselineYears - perturbedYears : NaN;
  return { key: lever.key, label: lever.label, note: lever.note, baselineYears, perturbedYears, deltaYears, reachable };
}

/**
 * Rank levers by years saved, biggest first. Unreachable levers (delta undefined) sort to the end,
 * preserving their relative input order. Does not mutate `baseline` or `levers`.
 */
export function rankLeverImpacts(baseline: FireBaseline, levers: Lever[]): LeverImpact[] {
  return levers
    .map((lever) => computeLeverImpact(baseline, lever))
    .sort((a, b) => {
      if (a.reachable !== b.reachable) return a.reachable ? -1 : 1; // reachable first
      // both unreachable → return 0 to preserve input order. This relies on Array.prototype.sort
      // being STABLE (guaranteed ES2019+), which the doc comment's order-preservation promise needs.
      if (!a.reachable) return 0;
      return b.deltaYears - a.deltaYears; // biggest years-saved first
    });
}
