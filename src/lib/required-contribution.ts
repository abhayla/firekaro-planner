/**
 * T-377 (QN-2) — "how much must I invest every month to retire at N?"
 *
 * The one solver behind the dashboard gap hero (design SSOT:
 * docs/design/2026-08-27-quick-number-gap-hero/option-c-merged.html). Pure: no store, no DOM.
 *
 * METHOD — binary search on the household REAL monthly contribution driven through the REAL
 * `derive()` kernel (never a parallel closed-form). Every candidate is a full kernel run, so the
 * answer honours step-up (ADR-0004), the accessible-money bridge (#15), horizon-driven SWR, the
 * healthcare reservation, the family/planned-goals layer (#165) and the member lens (#81).
 * Bisection is sound only because `derive()`'s years-to-FIRE is monotone non-increasing in the
 * contribution — that precondition is LOCKED by `kernel-invariants.property.spec.ts` (T-377), not
 * assumed. If that property ever fails, this module must fall back to a monotone scan; shipping a
 * silently-wrong "do this" number is the optimism error the honesty mandate exists to prevent.
 *
 * HONESTY (rule 31): an unreachable target returns `Infinity` — never a fabricated finite amount —
 * and `paceFireAge` is `null` when the current pace never reaches the number within the horizon.
 * No field is ever NaN.
 */
import type { Household } from "@/types/household";
import type { Assumptions } from "@/types/assumptions";
import { derive, type DeriveLens } from "@/lib/derive";
import { projectCorpus } from "@/lib/fire-math";

/** Bisection stops once the bracket is this tight (rupees/month). */
export const REQUIRED_CONTRIBUTION_TOLERANCE = 100;
/** Hard iteration cap — bisection over the bracket converges long before this. */
export const REQUIRED_CONTRIBUTION_MAX_ITERATIONS = 60;
/** Absolute floor for the search ceiling (contract section 3). */
export const REQUIRED_CONTRIBUTION_MIN_CEILING = 500_000;

export interface RequiredContributionInput {
  snapshot: Household;
  assumptions: Assumptions;
  lens: DeriveLens;
  /** The age the user wants to retire at (the hero slider). */
  targetAge: number;
}

export interface RequiredContributionResult {
  /** Rupees/month in today's money needed to reach the number by `targetAge`. Infinity = unreachable. */
  requiredMonthlyReal: number;
  /** What the household (or lensed adult) actually invests today, rupees/month. */
  currentMonthlyReal: number;
  /** needReal minus haveAtTargetReal. Positive = short, negative = surplus. */
  gapReal: number;
  /** The FIRE number for this target age, today's rupees. */
  needReal: number;
  /** Corpus the CURRENT pace reaches by `targetAge`, today's rupees. */
  haveAtTargetReal: number;
  /** FIRE age at today's pace (unchanged by the slider). null = never within the horizon. */
  paceFireAge: number | null;
  /** The same need in `targetAge`-year rupees — shown ONCE beside the real figure. */
  needNominal: number;
  /** Horizon-driven safe withdrawal rate used for this target age. */
  swrUsed: number;
}

/** Finite-or-fallback guard so no arithmetic edge can put a NaN on screen. */
function safe(v: number, fallback = 0): number {
  return Number.isFinite(v) ? v : fallback;
}

