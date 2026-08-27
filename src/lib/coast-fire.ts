/**
 * Coast FIRE — the corpus point where you can stop saving and the
 * existing corpus alone grows to your full FIRE number by retirement.
 *
 * Phase 2 Stage C per docs/goals/build-firekaro-mvp-v5.md §5.
 * Audit Entry #2 A2.3 — replaces v4's missing Coast FIRE milestone with
 * the standard "compound-grow alone" formula.
 *
 * The Coast FIRE corpus today = (target FIRE number) / (1 + r)^years
 *
 * Where:
 *   r = expected real return (decimal; nominal return - inflation)
 *   years = years until retirement
 *
 * A user who has reached their Coast FIRE corpus can continue working
 * but stop contributing — the existing corpus, compounding at expected
 * real return, hits the FIRE number at retirement. This is the
 * audit-required milestone for users who want a "go part-time" target
 * before full FIRE.
 *
 * Note on returns: this module accepts REAL return (nominal - inflation)
 * because the FIRE number is expressed in TODAY's rupees. If callers
 * have nominal return + inflation, compute real = nominal - inflation
 * before calling.
 */

export interface CoastFireInput {
  /** Target FIRE number in today's rupees. */
  fireNumber: number;
  /** Years until retirement (anchor age). */
  yearsToRetirement: number;
  /** Expected real return (nominal - inflation) as decimal, e.g. 0.06. */
  realReturn: number;
  /**
   * ADR-0006. The REAL annual drift of `fireNumber` — the FIRE target rises in TODAY's rupees
   * because the household's spending basket outruns the general CPI everything here is deflated
   * by (`derive().realTargetDriftRate`). Absent/0 ⇒ the pre-ADR-0006 CONSTANT target, byte-identical.
   *
   * Coasting is a race between two compounding series, so a drifting target is not a detail: with
   * `g > 0` the corpus must out-earn the target, i.e. the discount rate is the NET rate
   * `(1+realReturn)/(1+g) − 1`, not `realReturn`. Discounting a constant target under-states the
   * coast corpus and tells the user they can stop saving sooner than they actually can — the
   * optimistic direction, which is Tier-0 for this persona.
   */
  targetDriftRate?: number;
}

export interface CoastFireResult {
  /** The corpus today that, with no further contributions, grows to fireNumber. */
  coastCorpus: number;
  /** Ratio current / coastCorpus — >=1.0 means user is at or past Coast FIRE. */
  coastRatio: (currentCorpus: number) => number;
  /** True when user can stop saving and still hit FIRE by retirement. */
  hasReachedCoast: (currentCorpus: number) => boolean;
  /** Years until current corpus, growing at realReturn, equals fireNumber. */
  yearsAtCurrent: (currentCorpus: number) => number;
}

/**
 * Compute Coast FIRE milestones for a user.
 *
 * Edge cases:
 *  - yearsToRetirement <= 0 -> coastCorpus = fireNumber (already retiring).
 *  - realReturn <= 0 -> coastCorpus = fireNumber (no compounding helps).
 *  - fireNumber <= 0 -> coastCorpus = 0 (no target).
 */
