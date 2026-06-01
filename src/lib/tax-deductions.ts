/**
 * Auto-deductions derivation — sums up Sec 80C / 80CCD(1B) / 80CCD(2) /
 * 80D / Sec 24 / HRA / standard deduction from the user's actual data
 * instead of asking them to type a number.
 *
 * Phase 2 Stage D per docs/goals/build-firekaro-mvp-v5.md §5.
 * Audit Entry #12 A12.2 — replaces the v4 hardcoded `150000 + 25000`
 * dummy with a real summation.
 *
 * Marginal-relief detector lives at the bottom — audit Entry #13 A13.1.
 *
 * NOTE: this module is the SUMMATION layer. The tax engine itself
 * (lib/tax.ts:computeTax) applies the deductions only in OLD regime
 * and ignores them in NEW regime per Indian tax law. Marginal-relief
 * application also lives inside computeTax; this module only DETECTS
 * the band so surfaces can render the warning chip.
 */

import type { Household, Investment, Liability, InsurancePolicy } from "@/types/household";

// ---------- Statutory limits (audit-grounded, FY 2025-26 onward) ----------
// These are STATUTORY FACTS per R1.4 — they appear read-only on /preferences
// and are NEVER user-editable, even in What-If mode.

export const LIMIT_80C = 150_000;
export const LIMIT_80CCD_1B = 50_000;
export const LIMIT_80D_SELF = 25_000;
export const LIMIT_80D_SENIOR_SELF = 50_000;
export const LIMIT_80D_PARENTS = 25_000;
export const LIMIT_80D_SENIOR_PARENTS = 50_000;
export const LIMIT_SECTION_24 = 200_000;

export interface DeductionBreakdown {
  /** Sec 80C — EPF + PPF + ELSS + life insurance premium + tuition fees. */
  section80C: number;
  /** Sec 80CCD(1B) — additional NPS contribution above 80C ceiling. */
  section80CCD1B: number;
  /** Sec 80CCD(2) — employer NPS contribution (up to 10% of basic). */
  section80CCD2: number;
  /** Sec 80D — health insurance premium (self + parents). */
  section80D: number;
  /** Sec 24 — home loan interest. */
  section24: number;
  /**
   * Total Chapter VI-A + Sec 24 deductions. Standard deduction is
   * applied separately by computeTax (it depends on isSalaried).
   */
  totalDeductions: number;
}

interface DeriveDeductionsOptions {
  /** When true, applies senior-citizen limits to 80D self (audit Entry #10). */
  isSelfSenior?: boolean;
  /** When true, applies senior-citizen limits to 80D parents. */
  hasSeniorParents?: boolean;
}

/**
 * Sum the user's claimable deductions across all current data sources.
 * Used by the /tax-planning surface (Stage J) to replace the hardcoded
 * estimate with the real number.
 *
 * The function is intentionally conservative — caps at statutory limits
 * (audit Entry #12 A12.3 prevents over-claiming).
 */
export function deriveDeductions(
  household: Household,
  options: DeriveDeductionsOptions = {},
): DeductionBreakdown {
  const investments = household.investments;
  const liabilities = household.liabilities;
  const insurance = household.insurance;

  // ---- 80C ----
  const epfAnnual = sumAnnual(investments, "EPF_VPF");
  const ppfAnnual = sumAnnual(investments, "PPF");
  const elssAnnual = mutualFundsSIPAnnual(investments);
  const lifePremium = sumLifePremium(insurance);
  const section80C = Math.min(
    LIMIT_80C,
    epfAnnual + ppfAnnual + elssAnnual + lifePremium,
  );

  // ---- 80CCD(1B) — NPS Tier-I additional, above 80C ----
  const npsAnnual = sumAnnual(investments, "NPS");
  const section80CCD1B = Math.min(LIMIT_80CCD_1B, npsAnnual);

  // ---- 80CCD(2) — employer NPS contribution ----
  // 80CCD(2) is the EMPLOYER's NPS contribution (deductible up to 10% of basic,
  // 14% for the new regime), NOT a function of the member's own NPS. This app
  // does not yet track employer NPS, so we claim 0 rather than fabricate a figure
  // (the prior `npsAnnual * 0.5` heuristic was not grounded in law — gh-issue #2
  // finding #1). When a Member.salary employer-NPS field lands, derive it here and
  // also apply it in the NEW regime (gh-issue #2 finding #2 — see tax.ts computeTax).
  const section80CCD2 = 0;

  // ---- 80D — health insurance ----
  const healthSelfPremium = sumHealthPremium(insurance, "self");
  const healthParentsPremium = sumHealthPremium(insurance, "parents");
  const cap80Dself = options.isSelfSenior ? LIMIT_80D_SENIOR_SELF : LIMIT_80D_SELF;
  const cap80Dparents = options.hasSeniorParents
    ? LIMIT_80D_SENIOR_PARENTS
    : LIMIT_80D_PARENTS;
  const section80D =
    Math.min(cap80Dself, healthSelfPremium) +
    Math.min(cap80Dparents, healthParentsPremium);

  // ---- Sec 24 — home loan interest (audit Entry #23 doubles for joint) ----
  let section24 = 0;
  for (const l of liabilities) {
    if (l.type !== "HomeLoan") continue;
    const annualInterest = estimateAnnualInterest(l);
    const coBorrowers = l.coBorrowers ?? [];
    // Joint home loan -> each co-borrower can claim ₹2L. We surface the user's
    // share + the spouse's share when applicable.
    const multiplier = coBorrowers.length >= 2 ? 2 : 1;
    section24 += Math.min(LIMIT_SECTION_24 * multiplier, annualInterest);
  }

  return {
    section80C,
    section80CCD1B,
    section80CCD2,
    section80D,
    section24,
    totalDeductions: section80C + section80CCD1B + section80CCD2 + section80D + section24,
  };
}

