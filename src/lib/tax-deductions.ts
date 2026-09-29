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

import type {
  Household,
  Investment,
  Liability,
  InsurancePolicy,
  Member,
  OtherIncomeLine,
} from "@/types/household";
import { isAdultRole } from "@/types/household";
import { isEarningMember } from "@/lib/member-earning";
import { ageAsOf, todayIsoLocal } from "@/lib/as-of-date";
import { netCashSalary, pfFromRows, PROFESSIONAL_TAX_ANNUAL_PER_EARNER } from "@/lib/salary-cash";
import { toAnnual } from "@/lib/cashflow";
import { computeTax, singleEarnerNpsArgs } from "@/lib/tax";

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

// ---------- House-property tax (let-out rentals) — §24a / §24b / §71 ----------
// §24(a): a flat 30% standard deduction on Net Annual Value. §24(b): home-loan
// interest is FULLY deductible on a LET-OUT property (the ₹2L ceiling is
// self-occupied only). §71: a house-property LOSS set-off against other heads is
// capped at ₹2,00,000/yr (the unabsorbed loss carries forward 8 yrs — out of
// scope for this single-year engine).
export const SEC_24A_DEDUCTION_RATE = 0.3;
export const SEC_71_HP_LOSS_SETOFF_CAP = 200_000;

export interface HousePropertyTax {
  /** Σ annual gross rent of let-out (taxable) rentals — the CASH the landlord receives. */
  grossRentTotal: number;
  /** §24a/§24b/municipal-tax/§71-collapsed taxable house-property income (can be negative). */
  taxableHouseProperty: number;
  /** grossRentTotal − taxableHouseProperty: the amount to SUBTRACT from the cash-basis
   * tax grossIncome so it collapses to the taxable house-property figure. Cash stays full. */
  rentalTaxDeduction: number;
}

/**
 * SINGLE SOURCE OF TRUTH for the rental → taxable-house-property collapse, shared
 * by derive.ts (the FIRE-model tax) and the /tax-planning screen so the two can
 * never show two different "annual tax" figures for the same household (gh-issue #65).
 *
 * Per let-out (taxable) rental i:
 *   NAV_i           = max(0, grossRent_i − municipalTaxes_i)          (§23/§24)
 *   houseProperty_i = NAV_i × (1 − §24a 30%) − homeLoanInterest_i     (§24b, no let-out cap)
 *   netHP           = Σ houseProperty_i  (may be negative — a leveraged rental loss)
 *   taxableHP       = netHP ≥ 0 ? netHP : −min(|netHP|, ₹2,00,000)    (§71 set-off cap)
 *
 * NOTE: this reduces TAXABLE income ONLY — the landlord still receives full rent as
 * CASH (and the home-loan EMI is a separate household expense), so callers MUST NOT
 * shrink cash income / savings by rentalTaxDeduction. gh-issue #29 / #32 / #65.
 */
