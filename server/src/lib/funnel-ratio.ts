/**
 * #44 — the one pure piece of the funnel report (scripts/funnel-report.ts).
 *
 * Lives in src/ so it is covered by the unit suite (vitest only collects src/**), and so the
 * "never print a fake 0%" rule is a test, not a convention: a ratio with no denominator is an
 * unmeasured funnel, and saying "0%" about it would be a false claim.
 */
export function ratio(numerator: number, denominator: number): string {
  if (denominator <= 0) return "n/a (no denominator yet)";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}
