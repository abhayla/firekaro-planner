<script setup lang="ts">
/**
 * #138 — Plan-vs-actual variance card. Lock a plan baseline, then see the HONEST delta since:
 * the FIRE-date move DECOMPOSED into progress (corpus grew) / reality (expenses changed) / goalpost
 * (you changed an assumption) — rendered as the Option-D waterfall. The card NEVER sells an
 * assumption tweak as "progress" — when assumptions changed it says so prominently, and when the
 * attribution drivers are all-zero (the sign-mismatch guard) the waterfall renders NO bars: the
 * exact headline + the goalpost alert stand un-attributed. Rupee deltas are CPI-rebased to today.
 *
 * Option-D split of controls: the HERO hosts the one canonical "Lock this as my plan" CTA (no
 * baseline); THIS card hosts Re-lock once locked (#155: with a transient ✓ acknowledgement).
 */
import { computed, ref, onBeforeUnmount } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { useUiStore } from "@/stores/ui";
import { usePlanBaseline } from "@/composables/usePlanBaseline";
import { computePlanVariance } from "@/lib/plan-variance";
import { formatINRCompact } from "@/lib/formatters";
import PlanVarianceWaterfall from "@/components/dashboard/viz/PlanVarianceWaterfall.vue";

const h = useHouseholdStore();
const a = useAssumptionsStore();
const ui = useUiStore();
const { baseline, lockBaseline } = usePlanBaseline();

// A persisted Infinity yearsToFire JSON-round-trips to null and would fabricate a finite
// claim ((null − current)×12 → "N mo behind"). An unusable baseline renders the empty state
// (re-lock from the hero once the plan is projectable) — never a fabricated verdict.
const baselineUsable = computed(() => !!baseline.value && Number.isFinite(baseline.value.yearsToFire));

const variance = computed(() => {
  if (!baseline.value || !baselineUsable.value) return null;
  return computePlanVariance({
    baseline: baseline.value,
    household: h.data,
    currentAssumptions: a.values,
    lens: { isFamilyView: ui.isFamilyView, viewingMemberId: ui.viewingMemberId, currentFY: ui.currentFY },
    nowMs: Date.now(),
  });
});

// "4 months earlier" / "6 months later" / "on track". Positive = earlier (ahead of plan).
// Non-finite delta (current plan unprojectable) makes NO numeric claim (the H1 honesty class).
function monthsPhrase(m: number): { text: string; tone: "ahead" | "behind" | "flat" | "unknown" } {
  if (!Number.isFinite(m)) return { text: "not comparable right now — the current plan has no projectable date", tone: "unknown" };
  const months = Math.round(m);
  if (months === 0) return { text: "right on your plan", tone: "flat" };
  const mag = Math.abs(months);
  const unit = mag === 1 ? "month" : "months";
  return months > 0
    ? { text: `${mag} ${unit} earlier`, tone: "ahead" }
    : { text: `${mag} ${unit} later`, tone: "behind" };
}

const headline = computed(() => (variance.value ? monthsPhrase(variance.value.fireDateDeltaMonths) : null));

// Waterfall inputs — rounded whole-month drivers (the viz renders nothing when all-zero).
const wf = computed(() => {
  const v = variance.value;
  if (!v) return null;
  return {
    progress: v.attribution.progress,
    reality: v.attribution.reality,
    goalpost: v.attribution.goalpost,
    net: Number.isFinite(v.fireDateDeltaMonths) ? v.fireDateDeltaMonths : 0,
  };
});

// #155 — transient re-lock acknowledgement: the button flips to "✓ Re-locked" for ~2s so the
// click visibly DID something even when the variance state doesn't change (it usually resets
// to "right on your plan", which looks identical if you were already on plan).
const relockAck = ref(false);
let ackTimer: ReturnType<typeof setTimeout> | null = null;
function relock(): void {
  lockBaseline();
  relockAck.value = true;
  if (ackTimer) clearTimeout(ackTimer);
  ackTimer = setTimeout(() => (relockAck.value = false), 2000);
}
onBeforeUnmount(() => {
  if (ackTimer) clearTimeout(ackTimer);
});

