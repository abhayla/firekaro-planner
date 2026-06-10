<script setup lang="ts">
/**
 * #140 — Job-loss / layoff runway card. "If you stop working today or get fired — how many months could you
 * cover your FULL obligations from liquid savings?" Honest by construction: the numerator is the
 * POST-TAX net of liquidating each liquid holding (selling equity/crypto owes real tax), and the
 * burn is the full living + EMI + insurance-premium obligation (those don't pause at a layoff).
 * EPF is shown as a separate "available ~2 months after exit" line, never folded into day-1.
 */
import { computed } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { useFireDerive } from "@/lib/useFireDerive";
import { computeRunway } from "@/lib/runway";
import { accessibilityClass } from "@/lib/investment-traits";
import { toMonthly } from "@/lib/cashflow";
import { formatINRCompact } from "@/lib/formatters";
import RunwayGauge from "@/components/dashboard/viz/RunwayGauge.vue";

const household = useHouseholdStore();
const fire = useFireDerive();

// Full-obligation monthly burn — identical to the dashboard's burn: avg living spend + every
// recurring line. The recurring list ALREADY carries the auto-flowed EMI + insurance-premium
// lines (household store autoFlowEMIToRecurring + premium sync), so EMIs/premiums are included
// without double-counting.
const monthlyBurn = computed(() => {
  const recurring = household.data.expenses.recurring.reduce(
    (s, r) => s + toMonthly({ amount: r.amount, period: r.frequency }),
    0,
  );
  return household.data.expenses.avgMonthly + recurring;
});

const runway = computed(() =>
  computeRunway({
    investments: household.data.investments,
    monthlyBurn: monthlyBurn.value,
    marginalRate: fire.householdMarginalRate.value,
  }),
);

// Show only when there is genuine liquid runway to talk about (three-state empty otherwise).
const show = computed(() => runway.value.liquidNet > 0 && monthlyBurn.value > 0);

const volatilePercent = computed(() => Math.round(runway.value.volatilePortion * 100));
const hasVolatile = computed(() => runway.value.volatilePortion > 0);
const hasEsop = computed(() =>
  household.data.investments.some((i) => i.type === "ESOP" && accessibilityClass(i) === "liquid"),
);

// Gauge zone mapping — the CARD owns the thresholds (contract §3.3): ≥12mo ok, 6–12 warn, <6 bad.
const zone = computed<"ok" | "warn" | "bad">(() => {
  const m = runway.value.runwayMonths;
  if (m >= 12) return "ok";
  if (m >= 6) return "warn";
  return "bad";
});

// "≈ 16 months" with a parenthetical year breakdown once it's ≥ a year.
function fmtMonths(m: number): string {
  const months = Math.max(0, Math.round(m));
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const yrs = Math.floor(months / 12);
  const rem = months % 12;
  const yPart = `${yrs} yr${yrs === 1 ? "" : "s"}`;
  return rem === 0 ? yPart : `${yPart} ${rem} mo`;
}
</script>

<template>
  <v-card v-if="show" variant="outlined" class="pa-4 mt-4" data-testid="runway-card">
    <div class="d-flex align-center ga-2 mb-1">
      <v-icon icon="mdi-parachute-outline" color="primary" />
      <h3 class="text-subtitle-1 font-weight-bold">If you stop working today or get fired</h3>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-3">
      How long your liquid savings could cover your full obligations — living costs, EMIs and
      insurance premiums — with <strong>zero income</strong>. Post-tax, so it's what you'd actually
      keep after selling.
    </p>

    <!-- Option-D: the gauge IS the headline; the legend (right of the gauge per the mockup)
         keeps every figure the prose version showed. -->
    <div class="d-flex flex-wrap align-center ga-6 mb-3">
      <RunwayGauge
        :months="runway.runwayMonths"
        :conservative-months="runway.runwayMonthsConservative"
        :zone="zone"
        data-testid="runway-headline"
      />
      <div class="text-caption runway-legend">
        <span class="text-currency">{{ formatINRCompact(runway.liquidNet) }}</span> liquid (post-tax) ÷
        <span class="text-currency">{{ formatINRCompact(runway.monthlyBurn) }}/mo</span> burn (living + EMIs + premiums)<br />
        <span data-testid="runway-conservative">
          <v-icon icon="mdi-square" size="10" color="grey-darken-1" /> stable-only:
          <strong>≈ {{ fmtMonths(runway.runwayMonthsConservative) }}</strong>
          ({{ formatINRCompact(runway.liquidNetConservative) }} FD)
        </span>
      </div>
    </div>

    <v-alert
      v-if="hasVolatile"
      type="warning"
      variant="tonal"
      density="compact"
      class="mb-2"
      data-testid="runway-volatile-note"
    >
      {{ volatilePercent }}% of this is market-linked (equity, mutual funds, international, REIT, crypto<span
        v-if="hasEsop"
      >, ESOP</span>) — actual runway may be shorter if markets are down when you liquidate.<span v-if="hasEsop">
        Vested ESOP only; unvested grant is forfeited on exit and private-company ESOP may not be sellable.</span>
    </v-alert>

    <div
      v-if="runway.epfValue > 0"
      class="d-flex align-center ga-2 text-caption"
      data-testid="runway-epf-line"
    >
      <v-icon icon="mdi-lock-clock" size="14" />
      <span>
        + EPF ({{ formatINRCompact(runway.epfValue) }}) available ~2 months after exit →
        <strong>≈ {{ fmtMonths(runway.runwayMonthsWithEpf) }}</strong> total. Not part of the day-1
        number above.
      </span>
    </div>
  </v-card>

  <v-card v-else variant="outlined" class="pa-4 mt-4 text-center" data-testid="runway-card-empty">
    <v-icon icon="mdi-parachute-outline" size="40" color="grey-lighten-1" />
    <div class="text-subtitle-2 mt-2">No liquid runway to show yet</div>
    <div class="text-caption text-medium-emphasis">
      Add liquid investments (FD, stocks, mutual funds) to see how long you could go without income.
    </div>
  </v-card>
</template>

<style scoped>
.runway-legend {
  color: var(--text-secondary);
  line-height: 1.9;
  min-width: 240px;
  flex: 1;
}
</style>
