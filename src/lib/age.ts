/**
 * Q2 (v3): Member age is now derived from `dateOfBirth` (ISO YYYY-MM-DD), not stored as a number.
 * This helper turns a DOB string into the integer age as-of a reference date (default: now).
 *
 * Invariants:
 * - Returns 0 if DOB is in the future or unparseable.
 * - Returns the age in completed years (i.e. before the birthday this year, still last year's age).
 */
export function ageFromDOB(dob: string | null | undefined, asOf: Date = new Date()): number {
  if (!dob) return 0;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return 0;
  if (birth.getTime() > asOf.getTime()) return 0;

  let age = asOf.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    asOf.getMonth() < birth.getMonth() ||
    (asOf.getMonth() === birth.getMonth() && asOf.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return Math.max(0, age);
}

/**
 * Inverse: synthesize a DOB (Jan 1 of the year that makes the person `age` years old as-of `asOf`).
 * Used by the v2→v3 hydrate migration when an older serialized member has `age` but no `dateOfBirth`.
 */
export function dobFromAge(age: number, asOf: Date = new Date()): string {
  const safe = Math.max(0, Math.min(120, Math.floor(age)));
  const year = asOf.getFullYear() - safe;
  return `${year}-01-01`;
}
