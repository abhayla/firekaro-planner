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

  let coastCorpus: number;
  if (fireNumber <= 0) {
    coastCorpus = 0;
  } else if (yearsToRetirement <= 0 || realReturn <= 0) {
    coastCorpus = fireNumber;
  } else {
    coastCorpus = fireNumber / Math.pow(1 + realReturn, yearsToRetirement);
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
    if (realReturn <= 0) return Infinity;
    // current * (1 + r)^t = fireNumber  =>  t = log(fireNumber/current) / log(1 + r)
    return Math.log(fireNumber / currentCorpus) / Math.log(1 + realReturn);
  }

  return { coastCorpus, coastRatio, hasReachedCoast, yearsAtCurrent };
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
 * contributions, tracks toward the (today's-rupees) FIRE number over the years
 * to retirement. Where the no-contribution curve crosses the flat FIRE line is
 * the Coast crossover: if it crosses on or before retirement, the user has
 * reached Coast FIRE. Both series are in today's rupees (real return used), so
 * the FIRE target is a flat line.
 */
export interface CoastTrajectoryPoint {
  /** Calendar year at this step. */
  year: number;
  /** Years from now (0 = today). */
  yearsFromNow: number;
  /** Existing corpus grown at the real return with no new contributions. */
  corpusNoContribution: number;
  /** The FIRE number (flat — today's rupees). */
  fireTarget: number;
}

export function coastTrajectory(args: {
  currentCorpus: number;
  fireNumber: number;
  yearsToRetirement: number;
  realReturn: number;
  startYear: number;
}): CoastTrajectoryPoint[] {
  const { currentCorpus, fireNumber, yearsToRetirement, realReturn, startYear } = args;
  const horizon = Math.max(0, Math.ceil(yearsToRetirement));
  const points: CoastTrajectoryPoint[] = [];
  for (let t = 0; t <= horizon; t++) {
    const grown = realReturn > 0 ? currentCorpus * Math.pow(1 + realReturn, t) : currentCorpus;
    points.push({
      year: startYear + t,
      yearsFromNow: t,
      corpusNoContribution: Math.round(grown),
      fireTarget: Math.round(fireNumber),
    });
  }
  return points;
}
