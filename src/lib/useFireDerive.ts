import { computed } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { useUiStore } from "@/stores/ui";
import { derive } from "@/lib/derive";
import { runMonteCarloFire } from "@/lib/monte-carlo";

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

  return {
    applyMemberLens: computed(() => d.value.applyMemberLens),
    lensedMembers: computed(() => d.value.lensedMembers),
    lensedEarners: computed(() => d.value.lensedEarners),
    lensedInvestments: computed(() => d.value.lensedInvestments),
    lensedLiabilities: computed(() => d.value.lensedLiabilities),
    lensedInsurance: computed(() => d.value.lensedInsurance),
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
    // #18 Monte Carlo headline confidence band — LAZY (Vue computed only runs the
    // simulation when a consumer reads it, e.g. FireHero). Same real frame as the
    // corrected headline so p50 ≈ the deterministic years-to-FIRE. The MC now tapers its
    // per-year MEAN along the GLIDE schedule (#24 Part 1) so p50 converges to the headline
    // for glide-ON households instead of running fast off a scalar pre-glide return.
    // meanReturn stays as the scalar fallback (glide-OFF households resolve it identically).
    monteCarlo: computed(() =>
      runMonteCarloFire({
        currentCorpus: d.value.fireWithdrawableCorpus,
        targetCorpus: d.value.fireNumber,
        monthlySavings: d.value.monthlyContribution,
        meanReturn: d.value.realBlendedReturn,
        meanReturnSchedule: d.value.realReturnSchedule,
        volatility: d.value.portfolioVolatility,
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
