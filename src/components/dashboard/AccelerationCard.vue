<script setup lang="ts">
/**
 * Acceleration card (objective 2, gh-issue #48) — "your biggest achievable wins": an opinionated,
 * RANKED list of the accelerators that move THIS household's FIRE date, biggest-years-saved first,
 * each stated as "do X → FIRE ~N years sooner" with its transparent bound. The variance-bearing
 * risk-notch shows a confidence RANGE (never a free-lunch point). Its BODY is the QN-5
 * <LeverPicker> (T-379): the same "pick your moves" card the /quick result shows, pricing each move
 * in "₹ less to find every month". Decision-support framing — never product advice.
 *
 * All math comes from the pure libs via useAcceleration(); this component only renders.
 */
import { computed } from "vue";
import { useAcceleration } from "@/composables/useAcceleration";
import WinsImpactBars, { type WinBar } from "@/components/dashboard/viz/WinsImpactBars.vue";
import LeverPicker from "@/components/quick/LeverPicker.vue";

const accel = useAcceleration();

// The card ALWAYS shows the honest, bridge-adjusted headline (never the rosier scalar corpus model) —
// a user must never see a FIRE date more optimistic than the truth (rule 31 / bug-#22, fixed 2026-06-06).
const headlineYears = computed(() => accel.headlineYears.value);
// When the accessible-money bridge (early-years liquidity) sets the date, the scalar per-lever
// "N years sooner" deltas overstate the real, liquidity-gated saving — so we drop them and caveat.
const bridgeBinding = computed(() => accel.bridgeBinding.value);
const baselineYears = computed(() => accel.baselineYears.value);
const ranked = computed(() => accel.rankedLevers.value);
const reachableLevers = computed(() => ranked.value.filter((l) => l.reachable && l.deltaYears > 0));

// Baseline must itself be reachable for any "sooner" to mean anything; otherwise the honest message
// is "build the plan first", not a fake accelerator (gh #39 empty-state class).
const baselineReachable = computed(() => Number.isFinite(headlineYears.value) && headlineYears.value > 0);

// Self-hide only when there is genuinely nothing to offer: no reachable lever AND no plannable
// baseline to save against. Otherwise always render (this is the obj-2 flagship surface).
const show = computed(() => baselineReachable.value || reachableLevers.value.length > 0);

/** Format a duration in years as a compact "X.X yrs" / "N mo" string. */
function yearsLabel(years: number): string {
  const a = Math.abs(years);
  if (a < 1) return `${Math.round(a * 12)} mo`;
  return `${a.toFixed(1)} yr${a >= 2 ? "s" : ""}`;
}
/** "≈ X.X yrs sooner" (or "later" if a perturbation would delay FIRE — honest sign). */
function soonerLabel(yearsSaved: number): string {
  if (yearsSaved <= 0) return `≈ ${yearsLabel(yearsSaved)} later`;
  return `≈ ${yearsLabel(yearsSaved)} sooner`;
}

// Option-D: ranked levers as impact bars from a common zero axis (viz/WinsImpactBars).
// Deterministic levers → solid success bar; the variance-bearing risk-notch → the striped
// [worst, best] range (both bounds labeled — the honesty device). ONLY rendered when the
// bridge is NOT the binding constraint: under bridgeBinding the scalar deltas overstate the
// liquidity-gated date (rule 31), so the plain ranked list + caveat render instead.
const winBars = computed<WinBar[]>(() =>
  reachableLevers.value.map((lever): WinBar => {
    if (lever.band) {
      return {
        label: lever.label,
        note: lever.note,
        kind: "market",
        range: [baselineYears.value - lever.band.p90Years, baselineYears.value - lever.band.p10Years],
      };
    }
    return { label: lever.label, note: lever.note, kind: "sure", deltaYears: lever.deltaYears };
  }),
);

