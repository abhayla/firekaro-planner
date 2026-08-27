/**
 * individual-fire — the ONE canonical helper for a single adult's STANDALONE FIRE (#81 Phase 2).
 *
 * Treats one adult as a "mini-household": their attributable corpus grows (real frame, SWR) to
 * their attributable expenses. Attribution rules (contract §3, grilled 2026-06-08):
 *   - expenses: M's OWN itemised lines (ring 1) at 100% + the SHARED "Household" pool (ring 2,
 *     incl. avgMonthly) × the household split %. Ring 3 (dependent-owned / "Dependents") is
 *     EXCLUDED — a child's cost is a household obligation, not one adult's personal FIRE.
 *   - corpus / income: member-owned at 100% + "Joint" × split; dependent-owned excluded.
 *   - tax: per-individual (India files individually) — computeTax on the adult's attributable
 *     taxable income with the adult's OWN deductions.
 *
 * DELIBERATE SIMPLIFICATIONS (each either CONSERVATIVE — never makes individual FIRE look EARLIER
 * than reality, the safe direction for the accumulator — or a disclosed bound):
 *   - gross attributable expenses (no NPS-annuity offset); no bridge/glide/family-layer/healthcare
 *     reservation overlay — all conservative (a higher target / no early-money credit).
 *   - rental income is taxed at FULL gross in the attributable tax (the household path applies the
 *     §24(a) 30% / §24(b) / §71 house-property collapse; the individual path does NOT). This
 *     OVER-taxes the individual → savings lower → individual FIRE LATER → conservative/safe; it only
 *     slightly widens the household-vs-individual gap. (FinTech #81 Phase 2, MED-1.)
 *   - the household split % is a single number applied to EACH adult: for the locked 2-adult persona
 *     (50/50) Σ = 100% of shared; for 3+ adults a single % can over-allocate shared costs (Σ > 100%)
 *     — a documented bound for the non-target N>2 case (assumptions.ts; FinTech MED-3).
 * The HOUSEHOLD FIRE number (which carries all of the above) stays the primary, decision-driving
 * figure; this is a clearly-caveated secondary view. This helper NEVER feeds the household number
 * (derive only ADDS it alongside).
 */
import { usableOverride, type DeriveOverrides } from "@/lib/derive-overrides";
import { isAdultRole, type Household } from "@/types/household";
import type { Assumptions } from "@/types/assumptions";
import { isEarningMember } from "@/lib/member-earning";
import { toMonthly, toAnnual } from "@/lib/cashflow";
import { ageFromDOB } from "@/lib/age";
import { calculateFIRENumber, calculateYearsToTarget } from "@/lib/fire-math";
import { computeTax, recommendRegime, marginalSlabRate, getTaxConfigForFY } from "@/lib/tax";
import { deriveDeductions } from "@/lib/tax-deductions";
import { epfBucketAfterTaxReturn } from "@/lib/epf-vpf";
import { returnBucketKey } from "@/lib/investment-traits";
import {
  resolveEffectiveSWRByHorizon,
  blendPortfolioReturn,
  resolveHouseholdInflation,
} from "@/lib/assumption-math";
import { EXPENSE_OWNER_HOUSEHOLD } from "@/lib/expense-attribution";

export interface IndividualFireResult {
  memberId: string;
  name: string;
  anchorAge: number;
  /** M's own (ring 1) + split × shared (ring 2); ring 3 excluded. ₹/yr today. */
  attributableAnnualExpenses: number;
  /** M-owned + split × Joint investments (primary residence excluded). ₹ today. */
  attributableCorpus: number;
  attributableAnnualIncome: number;
  attributableAnnualTax: number;
  attributableAnnualSavings: number;
  /** SWR-based personal FIRE number from attributable expenses. ₹ today. */
  individualFireNumber: number;
  /** The member's OWN real (inflation-adjusted) blended return — the rate their FIRE age was
   *  solved at. Exposed so no consumer grows a member's corpus at the HOUSEHOLD rate (T-377). */
  realReturn: number;
  /** ADR-0006: the NOMINAL blended return this member's FIRE age was solved at. */
  nominalReturn: number;
  yearsToIndividualFire: number;
  /** anchorAge + yearsToIndividualFire (Infinity → anchorAge unchanged sentinel handled by caller). */
  individualFireAge: number;
}

/** "Joint" asset/debt/income sentinel (distinct from the "Household" expense sentinel). */
const JOINT = "Joint";

/**
 * Standalone individual FIRE for ONE adult. Returns null for a non-adult or a missing member
 * (dependents have no standalone FIRE — they are funded by the household).
 */
