/**
 * Tax-cliff series (audit Entry #13 A13.3).
 *
 * Samples total tax across an income range under both regimes so the
 * /tax-planning page can plot an income-vs-tax curve and highlight the
 * ₹12L–₹12.75L marginal-relief band (FY 2025-26 new-regime 87A rebate
 * phase-out) where a small income bump triggers a disproportionate tax jump.
 *
 * Pure: delegates to lib/tax.computeTax. No Vue, no store.
 */
import { computeTax } from "@/lib/tax";

export interface TaxCliffPoint {
  /** Gross income (₹). */
  income: number;
  /** Total tax under the NEW regime (no deductions). */
  newTax: number;
  /** Total tax under the OLD regime (with the supplied deductions). */
  oldTax: number;
}

/**
 * The FY 2025-26 new-regime 87A rebate phase-out band. Below ₹12L taxable the
 * rebate zeroes tax; just above it marginal relief caps the tax at the income
 * over ₹12L, producing a steep but bounded rise across this band.
 */
export const REBATE_CLIFF_BAND = { lo: 1_200_000, hi: 1_275_000 } as const;

export interface TaxCliffArgs {
  fy: string;
  minIncome?: number;
  maxIncome?: number;
  step?: number;
  /** Deductions assumed for the OLD-regime curve (default 0). */
  oldDeductions?: number;
}

export function taxCliffSeries(args: TaxCliffArgs): TaxCliffPoint[] {
  const min = args.minIncome ?? 0;
  const max = args.maxIncome ?? 2_000_000;
  const step = args.step ?? 50_000;
  const oldDeductions = args.oldDeductions ?? 0;

  const points: TaxCliffPoint[] = [];
  for (let income = min; income <= max; income += step) {
    points.push({
      income,
      newTax: computeTax({ grossIncome: income, regime: "NEW", fy: args.fy }).totalTax,
      oldTax: computeTax({
        grossIncome: income,
        regime: "OLD",
        fy: args.fy,
        deductions: oldDeductions,
      }).totalTax,
    });
  }
  return points;
}
