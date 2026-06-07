<script setup lang="ts">
/**
 * WithdrawalBandsCard (#obj-4) — the post-FIRE "how much can I safely withdraw this year?"
 * surface. Turns the pure {@link safeWithdrawalBands} accessor (which REUSES the existing
 * Floor/Ceiling rule) into an honest, plain-language safe range for the retiree.
 *
 * Coherence (rule 26 / #20): the corpus + SWR fed in are the headline's own
 * `fireWithdrawableCorpus` + `effectiveSWR`, evaluated in the real frame (inflation 0) — never
 * a parallel computation. For a household still accumulating, the current corpus would understate
 * the band, so we show an HONEST forward preview at the FIRE number instead of a misleading
 * small number. Decision-support, never advice.
 */
import { computed } from "vue";
import { useFireDerive } from "@/lib/useFireDerive";
import { safeWithdrawalBands } from "@/lib/decumulation";
import { formatINRCompact } from "@/lib/formatters";

const fire = useFireDerive();

const corpusNow = computed(() => fire.fireWithdrawableCorpus.value ?? 0);
const fireNumber = computed(() => fire.fireNumber.value ?? 0);
const swr = computed(() => fire.effectiveSWR.value ?? 0);
const yearsToFire = computed(() => Math.max(0, Math.round(fire.yearsToRegular.value ?? 0)));

// At/past FIRE when the withdrawable corpus meets the FIRE number. Otherwise the user is still
// accumulating — show the forward preview at the FIRE number, clearly labelled, never a
// misleadingly-low band on today's small corpus.
const atFire = computed(() => corpusNow.value > 0 && fireNumber.value > 0 && corpusNow.value >= fireNumber.value);
const isPreview = computed(() => !atFire.value && fireNumber.value > 0);

// The corpus the bands are evaluated on: the real one once at FIRE, the FIRE-number target while
// still accumulating (the honest "what it will be" preview).
const evalCorpus = computed(() => (atFire.value ? corpusNow.value : fireNumber.value));

const bands = computed(() =>
  safeWithdrawalBands({ corpus: evalCorpus.value, swr: swr.value, inflation: 0 }),
);

const plannable = computed(() => evalCorpus.value > 0 && swr.value > 0 && bands.value.suggested > 0);
// data-state reflects the ACTUAL rendered state (unplannable when there's no FIRE number yet).
const dataState = computed(() => (!plannable.value ? "unplannable" : atFire.value ? "at-fire" : "preview"));
</script>

<template>
  <v-card
    variant="outlined"
    class="bands-card pa-5 mb-4"
    data-testid="withdrawal-bands"
    :data-state="dataState"
  >
    <div class="d-flex align-center mb-3">
      <v-icon icon="mdi-cash-multiple" color="fire-green" size="26" class="mr-2" />
      <h3 class="bands-card__eyebrow flex-grow-1">Your safe withdrawal range</h3>
      <v-chip
        v-if="bands.triggered !== 'none'"
        size="small"
        :color="bands.triggered === 'floor' ? 'warning' : 'success'"
        variant="tonal"
        :data-testid="`withdrawal-bands-${bands.triggered}`"
      >
        {{ bands.triggered === "floor" ? "Floor triggered" : "Ceiling capped" }}
      </v-chip>
    </div>

    <!-- Unplannable: no FIRE number yet. -->
    <v-alert
      v-if="!plannable"
      type="info"
      variant="tonal"
      density="comfortable"
      data-testid="withdrawal-bands-unplannable"
    >
      <div class="bands-card__headline">We can't show a safe range yet.</div>
      <div class="text-body-2 mt-1">
        Add your income, expenses and investments so we can compute your FIRE number — then the safe
        withdrawal range follows from it.
      </div>
    </v-alert>

    <template v-else>
      <v-alert
        :type="atFire ? 'success' : 'info'"
        variant="tonal"
        density="comfortable"
        class="mb-3"
        data-testid="withdrawal-bands-range"
      >
        <div v-if="isPreview" class="bands-card__preview-label text-caption text-medium-emphasis mb-1">
          Preview — once you reach your FIRE number (~{{ formatINRCompact(fireNumber) }}<template
            v-if="yearsToFire > 0"
          >, about {{ yearsToFire }} {{ yearsToFire === 1 ? "year" : "years" }} away</template
          >):
        </div>
        <div class="bands-card__headline">
          Withdraw
          <span class="bands-card__band">{{ formatINRCompact(bands.floor) }}–{{ formatINRCompact(bands.ceiling) }}</span>
          {{ isPreview ? "a year" : "this year" }}
        </div>
        <div class="text-body-2 mt-1">
          Suggested draw <strong>{{ formatINRCompact(bands.suggested) }}</strong> ·
          {{ Math.round(swr * 1000) / 10 }}% of corpus.
        </div>
      </v-alert>

      <div class="bands-card__explain d-flex align-start">
        <v-icon icon="mdi-information-outline" size="18" class="mr-2 mt-1 flex-shrink-0" color="primary" />
        <span class="text-body-2 text-medium-emphasis">
          The <strong>floor</strong> is the lower guide to drop to in a down year; the
          <strong>ceiling</strong> is the most to take when the corpus runs healthy. Staying inside the
          band is what keeps the corpus lasting — it's a guide, not a rule you've set.
        </span>
      </div>
    </template>

    <p class="bands-card__disclaimer text-caption text-medium-emphasis mt-4 mb-0">
      Decision support, not advice — this shows a research-grounded safe range, never an instruction on
      what to spend.
    </p>
  </v-card>
</template>

<style scoped>
.bands-card {
  border-color: var(--border-subtle);
}
.bands-card__eyebrow {
  font-family: var(--font-display);
  font-size: var(--type-lg);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
}
.bands-card__headline {
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: var(--weight-semibold);
  line-height: 1.3;
}
.bands-card__band {
  font-family: var(--font-mono, "JetBrains Mono", monospace);
  font-variant-numeric: tabular-nums;
}
.bands-card__disclaimer {
  border-top: 1px solid var(--border-subtle);
  padding-top: var(--space-2);
}
</style>