export function computeHousePropertyTax(otherIncome: OtherIncomeLine[]): HousePropertyTax {
  const taxableRentals = otherIncome.filter((o) => o.type === "Rental" && !o.isTaxExempt);
  const grossRentTotal = taxableRentals.reduce(
    (s, o) => s + toAnnual({ amount: o.amount, period: o.frequency }),
    0,
  );
  const netHouseProperty = taxableRentals.reduce((s, o) => {
    const grossRent = toAnnual({ amount: o.amount, period: o.frequency });
    const nav = Math.max(0, grossRent - (o.municipalTaxes ?? 0));
    return s + nav * (1 - SEC_24A_DEDUCTION_RATE) - (o.homeLoanInterest ?? 0);
  }, 0);
  const taxableHousePropertyRaw =
    netHouseProperty >= 0
      ? netHouseProperty
      : -Math.min(Math.abs(netHouseProperty), SEC_71_HP_LOSS_SETOFF_CAP);
  // Round to whole rupees (monetary-output convention) — also clears float noise like
  // 180000 × 0.7 = 125999.99999999999.
  const taxableHouseProperty = Math.round(taxableHousePropertyRaw);
  return {
    grossRentTotal: Math.round(grossRentTotal),
    taxableHouseProperty,
    rentalTaxDeduction: Math.round(grossRentTotal) - taxableHouseProperty,
  };
}

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
  employerNpsByMember: { nps: number; basic: number; sector?: "private" | "government" }[];
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
  /**
   * #198: the reference date the auto-detected senior-citizen (≥60) 80D check resolves member
   * ages against. Defaults to `todayIsoLocal()` (today, local calendar date) for the callers that
   * don't carry an explicit kernel lens date; `derive.ts` and `individual-fire.ts` pass their own
   * pinned `asOfDate`/`asOf` so this agrees with the SAME age the kernel uses elsewhere.
   */
  asOfDate?: string;
  /**
   * #204: the Sec-24 co-borrower "tracked household member" check must see the WHOLE household's
   * member roster, even when a caller scopes `household.members` down to one earner for the
   * 80CCD(2) employer-NPS sums (`section80CCD2`/`employerNpsBasicTotal`/`employerNpsByMember` are
   * deliberately summed over `household.members` only). Without this, a per-member deduction call
   * (`household.members = [thisEarner]`) could never see ≥2 tracked co-borrowers on a joint home
   * loan, so the §24 cap silently narrowed from ₹4L to ₹2L the moment deductions were scoped to one
   * earner — independent of, and in addition to, the Joint-attribution split below. Defaults to
   * `household.members` (today's behaviour) when omitted.
   */
  coBorrowerTrackedMemberIds?: string[];
}

/** "Joint" ownership sentinel for a deduction-eligible investment/liability (matches
 * `individual-fire.ts`'s `JOINT` and `Investment.ownerId`'s "member id or 'Joint'" contract). */
export const JOINT_DEDUCTION_OWNER = "Joint";

/**
 * #204: the ONE member-scoped deduction-attribution builder, shared by every "this earner's own
 * 80C/80D/§24" call site (`individual-fire.ts`'s standalone-FIRE tax leg, `tax-planning/Index.vue`'s
 * per-earner card, and `previewEarnerTakeHome`'s salary-form preview). Before this fix each of those
 * three sites independently filtered `ownerId === memberId` / `insuredPersonId === memberId` and
 * DROPPED every Joint-owned source — a PPF/ELSS/NPS held `ownerId: "Joint"`, or a home loan flagged
 * `isSharedWithSpouse`, was claimed by NEITHER earner (RCA, gh #204).
 *
 * Round 3 (#204 review CRITICAL finding): a Joint 80C/80CCD(1B) investment's split must be
 * COMPLEMENTARY across the two adults, not the same `householdSplitPercent` read twice — round 2's
 * `weightOf` gave EVERY member queried the same `split` share regardless of who they were, so at a
 * non-50 split (e.g. 60) a Joint ₹1.2L PPF yielded A ₹72k + B ₹72k = ₹1.44L, ₹24k more than the
 * ₹1.2L actually contributed (the exact `deriveDeductions` double-count this whole fix exists to
 * remove — see #204's original RCA). Fixed the same way §24 already was in round 2: an "anchor"
 * adult's share and the OTHER adult's share must sum to 1. The anchor is the same one `derive.ts`'s
 * `anchorAgeFor` uses for the household's primary-earner age (`earners[0]`, i.e. the FIRST EARNING
 * adult in `household.members` array order — `jointAnchorMemberId` below) — with exactly 2 adults:
 * anchor gets `split`, the other gets `1 − split` (both sum to 1, so the household's true claim is
 * never inflated regardless of which value `householdSplitPercent` holds). A single-adult household
 * gets 100% of every Joint source (there is no one else to split with). 3+ adults: `1/adultCount`
 * equal shares each (no anchor concept scales past 2 — `householdSplitPercent` itself is documented
 * elsewhere as a 2-adult convention; equal split is the least-surprising N-way default until a
 * per-adult split model exists). `deriveDeductions` below then caps EACH earner's resulting
 * `totalDeductions` independently at the statutory limits, so a large-enough Joint source (e.g. a
 * ₹4L Joint PPF) still cannot let either earner individually exceed ₹1.5L under 80C.
 *
 * Insurance (`InsurancePolicy.insuredPersonId`) has NO "Joint" sentinel in this schema — the only
 * values a policy's `insuredPersonId` ever takes are household member ids (`InsurancePolicyForm.vue`'s
 * "Insured person" selector lists members only) — so 80D stays own-owned-only; there is no Joint
 * family-floater CLASS to split here today. If a Joint-insurance concept is ever added, it plugs into
 * this same `weightOf` convention.
 *
 * Sec 24 round 2 (#204 review finding): a shared home loan is a PAYMENT split, not an OWNERSHIP
 * split — the corpus-style "owner 100% + Joint × split" convention (right for who OWNS an asset)
 * double-counted a shared loan's interest across both earners (owner ₹4L + spouse ₹2L = ₹6L
 * claimed on ₹4L actually paid). Tax law: each co-borrower claims ONLY their own share of the
 * interest, each capped at the per-assessee ₹2L, and the two shares always sum to the interest
 * paid (never more). So §24 is computed HERE directly, per member, and passed straight into
 * `totalDeductions` — it is NEVER routed through `deriveDeductions`'s own household-aggregate §24
 * block (that block's co-borrower ₹2L→₹4L doubling is a HOUSEHOLD-total rule — exactly the SUM of
 * two ₹2L caps — and would double-count again if applied a second time to an already-split share).
 */
