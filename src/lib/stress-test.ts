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
import { calculateFIRENumber, calculateYearsToTarget } from "@/lib/fire-math";

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
}

/** Baseline years-to-FIRE before any scenario shift. */
export function baselineYearsToFire(args: StressRunArgs): number {
  const target = calculateFIRENumber(args.annualExpenses, args.swr);
  const monthly = (args.annualIncomeTotal - args.annualExpenses) / 12;
  return calculateYearsToTarget(args.totalCorpus, target, monthly, args.expectedReturn);
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
    const target = calculateFIRENumber(shifted.annualExpenses, shifted.swr);
    const monthly = Math.max(0, (args.annualIncomeTotal - shifted.annualExpenses) / 12);
    const years = calculateYearsToTarget(args.totalCorpus, target, monthly, shifted.expectedReturn);
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
