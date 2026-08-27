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
 * ADR-0006 RE-STATEMENT OF THAT CONTRACT FOR A MOVING TARGET. The target is no longer a constant:
 * it now grows at the household expense basket while the corpus grows at the nominal return. The
 * monotonicity STILL HOLDS, and for a reason worth writing down rather than re-deriving: for any
 * fixed year `t`, `corpus_t` is strictly increasing in the contribution `C`, while `target_t`
 * depends only on today's expenses and the basket — it is INDEPENDENT of `C`. So the set of years
 * at which `corpus_t >= target_t` can only grow as `C` grows, and its first element (years-to-FIRE)
 * is non-increasing. Nothing in the drift couples the target to the contribution; if a future
 * change ever does couple them (e.g. a lever that trims expenses as a function of the amount
 * invested), this argument breaks and the solver must be re-verified, not assumed.
 *
 * FRAME. `needReal`/`haveAtTargetReal`/`requiredMonthlyReal` are TODAY's rupees at the TARGET AGE
 * — i.e. the nominal figure at T deflated at general CPI. `needNominal` is the nominal target at T
 * read directly off the same basket growth, never a separate `(1+CPI)^T` multiplication of the
 * real figure (which was the pre-ADR-0006 shape and understated it by `((1+b)/(1+CPI))^T`).
 *
 * HONESTY (rule 31): an unreachable target returns `Infinity` — never a fabricated finite amount —
 * and `paceFireAge` is `null` when the current pace never reaches the number within the horizon.
 * No field is ever NaN.
 */
import type { Household } from "@/types/household";
import type { Assumptions } from "@/types/assumptions";
import { derive, type DeriveLens } from "@/lib/derive";
import { projectCorpus } from "@/lib/fire-math";
import { toMonthly } from "@/lib/cashflow";
import type { ContributionSegments } from "@/lib/contribution-schedule";

/** Bisection stops once the bracket is this tight (rupees/month). */
export const REQUIRED_CONTRIBUTION_TOLERANCE = 100;
/** Hard iteration cap — bisection over the bracket converges long before this. */
export const REQUIRED_CONTRIBUTION_MAX_ITERATIONS = 60;

export interface RequiredContributionInput {
  snapshot: Household;
  assumptions: Assumptions;
  lens: DeriveLens;
  /** The age the user wants to retire at (the hero slider). */
  targetAge: number;
  /** QN-5: extra ADR-0004 segments summed onto the savings residual (the roll-the-EMI lever). */
  extraContributionSegments?: ContributionSegments;
  /**
   * `false` skips the bisection (the expensive part) and returns `requiredMonthlyReal = Infinity`
   * with `solved: false` — for callers that only need need / have-by-target / gap (the QN-4 chart
   * samples six ages per render; solving each one made every slider release cost ~300 ms for
   * numbers the chart never draws). Default `true`.
   */
  solve?: boolean;
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
  /** The age the projection actually started from (the LENSED adult's, not the household's). */
  anchorAgeUsed: number;
  /** Whole years from `anchorAgeUsed` to the target — the card must reuse this, never re-derive it. */
  yearsToTarget: number;
  /** False when there is no FIRE target yet (no expenses entered) — the card must make NO claim. */
  hasTarget: boolean;
  /** False when the caller asked not to solve (`solve: false`) — `requiredMonthlyReal` is then not a verdict. */
  solved: boolean;
  /**
   * T-378: the three components of `needReal`, taken from the SAME at-target kernel run.
   *
   * The QN-4 explainer narrates need as base + goals layer + medical reservation, and those steps
   * have to keep summing to the headline when the slider moves. Reading the components off the
   * STORED-target `derive()` while `needReal` comes from the AT-target one desynced them the moment
   * the user dragged the age, because all three are built on the horizon-driven SWR (blind
   * verification finding 2). One run, one set of parts.
   */
  needBaseReal: number;
  needPlannedGoalsReal: number;
  needHealthcareReservationReal: number;
  /**
   * The expense base the kernel actually capitalises — today's expenses NET of post-tax NPS annuity
   * income (`derive.ts`). Quoting the gross figure over-sums the steps for any household with NPS
   * (blind verification finding 3).
   */
  netAnnualExpensesReal: number;
}

/**
 * The share of today's spending a household is assumed to keep. A prescription that requires
 * cutting spending below this is not a plan — and it is also SELF-CONTRADICTORY, because the
 * FIRE number it is solving against was built on today's spending (FinTech re-review §B: quoting
 * Rs3.11 L/month to a household that spends Rs1.73 L/month asserts both "you'll spend Rs20.8 L/yr
 * forever, hence Rs10.6 Cr" and "spend Rs2.8 L/yr for 17 years"). Beyond this floor the honest
 * answer is Infinity → "Move the age", not a number from a different household's plan.
 */
export const MIN_LIVING_RETENTION = 0.5;

/** Finite-or-fallback guard so no arithmetic edge can put a NaN on screen. */
function safe(v: number, fallback = 0): number {
  return Number.isFinite(v) ? v : fallback;
}

