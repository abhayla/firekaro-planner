/**
 * T-377 (QN-2) — the ADDITIVE, default-OFF override seam the required-contribution solver drives.
 *
 * Lives in its own module (not in `derive.ts`) so `individual-fire.ts` can honour the SAME
 * overrides without a circular import — one shape, one guard, both scopes.
 *
 * The solver (`required-contribution.ts`) binary-searches the household real monthly contribution
 * through the REAL `derive()` path (never a parallel formula), so step-up, bridge/accessibility,
 * horizon-SWR, the family layer and the member lens are all honoured. Both fields are ignored
 * unless finite and in range — a NaN/±Infinity can never poison the kernel (rule 31). Omitting the
 * object leaves every kernel output byte-identical to the pre-T-377 kernel.
 */
import type { ContributionSegments } from "@/lib/contribution-schedule";

export interface DeriveOverrides {
  /** Replace the real monthly corpus inflow (₹/month, today's ₹). Must be finite and ≥ 0. */
  monthlyContributionReal?: number;
  /** Evaluate the plan as if retirement were targeted at this age (the hero slider). */
  targetRetirementAge?: number;
  /**
   * QN-5 — ADDITIONAL real contribution segments layered ON TOP of the household savings
   * residual (ADR-0004 segments, age-relative, REAL ₹/month). The "roll the EMI into investing
   * when the loan ends" lever is the one caller: a segment starting at the loan's end age. The
   * segments are SUMMED with the base inflow (never replace it) and are ignored when empty, so
   * omitting the field leaves every kernel output byte-identical. Household scope only — the
   * individual-FIRE path does not read it.
   */
  extraContributionSegments?: ContributionSegments;
  /**
   * ADR-0006 Phase 1d — the calendar year the plan is being evaluated in, used to turn a dated
   * goal's `targetYear` into "years from now".
   *
   * The kernel used to read `new Date().getFullYear()` itself. That made `derive()` impure: the
   * golden master would silently shift on 1 January, and in the EARLIER direction (every goal one
   * year nearer, so it inflates for one year less), which is the direction an honesty gate must
   * never move on its own. The wall clock now enters at the COMPOSABLE boundary — `useFireDerive`,
   * `required-contribution`, `plan-variance`, `QuickNumber`, `NudgeStack` and the server lifecycle
   * runner all pass it — and the kernel never calls `Date`.
   *
   * Absent, the kernel falls back to the START year of `lens.currentFY` (FY "2026-27" -> 2026),
   * which in production IS the wall clock because `ui.currentFY` is derived from it
   * (`getCurrentFinancialYear`). Specs PIN this explicitly so their baselines are deterministic.
   */
  currentYear?: number;
}

/**
 * The calendar year an Indian FY string starts in — "2026-27" -> 2026. Returns null for anything
 * that is not a parseable `YYYY-YY`, so a caller can fall through rather than compute against NaN.
 */
export function financialYearStartYear(fy: string | undefined): number | null {
  if (typeof fy !== "string") return null;
  const start = Number.parseInt(fy.slice(0, 4), 10);
  return Number.isFinite(start) && start > 1900 ? start : null;
}

/** Finite, in-range guard shared by both override fields (never trusts a caller's number). */
export function usableOverride(v: number | undefined, min: number): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= min ? v : null;
}