// --- T-379 (QN-5) ---
// The fixed-amount "invest ₹X more/month" slider that used to sit here has been REPLACED by
// <LeverPicker>: a picker of concrete moves whose effect is stated in the metric a person can act
// on ("₹X less to find every month"), re-solved through derive() rather than estimated off the
// scalar corpus model. Everything ABOVE this line is retained deliberately — the bridge-binding
// caveat, the baseline-reachable guard and the years-saved "biggest win" ranking answer a
// different question ("when can I stop?") and carry the #22/rule-31 honesty history.
//
// `useAcceleration`'s `saveMoreImpact` is likewise retained (still exported, still spec'd); only
// this card's presentation of it changed.
</script>

<template>
  <v-card
    v-if="show"
    variant="outlined"
    class="accel-card pa-5"
    data-testid="acceleration-card"
  >
    <div class="d-flex align-center mb-3">
      <v-icon icon="mdi-rocket-launch-outline" color="fire-orange" size="24" class="mr-2" />
      <h3 class="accel-card__title flex-grow-1">Your biggest achievable wins</h3>
      <v-chip size="small" variant="tonal" color="fire-orange" prepend-icon="mdi-flag-checkered">
        FIRE in ~{{ yearsLabel(headlineYears) }}
      </v-chip>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-4">
      Realistic moves that pull your FIRE date closer — ranked by impact for your household. These show
      what <em>you</em> could choose; we never recommend products.
    </p>

    <!-- Bridge-limited honesty caveat: when early-years liquidity (the accessible-money bridge), not
         corpus size, sets the FIRE date, the corpus-model "N years sooner" figures overstate the real
         liquidity-gated saving — so we drop them and point the user at the binding constraint. -->
    <v-alert
      v-if="bridgeBinding"
      type="warning"
      variant="tonal"
      density="comfortable"
      class="mb-4"
      data-testid="accel-bridge-caveat"
    >
      Your FIRE date is currently set by <strong>early-years liquidity</strong> — your accessible-money
      bridge, not your corpus size. The moves below build your corpus faster, but closing the bridge gap
      (see the bridge breakdown above) is what actually moves your date.
    </v-alert>

    <!-- Ranked levers — Option-D impact bars when the scalar deltas are honest to show.
         The "N years sooner" figures are corpus-model estimates; the bars are hidden when the
         bridge is the binding constraint (they would overstate the real, liquidity-gated
         saving — rule 31), leaving the plain ranked list + the caveat above. -->
    <template v-if="reachableLevers.length">
      <WinsImpactBars v-if="!bridgeBinding" :wins="winBars" data-testid="accel-impact-bars" />
      <template v-else>
        <div
          v-for="(lever, i) in reachableLevers"
          :key="lever.key"
          class="accel-row"
          :data-testid="`accel-lever-${lever.key}`"
        >
          <div class="accel-row__rank">{{ i + 1 }}</div>
          <div class="flex-grow-1">
            <div class="text-body-1 font-weight-medium">{{ lever.label }}</div>
            <div class="text-caption text-medium-emphasis">{{ lever.note }}</div>
          </div>
        </div>
      </template>
    </template>

    <!-- Honest on-track / not-yet-applicable state -->
    <v-alert
      v-else
      type="info"
      variant="tonal"
      density="comfortable"
      class="mb-2"
      data-testid="accel-empty"
    >
      No realistic accelerators apply right now — your allocation and spending are already working hard.
      The moves below are still yours to pick.
    </v-alert>

    <!-- QN-5 picker — the concrete moves, priced in "₹ less to find every month" (re-solved
         through derive(), so stacking compounds). Replaces the old fixed-amount save-more slider. -->
    <v-divider class="my-4" />
    <LeverPicker data-testid="accel-lever-picker" />
  </v-card>
</template>

<style scoped>
.accel-card {
  border-color: rgba(var(--v-theme-fire-orange), 0.35) !important;
}
.accel-card__title {
  font-family: var(--font-display);
  font-size: var(--type-lg);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
}
.accel-row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--border-subtle);
}
.accel-row:last-of-type {
  border-bottom: none;
}
.accel-row__rank {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-full);
  background: rgba(var(--v-theme-fire-orange), 0.12);
  color: rgb(var(--v-theme-fire-orange));
  font-weight: var(--weight-bold);
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
