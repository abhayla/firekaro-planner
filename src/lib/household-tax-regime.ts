import { computeTax } from "@/lib/tax";
import type { AssesseeTax } from "@/lib/tax-deductions";

export type RegimePick = "AUTO" | "OLD" | "NEW";

/**
 * #87 round 3 — the household's tax with each adult's regime chosen by `pick`, summed assessee by
 * assessee: "AUTO" = each adult's OWN cheaper regime (what the household actually pays — equal to the
 * kernel's `annualTax`); "OLD"/"NEW" = every adult forced through that regime. The tax-planning page
 * renders its headline and Old/New comparison from THIS function, and the page-vs-kernel lock calls
 * the same function — so the lock tests the page's real code, not a copy of it.
 *
 * `grossIncome` and `effectiveRate` use Σ per-person gross — the same base as the per-person table.
 */
export function householdTaxUnderRegime(
  perAssessee: readonly AssesseeTax[],
  pick: RegimePick,
  fy: string,
) {
  const rows = perAssessee.map((a) =>
    computeTax({
      grossIncome: a.grossIncome,
      regime: pick === "AUTO" ? a.regime : pick,
      fy,
      deductions: a.deductions,
      employerNpsByMember: a.employerNpsByMember,
      taxpayerAge: a.age,
      isSalaried: a.isSalaried,
    }),
  );
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((t, r) => t + f(r), 0);
  const gross = perAssessee.reduce((t, a) => t + a.grossIncome, 0);
  const totalTax = sum((r) => r.totalTax);
  return {
    grossIncome: gross,
    standardDeduction: sum((r) => r.standardDeduction),
    estimatedDeductions: sum((r) => r.estimatedDeductions),
    taxableIncome: sum((r) => r.taxableIncome),
    slabTax: sum((r) => r.slabTax),
    rebate: sum((r) => r.rebate),
    taxAfterRebate: sum((r) => r.taxAfterRebate),
    surcharge: sum((r) => r.surcharge),
    cess: sum((r) => r.cess),
    totalTax,
    effectiveRate: gross > 0 ? (totalTax / gross) * 100 : 0,
  };
}
