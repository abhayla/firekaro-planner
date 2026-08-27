/**
 * Stress-test scenarios (audit Entry #27, research Ch 05 §5.14).
 *
 * Pure scenario library extracted from the StressTest page so BOTH the page and
 * the Dashboard red-flag chip (A27.3) compute "plan fails X of 10" from one
 * source — no duplicated scenario list.
 *
 * Each scenario applies a lever shift to the baseline (annual expenses, SWR,
 * expected return) and the runner re-computes years-to-FIRE. A scenario passes
 * when it adds ≤ 5 years to the baseline FIRE date (A27.3 tolerance).
 */
import {
  calculateFIRENumber,
  calculateYearsToTarget,
  type ContributionSchedule,
  type ReturnSchedule,
} from "@/lib/fire-math";

export interface StressBaseline {
  annualExpenses: number;
  swr: number;
  expectedReturn: number;
}

export interface StressScenario {
  id: string;
  name: string;
  description: string;
  apply: (b: StressBaseline) => StressBaseline;
  /** Remediation copy shown on failures. */
  remediation: string;
}

export const STRESS_TOLERANCE_YEARS = 5;

export const STRESS_SCENARIOS: StressScenario[] = [
  {
    id: "market-correction-3yr",
    name: "30% market correction in first 3 years",
    description: "Equity allocation drops 30% as user enters retirement.",
    apply: (b) => ({ ...b, expectedReturn: b.expectedReturn - 0.04 }),
    remediation: "Build Bucket 1 (cash + breakable FDs) to cover the first 3 years of expenses. See /investments/buckets.",
  },
  {
    id: "high-inflation",
    name: "High inflation period (CPI 9-10%)",
    description: "General inflation runs ~3pp above the 6% baseline.",
    apply: (b) => ({ ...b, annualExpenses: b.annualExpenses * 1.5 }),
    remediation: "Increase equity allocation to outpace inflation; healthcare bucket especially. Review on /preferences#inflation.",
  },
  {
    id: "healthcare-shock",
    name: "Major healthcare event",
    description: "₹15-20L one-time medical expense not covered by insurance.",
    apply: (b) => ({ ...b, annualExpenses: b.annualExpenses + 200_000 }),
    remediation: "Increase senior-citizen health-floater cover + healthcare corpus reservation (currently 20%). See /preferences#family.",
  },
  {
    id: "parents-care-escalation",
    name: "Parents needing in-home care",
    description: "Parents healthcare expense doubles in next 5 years.",
    apply: (b) => ({ ...b, annualExpenses: b.annualExpenses * 1.15 }),
    remediation: "Add a Parents-kind recurring line + healthcare inflation routing on /expenses/recurring.",
  },
  {
    id: "earner-job-loss",
    name: "Primary earner job loss for 12 months",
    description: "Annual income drops by primary earner's share for one year.",
    apply: (b) => ({ ...b, annualExpenses: b.annualExpenses * 1.05 }),
    remediation: "12-month emergency fund (audit-grounded sandwich-gen minimum). Currently most households target only 6mo.",
  },
  {
    id: "child-education-overseas",
    name: "Children's overseas higher-ed",
    description: "Education target jumps from ₹50L to ₹1.5Cr per child.",
    apply: (b) => ({ ...b, annualExpenses: b.annualExpenses * 1.08 }),
    remediation: "Earmark a dedicated Education goal (kind: 'education', planned-future line) with 10%/yr inflation.",
  },
  {
    id: "longevity-shock",
    name: "Living to 100 instead of 90",
    description: "Plan-to age extended by 10 years.",
    apply: (b) => ({ ...b, swr: b.swr - 0.005 }),
    remediation: "Set per-member Plan-to age on Profile; revise SWR via the horizon-driven resolver on /preferences#core.",
  },
  {
    id: "swr-shock",
    name: "SWR drops to 3% (very conservative)",
    description: "Research downgrade — SWR moves from 3.5% to 3%.",
    apply: (b) => ({ ...b, swr: 0.03 }),
    remediation: "Stress 3% is conservative; the FIRE engine accepts your own SWR on /preferences#core.",
  },
  {
    id: "equity-haircut-permanent",
    name: "Permanent 25% equity haircut",
    description: "Long-run equity return drops 2pp permanently (8-10% to 6-8%).",
    apply: (b) => ({ ...b, expectedReturn: b.expectedReturn - 0.02 }),
    remediation: "Increase savings rate or extend horizon; rebalance via /preferences#returns.",
  },
  {
    id: "currency-depreciation",
    name: "INR depreciation 30% over horizon",
    description: "Imports + foreign edu costs scale up due to weak INR.",
    apply: (b) => ({ ...b, annualExpenses: b.annualExpenses * 1.07 }),
    remediation: "Add international-equity allocation (15-25%) as natural hedge. Enable via /preferences#features.",
  },
];

