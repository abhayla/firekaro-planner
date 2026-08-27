// Insurance + asset-allocation adequacy rules per D16 + D19.
// Soft chips, never blocking.

export type AdequacyStatus = "adequate" | "under" | "advisory";

export interface AdequacyResult {
  status: AdequacyStatus;
  message: string;
}

export function lifeCoverAdequacy(sumAssured: number, insuredAnnualIncome: number): AdequacyResult {
  if (insuredAnnualIncome <= 0) {
    return { status: "advisory", message: "Life insurance for non-earners is uncommon — consider term life on the household's primary earner." };
  }
  const target = insuredAnnualIncome * 10;
  if (sumAssured >= target) {
    return { status: "adequate", message: "Adequate (≥10× annual income)." };
  }
  return {
    status: "under",
    message: `Consider increasing — advisor benchmark is 10× annual income (~₹${formatCompact(target)}).`,
  };
}

export function healthCoverAdequacy(
  sumAssured: number,
  isMetro: boolean = true,
): AdequacyResult {
  const target = isMetro ? 500000 : 300000;
  if (sumAssured >= target) {
    return { status: "adequate", message: "Adequate for an Indian family floater." };
  }
  return {
    status: "under",
    message: `Consider increasing — recommended minimum for ${isMetro ? "metro" : "non-metro"} Indian family is ₹${formatCompact(target)}.`,
  };
}

export interface AllocationByAge {
  equityPercent: number;
  recommendedMinEquity: number;
  recommendedMaxEquity: number;
  status: AdequacyStatus;
  message: string;
}

export function allocationByAge(
  age: number,
  equityValue: number,
  totalCorpus: number,
): AllocationByAge {
  const pct = totalCorpus > 0 ? (equityValue / totalCorpus) * 100 : 0;
  let minE = 60, maxE = 100, label = "<45 years";
  if (age >= 45 && age < 55) {
    minE = 40; maxE = 60; label = "45-55 years";
  } else if (age >= 55) {
    minE = 0; maxE = 40; label = "55+ years";
  }
  const inRange = pct >= minE && pct <= maxE;
  return {
    equityPercent: Math.round(pct * 10) / 10,
    recommendedMinEquity: minE,
    recommendedMaxEquity: maxE,
    status: inRange ? "adequate" : "under",
    message: inRange
      ? `Mostly aligned (${label}: ${minE}-${maxE}% equity recommended).`
      : `Consider rebalancing (${label}: ${minE}-${maxE}% equity recommended; currently ${Math.round(pct)}%).`,
  };
}

function formatCompact(n: number): string {
  if (n >= 10000000) return `${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `${(n / 100000).toFixed(2)} L`;
  return `${Math.round(n)}`;
}

// ---------- Education goal-funding adequacy (audit Entry #6 — Sharma S1) ----------

export interface EducationAdequacyRow {
  label: string;
  /** Today's-rupee target. */
  todayAmount: number;
  targetYear: number;
  /** Whole years from now to the target (floored at 0). */
  yearsToTarget: number;
  /** Inflated target at the education bucket rate. */
  futureValue: number;
  /** Monthly SIP needed to reach futureValue by targetYear at expectedReturn. */
  requiredMonthlySIP: number;
}

export interface EducationAdequacyResult {
  rows: EducationAdequacyRow[];
  totalFutureValue: number;
  totalRequiredMonthlySIP: number;
  availableMonthlySIP: number;
  /** True when available monthly savings cover the sum of required SIPs. */
  onTrack: boolean;
  /** Monthly shortfall (0 when on track). */
  shortfallMonthly: number;
}

export interface EducationGoalInput {
  label?: string;
  todayAmount: number;
  targetYear: number;
}

/**
 * Required-SIP funding adequacy for each education goal. FV inflates the
 * today-amount at the education bucket rate; the required monthly SIP is the
 * future-value annuity payment over the remaining months at the expected
 * return. The household is "on track" when its available monthly savings
 * cover the sum of required SIPs across all education goals.
 *
 * Pure; no store. The currentYear + rates are injected for testability.
 */
export function educationAdequacy(args: {
  goals: EducationGoalInput[];
  educationInflation: number;
  expectedReturn: number;
  currentYear: number;
  availableMonthlySIP: number;
}): EducationAdequacyResult {
  const { goals, educationInflation, expectedReturn, currentYear, availableMonthlySIP } = args;

  const rows: EducationAdequacyRow[] = goals.map((g, i) => {
    const yearsToTarget = Math.max(0, g.targetYear - currentYear);
    const futureValue = Math.round(g.todayAmount * Math.pow(1 + educationInflation, yearsToTarget));
    const requiredMonthlySIP = requiredSIP(futureValue, yearsToTarget, expectedReturn);
    return {
      label: g.label?.trim() || `Education goal ${i + 1}`,
      todayAmount: g.todayAmount,
      targetYear: g.targetYear,
      yearsToTarget,
      futureValue,
      requiredMonthlySIP,
    };
  });

  const totalFutureValue = rows.reduce((s, r) => s + r.futureValue, 0);
  const totalRequiredMonthlySIP = rows.reduce((s, r) => s + r.requiredMonthlySIP, 0);
  const shortfallMonthly = Math.max(0, Math.round(totalRequiredMonthlySIP - availableMonthlySIP));

  return {
    rows,
    totalFutureValue,
    totalRequiredMonthlySIP: Math.round(totalRequiredMonthlySIP),
    availableMonthlySIP,
    onTrack: totalRequiredMonthlySIP <= availableMonthlySIP,
    shortfallMonthly,
  };
}

/*
 * `RetireByAgeInput` / `RetireByAgeResult` / `retireByAgeRequiredSIP` (gh-issue #30) were DELETED
 * by ADR-0006 Phase 1b (HIGH-2). They were a second reverse-FIRE solver that never made the
 * ADR-0006 migration — a constant today's-₹ target, `rate/12` compounding and no savings step-up —
 * so `/fire-goals/what-if` quoted a different, always smaller ₹/month than the dashboard hero for
 * the same household at the same age. Its only consumer now calls the ONE solver,
 * `required-contribution.requiredMonthlyContributionFor`, which drives the real `derive()` kernel.
 * Do not re-introduce a parallel closed-form here.
 */

/** Future-value-annuity monthly payment to reach `fv` over `years` at annual `rate`. */
function requiredSIP(fv: number, years: number, rate: number): number {
  const months = Math.round(years * 12);
  if (months <= 0) return Math.round(fv); // due now — needs the lump immediately
  // ADR-0006 Phase 1b: the TRUE monthly equivalent of the annual rate, `(1+r)^(1/12) − 1`, not
  // `r/12`. `r/12` compounds to `(1+r/12)^12 > 1+r`, by an amount that depends on `r`, so it
  // over-states the growth the SIP earns and therefore UNDER-states the SIP required — the
  // optimistic direction, on a prescription. Same correction, same reason, as `fire-math.ts`'s
  // `monthlyRate` (which the headline solver already uses); the two must not disagree about what
  // "8% a year" means.
  const r = rate > -1 ? Math.pow(1 + rate, 1 / 12) - 1 : -1;
  if (r <= 0) return Math.round(fv / months);
  const factor = (Math.pow(1 + r, months) - 1) / r;
  return Math.round(fv / factor);
}