export function deductionsForMember(
  household: Household,
  memberId: string,
  householdSplitPercent: number,
  options: Omit<DeriveDeductionsOptions, "coBorrowerTrackedMemberIds"> = {},
): DeductionBreakdown {
  const split = Math.min(100, Math.max(0, householdSplitPercent)) / 100;
  const member = household.members.find((m) => m.id === memberId);
  const adults = household.members.filter((m) => isAdultRole(m.role));

  // #204 round 3 — the SAME anchor convention `derive.ts`'s `anchorAgeFor` uses for the household's
  // primary earner: the FIRST EARNING adult in household member-array order, falling back to the
  // first adult at all when nobody earns (mirrors `derive.ts`'s `earners[0] ?? ...` pattern).
  const jointAnchorMemberId =
    adults.find((m) => isEarningMember(m, household.businesses))?.id ?? adults[0]?.id;

  /** A member's COMPLEMENTARY share of a Joint 80C/80CCD(1B) source — sums to 1 across all adults,
   * never re-reads the same `split` for both queried members (round-3 fix). */
  const jointShareFor = (thisMemberId: string): number => {
    if (adults.length <= 1) return 1;
    if (adults.length === 2) return thisMemberId === jointAnchorMemberId ? split : 1 - split;
    return adults.some((m) => m.id === thisMemberId) ? 1 / adults.length : 0;
  };
  const jointShare = jointShareFor(memberId);
  const weightOf = (ownerId: string): number =>
    ownerId === memberId ? 1 : ownerId === JOINT_DEDUCTION_OWNER ? jointShare : 0;

  const investments = household.investments
    .map((i) => ({ inv: i, w: weightOf(i.ownerId) }))
    .filter(({ w }) => w > 0)
    .map(({ inv, w }) => ({
      ...inv,
      monthlyContribution: (inv.monthlyContribution ?? 0) * w,
    }));

  // No "Joint" sentinel for insurance (see doc comment above) — own-owned only, unchanged.
  const insurance = household.insurance.filter((p) => p.insuredPersonId === memberId);

  // ---- Sec 24 — PAYMENT share, not ownership share (round-2 fix) ----
  // Owner's share = (1 − split); spouse's (non-owner) share = split — the two always sum to 1, so
  // the two earners' §24 claims on one shared loan always sum to the interest actually paid, never
  // more. A non-shared loan is 100% the owner's, 0% everyone else's. Each earner's share is capped
  // independently at the per-assessee ₹2L (LIMIT_SECTION_24) — never at a doubled ₹4L; the ₹4L
  // "household" figure is only ever the sum of two ₹2L per-assessee caps.
  let section24 = 0;
  for (const l of household.liabilities) {
    if (l.type !== "HomeLoan") continue;
    const annualInterest = estimateAnnualInterest(l);
    const isOwner = l.ownerId === memberId;
    const isSpouseShare = !isOwner && l.isSharedWithSpouse;
    if (!isOwner && !isSpouseShare) continue;
    const paymentShare = !l.isSharedWithSpouse ? (isOwner ? 1 : 0) : isOwner ? 1 - split : split;
    section24 += Math.min(LIMIT_SECTION_24, annualInterest * paymentShare);
  }

  const rest = deriveDeductions(
    {
      ...household,
      members: member ? [member] : [],
      investments,
      liabilities: [], // §24 computed above, independently — see doc comment
      insurance,
    },
    options,
  );

  return {
    ...rest,
    section24,
    totalDeductions: rest.section80C + rest.section80CCD1B + rest.section80D + section24,
  };
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
    .map((m) => ({
      nps: m.salary?.employerNpsAnnual ?? 0,
      basic: m.salary?.basicAnnual ?? 0,
      sector: m.salary?.employerSector ?? "private", // govt → 14% OLD ceiling (gh-issue #4)
    }))
    .filter((e) => e.nps > 0 || e.basic > 0);

  // ---- 80D — health insurance ----
  const healthSelfPremium = sumHealthPremium(insurance, "self", household.members);
  const healthParentsPremium = sumHealthPremium(insurance, "parents", household.members);
  // Senior status: honour an explicit option, else auto-detect from member age — a parent ≥ 60
  // qualifies for the ₹50k senior 80D cap (gh-issue #6; callers don't pass the flag today, so
  // seniors were silently under-claiming the ₹25k cap). `?? ` keeps an explicit `false` honoured.
  const asOfDate = options.asOfDate ?? todayIsoLocal();
  const hasSeniorParents =
    options.hasSeniorParents ??
    household.members.filter(isParentMember).some((m) => memberIsSenior(m, asOfDate));
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
  const memberIds = new Set(
    options.coBorrowerTrackedMemberIds ?? household.members.map((m) => m.id),
  );
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
function memberIsSenior(m: Member, asOfDate: string): boolean {
  return m.dateOfBirth ? ageAsOf(m.dateOfBirth, asOfDate) >= 60 : false;
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

export interface EarnerTaxCard {
  name: string;
  gross: number;
  tax: number;
  takeHome: number;
  effRate: number;
  rec: "OLD" | "NEW";
}

/**
 * gh-issue #157: the tax-planning per-earner card computation, extracted out of
 * `tax-planning/Index.vue`'s `perEarner` computed so a behaviour spec can call the SAME
 * function the screen renders from (previously the logic was inline in the .vue with no
 * importable seam). Sector-aware via `singleEarnerNpsArgs` — a government earner's employer
 * NPS is capped at 14% of basic on the OLD regime, matching the headline `derive()` /
 * `computeIndividualFire()` path instead of the private-only scalar fallback.
 */
export function computeEarnerTaxCard(
  member: Member,
  fy: string,
  totalDeductionsForOld: number,
  effectiveRegime: "OLD" | "NEW",
  /**
   * gh #218 — the earner's annual PF outflow, read from their EPF_VPF rows by the caller
   * (`pfFromInvestmentRows(household, member.id)`). Optional so the many existing callers that
   * only want the tax half keep compiling; absent ⇒ no PF is deducted, which is the honest
   * answer for an earner with no EPF row.
   */
  annualPf = 0,
): EarnerTaxCard {
  const gross = member.salary?.annualCTC ?? 0;
  const earnerNps = member.salary?.employerNpsAnnual ?? 0;
  const earnerBasic = member.salary?.basicAnnual ?? 0;
  const earnerNpsArgs = singleEarnerNpsArgs(earnerNps, earnerBasic, member.salary?.employerSector ?? "private");
  const earnerOld = computeTax({
    grossIncome: gross,
    regime: "OLD",
    fy,
    deductions: totalDeductionsForOld,
    ...earnerNpsArgs,
  });
  const earnerNew = computeTax({ grossIncome: gross, regime: "NEW", fy, ...earnerNpsArgs });
  const rec: "OLD" | "NEW" = earnerOld.totalTax <= earnerNew.totalTax ? "OLD" : "NEW";
  const active = effectiveRegime === "OLD" ? earnerOld : earnerNew;
  return {
    name: member.name || "Earner",
    gross,
    tax: active.totalTax,
    // gh #218 — the card's cash figure is net of the PF this earner's own EPF_VPF row already
    // carries (passed in by the caller) plus professional tax, from the ONE helper the dashboard
    // headline uses (`salary-cash.ts`). `gross - tax` overstated a salaried earner's bank credit
    // by the whole PF block.
    takeHome: netCashSalary({
      annualCTC: gross,
      annualPf,
      annualTax: active.totalTax,
      professionalTax: gross > 0 ? PROFESSIONAL_TAX_ANNUAL_PER_EARNER : 0,
    }).annual,
    effRate: gross > 0 ? (active.totalTax / gross) * 100 : 0,
    rec,
  };
}

/**
 * gh-issue #222: the ONE derivation behind any "preview this earner's take-home" surface
 * (today: EarnerSalaryForm.vue's take-home strip). Callers previously hardcoded
 * `oldDed = 175000` for the old-regime deduction instead of this earner's REAL deductions
 * (80C/80CCD(1B)/80D/§24 from their own investments/liabilities/insurance) — the same
 * ₹1.75L-flat mistake `tax-planning/Index.vue`'s per-earner table stopped making in gh-issue
 * #201/#157. That let the salary-form preview's regime pick AND take-home disagree with the
 * tax-planning page's per-earner card for the exact same person on the exact same data.
 *
 * This helper is a thin, member-scoped wrapper around `computeEarnerTaxCard` — the SAME
 * function the tax-planning page's per-earner table calls — so there is one derivation, not
 * two. Regime is AUTO-recommended (cheaper of OLD/NEW for this earner), matching what the
 * salary-form preview showed before (it always used `recommendRegime`, never a page-level
 * regime override).
 *
 * `draftSalary` lets a caller preview an UNSAVED edit (e.g. a CTC the user just typed but
 * has not saved yet) without writing it to the store first — merged onto the member's
 * current `salary` before deriving deductions/tax, exactly as EarnerSalaryForm.vue's local
 * `editing` draft state works today.
 */
export function previewEarnerTakeHome(
  household: Household,
  member: Member,
  fy: string,
  draftSalary?: Partial<NonNullable<Member["salary"]>>,
  /** #204: same household split the headline/card paths use; defaults to 50 (the persona default,
   * matching `individual-fire.ts`/`useFireDerive.ts`'s own `?? 50` fallback) when omitted. */
  householdSplitPercent = 50,
): EarnerTaxCard | null {
  const effectiveMember: Member = draftSalary
    ? {
        ...member,
        salary: { annualCTC: 0, hikePercent: 0, ...member.salary, ...draftSalary },
      }
    : member;
  const gross = effectiveMember.salary?.annualCTC ?? 0;
  if (!gross) return null;

  // #204: own-owned (100%) + Joint-owned (× split) attribution — the SAME convention as
  // `individual-fire.ts`'s headline path and `tax-planning/Index.vue`'s `perEarner` card, via the
  // one shared `deductionsForMember` builder. `effectiveMember` swapped in so a draft salary edit
  // (employer NPS %, basic %) still reaches the member the deductions are scoped to.
  const earnerDeductions = deductionsForMember(
    { ...household, members: household.members.map((m) => (m.id === effectiveMember.id ? effectiveMember : m)) },
    effectiveMember.id,
    householdSplitPercent,
    { asOfDate: todayIsoLocal() },
  );
  // #223 — a draft `hasEpf:false` must zero the preview's PF even though the member's real EPF
  // row still exists (it is only removed by `autoFlowSalaryToEPF` on SAVE, via `updateMember`).
  // Without this, previewing "switch EPF off" would keep showing the old PF-reduced take-home
  // until after save — the opposite of what the toggle is for.
  const annualPf =
    effectiveMember.salary?.hasEpf === false ? 0 : pfFromRows(household.investments, effectiveMember.id);

  // Peek at the AUTO-recommended regime first (independent of the `effectiveRegime` arg),
  // then re-call with that regime so the returned tax/takeHome/effRate are the ACTIVE figures
  // for the cheaper regime — matching the AUTO mode the preview always used.
  const peek = computeEarnerTaxCard(effectiveMember, fy, earnerDeductions.totalDeductions, "OLD", annualPf);
  return computeEarnerTaxCard(effectiveMember, fy, earnerDeductions.totalDeductions, peek.rec, annualPf);
}
