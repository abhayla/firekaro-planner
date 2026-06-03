<script setup lang="ts">
/**
 * NudgeStack — renders the firing nudges for the given route from the
 * Stage E lib/nudge-engine.
 *
 * Phase 4 Stage I per docs/goals/build-firekaro-mvp-v5.md §7.
 * Stage R adds dismissal persistence; this component just renders.
 *
 * Severity color mapping:
 *   alert -> error
 *   warning -> warning
 *   info -> info
 */
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { useUiStore } from "@/stores/ui";
import { useFireDerive } from "@/lib/useFireDerive";
import { derive } from "@/lib/derive";
import { evaluateNudges, type NudgeSeverity } from "@/lib/nudge-engine";
import { derivedFamilyLayer } from "@/lib/derived-records";
import { analyzeLifestyleInflation, detectGoalPostShift } from "@/lib/expense-history";
import { useDismissedNudges } from "@/composables/useDismissedNudges";

const props = defineProps<{
  /** Override the current route name for testing. */
  routeName?: string;
}>();

const route = useRoute();
const household = useHouseholdStore();
const assumptions = useAssumptionsStore();
const ui = useUiStore();
const fire = useFireDerive();

const currentRouteName = computed(
  () => props.routeName ?? String(route.name ?? ""),
);

// Phase 6 Stage R — dismissal persistence.
const { isDismissed, dismiss } = useDismissedNudges();

const nudges = computed(() => {
  const recommended = fire.householdTaxRecommendation.value?.recommended;
  const taxableIncome = recommended === "OLD"
    ? fire.annualIncome.value.total - fire.estimatedDeductionsForOld()
    : fire.annualIncome.value.total;
  // Re-read snapshot-derived analyses when a snapshot is captured (P2 nudges
  // A29.2/A30.2 depend on real history). Pure-engine purity: compute here, pass in.
  void household.snapshotVersion;
  const lifestyleInflation = analyzeLifestyleInflation(assumptions.householdInflation());
  const goalPostShift = detectGoalPostShift();
  // Affordability (over-committed SIPs) is a WHOLE-household property — compute the
  // surplus from the unlensed household so it matches the whole-household SIP total
  // the engine sums. Using the lensed `fire.annualSavings` here would false-fire in
  // a member-lens view (one earner's surplus vs the household's total SIPs).
  const wholeHousehold = derive(household.data, assumptions.values, {
    isFamilyView: true,
    viewingMemberId: null,
    currentFY: ui.currentFY,
  });
  const all = evaluateNudges({
    household: household.data,
    family: derivedFamilyLayer(household.data),
    annualExpenses: fire.annualExpensesToday.value,
    taxableIncome,
    fy: ui.currentFY ?? "2025-26",
    marginalSlabRate: 0.30,
    currentMonth: new Date().getMonth(),
    lifestyleInflation,
    goalPostShift,
    monthlySurplus: Math.round((wholeHousehold.annualSavings || 0) / 12),
  });
  void assumptions.values;
  return all
    .filter((n) => n.routes.includes(currentRouteName.value))
    .filter((n) => !isDismissed(n.id));
});

function colorFor(s: NudgeSeverity): string {
  if (s === "alert") return "error";
  if (s === "warning") return "warning";
  return "info";
}

function iconFor(s: NudgeSeverity): string {
  if (s === "alert") return "mdi-alert-octagon";
  if (s === "warning") return "mdi-alert";
  return "mdi-information";
}
</script>

<template>
  <div v-if="nudges.length > 0" class="nudge-stack mb-4" data-testid="nudge-stack">
    <h3 class="text-subtitle-2 font-weight-bold mb-2">Suggestions for you</h3>
    <v-card
      v-for="n in nudges"
      :key="n.id"
      :color="colorFor(n.severity)"
      variant="tonal"
      class="mb-2"
      :data-testid="`nudge-${n.kind}`"
    >
      <v-card-text>
        <div class="d-flex align-start" style="gap: 12px">
          <v-icon :icon="iconFor(n.severity)" :color="colorFor(n.severity)" />
          <div class="flex-grow-1">
            <div class="text-subtitle-2 font-weight-bold">{{ n.title }}</div>
            <div class="text-body-2">{{ n.body }}</div>
            <v-btn
              v-if="n.ctaTarget"
              :to="n.ctaTarget"
              variant="text"
              size="small"
              :color="colorFor(n.severity)"
              class="mt-2"
            >
              {{ n.ctaLabel ?? "Open" }}
              <v-icon icon="mdi-arrow-right" class="ml-1" />
            </v-btn>
          </div>
          <!-- Phase 6 Stage R — dismiss button. Persists via useDismissedNudges. -->
          <v-btn
            icon
            variant="text"
            size="small"
            :data-testid="`nudge-dismiss-${n.id}`"
            :aria-label="`Dismiss ${n.title}`"
            @click="dismiss(n.id)"
          >
            <v-icon icon="mdi-close" size="small" />
          </v-btn>
        </div>
      </v-card-text>
    </v-card>
  </div>
</template>
