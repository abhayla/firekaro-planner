import { computed } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { useUiStore } from "@/stores/ui";
import { derive } from "@/lib/derive";
import { runMonteCarloFire, INDIA_EQUITY_ANNUAL_RETURNS } from "@/lib/monte-carlo";
import { isEmergencyFundEligible } from "@/lib/investment-traits";

/**
 * Single source of truth for all FIRE dashboard math — now a thin Pinia-aware
 * wrapper (Stage-T0 B-1). It reads the household + assumptions stores + the UI
 * lens, calls the pure {@link derive} kernel once, and re-exposes every field
 * as a `computed` so the public surface (and every consumer) is unchanged.
 *
 * All math lives in `lib/derive.ts`; the kernel is unit-tested directly in
 * `derive.spec.ts`, and `useFireDerive.seed.spec.ts` locks the end-to-end
 * behaviour through the real stores.
 */
export function useFireDerive() {
  const h = useHouseholdStore();
  const a = useAssumptionsStore();
  const ui = useUiStore();

  // The lens defaults to the whole household (derive() only scopes to a member when
  // one is EXPLICITLY selected — gh-issue #22 root fix), so no per-consumer flag is
  // needed: every consumer gets the coherent household FIRE number by default.
  const d = computed(() =>
    derive(h.data, a.values, {
      isFamilyView: ui.isFamilyView,
      viewingMemberId: ui.viewingMemberId,
      currentFY: ui.currentFY,
    }),
  );

  // #81 Phase 3 — the SAME-SCOPE Financial-Health resolver. When an adult is selected in "Viewing
  // as", every figure is THAT member's own slice; on the default "Whole household" view it is the
  // full household (byte-identical). CRUCIAL: a member's share of "Joint"/shared assets, liquid,
  // liabilities and EMI is taken at the SAME `householdSplitPercent` the income/expense attribution
  // uses (FinTech #81 Phase-3 HIGH-1/2 fix). So EVERY FH ratio — net worth (assets − liab), savings
  // rate, DTI (EMI ÷ take-home), emergency months (liquid ÷ burn), health score — divides figures
  // built on ONE identical Joint convention. Mixing a 100%-Joint numerator with a split denominator
  // (the deeper #23 trap) over-states a member's safety; unifying the split kills it. Member-owned =
  // 100%; "Joint"/shared = × split; dependent-owned excluded. Same-scope enforced ONCE, here.
  const memberFinancials = computed(() => {
    const k = d.value;
    const adult = k.individualFireByMember.find((r) => r.memberId === ui.viewingMemberId) ?? null;
    const split = Math.min(100, Math.max(0, a.values.householdSplitPercent ?? 50)) / 100;
    const memberId = adult?.memberId ?? null;
    // The Joint weight applied to every member-scoped FH figure (1 by default = household view).
    const invWeight = (ownerId: string): number =>
      !adult ? 1 : ownerId === memberId ? 1 : ownerId === "Joint" ? split : 0;
    const liabWeight = (ownerId: string, isSharedWithSpouse: boolean): number =>
      !adult ? 1 : ownerId === memberId ? 1 : ownerId === "Joint" || isSharedWithSpouse ? split : 0;

    // Split-scoped lists — the member's SHARE of each holding/loan (own full, Joint × split). The
    // FH screens read these for both totals AND per-row breakdowns, so every screen uses one convention.
    const scopedInvestments = k.lensedInvestments.map((i) => ({
      ...i,
      value: Math.round(i.value * invWeight(i.ownerId)),
    }));
    const scopedLiabilities = k.lensedLiabilities.map((l) => ({
      ...l,
      outstandingBalance: Math.round(l.outstandingBalance * liabWeight(l.ownerId, l.isSharedWithSpouse)),
      monthlyEMI: Math.round(l.monthlyEMI * liabWeight(l.ownerId, l.isSharedWithSpouse)),
    }));

    const totalAssets = scopedInvestments.reduce((s, i) => s + i.value, 0);
    const totalLiabilities = scopedLiabilities.reduce((s, l) => s + l.outstandingBalance, 0);
    const liquid = scopedInvestments
      .filter((i) => isEmergencyFundEligible(i))
      .reduce((s, i) => s + i.value, 0);
    const monthlyEMI = scopedLiabilities.reduce((s, l) => s + l.monthlyEMI, 0);
    // Insurance is per insured-person (not Joint) — lensedInsurance is already the member's own policies.
    const lifeCover = k.lensedInsurance
      .filter((p) => p.type === "Life")
      .reduce((s, p) => s + p.sumAssured, 0);
    const healthCover = k.lensedInsurance
      .filter((p) => p.type === "Health")
      .reduce((s, p) => s + p.sumAssured, 0);
    // Income/tax/expenses: member attribution when lensed (already split-Joint), household by default.
    const annualIncome = adult ? adult.attributableAnnualIncome : k.householdAnnualIncome ?? 0;
    const annualTax = adult ? adult.attributableAnnualTax : k.householdAnnualTax ?? 0;
    const annualExpenses = adult ? adult.attributableAnnualExpenses : k.annualExpensesToday;
    const annualTakeHome = annualIncome - annualTax;
    const surplus = Math.max(0, annualTakeHome - annualExpenses);
    const adultMember = adult ? h.data.members.find((m) => m.id === adult.memberId) ?? null : null;
    return {
      isMemberView: adult != null,
      memberName: adult?.name ?? null,
      // Is the lensed adult an earner? (drives the non-earner health-score caveat.)
      isEarner: adult ? k.lensedEarners.some((m) => m.id === adult.memberId) : true,
      annualIncome,
      annualTax,
      annualExpenses,
      surplus,
      monthlySurplus: Math.round(surplus / 12),
      // Split-scoped lists for the NetWorth/Banking breakdowns (one convention with the ratios).
      scopedInvestments,
      scopedLiabilities,
      totalAssets,
      totalLiabilities,
      netWorth: totalAssets - totalLiabilities,
      liquid,
      // Health-score inputs — each member-scoped (one Joint convention) when lensed, kernel by default.
      monthlyTakeHome: adult ? Math.round(annualTakeHome / 12) : k.monthlyTakeHome,
      monthlyEMI,
      savingsRatePercent: adult
        ? annualTakeHome > 0
          ? Math.round((surplus / annualTakeHome) * 100)
          : 0
        : k.savingsRate,
      fireProgressPercent: adult
        ? adult.individualFireNumber > 0
          ? Math.min(100, Math.round((adult.attributableCorpus / adult.individualFireNumber) * 100))
          : 0
        : k.progressPercent,
      lifeCover,
      healthCover,
      primaryIncome: adult ? adultMember?.salary?.annualCTC ?? 0 : h.earners[0]?.salary?.annualCTC ?? 0,
    };
  });

  return {
    // #81 Phase 3 — the centralized same-scope Financial-Health resolver (member or household).
    memberFinancials,
    applyMemberLens: computed(() => d.value.applyMemberLens),
    lensedMembers: computed(() => d.value.lensedMembers),
    lensedEarners: computed(() => d.value.lensedEarners),
    lensedInvestments: computed(() => d.value.lensedInvestments),
    lensedLiabilities: computed(() => d.value.lensedLiabilities),
    lensedInsurance: computed(() => d.value.lensedInsurance),
    // #66: member-attributable income collections for the Business / Other-Sources screens.
    lensedBusinesses: computed(() => d.value.lensedBusinesses),
    lensedOtherIncome: computed(() => d.value.lensedOtherIncome),
    // #81 Phase 1 — member-attributable expense display (display-only; FIRE total unchanged).
    lensedRecurringExpenses: computed(() => d.value.lensedRecurringExpenses),
    lensedPlannedExpenses: computed(() => d.value.lensedPlannedExpenses),
    lensedMonthlyExpenses: computed(() => d.value.lensedMonthlyExpenses),
    // #81 Phase 2 — standalone individual FIRE per adult + the household−Σ(adults) gap.
    individualFireByMember: computed(() => d.value.individualFireByMember),
    individualFireExpenseGapAnnual: computed(() => d.value.individualFireExpenseGapAnnual),
    householdFireAge: computed(() => d.value.householdFireAge),
    anchorAge: computed(() => d.value.anchorAge),
    targetRetirementAge: computed(() => d.value.targetRetirementAge),
    annualExpensesToday: computed(() => d.value.annualExpensesToday),
    annualIncome: computed(() => d.value.annualIncome),
    annualTax: computed(() => d.value.annualTax),
    annualSavings: computed(() => d.value.annualSavings),
    monthlyContribution: computed(() => d.value.monthlyContribution),
    monthlyTakeHome: computed(() => d.value.monthlyTakeHome),
    savingsRate: computed(() => d.value.savingsRate),
    effectiveSWR: computed(() => d.value.effectiveSWR),
    planToAge: computed(() => d.value.planToAge),
    fireNumber: computed(() => d.value.fireNumber),
    baseFireNumber: computed(() => d.value.baseFireNumber),
    familyLayer: computed(() => d.value.familyLayer),
    familyLayerCorpus: computed(() => d.value.familyLayerCorpus),
    healthcareReservation: computed(() => d.value.healthcareReservation),
    healthcareReservationPercent: computed(() => d.value.healthcareReservationPercent),
    variants: computed(() => d.value.variants),
    blendedReturn: computed(() => d.value.blendedReturn),
    realBlendedReturn: computed(() => d.value.realBlendedReturn),
    realReturnSchedule: computed(() => d.value.realReturnSchedule),
    portfolioVolatility: computed(() => d.value.portfolioVolatility),
    // Canonical per-bucket corpus weights (₹) backing blendedReturn/portfolioVolatility — the basis
    // the obj-2 acceleration composable must use for risk-notch equity headroom + perturbed σ (gh-48).
    returnWeights: computed(() => d.value.returnWeights),
    // #18 Monte Carlo headline confidence band — LAZY (Vue computed only runs the
    // simulation when a consumer reads it, e.g. FireHero). Same real frame as the
    // corrected headline so p50 ≈ the deterministic years-to-FIRE. The MC tapers its
    // per-year MEAN along the GLIDE schedule (#24 Part 1) so p50 converges to the headline
    // for glide-ON households; meanReturn stays as the scalar fallback (glide-OFF resolves
    // identically). #24 Part 2: HISTORY-FED block-bootstrap — passing the real Indian-equity
    // series swaps the IID draw for circular-block sampling of standardized historical
    // deviations (location-scaled to this household's mean+vol), so the band now carries the
    // REAL return shape + serial structure (mean-reversion) of Indian equity since 1991 —
    // measured tighter-or-equal to IID, not heavier (the lognormal's fat tail was an
    // artifact); surfaced as the "history-informed" disclosure.
    monteCarlo: computed(() =>
      runMonteCarloFire({
        currentCorpus: d.value.fireWithdrawableCorpus,
        targetCorpus: d.value.fireNumber,
        monthlySavings: d.value.monthlyContribution,
        meanReturn: d.value.realBlendedReturn,
        meanReturnSchedule: d.value.realReturnSchedule,
        volatility: d.value.portfolioVolatility,
        historicalReturns: INDIA_EQUITY_ANNUAL_RETURNS,
      }),
    ),
    annualEpfVpfContribution: computed(() => d.value.annualEpfVpfContribution),
    householdMarginalRate: computed(() => d.value.householdMarginalRate),
    epfAfterTaxReturn: computed(() => d.value.epfAfterTaxReturn),
    yearsToRegular: computed(() => d.value.yearsToRegular),
    corpusOnlyYearsToRegular: computed(() => d.value.corpusOnlyYearsToRegular),
    bridgeCoverage: computed(() => d.value.bridgeCoverage),
    yearsToLean: computed(() => d.value.yearsToLean),
    yearsToFat: computed(() => d.value.yearsToFat),
    projection: computed(() => d.value.projection),
    crossovers: computed(() => d.value.crossovers),
    progressPercent: computed(() => d.value.progressPercent),
    fyTax: computed(() => d.value.fyTax),
    householdTaxRecommendation: computed(() => d.value.householdTaxRecommendation),
    // Preserved as a function for the original call-site API (NudgeStack).
    estimatedDeductionsForOld: () => d.value.estimatedDeductionsForOld,
    totalCorpus: computed(() => d.value.totalCorpus),
    totalLiabilitiesValue: computed(() => d.value.totalLiabilitiesValue),
    npsAnnuityIncome: computed(() => d.value.npsAnnuityIncome),
    fireWithdrawableCorpus: computed(() => d.value.fireWithdrawableCorpus),
    // Whole-household income/tax for the cashflow / financial-health charts — they mix income with
    // HOUSEHOLD expenses/savings/tax, so they MUST read the household income (not the lensed display)
    // to avoid a spurious negative surplus under a member lens (#23 HIGH follow-up).
    householdAnnualIncome: computed(() => d.value.householdAnnualIncome),
    householdAnnualTax: computed(() => d.value.householdAnnualTax),
  };
}
