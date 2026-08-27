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
import {
  calculateYearsToTarget,
  type ContributionSchedule,
  type TargetSchedule,
} from "./fire-math";
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
  /** Expected REAL return (matches the headline's CPI-real frame). */
  expectedReturn: number;
  /**
   * ADR-0006. The annual drift of `targetCorpus` — the FIRE number rises in TODAY's rupees
   * because the household's expense basket outruns general CPI, the medical reservation outruns
   * both, and dated goals stop on their due years. That is a CURVE, and this engine takes one
   * SCALAR, so callers pass `derive().effectiveTargetDriftRate` (or its nominal twin) — the
   * constant rate that reproduces the kernel's component curve over the SOLVED horizon. Passing
   * `realTargetDriftRate` instead describes only the base leg and puts the baseline off the
   * headline. Absent/0 ⇒ a fixed target, i.e. the pre-ADR-0006 model. This engine stays in the CPI-REAL
   * frame (a real `expectedReturn` against a today's-₹ target); dividing the kernel's nominal
   * crossing condition through by (1+CPI)^t gives exactly this. Omitting it made every lever's
   * baseline 1–3 years more OPTIMISTIC than the headline it sits next to.
   */
  targetGrowthRate?: number;
  /**
   * ADR-0006. The REAL savings step-up (%/yr) applied to `monthlySavings`, and the number of years
   * from now after which it stops compounding (the age-50 taper in `derive.ts`). Modelled as a rate
   * rather than a pre-built schedule ON PURPOSE: a lever that raises `monthlySavings` must get the
   * step-up applied to its RAISED amount, which a captured schedule could not do.
   */
  savingsStepUpPercent?: number;
  savingsStepUpTaperYears?: number;
  /**
   * ADR-0006. Annual growth of `monthlySavings` in the frame of `expectedReturn` — general CPI when
   * the caller works in the NOMINAL frame, 0 when it works in the CPI-real frame.
   *
   * FRAME CONTRACT: `expectedReturn`, `targetGrowthRate` and `savingsInflationRate` must all be
   * quoted in ONE frame. The live caller (`useAcceleration`) passes the NOMINAL triple — nominal
   * return, basket target growth, CPI savings growth — which reproduces `derive()`'s headline
   * solver exactly. The CPI-real triple (real return, drift g, 0) is algebraically the same model
   * only if contributions are re-indexed monthly; because the kernel re-indexes them ANNUALLY (a
   * salary is revised once a year, and loses purchasing power in between) the real triple runs
   * ~0.4 years optimistic. Quote the nominal triple.
   */
  savingsInflationRate?: number;
  /**
   * ADR-0006 Phase 1b. A FLAT extra monthly inflow that is added to `monthlySavings` but is NOT
   * subject to `savingsStepUpPercent`.
   *
   * The `nps-80ccd1b` lever adds the marginal TAX SAVED on filling the ₹50k sub-limit, redirected
   * to investing. That saving is a fixed statutory headroom times a slab rate — it does not grow
   * with the household's real wage curve, so folding it into `monthlySavings` handed it the 2%
   * real step-up and compounded a constant into a rising series (by the age-50 taper on a 30-year
   * old that is ~1.5x, entirely fabricated). It DOES still get `savingsInflationRate`, because in
   * the nominal frame a today's-rupee amount must be grown at CPI just to hold its real value.
   */
  flatExtraMonthlySavings?: number;
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

/**
 * The two time-varying schedules a baseline implies, in the baseline's own frame. Shared by
 * `yearsToFire` and `lever-bands.computeLeverBand` so the deterministic point and the confidence
 * band around it can never be built from two different models of the same plan.
 */
export function resolveBaselineSchedules(b: FireBaseline): {
  target: TargetSchedule;
  savings: ContributionSchedule;
} {
  const drift = Number.isFinite(b.targetGrowthRate) ? (b.targetGrowthRate as number) : 0;
  const target: TargetSchedule =
    drift === 0 ? b.targetCorpus : (y: number) => b.targetCorpus * Math.pow(1 + drift, y);

  const stepUp = Number.isFinite(b.savingsStepUpPercent) ? (b.savingsStepUpPercent as number) : 0;
  const taperYears = Number.isFinite(b.savingsStepUpTaperYears)
    ? Math.max(0, b.savingsStepUpTaperYears as number)
    : 0;
  // A non-positive scalar is passed through so the kernel's `<= 0 → Infinity` sentinel still fires.
  const savingsInflation = Number.isFinite(b.savingsInflationRate)
    ? (b.savingsInflationRate as number)
    : 0;
  const stepUpApplies = stepUp > 0 && taperYears > 0;
  const flatExtra = Number.isFinite(b.flatExtraMonthlySavings)
    ? Math.max(0, b.flatExtraMonthlySavings as number)
    : 0;
  const savings: ContributionSchedule =
    (b.monthlySavings <= 0 && flatExtra === 0) ||
    (flatExtra === 0 && !stepUpApplies && savingsInflation === 0)
      ? b.monthlySavings
      : (y: number) =>
          (b.monthlySavings *
            (stepUpApplies ? Math.pow(1 + stepUp / 100, Math.min(y, taperYears)) : 1) +
            // Flat: CPI only, never the step-up (see `flatExtraMonthlySavings`).
            flatExtra) *
          Math.pow(1 + savingsInflation, y);

  return { target, savings };
}

/** Years-to-FIRE for a resolved baseline — thin wrapper over the ONE kernel. */
export function yearsToFire(b: FireBaseline): number {
  const { target, savings } = resolveBaselineSchedules(b);
  return calculateYearsToTarget(b.currentCorpus, target, savings, b.expectedReturn);
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