// ---------- Marginal-relief detection (audit Entry #13 A13.1) ----------

/**
 * The FY 2025-26+ new-regime rebate-cliff band. Income up to ₹12L gets
 * full rebate (zero tax); income just above ₹12L can pay MORE tax than
 * the increase in income — the "rebate cliff". Marginal relief is built
 * into the tax engine to soften this; this detector identifies when a
 * user is INSIDE the band so the UI can render the warning chip.
 *
 * The band spans ₹12,00,001 → ₹12,70,588. The upper bound is the exact point
 * where new-regime marginal relief stops being needed: tax at ₹12L taxable is
 * ₹60,000 (5% of 4–8L + 10% of 8–12L) and the marginal slab above ₹12L is 15%,
 * so relief applies until 60,000 + 0.15·d = d ⇒ d = 60,000/0.85 = ₹70,588 over
 * ₹12L (gh-issue #2 finding #4 — was previously an approximate ₹12,75,000).
 */
export const MARGINAL_RELIEF_BAND_FY_2025_26 = {
  fy: "2025-26",
  lower: 1_200_001,
  upper: 1_270_588,
} as const;

// FY 2026-27 new-regime slabs are modelled identically to 2025-26, so the
// marginal-relief crossover is the same ₹12,70,588.
export const MARGINAL_RELIEF_BAND_FY_2026_27 = {
  fy: "2026-27",
  lower: 1_200_001,
  upper: 1_270_588,
} as const;

/**
 * Returns true when the taxable income (post-deductions) falls in the
 * marginal-relief band for the given FY. Currently active for FY 2025-26
 * and FY 2026-27. Earlier FYs return false (no marginal relief existed).
 */
export function isInMarginalReliefBand(taxableIncome: number, fy: string): boolean {
  const band = bandForFY(fy);
  if (!band) return false;
  return taxableIncome >= band.lower && taxableIncome <= band.upper;
}

/**
 * Suggested mitigation strategies when in the marginal-relief band
 * (audit Entry #13 A13.4). Returns the actionable text the Dashboard
 * surfaces.
 */
export function marginalReliefMitigations(taxableIncome: number, fy: string): string[] {
  if (!isInMarginalReliefBand(taxableIncome, fy)) return [];
  const band = bandForFY(fy);
  if (!band) return [];
  const overshoot = taxableIncome - 1_200_000;
  return [
    `Your taxable income is ₹${(overshoot / 100000).toFixed(2)}L above the ₹12L rebate threshold — you sit in the marginal-relief band.`,
    `Option A: Increase 80C contributions (EPF/PPF/ELSS) by up to ₹${(overshoot / 100000).toFixed(2)}L to drop back under ₹12L.`,
    `Option B: Use 80CCD(1B) NPS top-up (up to ₹50k additional).`,
    `Option C: Boost HRA exemption if applicable (re-check rent paid vs basic).`,
  ];
}

function bandForFY(fy: string) {
  if (fy === MARGINAL_RELIEF_BAND_FY_2025_26.fy) return MARGINAL_RELIEF_BAND_FY_2025_26;
  if (fy === MARGINAL_RELIEF_BAND_FY_2026_27.fy) return MARGINAL_RELIEF_BAND_FY_2026_27;
  return null;
}

// ---------- Helpers ----------

function sumAnnual(investments: Investment[], type: Investment["type"]): number {
  return investments
    .filter((i) => i.type === type)
    .reduce((s, i) => s + (i.monthlyContribution ?? 0) * 12, 0);
}

function mutualFundsSIPAnnual(investments: Investment[]): number {
  // Conservative — assume MF monthly contributions go to ELSS-eligible funds.
  // Stage K can refine with a "this MF is ELSS" flag if needed.
  return investments
    .filter((i) => i.type === "MutualFunds")
    .reduce((s, i) => s + (i.monthlyContribution ?? 0) * 12, 0);
}

function sumLifePremium(insurance: InsurancePolicy[]): number {
  return insurance
    .filter((p) => p.type === "Life")
    .reduce((s, p) => s + p.annualPremium, 0);
}

function sumHealthPremium(
  insurance: InsurancePolicy[],
  scope: "self" | "parents",
): number {
  // MVP-1: aggregate all Health policies as self. The parents-specific
  // bucket lands in Stage K when InsurancePolicy.insuredPersonId can
  // discriminate parents from other dependents.
  if (scope === "parents") return 0;
  return insurance
    .filter((p) => p.type === "Health")
    .reduce((s, p) => s + p.annualPremium, 0);
}

function estimateAnnualInterest(liability: Liability): number {
  // Pre-EMI / simple-interest approximation; the per-month split between
  // principal and interest in a real amortization schedule varies over
  // the loan life. For Sec 24 surfacing this approximation is acceptable
  // — the user can override on /preferences if needed.
  return liability.outstandingBalance * (liability.interestRate / 100);
}
