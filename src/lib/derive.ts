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
import type { Household } from "@/types/household";
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
import { calculateNpsWithdrawal, postTaxAnnuityIncome } from "@/lib/nps-withdrawal";
import { equityPercentAtYear } from "@/lib/glide-path";
import { computeBridgeCoverage, type BridgeHolding } from "@/lib/bridge";
import { deriveEpsPensionForMember, EPS_NORMAL_START_AGE } from "@/lib/eps-pension";
import { deriveGratuityForMember } from "@/lib/gratuity";
import type { ReturnSchedule } from "@/lib/fire-math";
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

  // taxpayerAge drives the OLD-regime senior (60+/80+) basic-exemption variant (gh-issue #6).
  // anchorAge is the lensed member's age, else the primary earner's — the same anchor the
  // rest of the projection uses, consistent with this engine's single-aggregate-earner model.
  const householdTaxRecommendation = recommendRegime({
    grossIncome: annualIncome.salaryIncome + annualIncome.businessShare + annualIncome.otherTaxable,
    fy: lens.currentFY,
    deductions: estimatedDeductionsForOld,
    employerNpsByMember,
    taxpayerAge: anchorAge,
  });

  const fyTax = computeTax({
    grossIncome: annualIncome.salaryIncome + annualIncome.businessShare + annualIncome.otherTaxable,
    regime: householdTaxRecommendation.recommended,
    fy: lens.currentFY,
    deductions: estimatedDeductionsForOld,
    employerNpsByMember,
    taxpayerAge: anchorAge,
  });
  const annualTax = fyTax.totalTax;

  // Household marginal slab rate — computed early so BOTH the NPS-annuity
  // post-tax offset (A2, #7) and the EPF after-tax yield drag (A15.3) use it.
  const cfg = getTaxConfigForFY(lens.currentFY);
  const slabs =
    householdTaxRecommendation.recommended === "NEW" ? cfg.newRegime.slabs : cfg.oldRegime.slabs;
  const householdMarginalRate = marginalSlabRate(fyTax.taxableIncome, slabs);

  const annualSavings = Math.max(0, annualIncome.total - annualTax - annualExpensesToday);
  // gh-issue #11: the monthly amount flowing to the corpus is the savings residual ALONE. The
  // expense input EXCLUDES SIPs (UI contract: /expenses "Exclude rent, EMIs, insurance, and SIPs"),
  // so investments[].monthlyContribution is ALREADY inside annualSavings — adding it again
  // double-counted every SIP (≈10× over-statement for the Sharmas) and pulled the FIRE date years
  // early. SIPs are a subset of the surplus, never additive to it.
  const monthlyContribution = Math.round(annualSavings / 12);
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
  // A2 (#7): the NPS annuity is slab-taxable — offset expenses with the POST-TAX
  // pension, never the gross figure. Offsetting by gross over-credits the annuity
  // and under-states the required FIRE corpus (an optimistic error — the worst
  // class for the accumulator). The household's current marginal rate is a
  // conservative proxy for the retiree's slab (documented simplification:
  // retirement income is usually lower, so this errs on the safe side).
  // Note: householdMarginalRate is the bare slab rate (no 4% cess/surcharge) by
  // design — do NOT "fix" it to the effective rate; the slab-proxy above already
  // over-taxes the annuity, and adding cess would double-stack the conservatism.
  const npsAnnuityIncome = postTaxAnnuityIncome(npsSplit.annuityIncomeAnnual, householdMarginalRate);
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
  // cfg / slabs / householdMarginalRate are computed earlier (NPS A2 offset).
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

  // M1 (#9): when the glide path is enabled, the corpus must compound each year
  // at a DE-RISKED return reflecting that year's equity allocation, not one static
  // blended return — else the projection AND the headline "years to FIRE" over-state
  // growth and report an optimistically EARLY FIRE date (Tier-0 for the salaried
  // accumulator).
  //
  // The schedule is ANCHORED to the household's actual `blendedReturn`: as the
  // glide sheds equity (startEquityPercent → endEquityPercent over the taper),
  // the return drops by the shed-equity fraction × the equity risk premium
  // (equityReturn − debtReturn). It is therefore ALWAYS ≤ blendedReturn and equals
  // blendedReturn before the taper begins — so enabling the glide can only push the
  // FIRE date LATER or leave it unchanged, never earlier. (An earlier naive model
  // rebased the whole portfolio to a 75%-equity 2-asset blend, which RAISED the
  // return — and pulled FIRE optimistically earlier — for any household whose real
  // equity weight was below 75%; rules 24/25 caught that on the Sharmas seed.)
  // Non-glide households keep the flat blended return → byte-identical to before.
  const glide = household.glidePath;
  const glideYearsToRetirement = Math.max(0, targetRetirementAge - anchorAge);
  const equityRiskPremium = Math.max(0, assumptions.equityReturn - assumptions.debtReturn);
  const expectedReturnSchedule: ReturnSchedule = glide?.enabled
    ? (yearIndex: number) => {
        const startEquity = glide.startEquityPercent / 100;
        const equityNow = equityPercentAtYear(glide, glideYearsToRetirement, yearIndex) / 100;
        const equityShed = Math.max(0, startEquity - equityNow);
        return blendedReturn - equityShed * equityRiskPremium;
      }
    : blendedReturn;

  // #20 (Tier-0 honesty): the headline grows TODAY's corpus to a TODAY's-rupee
  // `fireNumber`, so it MUST compound at a REAL return. Growing a NOMINAL return
  // against a non-inflating target reaches optimistically EARLY (#20). The deflator
  // MUST be GENERAL CPI (`assumptions.inflation` ≈6%) — the rate at which a rupee
  // loses economy-wide purchasing power — NOT the 4-bucket household EXPENSE blend
  // (~7.9%, lifted by 14% healthcare). Deflating MARKET RETURNS by the
  // healthcare-weighted expense basket is a modeling error: it crushed the real
  // return to ~0.9% and made FIRE look unreachable (~age 115) for the seed personas
  // (#20, FinTech-validated 2026-06-03). The same general CPI grows the FIRE target
  // in projectCorpus below, so the headline and the chart crossover AGREE. Assumes
  // savings keep pace with general inflation (constant REAL contribution).
  // `householdInflation` (the 4-bucket blend) is retained ONLY for the retiree's
  // decumulation withdrawal-floor growth — an INTENTIONAL asymmetry (a retiree's
  // own spending DOES rise at their personal basket rate; a saver's corpus return
  // deflates at CPI). Do NOT "consistency-fix" these to the same rate.
  const householdInflation = resolveHouseholdInflation(assumptions);
  const generalInflation = assumptions.inflation;
  const toRealReturn = (nominal: number) => (1 + nominal) / (1 + generalInflation) - 1;
  const realReturnSchedule: ReturnSchedule =
    typeof expectedReturnSchedule === "function"
      ? (yearIndex: number) => toRealReturn(expectedReturnSchedule(yearIndex))
      : toRealReturn(expectedReturnSchedule);

  // Headline FIRE dates (FireHero) — the ADEQUACY leg (corpus grows to the FIRE
  // number) in the REAL frame. The bridge layer below can push the HEADLINE later
  // when the adequate corpus is not yet liquid (#15). Lean/Fat stay corpus-only.
  const corpusOnlyYearsToRegular = calculateYearsToTarget(fireWithdrawableCorpus, fireNumber, monthlyContribution, realReturnSchedule);
  const yearsToLean = calculateYearsToTarget(fireWithdrawableCorpus, variants.leanFIRE, monthlyContribution, realReturnSchedule);
  const yearsToFat = calculateYearsToTarget(fireWithdrawableCorpus, variants.fatFIRE, monthlyContribution, realReturnSchedule);

  // ----- #15 accumulation bridge: corpus-adequate ≠ FIRE-ready -----
  // At the age the corpus first meets the FIRE number, check that the LIQUID
  // runway covers every retirement year until locked money (PPF / NPS annuity)
  // unlocks. A short bridge moves the headline FIRE age LATER. A fully-liquid
  // household has no locked window → covered → headline unchanged (byte-identical).
  const bridge = computeBridge();
  // Only a genuine liquidity SHORTFALL moves the headline later — when the bridge
  // is covered (or not evaluated), the headline stays exactly on the adequacy leg
  // (byte-identical; no rounding artifact from the bridge's integer age math).
  const yearsToRegular =
    bridge && !bridge.covered
      ? Math.max(corpusOnlyYearsToRegular, bridge.effectiveFireAge - anchorAge)
      : corpusOnlyYearsToRegular;

  function computeBridge() {
    // Only meaningful when the corpus actually reaches the FIRE number at a
    // plannable age. An unreachable target (Infinity) or one past the plan
    // horizon leaves the headline on the adequacy leg.
    if (!Number.isFinite(corpusOnlyYearsToRegular)) return null;
    const adequacyAge = Math.round(anchorAge + corpusOnlyYearsToRegular);
    if (adequacyAge > planToAge) return null;

    const dobForOwner = (ownerId: string): string | null => {
      const direct = members.find((m) => m.id === ownerId);
      if (direct) return direct.dateOfBirth;
      // "Joint" (or an unmatched owner) anchors to the lens/primary earner.
      const anchorMember =
        members.find((m) => m.id === effectiveLensMemberId) ?? earners[0] ?? members[0];
      return anchorMember?.dateOfBirth ?? null;
    };

    const holdings: BridgeHolding[] = fireCorpusInvestments.map((asset) => ({
      asset,
      ownerDob: dobForOwner(asset.ownerId),
    }));

    const rentalAnnual = lensedOtherIncome
      .filter((o) => o.type === "Rental")
      .reduce((s, o) => s + toAnnual({ amount: o.amount, period: o.frequency }), 0);
    const postTax = (gross: number) => gross * (1 - householdMarginalRate);

    // EPS pension + gratuity aggregated over the lensed earners (Phases D, E).
    let epsAnnualGross = 0;
    let gratuityNet = 0;
    for (const m of lensedEarners) {
      const eps = deriveEpsPensionForMember(m);
      if (eps) epsAnnualGross += eps.annualPension;
      const grat = deriveGratuityForMember(m, householdMarginalRate);
      if (grat) gratuityNet += grat.net;
    }

    // Map today's holding values to the corpus at the retirement age: it grows
    // toward the FIRE number via contributions + returns. The base MUST match
    // the holdings being scaled — `holdings` is the FULL corpus, so scale on
    // totalCorpus, not the annuity-excluded withdrawable corpus (using the
    // smaller denominator would over-scale NPS and over-credit its annuity income
    // — an optimistic error).
    const corpusScale = totalCorpus > 0 ? fireNumber / totalCorpus : 1;

    return computeBridgeCoverage({
      holdings,
      retirementAge: adequacyAge,
      anchorAge,
      planToAge,
      annualExpenses: annualExpensesToday,
      income: {
        rentalAnnualPostTax: Math.round(postTax(rentalAnnual)),
        epsAnnualPostTax: Math.round(postTax(epsAnnualGross)),
        epsStartAge: EPS_NORMAL_START_AGE,
      },
      exitLumpNet: Math.round(gratuityNet),
      marginalRate: householdMarginalRate,
      corpusScale,
    });
  }

  const yfat = Number.isFinite(yearsToFat) ? yearsToFat : 30;
  const projectionHorizonYears = Math.min(60, Math.max(20, Math.ceil(yfat) + 5));

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
    expectedReturns: expectedReturnSchedule,
    // #20: grow the FIRE target at GENERAL CPI (not the healthcare-weighted blend)
    // so the chart crossover and the real-frame headline agree and FIRE is reachable.
    inflation: generalInflation,
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
    householdInflation,
    annualEpfVpfContribution,
    householdMarginalRate,
    epfAfterTaxReturn,
    yearsToRegular,
    corpusOnlyYearsToRegular,
    bridgeCoverage: bridge,
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