export function requiredMonthlyContributionFor(
  input: RequiredContributionInput,
): RequiredContributionResult {
  const { snapshot, assumptions, lens } = input;
  const extra = input.extraContributionSegments ?? [];
  const extraOverride = extra.length > 0 ? { extraContributionSegments: extra } : {};
  // A non-finite target age can never produce an honest answer — reject it before it can
  // silently fall back to the stored target while the predicate always fails (code-review L6).
  if (!Number.isFinite(input.targetAge)) {
    const k = derive(snapshot, assumptions, lens, extraOverride);
    return {
      requiredMonthlyReal: Number.POSITIVE_INFINITY,
      currentMonthlyReal: Math.max(0, Math.round(safe(k.monthlyContribution))),
      gapReal: Number.NaN, // → resolveGapTone "unknown" → the UI makes NO claim
      needReal: 0,
      haveAtTargetReal: 0,
      paceFireAge: null,
      needNominal: 0,
      swrUsed: safe(k.effectiveSWR, 0.035),
      anchorAgeUsed: safe(k.anchorAge, 30),
      yearsToTarget: 0,
      hasTarget: false,
      solved: true,
      needBaseReal: 0,
      needPlannedGoalsReal: 0,
      needHealthcareReservationReal: 0,
      netAnnualExpensesReal: 0,
    };
  }
  const targetAge = Math.round(input.targetAge);

  // ---- baseline: today's pace, today's target (the slider must not move these) ----
  const base = derive(snapshot, assumptions, lens, extraOverride);
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
  const atTarget = derive(snapshot, assumptions, lens, { ...extraOverride, targetRetirementAge: targetAge });
  const atTargetAdult =
    atTarget.individualFireByMember.find((m) => m.memberId === lensedMemberId) ?? null;

  const paceFireAgeRaw = atTargetAdult
    ? Number.isFinite(atTargetAdult.individualFireAge)
      ? atTargetAdult.individualFireAge
      : null
    : atTarget.householdFireAge;

  const needRealToday = atTargetAdult ? atTargetAdult.individualFireNumber : atTarget.fireNumber;
  const swrUsed = safe(atTarget.effectiveSWR, 0.035);
  // The lensed adult's OWN age — `derive().anchorAge` is deliberately the primary earner's
  // (the #23 household-invariance guardrail), so using it under a lens would project an older
  // spouse for too many years and OVER-state their corpus (FinTech HIGH-2 / code-review H2).
  const anchorAge = safe(atTargetAdult ? atTargetAdult.anchorAge : atTarget.anchorAge, 30);
  const yearsToTarget = Math.max(0, targetAge - anchorAge);
  const inflation = safe(assumptions.inflation, 0.06);
  // ADR-0006. The FIRE number the household must actually hit AT the target age is today's number
  // grown at the household basket for `yearsToTarget` years. Expressed two ways, from ONE growth:
  //   needNominal = needToday x (1+b)^T        (target-year rupees)
  //   needReal    = needNominal / (1+CPI)^T    = needToday x (1+g)^T   (today's rupees)
  // where g = (1+b)/(1+CPI) − 1 is the kernel's own `realTargetDriftRate`. Before ADR-0006 the
  // real figure was the UNDRIFTED needToday and the nominal one was `needToday x (1+CPI)^T`, so
  // both were short by ((1+b)/(1+CPI))^T — an optimistic prescription (gh #167).
  const targetDrift = safe(atTarget.realTargetDriftRate, 0);
  const realDriftFactor = Math.pow(1 + targetDrift, yearsToTarget);
  const cpiInflator = Math.pow(1 + inflation, yearsToTarget);
  const needReal = needRealToday * realDriftFactor;

  // "You'll have by <target>" — the CURRENT pace projected in the REAL frame with the SAME
  // inflow schedule + real return schedule the kernel just used (no re-built parallel math).
  // Under a member lens the individual path has no projection of its own, so the adult's
  // attributable corpus is grown with their own scalar contribution through the same primitive.
  const startCorpus = atTargetAdult ? atTargetAdult.attributableCorpus : atTarget.fireWithdrawableCorpus;
  const inflowReal = atTargetAdult ? currentMonthlyReal : atTarget.householdContributionSchedule;
  const inflow: typeof inflowReal =
    typeof inflowReal === "number" && inflowReal <= 0
      ? inflowReal
      : (yearIndex: number) =>
          (typeof inflowReal === "function" ? inflowReal(yearIndex) : inflowReal) *
          Math.pow(1 + inflation, yearIndex);
  // The return must match the one the SAME scope's FIRE age was solved at: the household's
  // glide-aware schedule for the household, the member's OWN scalar real return under a lens.
  // Growing a debt-heavy spouse's corpus at the household blend over-states it (up to ~1.7x
  // across 25 years) — FinTech HIGH-1 / code-review M1.
  // ADR-0006: NOMINAL returns + a CPI-grown inflow, then deflate the endpoint at CPI — the exact
  // path the kernel's own solver walks, so "what you'll have" cannot drift from "when you get
  // there" through a second, differently-framed projection.
  const returns = atTargetAdult ? atTargetAdult.nominalReturn : atTarget.expectedReturnSchedule;
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
          inflation: 0, // only the corpus line is read here, never the target/expense lines
          annualExpensesToday: safe(atTarget.annualExpensesToday),
          startAge: anchorAge,
          swr: swrUsed,
          horizonYears: wholeYears,
        });
  const atTargetPoint = points.find((pt) => pt.ageYears >= anchorAge + wholeYears) ?? points[points.length - 1];
  // Nominal corpus at T, deflated at general CPI → today's rupees, the frame `needReal` is in.
  const haveAtTargetNominal = safe(atTargetPoint?.corpus ?? startCorpus);
  const haveAtTargetReal = Math.max(
    0,
    Math.round(haveAtTargetNominal / Math.pow(1 + inflation, wholeYears)),
  );

  // ---- binary search on the real monthly contribution ----
  const reaches = (monthly: number): boolean => {
    const k = derive(snapshot, assumptions, lens, {
      ...extraOverride,
      monthlyContributionReal: monthly,
      targetRetirementAge: targetAge,
    });
    if (lensedMemberId) {
      const m = k.individualFireByMember.find((x) => x.memberId === lensedMemberId);
      return m != null && Number.isFinite(m.individualFireAge) && m.individualFireAge <= targetAge;
    }
    return k.householdFireAge != null && k.householdFireAge <= targetAge;
  };

  // ---- the FEASIBLE ceiling (rule 31) ----
  // Take-home alone is an asymptote, not a bound: investing 100% of it means spending zero.
  // The real ceiling is take-home MINUS a living floor, and the floor is the larger of
  //   (a) contractually committed outflows — the auto-flowed EMI + insurance premium, which a
  //       solver has no business assuming away (prescribing a loan default), and
  //   (b) half of today's spending — a 50% permanent cut is already the outer edge of what a
  //       salaried accumulator will actually do.
  // Scope matters: under a member lens this must be THAT adult's take-home and THAT adult's
  // expenses, never the couple's — the household figure would let the card quote one spouse
  // more than twice their own income (FinTech re-review §D).
  const monthlyTakeHome = atTargetAdult
    ? Math.max(0, Math.round((atTargetAdult.attributableAnnualIncome - atTargetAdult.attributableAnnualTax) / 12))
    : safe(base.monthlyTakeHome);
  const monthlyExpenses = atTargetAdult
    ? Math.max(0, atTargetAdult.attributableAnnualExpenses / 12)
    : Math.max(0, safe(atTarget.annualExpensesToday) / 12);
  // Contractual outflows already inside the expense base (auto-flowed by the household store).
  const scopeSplit = atTargetAdult
    ? Math.min(100, Math.max(0, assumptions.householdSplitPercent ?? 50)) / 100
    : 1;
  const committedMonthly = snapshot.expenses.recurring
    .filter((r) => r.source === "auto-loan" || r.source === "auto-insurance")
    .reduce((sum, r) => sum + toMonthly({ amount: r.amount, period: r.frequency }) * scopeSplit, 0);
  const livingFloor = Math.max(committedMonthly, MIN_LIVING_RETENTION * monthlyExpenses);
  const hi = Math.max(0, monthlyTakeHome - livingFloor);

  let requiredMonthlyReal: number;
  const solve = input.solve !== false;
  if (!solve) {
    requiredMonthlyReal = Number.POSITIVE_INFINITY; // not solved — see `solved`
  } else if (hi <= 0) {
    // No feasible headroom (no income, or every rupee of take-home is already committed) —
    // there is no honest monthly amount to quote (FinTech re-review §A finding 4, MEDIUM).
    requiredMonthlyReal = Number.POSITIVE_INFINITY;
  } else if (reaches(0)) {
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
    // needReal x (1+CPI)^T === needToday x (1+b)^T — the nominal target at T, read off the same
    // basket growth. Grown from the ROUNDED real figure so the two numbers the hero prints side
    // by side reconcile exactly for a user who checks them.
    needNominal: Math.max(0, Math.round(safe(needRealRounded * cpiInflator, needRealRounded))),
    swrUsed,
    anchorAgeUsed: anchorAge,
    yearsToTarget: wholeYears,
    hasTarget: needRealRounded > 0,
    solved: solve,
    // ADR-0006: the three narrated components are at the SAME target age as `needReal`, so they
    // carry the SAME real drift — otherwise base + goals + reservation would stop summing to the
    // headline the moment the slider moved (the desync T-378 fixed, re-opened by the drift).
    needBaseReal: Math.max(0, Math.round(safe(atTarget.baseFireNumber * realDriftFactor))),
    needPlannedGoalsReal: Math.max(0, Math.round(safe(atTarget.familyLayerCorpus * realDriftFactor))),
    needHealthcareReservationReal: Math.max(
      0,
      Math.round(safe(atTarget.healthcareReservation * realDriftFactor)),
    ),
    netAnnualExpensesReal: Math.max(
      0,
      Math.round(
        safe(atTarget.baseFireNumber * safe(atTarget.effectiveSWR, 0.035) * realDriftFactor),
      ),
    ),
  };
}
