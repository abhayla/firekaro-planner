/**
 * Member retirement-horizon sanity validation (audit Entry #5 A5.x).
 *
 * The planning horizon (planToAge − retirementAge) is the number of years the
 * retirement corpus must last; it drives the horizon-bracketed SWR
 * (lib/fire-math.getHorizonSWR). A nonsensical horizon silently produces a
 * wrong headline FIRE number, so the member form validates it at entry.
 *
 * Pure function — no Vue, no store. The member form maps the issue list into
 * inline messages and a save/proceed block.
 *
 * Rules (contract STAGE A A5.x):
 *   BLOCK (error):
 *     - planToAge ≤ retirementAge          (you can't plan to die before you retire)
 *     - horizon < 5 years                  (too short to model a withdrawal phase)
 *   SOFT-WARN (warn):
 *     - horizon < 20 years                 (draws a higher SWR; sanity-check)
 *     - horizon > 60 years                 (unusually long; verify plan-to age)
 *     - retirementAge < 35                 (very early — corpus assumptions must hold)
 */

export type HorizonIssueLevel = "error" | "warn";

export interface HorizonIssue {
  level: HorizonIssueLevel;
  message: string;
}

export const MIN_HORIZON_YEARS = 5;
export const SHORT_HORIZON_YEARS = 20;
export const LONG_HORIZON_YEARS = 60;
export const EARLY_RETIREMENT_AGE = 35;

export function validateMemberHorizon(args: {
  retirementAge: number | null | undefined;
  planToAge: number | null | undefined;
}): HorizonIssue[] {
  const issues: HorizonIssue[] = [];
  const r = args.retirementAge;
  const p = args.planToAge;

  // Nothing to validate until a retirement age is set.
  if (r == null || !Number.isFinite(r)) return issues;

  // Soft-warn on a very early retirement age regardless of plan-to age.
  if (r < EARLY_RETIREMENT_AGE) {
    issues.push({
      level: "warn",
      message: `Retiring before ${EARLY_RETIREMENT_AGE} implies a very long horizon — make sure your corpus assumptions are realistic.`,
    });
  }

  if (p == null || !Number.isFinite(p)) return issues;

  // Blocking: plan-to age must exceed retirement age.
  if (p <= r) {
    issues.push({
      level: "error",
      message: "Plan-to age must be greater than the target retirement age.",
    });
    return issues; // horizon is non-positive; further checks are meaningless
  }

  const horizon = p - r;
  if (horizon < MIN_HORIZON_YEARS) {
    issues.push({
      level: "error",
      message: `Retirement horizon is only ${horizon} year${horizon === 1 ? "" : "s"} — too short to plan a withdrawal phase (minimum ${MIN_HORIZON_YEARS}).`,
    });
  } else if (horizon < SHORT_HORIZON_YEARS) {
    issues.push({
      level: "warn",
      message: `Short horizon (${horizon} yrs) draws a higher safe-withdrawal rate — double-check your plan-to age.`,
    });
  } else if (horizon > LONG_HORIZON_YEARS) {
    issues.push({
      level: "warn",
      message: `Very long horizon (${horizon} yrs) — verify your plan-to age is realistic.`,
    });
  }

  return issues;
}

export function hasBlockingHorizonIssue(issues: HorizonIssue[]): boolean {
  return issues.some((i) => i.level === "error");
}
