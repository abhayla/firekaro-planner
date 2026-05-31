import { computed } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { useUiStore } from "@/stores/ui";
import { derive } from "@/lib/derive";

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
    annualEpfVpfContribution: computed(() => d.value.annualEpfVpfContribution),
    householdMarginalRate: computed(() => d.value.householdMarginalRate),
    epfAfterTaxReturn: computed(() => d.value.epfAfterTaxReturn),
    yearsToRegular: computed(() => d.value.yearsToRegular),
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
  };
}