export function calculateCoastFire(input: CoastFireInput): CoastFireResult {
  const { fireNumber, yearsToRetirement, realReturn } = input;
  const drift =
    Number.isFinite(input.targetDriftRate) && (input.targetDriftRate as number) > -1
      ? (input.targetDriftRate as number)
      : 0;
  // The rate at which the corpus GAINS on the target. Equivalent to
  // `fireNumber x (1+g)^Y / (1+realReturn)^Y`, written as one net rate so every branch and the
  // `yearsAtCurrent` inverse below share it. drift = 0 ⇒ netRate === realReturn, byte-identical.
  const netRate = (1 + realReturn) / (1 + drift) - 1;

  let coastCorpus: number;
  if (fireNumber <= 0) {
    coastCorpus = 0;
  } else if (yearsToRetirement <= 0 || netRate <= 0) {
    // Compounding never gains on the target, so no amount of coasting closes the gap. The honest
    // floor is the target AS IT WILL BE — the drifted number in today's rupees, which is
    // `fireNumber` exactly when g = 0 (the pre-ADR-0006 behaviour, preserved).
    coastCorpus = fireNumber * Math.pow(1 + drift, Math.max(0, yearsToRetirement));
  } else {
    coastCorpus = fireNumber / Math.pow(1 + netRate, yearsToRetirement);
  }

  function coastRatio(currentCorpus: number): number {
    if (coastCorpus <= 0) return Infinity;
    return currentCorpus / coastCorpus;
  }

  function hasReachedCoast(currentCorpus: number): boolean {
    return currentCorpus >= coastCorpus;
  }

  function yearsAtCurrent(currentCorpus: number): number {
    if (currentCorpus <= 0) return Infinity;
    if (currentCorpus >= fireNumber) return 0;
    if (netRate <= 0) return Infinity;
    // current x (1+r)^t = fireNumber x (1+g)^t  =>  t = log(fireNumber/current) / log(1+netRate).
    // g = 0 collapses to the prior `log(1 + realReturn)` denominator.
    return Math.log(fireNumber / currentCorpus) / Math.log(1 + netRate);
  }

  return { coastCorpus, coastRatio, hasReachedCoast, yearsAtCurrent };
}

/**
 * Real return for the Coast-FIRE calc — the ONE real return, defined exactly as the
 * kernel's `derive().realBlendedReturn`.
 *
 * ADR-0006 / gh #180. Two things were wrong here and they compounded:
 *   1. the deflator was the household EXPENSE BASKET while the hero deflated at GENERAL CPI,
 *      so the same dashboard carried two different real returns for one household;
 *   2. the arithmetic form `nominal − inflation` is not the geometric real return the kernel
 *      uses, so even with the same deflator the two figures would not have matched
 *      (at 11% / 6% the gap is ~28 bp — enough to move a Coast crossover).
 * Both are closed: the deflator is GENERAL CPI (never the basket — that re-creates the #20
 * "FIRE at 115" class), and the form is `(1+r)/(1+π) − 1`, identical to
 * `derive.ts`'s `toRealReturn`. `FireMilestonesCard` now reads `realBlendedReturn` straight
 * off the kernel; this helper exists for callers that hold only the raw inputs, and
 * `FireMilestonesCard.binding.spec.ts` pins the two to 1e-9 on every seed persona.
 *
 * A1 (gh-issue #9 L2): this MUST NOT be clamped to a positive floor. A negative
 * real return is a meaningful state for debt-heavy / high-inflation households —
 * `calculateCoastFire` then correctly returns `coastCorpus = fireNumber` (no
 * amount of compounding helps, so you cannot "coast"; you need the full number
 * today). The old `FireMilestonesCard` did `Math.max(0.01, nominal − inflation)`,
 * which silently understated the coast corpus → an OPTIMISTIC "you can stop
 * saving sooner than you actually can" signal. Pass the true real return through
 * so the library's `realReturn <= 0 → fireNumber` guard can fire.
 */
export function realReturnForCoast(nominalReturn: number, generalInflation: number): number {
  return (1 + nominalReturn) / (1 + generalInflation) - 1;
}

/**
 * Barista FIRE — the corpus where part-time work earnings cover the gap
 * between portfolio withdrawals and full expenses. Different from Coast
 * (Coast = stop saving entirely; Barista = stop full-time work but keep
 * part-time supplementary income).
 *
 * The Barista corpus is the corpus that, when withdrawing at the SWR,
 * covers (annualExpenses - baristaIncome).
 *
 * Audit Entry #2 A2.5 — Barista FIRE alternative path.
 */