export function requiredMonthlyContributionFor(
  input: RequiredContributionInput,
): RequiredContributionResult {
  const { snapshot, assumptions, lens } = input;
  const targetAge = Math.round(input.targetAge);

  // ---- baseline: today's pace, today's target (the slider must not move these) ----
  const base = derive(snapshot, assumptions, lens);
  const lensedAdult =
    base.individualFireByMember.find((m) => m.memberId === lens.viewingMemberId) ?? null;

  const currentMonthlyReal = lensedAdult
    ? Math.round(lensedAdult.attributableAnnualSavings / 12)
    : base.monthlyContribution;

  // paceFireAge = the CURRENT-pace headline age (household) / individual age (member lens).
  const paceFireAge = lensedAdult
    ? Number.isFinite(lensedAdult.individualFireAge)
      ? lensedAdult.individualFireAge
      : null
    : base.householdFireAge;

  // ---- the plan AS IF retirement were at `targetAge` (moves SWR, glide, bridge window) ----
  const atTarget = derive(snapshot, assumptions, lens, { targetRetirementAge: targetAge });
  const atTargetAdult =
    atTarget.individualFireByMember.find((m) => m.memberId === lens.viewingMemberId) ?? null;

  const needReal = atTargetAdult ? atTargetAdult.individualFireNumber : atTarget.fireNumber;
  const swrUsed = safe(atTarget.effectiveSWR, 0.035);
  const anchorAge = safe(atTarget.anchorAge, 30);
  const yearsToTarget = Math.max(0, targetAge - anchorAge);
  const inflation = safe(assumptions.inflation, 0.06);
  const inflator = Math.pow(1 + inflation, yearsToTarget);

  // "You'll have by <target>" — the CURRENT pace projected in the REAL frame with the SAME
  // inflow schedule + real return schedule the kernel just used (no re-built parallel math).
  // Under a member lens the individual path has no projection of its own, so the adult's
  // attributable corpus is grown with their own scalar contribution through the same primitive.
  const startCorpus = atTargetAdult ? atTargetAdult.attributableCorpus : atTarget.fireWithdrawableCorpus;
  const inflow = atTargetAdult ? currentMonthlyReal : atTarget.householdContributionSchedule;
  const points = projectCorpus({
    currentCorpus: safe(startCorpus),
    monthlyContribution: inflow,
    expectedReturns: atTarget.realReturnSchedule,
    inflation: 0, // REAL frame: only the corpus line is read here, never the target/expense lines
    annualExpensesToday: safe(atTarget.annualExpensesToday),
    startAge: anchorAge,
    swr: swrUsed,
    horizonYears: Math.max(1, Math.ceil(yearsToTarget)),
  });
  const last = points.length ? points[points.length - 1] : null;
  const haveAtTargetReal = Math.max(0, Math.round(safe(last?.corpus ?? startCorpus)));

  // ---- binary search on the real monthly contribution ----
  const reaches = (monthly: number): boolean => {
    const k = derive(snapshot, assumptions, lens, {
      monthlyContributionReal: monthly,
      targetRetirementAge: targetAge,
    });
    if (lens.viewingMemberId) {
      const m = k.individualFireByMember.find((x) => x.memberId === lens.viewingMemberId);
      return m != null && Number.isFinite(m.individualFireAge) && m.individualFireAge <= targetAge;
    }
    return k.householdFireAge != null && k.householdFireAge <= targetAge;
  };

  const monthlyTakeHome = safe(base.monthlyTakeHome);
  const hi = Math.max(
    10 * Math.max(0, currentMonthlyReal),
    5 * monthlyTakeHome,
    REQUIRED_CONTRIBUTION_MIN_CEILING,
  );

  let requiredMonthlyReal: number;
  if (reaches(0)) {
    // Already there without investing another rupee (a genuine surplus case).
    requiredMonthlyReal = 0;
  } else if (!reaches(hi)) {
    // Beyond any realistic monthly amount — the UI says "move the age", never a fake number.
    requiredMonthlyReal = Number.POSITIVE_INFINITY;
  } else {
    let lo = 0;
    let up = hi;
    for (
      let i = 0;
      i < REQUIRED_CONTRIBUTION_MAX_ITERATIONS && up - lo > REQUIRED_CONTRIBUTION_TOLERANCE;
      i++
    ) {
      const mid = (lo + up) / 2;
      if (reaches(mid)) up = mid;
      else lo = mid;
    }
    // Return the REACHING end of the bracket — rounding down would advertise an amount that
    // does not actually get the user there.
    requiredMonthlyReal = Math.ceil(up);
  }

  return {
    requiredMonthlyReal,
    currentMonthlyReal: Math.max(0, Math.round(safe(currentMonthlyReal))),
    gapReal: Math.round(safe(needReal)) - haveAtTargetReal,
    needReal: Math.max(0, Math.round(safe(needReal))),
    haveAtTargetReal,
    paceFireAge: paceFireAge != null && Number.isFinite(paceFireAge) ? paceFireAge : null,
    needNominal: Math.max(0, Math.round(safe(needReal * inflator, needReal))),
    swrUsed,
  };
}
