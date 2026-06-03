<script setup lang="ts">
/**
 * Bridge Breakdown card (#15 Phase F) — the honest, auditable view of the
 * accessible-money bridge: how much of the retirement corpus is spendable cash
 * at the FIRE age vs locked, WHEN the locked tranches unlock, any liquidity
 * shortfall, and — rendered uniformly from bridgeCoverage.assumptions[] — every
 * transparency disclosure with a one-tap "fix this field" affordance (principle 1).
 */
import { computed } from "vue";
import { useFireDerive } from "@/lib/useFireDerive";
import { formatINRCompact } from "@/lib/formatters";
import type { RouteLocationRaw } from "vue-router";

const fire = useFireDerive();

const bc = computed(() => fire.bridgeCoverage.value);

// Render only when the bridge was evaluated AND there is something to show
// (locked money or a disclosure) — a fully-liquid household needs no card.
const show = computed(() => {
  const b = bc.value;
  if (!b) return false;
  return b.lockedCorpus > 0 || b.unlockTimeline.length > 0 || b.assumptions.length > 0;
});

const reachable = computed(() => bc.value?.reachableCorpus ?? 0);
const locked = computed(() => bc.value?.lockedCorpus ?? 0);
const total = computed(() => reachable.value + locked.value);
const reachablePct = computed(() =>
  total.value > 0 ? Math.round((reachable.value / total.value) * 100) : 100,
);

// The engine's own corpus-only age (the exact age the bridge was tested at),
// so this never disagrees with the headline math by a rounding year.
const corpusOnlyAge = computed(() => bc.value?.corpusOnlyFireAge ?? null);

const shortfallYears = computed(() => bc.value?.shortfallYears ?? 0);

// Map an AssumptionNote.fixField to the screen where the user edits it.
function fixRoute(fixField?: string): RouteLocationRaw {
  switch (fixField) {
    case "targetRetirementAge":
    case "dateOfBirth":
      return { name: "wizard", params: { step: "profile" } };
    case "basicAnnual":
      return "/income/salary";
    case "openingYear":
    case "value":
    case "realEstateRole":
      return "/investments/overview";
    default:
      return "/preferences";
  }
}
</script>

<template>
  <v-card
    v-if="show"
    variant="outlined"
    class="bridge-card pa-5 mb-4"
    data-testid="bridge-breakdown-card"
  >
    <div class="d-flex align-center mb-3">
      <v-icon icon="mdi-key-chain-variant" color="warning" size="24" class="mr-2" />
      <h3 class="bridge-card__title flex-grow-1">Accessible-money bridge</h3>
      <v-chip
        size="small"
        :color="bc!.covered ? 'success' : 'warning'"
        variant="tonal"
        :prepend-icon="bc!.covered ? 'mdi-check-circle' : 'mdi-alert'"
      >
        {{ bc!.covered ? "Liquid runway covered" : "Liquidity gap" }}
      </v-chip>
    </div>

    <!-- Headline verdict -->
    <v-alert
      v-if="!bc!.covered"
      type="warning"
      variant="tonal"
      density="comfortable"
      class="mb-4"
      data-testid="bridge-shortfall-alert"
    >
      Your corpus is adequate<span v-if="corpusOnlyAge"> at age {{ corpusOnlyAge }}</span>, but
      <strong>{{ formatINRCompact(bc!.shortfallAmount) }}</strong> of spending is uncovered for
      <strong>{{ shortfallYears }}</strong> year{{ shortfallYears === 1 ? "" : "s" }} before locked
      savings unlock — so sustainable FIRE is <strong>age {{ bc!.effectiveFireAge }}</strong>.
    </v-alert>
    <v-alert
      v-else
      type="success"
      variant="tonal"
      density="comfortable"
      class="mb-4"
    >
      Your corpus stays liquid enough through retirement — locked savings unlock before your liquid
      runway runs out.
    </v-alert>

    <!-- Reachable vs locked -->
    <div class="mb-2 d-flex justify-space-between text-caption text-medium-emphasis">
      <span>Spendable at the FIRE age</span>
      <span>Locked / illiquid</span>
    </div>
    <v-progress-linear
      :model-value="reachablePct"
      height="18"
      rounded
      color="success"
      bg-color="warning"
      class="mb-1"
      :aria-label="`${reachablePct}% of the retirement corpus is spendable at the FIRE age`"
    />
    <div class="d-flex justify-space-between mb-4">
      <span class="text-currency font-weight-bold text-success">{{ formatINRCompact(reachable) }}</span>
      <span class="text-currency font-weight-bold text-warning">{{ formatINRCompact(locked) }}</span>
    </div>

    <!-- Unlock timeline -->
    <template v-if="bc!.unlockTimeline.length">
      <div class="section-label">When locked money unlocks</div>
      <v-list density="compact" class="bg-transparent pa-0 mb-2">
        <v-list-item
          v-for="(u, i) in bc!.unlockTimeline"
          :key="i"
          class="px-0"
          data-testid="bridge-unlock-row"
        >
          <template #prepend>
            <v-icon icon="mdi-lock-open-variant-outline" size="18" color="warning" class="mr-2" />
          </template>
          <v-list-item-title class="text-body-2">
            {{ u.label }} — unlocks at age {{ u.age }}
          </v-list-item-title>
          <template #append>
            <span class="text-currency text-body-2">{{ formatINRCompact(u.netAmount) }}</span>
          </template>
        </v-list-item>
      </v-list>
    </template>

    <!-- Bridge income -->
    <div v-if="bc!.bridgeIncomeAnnual > 0" class="text-caption text-medium-emphasis mb-3">
      <v-icon icon="mdi-cash-clock" size="14" class="mr-1" />
      Bridge income (rental + EPS + NPS pension, post-tax):
      <span class="text-currency">{{ formatINRCompact(bc!.bridgeIncomeAnnual) }}</span> / yr
    </div>

    <!-- Transparency: every assumption, each with a one-tap fix -->
    <template v-if="bc!.assumptions.length">
      <v-divider class="my-3" />
      <div class="section-label">
        What we assumed
        <span class="assumption-hint">— estimates you can correct</span>
      </div>
      <div
        v-for="(a, i) in bc!.assumptions"
        :key="a.id + i"
        class="assumption-row"
        data-testid="bridge-assumption-row"
      >
        <div class="flex-grow-1">
          <div class="text-body-2 font-weight-medium">{{ a.assumed }}</div>
          <div class="text-caption text-medium-emphasis">{{ a.why }}.</div>
          <div v-if="a.impact" class="text-caption text-medium-emphasis">{{ a.impact }}.</div>
        </div>
        <v-btn
          v-if="a.fixField"
          size="x-small"
          variant="outlined"
          color="primary"
          class="ml-2 flex-shrink-0"
          :to="fixRoute(a.fixField)"
          data-testid="bridge-assumption-fix"
        >
          Fix
        </v-btn>
      </div>
    </template>
  </v-card>
</template>

<style scoped>
.bridge-card {
  border-color: rgba(var(--v-theme-warning), 0.35) !important;
}
.bridge-card__title {
  font-family: var(--font-display);
  font-size: var(--type-lg);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
}
.section-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  font-weight: var(--weight-medium);
  color: var(--text-muted);
  margin-bottom: var(--space-2);
}
.assumption-hint {
  text-transform: none;
  letter-spacing: normal;
  font-weight: var(--weight-regular);
  color: var(--text-muted);
}
.assumption-row {
  display: flex;
  align-items: flex-start;
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--border-subtle);
}
.assumption-row:last-child {
  border-bottom: none;
}
</style>