export interface StressResult {
  scenario: StressScenario;
  yearsToFire: number;
  fireNumber: number;
  passed: boolean;
  delta: number;
}

export interface StressSummary {
  passed: number;
  failed: number;
  total: number;
}

export interface StressRunArgs extends StressBaseline {
  totalCorpus: number;
  annualIncomeTotal: number;
  /**
   * ADR-0006 Phase 1b — the KERNEL TRIPLE. Supply all four and this module runs the SAME nominal
   * model the headline does, so its absolute `yearsToFire` agrees with the FIRE age on the hero
   * instead of contradicting it. Omit them and the legacy scalar path runs, byte-identical.
   *
   * Why it matters: without them the target here is `annualExpenses / swr` — no family layer, no
   * medical reservation — held CONSTANT in today's rupees, the corpus grows at a flat real return
   * and the savings step-up does not exist. That is the pre-ADR-0006 model, and it produced a
   * baseline FIRE date years apart from the one the dashboard prints for the same household. The
   * per-scenario DELTA (what this page is really about) survived either way; the absolutes did not.
   */
  /** `derive().fireNumber` — the headline target in today's rupees (base + family layer + reservation). */
  fireNumberToday?: number;
  /**
   * `derive().effectiveTargetGrowthNominal` — the NOMINAL rate the headline target actually grows
   * at over the horizon the headline was solved at.
   *
   * ADR-0006 Phase 1d: this used to be `derive().householdInflation`, the scalar spending basket,
   * and was named `targetInflation` to match. That is only the BASE leg's rate: it is blind to the
   * medical reservation compounding at medical inflation and to every dated goal's due-year cap,
   * so the stress page's own baseline FIRE age drifted away from the dashboard's for the same
   * household. Renamed as well as re-pointed — a field called "inflation" invites the next caller
   * to hand it an inflation rate, which is exactly how the base-leg mistake keeps recurring.
   */
  targetGrowthNominal?: number;
  /** `derive().nominalContributionSchedule` — the real inflow grown at CPI, incl. the step-up. */
  contributionSchedule?: ContributionSchedule;
  /** `derive().expectedReturnSchedule` — NOMINAL, glide-tapered. */
  expectedReturnSchedule?: ReturnSchedule;
}

/**
 * Years-to-FIRE for one (possibly shifted) baseline. Uses the kernel triple when the caller
 * supplies it, else the legacy scalar model.
 *
 * A scenario shifts `annualExpenses`, `swr` and/or `expectedReturn`. In kernel mode those shifts
 * are applied PROPORTIONALLY to the headline target (the shift is a shock to the expense line, and
 * the family layer + reservation scale with it exactly as `derive()` builds them) and ADDITIVELY to
 * the nominal return schedule — so a scenario means the same thing in both modes.
 */
