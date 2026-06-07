<script setup lang="ts">
/**
 * SequenceRiskCard (#obj-4) — the honest decumulation sequence-of-returns warning. A bad market
 * in the FIRST retirement years is the #1 way a retiree goes broke, and a smooth-average
 * projection can never show it. This turns the pure {@link sequenceRiskWarning} (a deterministic
 * bad-early-sequence depletion stress) into a plain-language verdict.
 *
 * Coherence (rule 26 / #20): corpus / withdrawal / return / ages are the headline's own
 * (`fireWithdrawableCorpus`, `effectiveSWR`, `realBlendedReturn`, `targetRetirementAge`,
 * `planToAge`), real frame. For a still-accumulating household the check runs on the FIRE-number
 * target (the honest forward preview), never a misleading number on today's corpus.
 * Decision-support, never advice.
 */
import { computed } from "vue";
import { useFireDerive } from "@/lib/useFireDerive";
import { sequenceRiskWarning } from "@/lib/decumulation";

const fire = useFireDerive();

const corpusNow = computed(() => fire.fireWithdrawableCorpus.value ?? 0);
const fireNumber = computed(() => fire.fireNumber.value ?? 0);
const swr = computed(() => fire.effectiveSWR.value ?? 0);
const realReturn = computed(() => fire.realBlendedReturn.value ?? 0);
const fireAge = computed(() => fire.targetRetirementAge.value ?? 0);
const planToAge = computed(() => fire.planToAge.value ?? 0);

const atFire = computed(() => corpusNow.value > 0 && fireNumber.value > 0 && corpusNow.value >= fireNumber.value);
const isPreview = computed(() => !atFire.value && fireNumber.value > 0);

const evalCorpus = computed(() => (atFire.value ? corpusNow.value : fireNumber.value));
const yearsInRetirement = computed(() => Math.max(0, Math.round(planToAge.value - fireAge.value)));

const warning = computed(() =>
  sequenceRiskWarning({
    corpus: evalCorpus.value,
    annualRealWithdrawal: evalCorpus.value * swr.value,
    expectedRealReturn: realReturn.value,
    yearsInRetirement: yearsInRetirement.value,
    fireAge: fireAge.value > 0 ? fireAge.value : undefined,
  }),
);

const survives = computed(() => warning.value.survivalUnderBadSequence);
// No FIRE number / horizon yet → the lib flags `unplannable`; we render a neutral info state, NEVER
// the red "runs short" alarm (the gh-#39 empty-data false-positive class, rule 31). Mirrors the
// `plannable` guard in WithdrawalBandsCard.
const unplannable = computed(() => warning.value.unplannable);
const presentation = computed(() => {
  if (unplannable.value) {
    return {
      icon: "mdi-information-outline",
      color: "info",
      alertType: "info" as const,
      headline: "We can't stress-test your plan yet.",
    };
  }
  if (survives.value) {
    return {
      icon: "mdi-shield-check",
      color: "success",
      alertType: "success" as const,
      headline: "Your plan holds up against a bad early-retirement market.",
    };
  }
  if (warning.value.depletes) {
    return {
      icon: "mdi-alert-circle",
      color: "error",
      alertType: "error" as const,
      headline: "Your corpus runs short even under normal markets.",
    };
  }
  return {
    icon: "mdi-weather-lightning",
    color: "warning",
    alertType: "warning" as const,
    headline: "A bad market in your first retirement years is the risk to plan for.",
  };
});
</script>

<template>
  <v-card
    variant="outlined"
    class="seq-card pa-5 mb-4"
    :class="`seq-card--${presentation.color}`"
    data-testid="sequence-risk"
    :data-state="unplannable ? 'unplannable' : survives ? 'survives' : warning.depletes ? 'depletes' : 'at-risk'"
  >
    <div class="d-flex align-center mb-3">
      <v-icon :icon="presentation.icon" :color="presentation.color" size="26" class="mr-2" />
      <h3 class="seq-card__eyebrow flex-grow-1">Sequence-of-returns risk</h3>
      <v-chip
        v-if="!unplannable"
        size="small"
        :color="presentation.color"
        variant="tonal"
        :data-testid="`sequence-risk-${survives ? 'safe' : 'flag'}`"
      >
        {{ survives ? "Resilient" : "Watch early years" }}
      </v-chip>
    </div>

    <!-- Unplannable: no FIRE number yet — neutral info, never the red "runs short" alarm. -->
    <v-alert
      v-if="unplannable"
      type="info"
      variant="tonal"
      density="comfortable"
      data-testid="sequence-risk-unplannable"
    >
      <div class="seq-card__headline">We can't stress-test your plan yet.</div>
      <div class="text-body-2 mt-1">
        Add your income, expenses and investments so we can compute your FIRE number — then we can
        test it against a bad early-retirement market.
      </div>
    </v-alert>

    <template v-else>
      <div v-if="isPreview" class="seq-card__preview-label text-caption text-medium-emphasis mb-2">
        Preview — tested at your FIRE number (the corpus you're building toward).
      </div>

      <v-alert
        :type="presentation.alertType"
        variant="tonal"
        density="comfortable"
        class="mb-3"
        data-testid="sequence-risk-verdict"
      >
        <div class="seq-card__headline">{{ presentation.headline }}</div>
        <div class="text-body-2 mt-1">{{ warning.note }}</div>
      </v-alert>

      <div class="seq-card__explain d-flex align-start">
        <v-icon icon="mdi-information-outline" size="18" class="mr-2 mt-1 flex-shrink-0" color="primary" />
        <span class="text-body-2 text-medium-emphasis">
          We stress your plan against a 30% market drop in your first three retirement years — the order
          of returns, not just the average, decides whether an early crash plus withdrawals depletes the
          corpus. We never assume a smooth average, which can't fail.
        </span>
      </div>
    </template>

    <p class="seq-card__disclaimer text-caption text-medium-emphasis mt-4 mb-0">
      Decision support, not advice — an honest stress test of your plan, never a recommendation.
    </p>
  </v-card>
</template>

<style scoped>
.seq-card {
  border-color: var(--border-subtle);
}
.seq-card--success {
  border-color: rgba(var(--v-theme-success), 0.35) !important;
}
.seq-card--warning {
  border-color: rgba(var(--v-theme-warning), 0.35) !important;
}
.seq-card--error {
  border-color: rgba(var(--v-theme-error), 0.35) !important;
}
.seq-card__eyebrow {
  font-family: var(--font-display);
  font-size: var(--type-lg);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
}
.seq-card__headline {
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: var(--weight-semibold);
  line-height: 1.3;
}
.seq-card__disclaimer {
  border-top: 1px solid var(--border-subtle);
  padding-top: var(--space-2);
}
</style>
