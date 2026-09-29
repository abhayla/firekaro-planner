/**
 * #198 — the ONE place every screen/kernel-caller gets "today" from, as a LOCAL calendar date.
 *
 * Root cause: `new Date().toISOString().slice(0, 10)` reads the UTC calendar date. India is
 * UTC+5:30, so any time between 00:00 and 05:29 IST is still "yesterday" in UTC — at 03:00 IST
 * this returns yesterday's date, one day off from what the user's own calendar/clock shows. Eight
 * call sites across dashboard cards, the plan-baseline composable, and `useFireDerive.ts` each
 * independently constructed this string, so a fix in one place always left siblings live (rule 17)
 * — this module is the single source every one of them now calls.
 *
 * `ageAsOf(dob, asOfDate)` is the companion: everywhere a member's age is DISPLAYED (Profile,
 * MembersForm, EarnerSalaryForm) or used for ELIGIBILITY (tax-deductions senior-citizen check,
 * individual-fire's anchor age) must resolve against the SAME `asOfDate` string the kernel lens
 * carries — never a bare `ageFromDOB(dob)` defaulting to `new Date()` behind the caller's back.
 */
import { ageFromDOB } from "@/lib/age";

/** Today's LOCAL calendar date as YYYY-MM-DD (never the UTC date `toISOString()` would give). */
export function todayIsoLocal(referenceDate: Date = new Date()): string {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, "0");
  const day = String(referenceDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * A member's age as of a given ISO date string (defaults to the local-calendar "today" if the
 * caller has no explicit `asOfDate` yet — e.g. a screen rendered before any lens exists).
 *
 * Zone note: `new Date("YYYY-MM-DD")` parses as UTC MIDNIGHT, then `ageFromDOB`'s comparisons use
 * LOCAL getters — correct only EAST of UTC (where local midnight is later than UTC midnight, so
 * the local calendar day still matches). West of UTC (e.g. America/Los_Angeles, UTC-7/8), UTC
 * midnight is still the PREVIOUS local day, so `asOf`'s local getters would silently read one day
 * earlier than the `asOfDate` string says — the same class of zone bug #198 fixed for `todayIsoLocal`,
 * reintroduced here if the string were parsed the UTC way. Parsing the y/m/d parts directly into
 * the local-timezone `Date(y, m-1, d)` constructor sidesteps UTC entirely, so this is correct in
 * every zone, not just east of UTC.
 */
export function ageAsOf(dob: string | null | undefined, asOfDate: string = todayIsoLocal()): number {
  const [y, m, d] = asOfDate.split("-").map(Number);
  const localAsOf =
    Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)
      ? new Date(y, m - 1, d)
      : new Date(asOfDate);
  return ageFromDOB(dob, localAsOf);
}
