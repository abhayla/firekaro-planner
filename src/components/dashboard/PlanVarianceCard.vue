<script setup lang="ts">
/**
 * #138 — Plan-vs-actual variance card. Lock a plan baseline, then see the HONEST delta since:
 * the FIRE-date move DECOMPOSED into progress (corpus grew) / reality (expenses changed) / goalpost
 * (you changed an assumption). The card NEVER sells an assumption tweak as "progress" — when
 * assumptions changed it says so prominently. Rupee deltas are CPI-rebased to today's money.
 */
import { computed } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { useUiStore } from "@/stores/ui";
import { usePlanBaseline } from "@/composables/usePlanBaseline";
import { computePlanVariance } from "@/lib/plan-variance";
import { formatINRCompact } from "@/lib/formatters";

const h = useHouseholdStore();
const a = useAssumptionsStore();
const ui = useUiStore();
const { baseline, lockBaseline } = usePlanBaseline();

const variance = computed(() => {
  if (!baseline.value) return null;
  return computePlanVariance({
    baseline: baseline.value,
    household: h.data,
    currentAssumptions: a.values,
    lens: { isFamilyView: ui.isFamilyView, viewingMemberId: ui.viewingMemberId, currentFY: ui.currentFY },
    nowMs: Date.now(),
  });
});

// "4 months earlier" / "6 months later" / "on track". Positive = earlier (ahead of plan).
function monthsPhrase(m: number): { text: string; tone: "ahead" | "behind" | "flat" } {
  const months = Math.round(m);
  if (months === 0) return { text: "right on your plan", tone: "flat" };
  const mag = Math.abs(months);
  const unit = mag === 1 ? "month" : "months";
  return months > 0
    ? { text: `${mag} ${unit} earlier`, tone: "ahead" }
    : { text: `${mag} ${unit} later`, tone: "behind" };
}

const headline = computed(() => (variance.value ? monthsPhrase(variance.value.fireDateDeltaMonths) : null));

// Attribution lines — only the drivers that actually moved (rounded to a whole month).
const drivers = computed(() => {
  const v = variance.value;
  if (!v) return [];
  const line = (label: string, months: number) => {
    const r = Math.round(months);
    if (r === 0) return null;
    const sign = r > 0 ? "+" : "−";
    return { label, text: `${sign}${Math.abs(r)} mo`, positive: r > 0 };
  };
  return [
    line("corpus growth", v.attribution.progress),
    line("expense changes", v.attribution.reality),
    line("assumption changes", v.attribution.goalpost),
  ].filter((x): x is { label: string; text: string; positive: boolean } => x !== null);
});

const lockedOn = computed(() =>
  baseline.value ? new Date(baseline.value.capturedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "",
);

// Friendly labels for the changed assumption keys (raw store keys like "swrOverride" are jargon).
const ASSUMPTION_LABELS: Record<string, string> = {
  swrOverride: "safe withdrawal rate",
  inflation: "inflation",
  equityReturn: "equity returns",
  debtReturn: "debt returns",
  realEstateReturn: "real-estate returns",
  goldReturn: "gold returns",
  npsReturn: "NPS returns",
  ppfReturn: "PPF returns",
  epfReturn: "EPF returns",
  internationalReturn: "international returns",
  reitReturn: "REIT returns",
  cryptoReturn: "crypto returns",
  healthcareInflation: "healthcare inflation",
  educationInflation: "education inflation",
  housingInflation: "housing inflation",
  leanMultiplier: "lean-FIRE target",
  fatMultiplier: "fat-FIRE target",
  withdrawalRule: "withdrawal rule",
};
const changedAssumptionLabels = computed(() =>
  (variance.value?.changedAssumptionKeys ?? []).map((k) => ASSUMPTION_LABELS[k] ?? k).join(", "),
);
</script>

<template>
  <!-- Has a baseline → the variance view -->
  <v-card v-if="variance && headline" variant="outlined" class="pa-4 mt-4" data-testid="plan-variance-card">
    <div class="d-flex align-center justify-space-between ga-2 mb-2 flex-wrap">
      <div class="d-flex align-center ga-2">
        <v-icon icon="mdi-target" color="primary" />
        <h3 class="text-subtitle-1 font-weight-bold">Vs your locked plan</h3>
      </div>
      <v-btn
        size="x-small"
        variant="outlined"
        prepend-icon="mdi-lock-reset"
        data-testid="plan-variance-relock"
        @click="lockBaseline"
      >
        Re-lock
      </v-btn>
    </div>

    <div
      class="text-h6 font-weight-bold mb-1"
      :class="{ 'text-success': headline.tone === 'ahead', 'text-error': headline.tone === 'behind' }"
      data-testid="plan-variance-headline"
    >
      <template v-if="headline.tone === 'flat'">Your FIRE date is {{ headline.text }}</template>
      <template v-else>
        Your FIRE date is {{ headline.text }}
        <span class="text-body-2 text-medium-emphasis font-weight-regular">than when you locked this plan</span>
      </template>
    </div>

    <div v-if="drivers.length" class="d-flex flex-wrap ga-2 mb-1" data-testid="plan-variance-drivers">
      <v-chip
        v-for="d in drivers"
        :key="d.label"
        size="small"
        variant="tonal"
        :color="d.positive ? 'success' : 'error'"
      >
        {{ d.text }} {{ d.label }}
      </v-chip>
    </div>
    <p v-if="drivers.length" class="text-caption text-medium-emphasis mb-2">
      What moved your date (the parts add up to the move above).
    </p>

    <v-alert
      v-if="variance.assumptionsChanged"
      type="info"
      variant="tonal"
      density="compact"
      class="mb-2"
      data-testid="plan-variance-goalpost-note"
    >
      You changed your assumptions ({{ changedAssumptionLabels }}) since locking — part of
      this move is a re-definition of the goal, <strong>not</strong> progress or slippage.
    </v-alert>

    <div class="text-caption text-medium-emphasis" data-testid="plan-variance-realdelta">
      <template v-if="Math.abs(variance.netWorthDeltaReal) < 100000">
        In today's ₹, your net worth is essentially unchanged since you locked on {{ lockedOn }}.
      </template>
      <template v-else>
        In today's ₹, your net worth has changed
        <strong :class="variance.netWorthDeltaReal >= 0 ? 'text-success' : 'text-error'">
          {{ variance.netWorthDeltaReal >= 0 ? "+" : "−" }}{{ formatINRCompact(Math.abs(variance.netWorthDeltaReal)) }}
        </strong>
        (inflation-adjusted) since you locked on {{ lockedOn }}.
      </template>
    </div>
  </v-card>

  <!-- No baseline yet → the lock CTA -->
  <v-card v-else variant="outlined" class="pa-4 mt-4 text-center" data-testid="plan-variance-empty">
    <v-icon icon="mdi-target" size="40" color="grey-lighten-1" />
    <div class="text-subtitle-2 mt-2">Track yourself against your plan</div>
    <p class="text-caption text-medium-emphasis mb-3">
      Lock today's FIRE picture as your starting point. Later you'll see — honestly — how much of any
      change is real progress vs higher expenses vs you changing your assumptions.
    </p>
    <v-btn
      color="primary"
      variant="flat"
      size="small"
      prepend-icon="mdi-lock-check"
      data-testid="plan-variance-lock"
      @click="lockBaseline"
    >
      Lock this as my plan
    </v-btn>
  </v-card>
</template>
