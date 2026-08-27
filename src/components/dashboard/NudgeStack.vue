<script setup lang="ts">
/**
 * NudgeStack — Option-D "Suggestions for you", severity-coded: each entry renders as a
 * severity-dot row (error → warning → info, red first) with a one-line body, an optional
 * mini progress bar, and the CTA link. Engine nudges come from lib/nudge-engine (Stage E)
 * with dismissal persistence (Stage R); the relocated header chips (estate readiness +
 * stress-test failures — contract §3.5 / decision 8) render as SYNTHETIC entries with the
 * same gating logic they had as chips, non-dismissible (they are standing honesty surfaces,
 * not one-off tips).
 *
 * Severity color mapping: alert → error, warning → warning, info → info.
 */
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { useUiStore } from "@/stores/ui";
import { useFeaturesStore } from "@/stores/features";
import { useFireDerive } from "@/lib/useFireDerive";
import { derive } from "@/lib/derive";
import { evaluateNudges, type NudgeSeverity } from "@/lib/nudge-engine";
import { derivedFamilyLayer } from "@/lib/derived-records";
import { analyzeLifestyleInflation, detectGoalPostShift } from "@/lib/expense-history";
import { runStressScenarios } from "@/lib/stress-test";
import { useDismissedNudges } from "@/composables/useDismissedNudges";
import type { RouteLocationRaw } from "vue-router";

const props = defineProps<{
  /** Override the current route name for testing. */
  routeName?: string;
}>();

const route = useRoute();
const household = useHouseholdStore();
const assumptions = useAssumptionsStore();
const ui = useUiStore();
const features = useFeaturesStore();
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
  // ADR-0006: the household spending BASKET, read from the kernel (`derive().householdInflation`)
  // so there is ONE basket on screen. Correct input here — the nudge asks whether ACTUAL spend
  // growth outruns the basket the plan assumes, which is a basket question, not a CPI one.
  const lifestyleInflation = analyzeLifestyleInflation(fire.householdInflation.value);
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

// ---- Relocated header chips (contract decision 8) as synthetic severity entries ----

// A36.1/A36.2 — estate readiness (the exact chip logic from the old dashboard header):
// red-flag when total assets > ₹1 Cr with a barely-started checklist (no will yet).
const ESTATE_TOTAL = 7;
const totalEstateAssets = computed(() =>
  household.data.investments.reduce((s, i) => s + i.value, 0),
);
const estateComplete = computed(
  () => (household.data.estateChecklist ?? []).filter((e) => e.completed).length,
);
const estateRedFlag = computed(
  () => totalEstateAssets.value > 10_000_000 && estateComplete.value < 4,
);

// A27.3 — stress-test failures (chip gating preserved: feature enabled + a real FIRE
// target — gh #39: a zero-data plan "survives" vacuously).
const stressEnabled = computed(() => features.isEnabled("fire.stressTest"));
const hasFireTarget = computed(() => fire.fireNumber.value > 0);
const stressSummary = computed(() =>
  runStressScenarios({
    annualExpenses: fire.annualExpensesToday.value,
    swr: fire.effectiveSWR.value,
    expectedReturn: fire.blendedReturn.value,
    totalCorpus: fire.totalCorpus.value,
    annualIncomeTotal: fire.annualIncome.value.total,
  }).summary,
);

interface SuggestionEntry {
  id: string;
  severity: NudgeSeverity;
  title: string;
  body: string;
  ctaTarget?: RouteLocationRaw | string;
  ctaLabel?: string;
  kind: string;
  dismissible: boolean;
  /** Optional mini progress (0–100) per the mockup. */
  progress?: number;
  testid?: string;
}