// #155 — when the baseline was captured TODAY, the date alone ("10 Jun 2026") reads as a
// no-op after a re-lock; include the time of day.
const lockedOn = computed(() => {
  if (!baseline.value) return "";
  const d = new Date(baseline.value.capturedAt);
  const datePart = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const today = new Date();
  const isToday =
    d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  return isToday ? `${datePart}, ${d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}` : datePart;
});

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
  // ADR-0006: education carries weight 0 in the PERPETUAL retirement basket (spending on it ends)
  // but its 9% rate still drives the finite family-layer goals — the label must not imply otherwise.
  educationInflation: "education inflation (your goals, not your retirement basket)",
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
  <!-- Has a usable baseline → the variance view -->
  <v-card v-if="variance && headline" variant="outlined" class="pa-4" data-testid="plan-variance-card">
    <div class="d-flex align-center justify-space-between ga-2 mb-2 flex-wrap">
      <div class="d-flex align-center ga-2">
        <v-icon icon="mdi-target" color="primary" />
        <h3 class="text-subtitle-1 font-weight-bold">Vs your locked plan</h3>
      </div>
      <v-btn
        size="x-small"
        :variant="relockAck ? 'tonal' : 'outlined'"
        :color="relockAck ? 'success' : undefined"
        :prepend-icon="relockAck ? 'mdi-check' : 'mdi-lock-reset'"
        :data-testid="relockAck ? 'plan-variance-relock-ack' : 'plan-variance-relock'"
        @click="relock"
      >
        {{ relockAck ? "Re-locked" : "Re-lock" }}
      </v-btn>
    </div>

    <div
      class="text-h6 font-weight-bold mb-1"
      :class="{ 'text-success': headline.tone === 'ahead', 'text-error': headline.tone === 'behind' }"
      data-testid="plan-variance-headline"
    >
      <template v-if="headline.tone === 'flat'">Your FIRE date is {{ headline.text }}</template>
      <template v-else-if="headline.tone === 'unknown'">Your FIRE date is {{ headline.text }}</template>
      <template v-else>
        Your FIRE date is {{ headline.text }}
        <span class="text-body-2 text-medium-emphasis font-weight-regular">than when you locked this plan</span>
      </template>
    </div>

    <!-- Option-D waterfall — the drivers as columns. Renders NOTHING when attribution is
         all-zero (the honest un-attributed state; the alert below explains a goalpost move). -->
    <PlanVarianceWaterfall
      v-if="wf"
      :progress-months="wf.progress"
      :reality-months="wf.reality"
      :goalpost-months="wf.goalpost"
      :net-months="wf.net"
      data-testid="plan-variance-drivers"
    />
    <!-- Caption gate mirrors the viz's own finite-clamp render gate exactly — never a
         caption pointing at a chart that (honestly) refused to draw. -->
    <p
      v-if="wf && [wf.progress, wf.reality, wf.goalpost].some((x) => Number.isFinite(x) && Math.round(x) !== 0)"
      class="text-caption text-medium-emphasis mb-2"
    >
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

  <!-- No (usable) baseline → explainer; the ONE canonical lock CTA lives in the hero above. -->
  <v-card v-else variant="outlined" class="pa-4 text-center" data-testid="plan-variance-empty">
    <v-icon icon="mdi-target" size="40" color="grey-lighten-1" />
    <div class="text-subtitle-2 mt-2">Track yourself against your plan</div>
    <p class="text-caption text-medium-emphasis mb-1">
      Lock today's FIRE picture as your starting point — the <strong>Lock this as my plan</strong>
      button sits in the verdict panel above. Later you'll see — honestly — how much of any change is
      real progress vs higher expenses vs you changing your assumptions.
    </p>
  </v-card>
</template>
