/**
 * derive() — the pure FIRE-math kernel (Stage-T0 B-1, DEFERRED-v5 Concern #2).
 *
 * ALL the FIRE-dashboard math lives here as a single pure function of plain
 * inputs (household snapshot + resolved assumptions + UI lens). `useFireDerive`
 * is now a thin Pinia-aware wrapper that reads the stores and calls derive(),
 * re-exposing every field as a `computed`. No output changes vs the prior
 * composable — the Sharmas seed spec (`useFireDerive.seed.spec.ts`) is the
 * behaviour lock.
 *
 * Lens semantics (D6): solo OR family-view ON OR no specific member → aggregate
 * whole household; specific member + family-view OFF → that member's slice +
 * the always-visible joint pool.
 */
import type { Household, Member } from "@/types/household";
import type { Assumptions } from "@/types/assumptions";
import {
  calculateFIRENumber,
  calculateFIREVariants,
  calculateSavingsRate,
  calculateYearsToTarget,
  projectCorpus,
  findCrossovers,
  calculateFamilyLayerCorpus,
  calculateFireTarget,
} from "@/lib/fire-math";
import { derivedFamilyLayer } from "@/lib/derived-records";
import { computeTax, recommendRegime, marginalSlabRate, getTaxConfigForFY } from "@/lib/tax";
import { epfBucketAfterTaxReturn } from "@/lib/epf-vpf";
import { ageFromDOB } from "@/lib/age";
import { toMonthly, toAnnual } from "@/lib/cashflow";
import { returnBucketKey } from "@/lib/investment-traits";
import { deriveDeductions } from "@/lib/tax-deductions";
import { DEFAULT_FLOOR_CEILING } from "@/lib/withdrawal-strategy";
import { calculateNpsWithdrawal } from "@/lib/nps-withdrawal";
import {
  resolveHouseholdInflation,
  resolveEffectiveSWRByHorizon,
  blendPortfolioReturn,
} from "@/lib/assumption-math";

export interface DeriveLens {
  isFamilyView: boolean;
  viewingMemberId: string | null;
  currentFY: string;
}

