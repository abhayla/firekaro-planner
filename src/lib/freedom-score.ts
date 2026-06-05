// Freedom Score 0-100 — composite financial-health metric for the demo.
// Adapted from server/lib/calculations/freedom-score.ts (factor + weight model)
// but with demo-data-shape inputs and 5 weighted factors that the demo can compute
// from existing household + assumptions state.

export interface FreedomFactor {
  name: string;
  value: number; // raw current value
  target: number; // value at which the factor maxes out
  weight: number; // contribution to total /100
  score: number; // computed sub-score (0..weight)
  status: "excellent" | "good" | "fair" | "poor";
}

export interface FreedomScoreInput {
  /** % of monthly take-home being saved (0-100) */
  savingsRatePercent: number;
  /** EMIs / monthly take-home, expressed 0-100 — LOWER is better */
  dtiPercent: number;
  /** Whether the household has income to assess DTI against. gh #40: a zero-income
   *  user has dtiPercent 0 (0 debt / 0 income) which otherwise scores "excellent" —
   *  but DTI is not assessable without income, so it must NOT award marks then. */
  hasIncome: boolean;
  /** Liquid assets / monthly burn — months of coverage */
  emergencyMonths: number;
  /** Whether Life + Health insurance are adequate per adequacy.ts */
  lifeAdequate: boolean;
  healthAdequate: boolean;
  /** corpus / fireNumber × 100 (0-100, capped) */
  fireProgressPercent: number;
}

export interface FreedomScoreResult {
  score: number; // 0-100
  factors: FreedomFactor[];
  status: string;
  message: string;
}

function clampScore(score: number, weight: number): number {
  return Math.max(0, Math.min(weight, score));
}

function statusForRatio(actual: number, target: number): FreedomFactor["status"] {
  if (target <= 0) return "fair";
  const ratio = actual / target;
  if (ratio >= 1.2) return "excellent";
  if (ratio >= 0.9) return "good";
  if (ratio >= 0.5) return "fair";
  return "poor";
}

function inverseStatusForRatio(actual: number, target: number): FreedomFactor["status"] {
  // For factors where LOWER is better (DTI). target = max acceptable.
  if (actual <= target * 0.5) return "excellent";
  if (actual <= target) return "good";
  if (actual <= target * 1.5) return "fair";
  return "poor";
}

export function computeFreedomScore(input: FreedomScoreInput): FreedomScoreResult {
  // Savings rate — target 30%
  const savingsTarget = 30;
  const savingsScore = clampScore((input.savingsRatePercent / savingsTarget) * 25, 25);

  // DTI — target ≤ 30% (lower is better). gh #40: not assessable without income —
  // a zero-income household scores 0 here, never the false "excellent 20/20".
  const dtiTarget = 30;
  const dtiScore = !input.hasIncome
    ? 0
    : clampScore(
        input.dtiPercent <= dtiTarget
          ? 20
          : Math.max(0, 20 - ((input.dtiPercent - dtiTarget) / dtiTarget) * 20),
        20,
      );

  // Emergency fund — target 6 months
  const efTarget = 6;
  const efScore = clampScore((input.emergencyMonths / efTarget) * 20, 20);

  // Insurance adequacy — life + health each 7.5
  const insScore =
    (input.lifeAdequate ? 7.5 : 0) + (input.healthAdequate ? 7.5 : 0);

  // FIRE progress — target 100%
  const fireScore = clampScore((input.fireProgressPercent / 100) * 20, 20);

  const total = Math.round(savingsScore + dtiScore + efScore + insScore + fireScore);

  const factors: FreedomFactor[] = [
    {
      name: "Savings rate",
      value: input.savingsRatePercent,
      target: savingsTarget,
      weight: 25,
      score: Math.round(savingsScore),
      status: statusForRatio(input.savingsRatePercent, savingsTarget),
    },
    {
      name: "Debt-to-income",
      value: input.dtiPercent,
      target: dtiTarget,
      weight: 20,
      score: Math.round(dtiScore),
      // gh #40: no income → not assessable → "poor" (never the false "excellent").
      status: input.hasIncome ? inverseStatusForRatio(input.dtiPercent, dtiTarget) : "poor",
    },
    {
      name: "Emergency fund",
      value: input.emergencyMonths,
      target: efTarget,
      weight: 20,
      score: Math.round(efScore),
      status: statusForRatio(input.emergencyMonths, efTarget),
    },
    {
      name: "Insurance adequacy",
      value: (input.lifeAdequate ? 1 : 0) + (input.healthAdequate ? 1 : 0),
      target: 2,
      weight: 15,
      score: Math.round(insScore),
      status:
        input.lifeAdequate && input.healthAdequate
          ? "excellent"
          : input.lifeAdequate || input.healthAdequate
            ? "fair"
            : "poor",
    },
    {
      name: "FIRE progress",
      value: input.fireProgressPercent,
      target: 100,
      weight: 20,
      score: Math.round(fireScore),
      status: statusForRatio(input.fireProgressPercent, 100),
    },
  ];

  return {
    score: total,
    factors,
    ...getScoreMessage(total),
  };
}

export function getScoreMessage(score: number): { status: string; message: string } {
  if (score >= 85)
    return {
      status: "Excellent",
      message: "You're doing exceptionally well on your FIRE journey.",
    };
  if (score >= 70)
    return {
      status: "Good",
      message: "Solid progress toward financial independence.",
    };
  if (score >= 50)
    return {
      status: "Fair",
      message: "Good foundation. Focus on improving your weaker factors.",
    };
  if (score >= 30)
    return {
      status: "Developing",
      message: "Building your financial independence — review the recommendations below.",
    };
  return {
    status: "Starting",
    message: "Every journey begins with a first step. Let's build your foundation.",
  };
}

export function statusColor(s: FreedomFactor["status"]): string {
  switch (s) {
    case "excellent":
      return "success";
    case "good":
      return "primary";
    case "fair":
      return "warning";
    case "poor":
      return "error";
  }
}
