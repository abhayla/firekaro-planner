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

export interface RetireByAgeInput {
  /** The age the user wants to retire by. */
  targetRetirementAge: number;
  /** Today's age — the projection anchor (derive's anchorAge). */
  currentAge: number;
  /** FIRE target corpus, REAL frame / today's rupees (derive's fireNumber). */
  fireNumber: number;
  /** Today's FIRE-relevant corpus (derive's fireWithdrawableCorpus). */
  currentCorpus: number;
  /** Expected REAL annual return — same frame as fireNumber (derive's realBlendedReturn). */
  expectedReturn: number;
  /** The household's current monthly contribution (derive's monthlyContribution). */
  currentMonthlySIP: number;
}

export interface RetireByAgeResult {
  yearsToTarget: number;
  /** Future value of today's corpus ALONE at the target age (no further SIP). */
  projectedCorpusFromCurrent: number;
  /** The corpus gap the SIP must close (≥ 0; 0 ⇒ today's corpus alone already reaches the target). */
  gap: number;
  /** Monthly SIP required to close the gap by the target age. */
  requiredMonthlySIP: number;
  currentMonthlySIP: number;
  /** Extra monthly SIP needed BEYOND what they save today (≥ 0) — the actionable shortfall. */
  additionalMonthlySIP: number;
  /** True if today's SIP already reaches the FIRE target by the target age. */
  onTrack: boolean;
}

/**
 * Reverse FIRE solver (gh-issue #30, objective 2 "get there faster"): "to retire BY age X, what
 * monthly SIP do I need?". The forward engine (derive → yearsToRegular) takes savings and yields
 * the FIRE age; this INVERTS it for the headline retirement target, mirroring educationAdequacy's
 * per-goal back-solve. The existing corpus keeps compounding, so the SIP only has to close the GAP
 * between the target and the future value of today's corpus. All real-frame (today's rupees) — same
 * inflation frame as fireNumber, so no double-count.
 */
export function retireByAgeRequiredSIP(input: RetireByAgeInput): RetireByAgeResult {
  const years = Math.max(0, input.targetRetirementAge - input.currentAge);
  const projectedCorpusFromCurrent = Math.round(
    input.currentCorpus * Math.pow(1 + input.expectedReturn, years),
  );
  const gap = Math.max(0, input.fireNumber - projectedCorpusFromCurrent);
  const requiredMonthlySIP = requiredSIP(gap, years, input.expectedReturn);
  const currentMonthlySIP = Math.round(input.currentMonthlySIP);
  return {
    yearsToTarget: years,
    projectedCorpusFromCurrent,
    gap,
    requiredMonthlySIP,
    currentMonthlySIP,
    additionalMonthlySIP: Math.max(0, requiredMonthlySIP - currentMonthlySIP),
    onTrack: requiredMonthlySIP <= currentMonthlySIP,
  };
}

/** Future-value-annuity monthly payment to reach `fv` over `years` at annual `rate`. */
function requiredSIP(fv: number, years: number, rate: number): number {
  const months = Math.round(years * 12);
  if (months <= 0) return Math.round(fv); // due now — needs the lump immediately
  const r = rate / 12;
  if (r <= 0) return Math.round(fv / months);
  const factor = (Math.pow(1 + r, months) - 1) / r;
  return Math.round(fv / factor);
}