export interface BaristaFireInput {
  /** Annual expenses in today's rupees. */
  annualExpenses: number;
  /** Annual income from part-time / passion work (today's rupees). */
  baristaIncome: number;
  /** Safe Withdrawal Rate as decimal (e.g. 0.035). */
  swr: number;
}

export interface BaristaFireResult {
  /** Corpus required to cover (expenses - baristaIncome) at SWR. */
  baristaCorpus: number;
  /** True when current corpus + barista income covers full expenses. */
  hasReachedBarista: (currentCorpus: number) => boolean;
}

export function calculateBaristaFire(input: BaristaFireInput): BaristaFireResult {
  const { annualExpenses, baristaIncome, swr } = input;
  // If barista income covers all expenses, you don't need any corpus.
  const gap = Math.max(0, annualExpenses - baristaIncome);
  const baristaCorpus = swr > 0 ? gap / swr : Infinity;

  return {
    baristaCorpus,
    hasReachedBarista: (currentCorpus) => currentCorpus >= baristaCorpus,
  };
}

/**
 * Coast-trajectory series (audit Entry #21 A21.1) — the corpus-vs-Coast chart.
 *
 * Plots how the EXISTING corpus, compounding at the real return with NO further
 * contributions, tracks toward the FIRE number over the years to retirement.
 * Where the no-contribution curve crosses the target line is the Coast
 * crossover: if it crosses on or before retirement, the user has reached Coast
 * FIRE. Both series are in TODAY's rupees (a real return is used).
 *
 * ADR-0006 Phase 1c — THE TARGET LINE IS NOT FLAT. Even in today's rupees the
 * FIRE number rises, because the household's spending basket outruns general
 * CPI and the medical reservation outruns both. Drawing it flat made Coast look
 * reached years before it is — the corpus curve met a line that was standing
 * still. Callers pass `fireTargetRealAt`, the kernel's own today's-₹ target at
 * year `t` (`derive().regularTargetComponentsRealAt(t).total`), and the line
 * follows it kink for kink, including the flattening as dated goals fall due.
 * Omit it and the series falls back to the flat `fireNumber` — the legacy shape,
 * kept only so a caller with no kernel handle still renders something honest at
 * t = 0.
 */
export interface CoastTrajectoryPoint {
  /** Calendar year at this step. */
  year: number;
  /** Years from now (0 = today). */
  yearsFromNow: number;
  /** Existing corpus grown at the real return with no new contributions. */
  corpusNoContribution: number;
  /** The FIRE target at this step, today's rupees — RISING unless the caller omitted the schedule. */
  fireTarget: number;
}

export function coastTrajectory(args: {
  currentCorpus: number;
  fireNumber: number;
  yearsToRetirement: number;
  realReturn: number;
  startYear: number;
  /**
   * ADR-0006 Phase 1c. The kernel's today's-₹ FIRE target at year `t`. Supply it and the target
   * line drifts exactly as the headline solver's does; omit it for the legacy flat line.
   */
  fireTargetRealAt?: (t: number) => number;
}): CoastTrajectoryPoint[] {
  const { currentCorpus, fireNumber, yearsToRetirement, realReturn, startYear, fireTargetRealAt } = args;
  const horizon = Math.max(0, Math.ceil(yearsToRetirement));
  const points: CoastTrajectoryPoint[] = [];
  for (let t = 0; t <= horizon; t++) {
    const grown = realReturn > 0 ? currentCorpus * Math.pow(1 + realReturn, t) : currentCorpus;
    // A non-finite or negative reading from the caller's schedule falls back to the flat number
    // rather than putting a NaN on a chart axis (rule 31 — no field is ever NaN).
    const targetAtT = fireTargetRealAt ? fireTargetRealAt(t) : fireNumber;
    points.push({
      year: startYear + t,
      yearsFromNow: t,
      corpusNoContribution: Math.round(grown),
      fireTarget: Math.round(Number.isFinite(targetAtT) && targetAtT > 0 ? targetAtT : fireNumber),
    });
  }
  return points;
}