function yearsToFireFor(args: StressRunArgs, shifted: StressBaseline): number {
  const monthlyReal = Math.max(0, (args.annualIncomeTotal - shifted.annualExpenses) / 12);
  const kernelMode =
    args.fireNumberToday != null &&
    Number.isFinite(args.fireNumberToday) &&
    args.contributionSchedule != null &&
    args.expectedReturnSchedule != null;

  if (!kernelMode) {
    const target = calculateFIRENumber(shifted.annualExpenses, shifted.swr);
    return calculateYearsToTarget(args.totalCorpus, target, monthlyReal, shifted.expectedReturn);
  }

  // Proportional expense/SWR shock on the headline target, then grown at the rate the headline
  // itself was solved at (`effectiveTargetGrowthNominal`) — not at the raw spending basket, which
  // is only one of the target's three legs.
  const expenseScale = args.annualExpenses > 0 ? shifted.annualExpenses / args.annualExpenses : 1;
  const swrScale = shifted.swr > 0 ? args.swr / shifted.swr : 1;
  const targetToday = (args.fireNumberToday as number) * expenseScale * swrScale;
  const growth = Number.isFinite(args.targetGrowthNominal) ? (args.targetGrowthNominal as number) : 0;
  const target = (yearIndex: number) => targetToday * Math.pow(1 + growth, yearIndex);

  const returnDelta = shifted.expectedReturn - args.expectedReturn;
  const baseReturns = args.expectedReturnSchedule as ReturnSchedule;
  const returns: ReturnSchedule =
    returnDelta === 0
      ? baseReturns
      : (yearIndex: number) =>
          (typeof baseReturns === "function" ? baseReturns(yearIndex) : baseReturns) + returnDelta;

  // The kernel's inflow already carries CPI + the step-up. A scenario that lifts expenses eats
  // into the savings residual, so scale the schedule by the residual's own shift.
  const baseMonthlyReal = Math.max(0, (args.annualIncomeTotal - args.annualExpenses) / 12);
  const inflowScale = baseMonthlyReal > 0 ? monthlyReal / baseMonthlyReal : 0;
  const baseInflow = args.contributionSchedule as ContributionSchedule;
  const inflow: ContributionSchedule =
    inflowScale <= 0
      ? 0
      : (yearIndex: number) =>
          (typeof baseInflow === "function" ? baseInflow(yearIndex) : baseInflow) * inflowScale;

  return calculateYearsToTarget(args.totalCorpus, target, inflow, returns);
}

/** Baseline years-to-FIRE before any scenario shift. */
export function baselineYearsToFire(args: StressRunArgs): number {
  return yearsToFireFor(args, {
    annualExpenses: args.annualExpenses,
    swr: args.swr,
    expectedReturn: args.expectedReturn,
  });
}

export function runStressScenarios(args: StressRunArgs): {
  results: StressResult[];
  summary: StressSummary;
} {
  const base: StressBaseline = {
    annualExpenses: args.annualExpenses,
    swr: args.swr,
    expectedReturn: args.expectedReturn,
  };
  const baselineYears = baselineYearsToFire(args);

  const results: StressResult[] = STRESS_SCENARIOS.map((s) => {
    const shifted = s.apply(base);
    const years = yearsToFireFor(args, shifted);
    const expenseScale = args.annualExpenses > 0 ? shifted.annualExpenses / args.annualExpenses : 1;
    const swrScale = shifted.swr > 0 ? args.swr / shifted.swr : 1;
    const target =
      args.fireNumberToday != null && Number.isFinite(args.fireNumberToday)
        ? (args.fireNumberToday as number) * expenseScale * swrScale
        : calculateFIRENumber(shifted.annualExpenses, shifted.swr);
    const delta = years - baselineYears;
    return {
      scenario: s,
      yearsToFire: years,
      fireNumber: target,
      delta,
      passed: delta <= STRESS_TOLERANCE_YEARS,
    };
  });

  const passed = results.filter((r) => r.passed).length;
  return {
    results,
    summary: { passed, failed: results.length - passed, total: results.length },
  };
}
