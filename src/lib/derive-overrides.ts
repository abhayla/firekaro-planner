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
export interface DeriveOverrides {
  /** Replace the real monthly corpus inflow (₹/month, today's ₹). Must be finite and ≥ 0. */
  monthlyContributionReal?: number;
  /** Evaluate the plan as if retirement were targeted at this age (the hero slider). */
  targetRetirementAge?: number;
}

/** Finite, in-range guard shared by both override fields (never trusts a caller's number). */
export function usableOverride(v: number | undefined, min: number): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= min ? v : null;
}
