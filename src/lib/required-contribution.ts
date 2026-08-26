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
  // A non-finite target age can never produce an honest answer — reject it before it can
  // silently fall back to the stored target while the predicate always fails (code-review L6).
  if (!Number.isFinite(input.targetAge)) {
    const k = derive(snapshot, assumptions, lens);
    return {
      requiredMonthlyReal: Number.POSITIVE_INFINITY,
      currentMonthlyReal: Math.max(0, Math.round(safe(k.monthlyContribution))),
      gapReal: Number.NaN, // → resolveGapTone "unknown" → the UI makes NO claim
      needReal: 0,
      haveAtTargetReal: 0,
      paceFireAge: null,
      needNominal: 0,
      swrUsed: safe(k.effectiveSWR, 0.035),
    };
  }
  const targetAge = Math.round(input.targetAge);

  // ---- baseline: today's pace, today's target (the slider must not move these) ----
  const base = derive(snapshot, assumptions, lens);
  // `individualFireByMember` is computed for EVERY adult regardless of the lens, so keying off
  // `viewingMemberId` alone would switch a SOLO household (single parent) onto the individual
  // number — which excludes the dependants' costs. Honour the kernel's own lens gate instead.
  const lensedMemberId = base.applyMemberLens ? lens.viewingMemberId : null;
  const lensedAdult =
    base.individualFireByMember.find((m) => m.memberId === lensedMemberId) ?? null;

  const currentMonthlyReal = lensedAdult
    ? Math.round(lensedAdult.attributableAnnualSavings / 12)
    : base.monthlyContribution;

  // paceFireAge is resolved BELOW from the at-target kernel run, so the "at today's pace you'd
  // get there at N" annotation sits on the SAME SWR/need curve as the prescription beside it.
  // Reading it from `base` (the STORED target's SWR) produced a card that could say both
  // "your current amount is enough for 55" and "at today's pace: 56" (FinTech MEDIUM-HIGH-5).

  // ---- the plan AS IF retirement were at `targetAge` (moves SWR, glide, bridge window) ----
  const atTarget = derive(snapshot, assumptions, lens, { targetRetirementAge: targetAge });
  const atTargetAdult =
    atTarget.individualFireByMember.find((m) => m.memberId === lensedMemberId) ?? null;

  const paceFireAgeRaw = atTargetAdult
    ? Number.isFinite(atTargetAdult.individualFireAge)
      ? atTargetAdult.individualFireAge
      : null
    : atTarget.householdFireAge;

  const needReal = atTargetAdult ? atTargetAdult.individualFireNumber : atTarget.fireNumber;
  const swrUsed = safe(atTarget.effectiveSWR, 0.035);
  // The lensed adult's OWN age — `derive().anchorAge` is deliberately the primary earner's
  // (the #23 household-invariance guardrail), so using it under a lens would project an older
  // spouse for too many years and OVER-state their corpus (FinTech HIGH-2 / code-review H2).
  const anchorAge = safe(atTargetAdult ? atTargetAdult.anchorAge : atTarget.anchorAge, 30);
  const yearsToTarget = Math.max(0, targetAge - anchorAge);
  const inflation = safe(assumptions.inflation, 0.06);
  const inflator = Math.pow(1 + inflation, yearsToTarget);

  // "You'll have by <target>" — the CURRENT pace projected in the REAL frame with the SAME
  // inflow schedule + real return schedule the kernel just used (no re-built parallel math).
  // Under a member lens the individual path has no projection of its own, so the adult's
  // attributable corpus is grown with their own scalar contribution through the same primitive.
  const startCorpus = atTargetAdult ? atTargetAdult.attributableCorpus : atTarget.fireWithdrawableCorpus;
  const inflow = atTargetAdult ? currentMonthlyReal : atTarget.householdContributionSchedule;
  // The return must match the one the SAME scope's FIRE age was solved at: the household's
  // glide-aware schedule for the household, the member's OWN scalar real return under a lens.
  // Growing a debt-heavy spouse's corpus at the household blend over-states it (up to ~1.7x
  // across 25 years) — FinTech HIGH-1 / code-review M1.
  const returns = atTargetAdult ? atTargetAdult.realReturn : atTarget.realReturnSchedule;
  const wholeYears = Math.max(0, Math.round(yearsToTarget));
  // horizonYears 0 means "today" — projectCorpus would still run a full year of growth if we
  // forced a minimum of 1, inventing returns that have not happened (code-review H1).
  const points =
    wholeYears === 0
      ? []
      : projectCorpus({
          currentCorpus: safe(startCorpus),
          monthlyContribution: inflow,
          expectedReturns: returns,
          inflation: 0, // REAL frame: only the corpus line is read, never the target/expense lines
          annualExpensesToday: safe(atTarget.annualExpensesToday),
          startAge: anchorAge,
          swr: swrUsed,
          horizonYears: wholeYears,
        });
  const atTargetPoint = points.find((pt) => pt.ageYears >= anchorAge + wholeYears) ?? points[points.length - 1];
  const haveAtTargetReal = Math.max(0, Math.round(safe(atTargetPoint?.corpus ?? startCorpus)));

  // ---- binary search on the real monthly contribution ----
  const reaches = (monthly: number): boolean => {
    const k = derive(snapshot, assumptions, lens, {
      monthlyContributionReal: monthly,
      targetRetirementAge: targetAge,
    });
    if (lensedMemberId) {
      const m = k.individualFireByMember.find((x) => x.memberId === lensedMemberId);
      return m != null && Number.isFinite(m.individualFireAge) && m.individualFireAge <= targetAge;
    }
    return k.householdFireAge != null && k.householdFireAge <= targetAge;
  };

  // The ceiling must be a FEASIBLE amount. Nobody can invest more per month than they take
  // home, so a "do this Rs4.8 L/month" quoted at a Rs1 L/month take-home is domain-absurd
  // (rule 31) — beyond that the honest answer is Infinity, which renders "Move the age".
  // FinTech HIGH-4. NOTE the residual model limit, stated in the UI copy: an amount above
  // today's savings implies cutting spending, which would ALSO lower the FIRE number; the
  // solver does not re-solve that fixed point, so such an amount is CONSERVATIVE (too high),
  // never optimistic.
  const monthlyTakeHome = safe(base.monthlyTakeHome);
  const uncappedCeiling = Math.max(
    10 * Math.max(0, currentMonthlyReal),
    5 * monthlyTakeHome,
    REQUIRED_CONTRIBUTION_MIN_CEILING,
  );
  const hi = monthlyTakeHome > 0 ? Math.min(uncappedCeiling, monthlyTakeHome) : uncappedCeiling;

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
    // Anything inside the tolerance band is noise, not a plan ("invest Rs87/month" as the
    // headline action is absurd) — treat it as already-there (code-review L4).
    requiredMonthlyReal = up <= REQUIRED_CONTRIBUTION_TOLERANCE ? 0 : Math.ceil(up);
  }

  // The hero renders needReal and needNominal in ONE sentence, so the nominal figure is grown
  // from the ROUNDED real figure — otherwise the two numbers a user can check against each
  // other differ by a rupee for no reason.
  const needRealRounded = Math.max(0, Math.round(safe(needReal)));
  return {
    requiredMonthlyReal,
    currentMonthlyReal: Math.max(0, Math.round(safe(currentMonthlyReal))),
    gapReal: needRealRounded - haveAtTargetReal,
    needReal: needRealRounded,
    haveAtTargetReal,
    paceFireAge: paceFireAgeRaw != null && Number.isFinite(paceFireAgeRaw) ? paceFireAgeRaw : null,
    needNominal: Math.max(0, Math.round(safe(needRealRounded * inflator, needRealRounded))),
    swrUsed,
  };
}