export function derive(household: Household, assumptions: Assumptions, lens: DeriveLens) {
  const members = household.members;
  const earners = members.filter((m) => m.role === "EARNER");
  const isSolo = members.length <= 1;

  // Decide member-lens vs whole-household aggregation (ISSUES-v2 #6 fix).
  const applyMemberLens = !isSolo && !lens.isFamilyView;
  const effectiveLensMemberId: string | null = applyMemberLens
    ? lens.viewingMemberId ?? earners[0]?.id ?? members[0]?.id ?? null
    : null;
  const lensedMemberIds: Set<string> = applyMemberLens && effectiveLensMemberId
    ? new Set([effectiveLensMemberId])
    : new Set(members.map((m) => m.id));

  // Match a record's ownerId against the lens. "Joint" always visible.
  function ownerMatches(ownerId: string): boolean {
    if (!applyMemberLens) return true;
    if (ownerId === "Joint") return true;
    return lensedMemberIds.has(ownerId);
  }

  const lensedMembers = members.filter((m) => lensedMemberIds.has(m.id));
  const lensedEarners = lensedMembers.filter((m) => m.role === "EARNER");
  const lensedInvestments = household.investments.filter((i) => ownerMatches(i.ownerId));
  const lensedLiabilities = household.liabilities.filter(
    (l) => ownerMatches(l.ownerId) || l.isSharedWithSpouse,
  );
  const lensedInsurance = household.insurance.filter((p) =>
    applyMemberLens ? lensedMemberIds.has(p.insuredPersonId) : true,
  );
  const lensedBusinesses = household.businesses.filter((b) => ownerMatches(b.ownerId));
  const lensedOtherIncome = household.otherIncome.filter((o) => ownerMatches(o.ownerId));

  // Anchor age — effective-lens member's age if lensed, else primary earner.
  function anchorAgeFor(): number {
    if (applyMemberLens) {
      const m = members.find((x) => x.id === effectiveLensMemberId);
      if (m) return ageFromDOB(m.dateOfBirth);
    }
    const primary = earners[0];
    return primary ? ageFromDOB(primary.dateOfBirth) : 30;
  }
  const anchorAge = anchorAgeFor();

  const targetRetirementAge = (() => {
    if (applyMemberLens) {
      const m = members.find((x) => x.id === effectiveLensMemberId);
      if (m?.targetRetirementAge) return m.targetRetirementAge;
    }
    return earners[0]?.targetRetirementAge ?? 50;
  })();

  const planToAge = (() => {
    if (applyMemberLens) {
      const m = members.find((x) => x.id === effectiveLensMemberId);
      if (m?.planToAge) return m.planToAge;
    }
    return earners[0]?.planToAge ?? 90;
  })();

  // Annual income totals (lensed).
  const salaryIncome = lensedEarners.reduce((s, m) => s + (m.salary?.annualCTC ?? 0), 0);
  const otherTaxable = lensedOtherIncome
    .filter((o) => !o.isTaxExempt)
    .reduce((s, o) => s + toAnnual({ amount: o.amount, period: o.frequency }), 0);
  const otherExempt = lensedOtherIncome
    .filter((o) => o.isTaxExempt)
    .reduce((s, o) => s + toAnnual({ amount: o.amount, period: o.frequency }), 0);
  const businessShare = lensedBusinesses.reduce(
    (s, b) => s + toAnnual({ amount: b.annualProfit, period: b.frequency }) * (b.sharePercent / 100),
    0,
  );
  const annualIncome = {
    salaryIncome,
    otherTaxable,
    otherExempt,
    businessShare,
    total: salaryIncome + otherTaxable + otherExempt + businessShare,
  };

  // Household-level monthly expenses (joint pool).
  const totalMonthlyExpenses =
    household.expenses.avgMonthly +
    household.expenses.recurring.reduce(
      (s, r) => s + toMonthly({ amount: r.amount, period: r.frequency }),
      0,
    );

  // Expenses: household pool is always whole-household (joint) per D6; auto-flow
  // lines tied to lensed insurance/loans only count when those are visible.
  const annualExpensesToday = (() => {
    if (!applyMemberLens) {
      return totalMonthlyExpenses * 12;
    }
    const insuranceIds = new Set(lensedInsurance.map((p) => p.id));
    const loanIds = new Set(lensedLiabilities.map((l) => l.id));
    const recurringMonthly = household.expenses.recurring.reduce((s, r) => {
      if (r.source === "auto-insurance" && r.sourceRefId && !insuranceIds.has(r.sourceRefId)) return s;
      if (r.source === "auto-loan" && r.sourceRefId && !loanIds.has(r.sourceRefId)) return s;
      return s + toMonthly({ amount: r.amount, period: r.frequency });
    }, 0);
    return (household.expenses.avgMonthly + recurringMonthly) * 12;
  })();

  // Single source of truth for deductions — audit-grounded deriveDeductions()
  // over the LENSED subset so the recommendation + fyTax match /tax-planning.
  const lensedDeductions = deriveDeductions({
    ...household,
    // members MUST be lensed too: section80CCD2 sums members' employerNpsAnnual, and
    // grossIncome below is built from lensedEarners only. Passing full household.members
    // here would deduct the whole household's employer NPS from a single lensed earner's
    // income (understating tax / overstating FIRE). Scope it to the lensed earners.
    members: lensedEarners,
    investments: lensedInvestments,
    liabilities: lensedLiabilities,
    insurance: lensedInsurance,
  });
  const estimatedDeductionsForOld = lensedDeductions.totalDeductions;
  // 80CCD(2) employer NPS — applies in both regimes, passed separately (gh-issue #2);
  // employerNpsByMember lets computeTax cap each member at their own basic's ceiling
  // (gh-issue #4), more correct than the aggregate scalars for a multi-earner household.
  const employerNpsByMember = lensedDeductions.employerNpsByMember;

  const householdTaxRecommendation = recommendRegime({
    grossIncome: annualIncome.salaryIncome + annualIncome.businessShare + annualIncome.otherTaxable,
    fy: lens.currentFY,
    deductions: estimatedDeductionsForOld,
    employerNpsByMember,
  });

  const fyTax = computeTax({
    grossIncome: annualIncome.salaryIncome + annualIncome.businessShare + annualIncome.otherTaxable,
    regime: householdTaxRecommendation.recommended,
    fy: lens.currentFY,
    deductions: estimatedDeductionsForOld,
    employerNpsByMember,
  });
  const annualTax = fyTax.totalTax;

  const annualSavings = Math.max(0, annualIncome.total - annualTax - annualExpensesToday);
  const monthlyInvestmentContribution = lensedInvestments.reduce(
    (s, i) => s + (i.monthlyContribution ?? 0),
    0,
  );
  const monthlyContribution = Math.round(annualSavings / 12) + monthlyInvestmentContribution;
  const monthlyTakeHome = Math.round((annualIncome.total - annualTax) / 12);
  const savingsRate = calculateSavingsRate(monthlyTakeHome, Math.round(annualSavings / 12));

  // Primary-residence exclusion (A20.2).
  const fireCorpusInvestments = lensedInvestments.filter(
    (i) => !(i.type === "RealEstate" && i.realEstateRole === "PrimaryResidence"),
  );
  const totalCorpus = fireCorpusInvestments.reduce((s, i) => s + i.value, 0);
  const totalLiabilitiesValue = lensedLiabilities.reduce((s, l) => s + l.outstandingBalance, 0);

  // Horizon-driven SWR (A1.1).
  const effectiveSWR = resolveEffectiveSWRByHorizon(assumptions, targetRetirementAge, planToAge);

  // A14.2 — NPS annuity in retirement. The mandatory 40% annuitised portion
  // (PFRDA 2025, corpus > ₹5L) becomes a pension that offsets the net expenses
  // the corpus must fund, AND is removed from the withdrawable corpus so it is
  // not double-counted. Modelled on the CURRENT NPS corpus (documented
  // simplification — a precise model would project the corpus to NPS-exit age;
  // below the ₹5L threshold the annuity is zero, so most MVP households — incl.
  // the Sharmas at ₹4L — see no change).
  const npsCorpus = fireCorpusInvestments
    .filter((i) => i.type === "NPS")
    .reduce((s, i) => s + i.value, 0);
  const npsSplit = calculateNpsWithdrawal({ totalCorpus: npsCorpus });
  const npsAnnuityIncome = npsSplit.annuityIncomeAnnual;
  const npsAnnuityCorpus = npsSplit.annuityCorpus;
  const netAnnualExpenses = Math.max(0, annualExpensesToday - npsAnnuityIncome);
  // Corpus available for withdrawal excludes the locked annuitised portion.
  const fireWithdrawableCorpus = Math.max(0, totalCorpus - npsAnnuityCorpus);

  const baseFireNumber = calculateFIRENumber(netAnnualExpenses, effectiveSWR, anchorAge);

  // Family-layer additive corpus (A6.10).
  const familyLayer = derivedFamilyLayer(household);
  const educationMarriageLumpToday =
    familyLayer.educationGoals.reduce((s, g) => s + (g.todayAmount ?? 0), 0) +
    familyLayer.marriageEvents.reduce((s, g) => s + (g.todayAmount ?? 0), 0);
  const extendedContingencyAnnual = familyLayer.extendedContingency
    ? familyLayer.extendedContingency.amount * 12
    : 0;
  const familyLayerCorpus = calculateFamilyLayerCorpus({
    educationMarriageLumpToday,
    extendedContingencyAnnual,
    swr: effectiveSWR,
  });

  // Healthcare corpus reservation (A10.5).
  const healthcareReservationPercent = household.healthcareCorpusReservationPercent ?? 0.2;
  const healthcareReservation = baseFireNumber * healthcareReservationPercent;

  // Headline FIRE target = base + family layer + healthcare reservation.
  const fireNumber = calculateFireTarget({
    baseFireNumber,
    familyLayerCorpus,
    healthcareReservationPercent,
  });

  const variants = calculateFIREVariants(annualExpensesToday, effectiveSWR, {
    lean: assumptions.leanMultiplier,
    fat: assumptions.fatMultiplier,
  });

  // EPF/VPF after-tax yield drag (A15.3).
  const annualEpfVpfContribution = fireCorpusInvestments
    .filter((i) => i.type === "EPF_VPF")
    .reduce((s, i) => s + (i.monthlyContribution ?? 0) * 12, 0);
  const cfg = getTaxConfigForFY(lens.currentFY);
  const slabs =
    householdTaxRecommendation.recommended === "NEW" ? cfg.newRegime.slabs : cfg.oldRegime.slabs;
  const householdMarginalRate = marginalSlabRate(fyTax.taxableIncome, slabs);
  const epfAfterTaxReturn = epfBucketAfterTaxReturn({
    annualContribution: annualEpfVpfContribution,
    marginalSlabRate: householdMarginalRate,
    epfRate: assumptions.epfReturn,
  });

  const returnWeights = {
    equity: 0, debt: 0, realEstate: 0, gold: 0, nps: 0, ppf: 0, epf: 0,
    international: 0, reit: 0, crypto: 0, other: 0,
  };
  for (const inv of fireCorpusInvestments) {
    returnWeights[returnBucketKey(inv)] += inv.value;
  }
  const blendedReturn = blendPortfolioReturn(assumptions, returnWeights, epfAfterTaxReturn);

  const yearsToRegular = calculateYearsToTarget(fireWithdrawableCorpus, fireNumber, monthlyContribution, blendedReturn);
  const yearsToLean = calculateYearsToTarget(fireWithdrawableCorpus, variants.leanFIRE, monthlyContribution, blendedReturn);
  const yearsToFat = calculateYearsToTarget(fireWithdrawableCorpus, variants.fatFIRE, monthlyContribution, blendedReturn);

  const yfat = Number.isFinite(yearsToFat) ? yearsToFat : 30;
  const projectionHorizonYears = Math.min(60, Math.max(20, Math.ceil(yfat) + 5));

  const householdInflation = resolveHouseholdInflation(assumptions);

  // A9.1 — Floor/Ceiling decumulation overlay (Constant → undefined → unchanged).
  const decumulation =
    assumptions.withdrawalRule === "FloorCeiling"
      ? {
          retirementAge: targetRetirementAge,
          config: { ...DEFAULT_FLOOR_CEILING, swr: effectiveSWR, inflation: householdInflation },
          retirementIncomeAnnual: npsAnnuityIncome,
        }
      : undefined;

  const projection = projectCorpus({
    currentCorpus: fireWithdrawableCorpus,
    monthlyContribution,
    expectedReturns: blendedReturn,
    inflation: householdInflation,
    annualExpensesToday,
    startAge: anchorAge,
    swr: effectiveSWR,
    horizonYears: projectionHorizonYears,
    decumulation,
  });

  const crossovers = findCrossovers(projection);

  const progressPercent =
    fireNumber <= 0 ? 0 : Math.min(100, Math.round((fireWithdrawableCorpus / fireNumber) * 100));

  return {
    applyMemberLens,
    lensedMembers,
    lensedEarners,
    lensedInvestments,
    lensedLiabilities,
    lensedInsurance,
    anchorAge,
    targetRetirementAge,
    annualExpensesToday,
    annualIncome,
    annualTax,
    annualSavings,
    monthlyContribution,
    monthlyTakeHome,
    savingsRate,
    effectiveSWR,
    planToAge,
    fireNumber,
    baseFireNumber,
    familyLayer,
    familyLayerCorpus,
    healthcareReservation,
    healthcareReservationPercent,
    variants,
    blendedReturn,
    annualEpfVpfContribution,
    householdMarginalRate,
    epfAfterTaxReturn,
    yearsToRegular,
    yearsToLean,
    yearsToFat,
    projection,
    crossovers,
    progressPercent,
    fyTax,
    householdTaxRecommendation,
    estimatedDeductionsForOld,
    totalCorpus,
    totalLiabilitiesValue,
    npsAnnuityIncome,
    fireWithdrawableCorpus,
  };
}

export type DerivedFinancials = ReturnType<typeof derive>;
