/**
 * Retirement-goal card label math (gh-issue #33).
 *
 * The FIRE-Goals "Retirement" card must show an age and a target year that
 * CORRESPOND — i.e. the displayed age is the age the anchor earner reaches in
 * the displayed year. The earlier code labelled the card with the user's
 * *aspirational* target retirement age (a setting, e.g. 47) while the year was
 * the *computed* achievable FIRE year (e.g. 2052) — so "age 47 · 2052" was
 * self-contradictory for a 33-year-old and disagreed with the dashboard's
 * honest "FIRE at age 56 by 2052".
 *
 * This derives both from the SAME source the dashboard uses (anchorAge +
 * yearsToRegular), guaranteeing `year - currentYear === age - anchorAge`.
 */
export interface RetirementGoalAgeYear {
  /** The computed FIRE age (anchor earner's current age + years to FIRE). */
  age: number;
  /** The computed FIRE year (current year + years to FIRE) — corresponds to `age`. */
  year: number;
}

/** Fallback horizon when years-to-FIRE is not finite (no feasible FIRE date yet). */
export const RETIREMENT_FALLBACK_YEARS = 30;

export function retirementGoalAgeYear(
  anchorAge: number,
  yearsToRegular: number,
  currentYear: number,
): RetirementGoalAgeYear {
  const years = Number.isFinite(yearsToRegular)
    ? Math.max(0, Math.ceil(yearsToRegular))
    : RETIREMENT_FALLBACK_YEARS;
  const base = Math.round(anchorAge);
  return { age: base + years, year: currentYear + years };
}