export function computeIndividualFire(
  household: Household,
  assumptions: Assumptions,
  memberId: string,
  currentFY: string,
  /** T-377 (QN-2): the same additive solver seam the household path honours — see derive-overrides.ts. */
  overrides?: DeriveOverrides,
): IndividualFireResult | null {
  const member = household.members.find((m) => m.id === memberId);
  if (!member || !isAdultRole(member.role)) return null;

  const split = Math.min(100, Math.max(0, assumptions.householdSplitPercent ?? 50)) / 100;
  const anchorAge = ageFromDOB(member.dateOfBirth);
  const targetRetirementAge =
    usableOverride(overrides?.targetRetirementAge, 1) ?? member.targetRetirementAge ?? 50;
  const planToAge = member.planToAge ?? 90;

  // ---- attributable expenses: own ring-1 (100%) + shared ring-2 (× split); ring-3 excluded ----
  let ownMonthly = 0;
  let sharedMonthly = household.expenses.avgMonthly; // avgMonthly is the shared lump (ring 2)
  for (const r of household.expenses.recurring) {
    const owner = r.ownerId ?? EXPENSE_OWNER_HOUSEHOLD;
    const monthly = toMonthly({ amount: r.amount, period: r.frequency });
    if (owner === memberId) ownMonthly += monthly; // ring 1 (this adult's own)
    else if (owner === EXPENSE_OWNER_HOUSEHOLD) sharedMonthly += monthly; // ring 2 (shared)
    // else: another member's personal OR "Dependents"/dependent-owned (ring 3) → excluded
  }
  const attributableAnnualExpenses = Math.round((ownMonthly + split * sharedMonthly) * 12);

  // ---- attributable corpus: M-owned (100%) + Joint (× split); primary residence excluded ----
  const fireInvestments = household.investments.filter(
    (i) => !(i.type === "RealEstate" && i.realEstateRole === "PrimaryResidence"),
  );
  const corpusWeightOf = (ownerId: string, value: number): number =>
    ownerId === memberId ? value : ownerId === JOINT ? split * value : 0;
  let attributableCorpus = 0;
  const returnWeights = {
    equity: 0, debt: 0, realEstate: 0, gold: 0, nps: 0, ppf: 0, epf: 0,
    international: 0, reit: 0, crypto: 0, other: 0,
  };
  let attributableEpfAnnualContribution = 0;
  for (const inv of fireInvestments) {
    const w = corpusWeightOf(inv.ownerId, inv.value);
    if (w <= 0) continue;
    attributableCorpus += w;
    returnWeights[returnBucketKey(inv)] += w;
    if (inv.type === "EPF_VPF") {
      // EPF contribution is attributed the same way as its corpus weight (own full / joint split).
      const contribWeight = inv.ownerId === memberId ? 1 : inv.ownerId === JOINT ? split : 0;
      attributableEpfAnnualContribution += (inv.monthlyContribution ?? 0) * 12 * contribWeight;
    }
  }
  attributableCorpus = Math.round(attributableCorpus);

  // ---- attributable income: own (100%) + Joint (× split) ----
  const salary = isEarningMember(member, household.businesses)
    ? member.salary?.annualCTC ?? 0
    : 0;
  let ownTaxableOther = 0, ownExemptOther = 0, jointTaxableOther = 0, jointExemptOther = 0;
  for (const o of household.otherIncome) {
    const ann = toAnnual({ amount: o.amount, period: o.frequency });
    if (o.ownerId === memberId) (o.isTaxExempt ? (ownExemptOther += ann) : (ownTaxableOther += ann));
    else if (o.ownerId === JOINT) (o.isTaxExempt ? (jointExemptOther += ann) : (jointTaxableOther += ann));
  }
  let ownBusiness = 0, jointBusiness = 0;
  for (const b of household.businesses) {
    const ann = toAnnual({ amount: b.annualProfit, period: b.frequency }) * (b.sharePercent / 100);
    if (b.ownerId === memberId) ownBusiness += ann;
    else if (b.ownerId === JOINT) jointBusiness += ann;
  }
  const attrTaxableIncome =
    salary + ownTaxableOther + ownBusiness + split * (jointTaxableOther + jointBusiness);
  const attrExemptIncome = ownExemptOther + split * jointExemptOther;
  const attributableAnnualIncome = Math.round(attrTaxableIncome + attrExemptIncome);

  // ---- attributable tax: per-individual, on the adult's OWN deductions ----
  const ownInvestments = fireInvestments.filter((i) => i.ownerId === memberId);
  const ownLiabilities = household.liabilities.filter((l) => l.ownerId === memberId);
  const ownInsurance = household.insurance.filter((p) => p.insuredPersonId === memberId);
  const deductions = deriveDeductions({
    ...household,
    members: [member],
    investments: ownInvestments,
    liabilities: ownLiabilities,
    insurance: ownInsurance,
  });
  // The ₹50k salaried standard deduction applies ONLY against salary income — a non-earning
  // adult with only split capital income must NOT receive it (else their tax is understated →
  // an optimistically EARLY individual FIRE). isSalaried = this adult actually draws a salary.
  const memberIsSalaried = (member.salary?.annualCTC ?? 0) > 0;
  const recommended = recommendRegime({
    grossIncome: attrTaxableIncome,
    fy: currentFY,
    deductions: deductions.totalDeductions,
    employerNpsByMember: deductions.employerNpsByMember,
    taxpayerAge: anchorAge,
    isSalaried: memberIsSalaried,
  });
  const fyTax = computeTax({
    grossIncome: attrTaxableIncome,
    regime: recommended.recommended,
    fy: currentFY,
    deductions: deductions.totalDeductions,
    employerNpsByMember: deductions.employerNpsByMember,
    taxpayerAge: anchorAge,
    isSalaried: memberIsSalaried,
  });
  const attributableAnnualTax = Math.round(fyTax.totalTax);

  // ---- savings + FIRE (real frame, like the household path) ----
  const attributableAnnualSavings = Math.max(
    0,
    attributableAnnualIncome - attributableAnnualTax - attributableAnnualExpenses,
  );
  const monthlyContribution =
    usableOverride(overrides?.monthlyContributionReal, 0) ?? Math.round(attributableAnnualSavings / 12);

  const cfg = getTaxConfigForFY(currentFY);
  const slabs = recommended.recommended === "NEW" ? cfg.newRegime.slabs : cfg.oldRegime.slabs;
  const marginalRate = marginalSlabRate(fyTax.taxableIncome, slabs);
  const epfAfterTaxReturn = epfBucketAfterTaxReturn({
    annualContribution: attributableEpfAnnualContribution,
    marginalSlabRate: marginalRate,
    epfRate: assumptions.epfReturn,
  });
  const blendedReturn = blendPortfolioReturn(assumptions, returnWeights, epfAfterTaxReturn);
  const generalInflation = assumptions.inflation;
  // ADR-0006: `realReturn` is still the CPI-deflated return every DISPLAY surface (and the
  // solver's have-by-target projection) reads, but the individual FIRE age itself is now solved
  // in the SAME nominal frame as the household path below. If this site kept the old fixed-target
  // real frame, the same person's household and individual FIRE ages would drift apart — the
  // cross-screen incoherence class `feedback_cross_screen_figure_coherence` names.
  const realReturn = (1 + blendedReturn) / (1 + generalInflation) - 1;
  const householdBasket = resolveHouseholdInflation(assumptions);

  const effectiveSWR = resolveEffectiveSWRByHorizon(assumptions, targetRetirementAge, planToAge);
  const individualFireNumber = Math.round(
    calculateFIRENumber(attributableAnnualExpenses, effectiveSWR, anchorAge),
  );

  // calculateYearsToTarget caps its loop at 1200 months and returns a FINITE value (up to 100.0)
  // for an unreachable target with positive-but-insufficient savings — NOT Infinity (only the
  // ≤0-savings path returns Infinity). An individual FIRE that lands AFTER the member's own plan
  // horizon (planToAge) is not really FIRE — surface it as "not within horizon", else the card
  // renders a domain-absurd "age 125+" (a rule-31 headline leak the code-review caught).
  const hasTarget = individualFireNumber > 0;
  // Nominal frame: target grows at the household expense basket, corpus at the NOMINAL blended
  // return, the real contribution at general CPI. A non-positive scalar contribution is passed
  // through unchanged so the `<= 0 → Infinity` sentinel still fires.
  const nominalContribution =
    monthlyContribution <= 0
      ? monthlyContribution
      : (yearIndex: number) => monthlyContribution * Math.pow(1 + generalInflation, yearIndex);
  const rawYearsToFire = hasTarget
    ? calculateYearsToTarget(
        attributableCorpus,
        (yearIndex: number) => individualFireNumber * Math.pow(1 + householdBasket, yearIndex),
        nominalContribution,
        blendedReturn,
      )
    : Number.POSITIVE_INFINITY;
  const reachable = Number.isFinite(rawYearsToFire) && anchorAge + rawYearsToFire <= planToAge;
  const yearsToIndividualFire = reachable ? rawYearsToFire : Number.POSITIVE_INFINITY;
  const individualFireAge = reachable
    ? Math.round(anchorAge + rawYearsToFire)
    : Number.POSITIVE_INFINITY;

  return {
    memberId,
    name: member.name || "Adult",
    anchorAge,
    attributableAnnualExpenses,
    attributableCorpus,
    attributableAnnualIncome,
    attributableAnnualTax,
    attributableAnnualSavings,
    individualFireNumber,
    realReturn,
    /** ADR-0006: the NOMINAL blended return this member's FIRE age was solved at. */
    nominalReturn: blendedReturn,
    yearsToIndividualFire,
    individualFireAge,
  };
}
