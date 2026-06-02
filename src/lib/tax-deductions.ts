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

import type { Household, Investment, Liability, InsurancePolicy, Member } from "@/types/household";
import { ageFromDOB } from "@/lib/age";

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
  /**
   * Sec 80CCD(2) — employer NPS contribution. Deductible under BOTH regimes, so it is
   * reported here but applied separately by computeTax (its `employerNps` arg) and is
   * NOT included in `totalDeductions` below.
   */
  section80CCD2: number;
  /**
   * Sum of members' basic salary (Basic+DA). Pass to computeTax as `employerNpsBasic`
   * so it can cap section80CCD2 at the regime ceiling (10% old / 14% new). gh-issue #3.
   */
  employerNpsBasicTotal: number;
  /**
   * Per-member {nps, basic} pairs. Pass to computeTax as `employerNpsByMember` for a
   * per-member 80CCD(2) cap (no cross-member headroom borrowing). gh-issue #4.
   */
  employerNpsByMember: { nps: number; basic: number }[];
  /** Sec 80D — health insurance premium (self + parents). */
  section80D: number;
  /** Sec 24 — home loan interest. */
  section24: number;
  /**
   * Old-regime-only Chapter VI-A + Sec 24 deductions (80C + 80CCD(1B) + 80D + 24).
   * EXCLUDES 80CCD(2) (applied in both regimes — passed to computeTax as `employerNps`)
   * and the standard deduction (applied separately by computeTax via isSalaried).
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

  // ---- 80CCD(2) — employer NPS contribution (gh-issue #2 findings #1/#2) ----
  // The actual employer NPS contribution entered per member (Member.salary.employerNpsAnnual),
  // summed across the household. Deductible under BOTH regimes, so it is reported here but
  // applied SEPARATELY by computeTax (via its `employerNps` arg) and is intentionally kept
  // OUT of totalDeductions below to avoid double-counting in the old regime.
  const section80CCD2 = household.members.reduce(
    (s, m) => s + (m.salary?.employerNpsAnnual ?? 0),
    0,
  );
  // Basic-salary total feeds the regime-aware 80CCD(2) cap in computeTax (gh-issue #3).
  const employerNpsBasicTotal = household.members.reduce(
    (s, m) => s + (m.salary?.basicAnnual ?? 0),
    0,
  );
  // Per-member {nps, basic} for the per-member 80CCD(2) cap (gh-issue #4).
  const employerNpsByMember = household.members
    .map((m) => ({ nps: m.salary?.employerNpsAnnual ?? 0, basic: m.salary?.basicAnnual ?? 0 }))
    .filter((e) => e.nps > 0 || e.basic > 0);

  // ---- 80D — health insurance ----
  const healthSelfPremium = sumHealthPremium(insurance, "self", household.members);
  const healthParentsPremium = sumHealthPremium(insurance, "parents", household.members);
  // Senior status: honour an explicit option, else auto-detect from member age — a parent ≥ 60
  // qualifies for the ₹50k senior 80D cap (gh-issue #6; callers don't pass the flag today, so
  // seniors were silently under-claiming the ₹25k cap). `?? ` keeps an explicit `false` honoured.
  const hasSeniorParents =
    options.hasSeniorParents ??
    household.members.filter(isParentMember).some((m) => memberIsSenior(m));
  const cap80Dself = options.isSelfSenior ? LIMIT_80D_SENIOR_SELF : LIMIT_80D_SELF;
  const cap80Dparents = hasSeniorParents ? LIMIT_80D_SENIOR_PARENTS : LIMIT_80D_PARENTS;
  const section80D =
    Math.min(cap80Dself, healthSelfPremium) +
    Math.min(cap80Dparents, healthParentsPremium);

  // ---- Sec 24 — home loan interest (audit Entry #23; NISM-XV ruling gh-issue #2 #3) ----
  // Each co-borrower can claim ₹2L on their interest share, but only members whose
  // income is in THIS household's computation should contribute to this return's
  // deduction. So the cap doubles to ₹4L only when ≥2 co-borrowers are TRACKED
  // household members; a single filer on a joint loan whose spouse is not tracked
  // claims only their own ₹2L share (not the spouse's).
  const memberIds = new Set(household.members.map((m) => m.id));
  let section24 = 0;
  for (const l of liabilities) {
    if (l.type !== "HomeLoan") continue;
    const annualInterest = estimateAnnualInterest(l);
    const coBorrowers = l.coBorrowers ?? [];
    const trackedCoBorrowers = new Set(coBorrowers.filter((id) => memberIds.has(id)));
    const multiplier = trackedCoBorrowers.size >= 2 ? 2 : 1;
    section24 += Math.min(LIMIT_SECTION_24 * multiplier, annualInterest);
  }

  return {
    section80C,
    section80CCD1B,
    section80CCD2,
    employerNpsBasicTotal,
    employerNpsByMember,
    section80D,
    section24,
    // 80CCD(2) is deliberately excluded — it applies in both regimes and is passed to
    // computeTax separately as `employerNps` (gh-issue #2). Folding it in would double-count.
    totalDeductions: section80C + section80CCD1B + section80D + section24,
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

/** A household member whose free-text `relation` marks them a parent (seeds use "Father"/"Mother"). */
function isParentMember(m: Member): boolean {
  return /\b(parent|father|mother|dad|mom)\b/i.test(m.relation ?? "");
}

/** ≥ 60 by DOB → senior-citizen 80D limits. Missing DOB → not senior (safe default). */
function memberIsSenior(m: Member): boolean {
  return m.dateOfBirth ? ageFromDOB(m.dateOfBirth) >= 60 : false;
}

function sumHealthPremium(
  insurance: InsurancePolicy[],
  scope: "self" | "parents",
  members: Member[],
): number {
  // 80D has two independent buckets: self+family and parents. A Health policy is a
  // "parents" policy when its insuredPersonId maps to a member whose relation is a parent
  // (gh-issue #6 — this bucket previously returned 0, dropping a legitimate deduction).
  const parentIds = new Set(members.filter(isParentMember).map((m) => m.id));
  const isParentPolicy = (p: InsurancePolicy) => parentIds.has(p.insuredPersonId);
  return insurance
    .filter((p) => p.type === "Health")
    .filter((p) => (scope === "parents" ? isParentPolicy(p) : !isParentPolicy(p)))
    .reduce((s, p) => s + p.annualPremium, 0);
}

function estimateAnnualInterest(liability: Liability): number {
  // Pre-EMI / simple-interest approximation; the per-month split between
  // principal and interest in a real amortization schedule varies over
  // the loan life. For Sec 24 surfacing this approximation is acceptable
  // — the user can override on /preferences if needed.
  return liability.outstandingBalance * (liability.interestRate / 100);
}
