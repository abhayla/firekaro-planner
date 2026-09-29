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
 */
export function ageAsOf(dob: string | null | undefined, asOfDate: string = todayIsoLocal()): number {
  return ageFromDOB(dob, new Date(asOfDate));
}