const entries = computed<SuggestionEntry[]>(() => {
  const out: SuggestionEntry[] = [];

  if (estateComplete.value < ESTATE_TOTAL) {
    out.push({
      id: "synthetic-estate",
      severity: estateRedFlag.value ? "alert" : "warning",
      title: `Estate plan: ${estateComplete.value} of ${ESTATE_TOTAL} complete`,
      body: estateRedFlag.value
        ? "Your assets are past ₹1 Cr — an estate this size needs a will and the basics in place."
        : "Wills, nominees and access notes protect the plan you're building.",
      ctaTarget: "/estate-planning",
      ctaLabel: "Open estate planning",
      kind: "estate",
      dismissible: false,
      progress: (estateComplete.value / ESTATE_TOTAL) * 100,
      testid: "estate-chip",
    });
  }

  if (stressEnabled.value && hasFireTarget.value && stressSummary.value.failed > 0) {
    out.push({
      id: "synthetic-stress",
      severity: "alert",
      title: `Plan fails ${stressSummary.value.failed} of ${stressSummary.value.total} stress scenarios`,
      body: "See which shocks (healthcare, market, longevity) break the plan and what absorbs them.",
      ctaTarget: "/fire-goals/stress-test",
      ctaLabel: "Open stress test",
      kind: "stress",
      dismissible: false,
      testid: "stress-chip",
    });
  }

  for (const n of nudges.value) {
    out.push({
      id: n.id,
      severity: n.severity,
      title: n.title,
      body: n.body,
      ctaTarget: n.ctaTarget,
      ctaLabel: n.ctaLabel ?? "Open",
      kind: n.kind,
      dismissible: true,
    });
  }

  const rank: Record<NudgeSeverity, number> = { alert: 0, warning: 1, info: 2 };
  return out.sort((x, y) => rank[x.severity] - rank[y.severity]);
});

function colorFor(s: NudgeSeverity): string {
  if (s === "alert") return "error";
  if (s === "warning") return "warning";
  return "info";
}
</script>

<template>
  <v-card v-if="entries.length > 0" variant="outlined" class="nudge-stack pa-4" data-testid="nudge-stack">
    <h3 class="text-subtitle-2 font-weight-bold mb-2">Suggestions for you</h3>
    <div
      v-for="n in entries"
      :key="n.id"
      class="suggestion-row"
      :data-testid="`nudge-${n.kind}`"
    >
      <span class="suggestion-row__dot" :class="`bg-${colorFor(n.severity)}`" aria-hidden="true" />
      <div class="flex-grow-1">
        <!-- Severity is color-only on the dot — name it for screen readers (WCAG 1.4.1). -->
        <span class="d-sr-only">{{ n.severity === "alert" ? "Critical: " : n.severity === "warning" ? "Warning: " : "Info: " }}</span>
        <span class="text-body-2 font-weight-bold">{{ n.title }}</span>
        <span class="text-caption text-medium-emphasis"> — {{ n.body }}</span>
        <v-progress-linear
          v-if="n.progress != null"
          :model-value="n.progress"
          :color="colorFor(n.severity)"
          height="5"
          rounded
          class="mt-1"
          style="max-width: 220px"
          :aria-label="`${n.title} progress`"
        />
        <div v-if="n.ctaTarget">
          <!-- The synthetic entries keep the old header-chip testids (estate-chip / stress-chip)
               on their navigation control — selector continuity for the existing E2E. -->
          <v-btn
            :to="n.ctaTarget"
            variant="text"
            size="x-small"
            :color="colorFor(n.severity)"
            class="px-0 text-none"
            density="compact"
            :data-testid="n.testid"
          >
            {{ n.ctaLabel }}
            <v-icon icon="mdi-arrow-right" class="ml-1" size="x-small" />
          </v-btn>
        </div>
      </div>
      <v-btn
        v-if="n.dismissible"
        icon
        variant="text"
        size="x-small"
        :data-testid="`nudge-dismiss-${n.id}`"
        :aria-label="`Dismiss ${n.title}`"
        @click="dismiss(n.id)"
      >
        <v-icon icon="mdi-close" size="small" />
      </v-btn>
    </div>
  </v-card>
</template>

<style scoped>
.suggestion-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border-subtle);
  line-height: 1.35;
}
.suggestion-row:last-child {
  border-bottom: none;
}
.suggestion-row__dot {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  border-radius: 99px;
  margin-top: 6px;
}
</style>
