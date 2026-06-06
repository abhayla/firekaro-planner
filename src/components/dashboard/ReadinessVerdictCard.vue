<script setup lang="ts">
/**
 * ReadinessVerdictCard (#obj-3) — the decision-support "can I pull the trigger?"
 * verdict. It turns the pure {@link computeReadiness} classifier (over the existing
 * accessible-money bridge) into an honest, plain-language answer: can this household
 * stop working now, at what age, and what is the binding constraint.
 *
 * Decision-support, NEVER advice — it states whether the plan SUPPORTS stopping and
 * what would move the date; it never tells the user to retire. The verdict is never
 * more optimistic than the FireHero headline (readyAtAge == bridge.effectiveFireAge).
 * The supporting bridge detail lives in the BridgeBreakdownCard rendered below it on
 * the readiness page.
 */
import { computed } from "vue";
import { useFireDerive } from "@/lib/useFireDerive";
import { computeReadiness, type ReadinessState } from "@/lib/readiness";
import { formatINRCompact } from "@/lib/formatters";

const fire = useFireDerive();

const verdict = computed(() =>
  computeReadiness({
    bridge: fire.bridgeCoverage.value,
    currentAge: fire.anchorAge.value,
    targetRetirementAge: fire.targetRetirementAge.value,
  }),
);

const readyAtAge = computed(() => verdict.value.readyAtAge);
const gapYears = computed(() => verdict.value.gapYears);

// Liquid (spendable-at-FIRE) vs locked, lifted straight from the bridge for the
// confirmation line — never recomputed here.
const reachable = computed(() => fire.bridgeCoverage.value?.reachableCorpus ?? 0);
const locked = computed(() => fire.bridgeCoverage.value?.lockedCorpus ?? 0);

interface StatePresentation {
  testid: string;
  icon: string;
  color: string;
  /** The v-alert severity — explicit (not cast from `color`) so a future state can't pass an unmapped type. */
  alertType: "success" | "warning" | "info";
  /** The verdict headline (phrased HERE, not in the lib). */
  headline: string;
  /** One supporting line of honest context. */
  detail: string;
  /** "What would move it" — the honest lever, never an instruction to retire. */
  lever: string;
}

const PRESENTATION: Record<ReadinessState, () => StatePresentation> = {
  "ready-now": () => ({
    testid: "readiness-ready-now",
    icon: "mdi-check-circle",
    color: "success",
    alertType: "success",
    headline: "Your plan supports stopping now.",
    detail: `Your corpus meets your FIRE number and your liquid runway covers the early years — about ${formatINRCompact(reachable.value)} is spendable at the start.`,
    lever: "This is whether the plan supports it — the decision to stop is yours.",
  }),
  "ready-at-age": () => ({
    testid: "readiness-ready-at-age",
    icon: "mdi-flag-checkered",
    color: "success",
    alertType: "success",
    headline: `Your plan supports stopping at age ${readyAtAge.value} — ${gapYears.value} ${gapYears.value === 1 ? "year" : "years"} away.`,
    detail: "You're on track to reach a sustainable FIRE by your target age on your current pace.",
    lever: "A higher savings rate, lower expenses, or stronger returns would pull the date earlier.",
  }),
  "bridge-limited": () => ({
    testid: "readiness-bridge-limited",
    icon: "mdi-key-chain-variant",
    color: "warning",
    alertType: "warning",
    headline: "Your corpus is there, but early-years liquidity sets your date.",
    detail: `Sustainable from age ${readyAtAge.value} (${gapYears.value} ${gapYears.value === 1 ? "year" : "years"} away). About ${formatINRCompact(locked.value)} is locked past the start — see the bridge below.`,
    lever: "Freeing or rebalancing locked money (PPF / NPS) would move the date earlier — saving more would not.",
  }),
  "corpus-short": () => ({
    testid: "readiness-corpus-short",
    icon: "mdi-trending-up",
    color: "info",
    alertType: "info",
    headline: `Not yet — about ${gapYears.value} ${gapYears.value === 1 ? "year" : "years"} to go at your current pace.`,
    detail: `On your current pace you reach a sustainable FIRE at age ${readyAtAge.value}.`,
    lever: "A higher savings rate, lower expenses, or stronger returns would shorten the gap.",
  }),
  unplannable: () => ({
    testid: "readiness-unplannable",
    icon: "mdi-compass-outline",
    color: "grey",
    alertType: "info",
    headline: "We can't tell you whether you can stop yet.",
    detail: "Your plan doesn't reach a FIRE number at a plannable age yet — there's no date to give.",
    lever: "Add your income, expenses and investments so we can compute your FIRE number first.",
  }),
};

const p = computed(() => PRESENTATION[verdict.value.state]());
const isUnplannable = computed(() => verdict.value.state === "unplannable");
</script>

<template>
  <v-card
    variant="outlined"
    class="readiness-card pa-5 mb-4"
    :class="`readiness-card--${p.color}`"
    data-testid="readiness-verdict"
    :data-state="verdict.state"
  >
    <div class="d-flex align-center mb-3">
      <v-icon :icon="p.icon" :color="p.color" size="26" class="mr-2" />
      <h3 class="readiness-card__eyebrow flex-grow-1">Can I pull the trigger?</h3>
      <v-chip
        v-if="verdict.bindingConstraint"
        size="small"
        :color="p.color"
        variant="tonal"
        :data-testid="`readiness-binding-${verdict.bindingConstraint}`"
      >
        {{ verdict.bindingConstraint === "liquidity" ? "Liquidity-bound" : "Corpus-bound" }}
      </v-chip>
    </div>

    <v-alert
      :type="p.alertType"
      variant="tonal"
      density="comfortable"
      class="mb-3"
      :data-testid="p.testid"
    >
      <div class="readiness-card__headline">{{ p.headline }}</div>
      <div class="text-body-2 mt-1">{{ p.detail }}</div>
    </v-alert>

    <div class="readiness-card__lever d-flex align-start">
      <v-icon
        :icon="isUnplannable ? 'mdi-arrow-right-circle-outline' : 'mdi-lightbulb-on-outline'"
        size="18"
        class="mr-2 mt-1 flex-shrink-0"
        :color="p.color === 'grey' ? 'primary' : p.color"
      />
      <span class="text-body-2 text-medium-emphasis">{{ p.lever }}</span>
    </div>

    <v-btn
      v-if="isUnplannable"
      class="mt-4"
      color="primary"
      variant="flat"
      size="small"
      prepend-icon="mdi-pencil"
      :to="{ name: 'wizard', params: { step: 'profile' } }"
      data-testid="readiness-build-plan"
    >
      Build your plan
    </v-btn>

    <p class="readiness-card__disclaimer text-caption text-medium-emphasis mt-4 mb-0">
      Decision support, not advice — this shows whether your plan supports stopping, never a
      recommendation to retire.
    </p>
  </v-card>
</template>

<style scoped>
.readiness-card {
  border-color: var(--border-subtle);
}
.readiness-card--success {
  border-color: rgba(var(--v-theme-success), 0.35) !important;
}
.readiness-card--warning {
  border-color: rgba(var(--v-theme-warning), 0.35) !important;
}
.readiness-card__eyebrow {
  font-family: var(--font-display);
  font-size: var(--type-lg);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
}
.readiness-card__headline {
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: var(--weight-semibold);
  line-height: 1.3;
}
.readiness-card__disclaimer {
  border-top: 1px solid var(--border-subtle);
  padding-top: var(--space-2);
}
</style>
