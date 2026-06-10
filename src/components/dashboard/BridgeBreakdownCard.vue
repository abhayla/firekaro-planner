<script setup lang="ts">
/**
 * Bridge Breakdown card (#15 Phase F) — the honest, auditable view of the
 * accessible-money bridge: how much of the retirement corpus is spendable cash
 * at the FIRE age vs locked, WHEN the locked tranches unlock, any liquidity
 * shortfall, and — rendered uniformly from bridgeCoverage.assumptions[] — every
 * transparency disclosure with a one-tap "fix this field" affordance (principle 1).
 */
import { computed, ref } from "vue";
import { useFireDerive } from "@/lib/useFireDerive";
import { formatINRCompact } from "@/lib/formatters";
import type { RouteLocationRaw } from "vue-router";
import BridgeUnlockTimeline from "@/components/dashboard/viz/BridgeUnlockTimeline.vue";

// #74 + #76: one shared card, two presentations. `compact` (Dashboard) keeps the honest
// bridge headline but drops the unlock-timeline + assumptions wall and links to Readiness;
// `full` (Readiness, default) keeps everything, with the assumptions block collapsible.
const props = withDefaults(defineProps<{ variant?: "full" | "compact" }>(), {
  variant: "full",
});
const isCompact = computed(() => props.variant === "compact");

// #74: "What we assumed" is collapsible on the full card — default COLLAPSED, with the
// estimate count in the header so the honesty caveats stay discoverable. Local-only state
// (YAGNI — no ui-store persistence; the count keeps it discoverable when collapsed).
const assumptionsExpanded = ref(false);

const fire = useFireDerive();

// #17 M1: end an engine-owned note with a period ONLY if it doesn't already end in
// terminal punctuation — a hard-coded template "." renders "text.." / "text)." for any
// note ending in "." or ")". Robust without auditing every AssumptionNote string.
const withPeriod = (s: string) => (/[.!?)]\s*$/.test(s) ? s : `${s}.`);

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
// Zero-corpus → 0% spendable, NOT 100%: an empty pot is not "fully reachable".
// Defaulting to 100 would paint an optimistic all-green bar for a no-money state.
const reachablePct = computed(() =>
  total.value > 0 ? Math.round((reachable.value / total.value) * 100) : 0,
);

// The engine's own corpus-only age (the exact age the bridge was tested at),
// so this never disagrees with the headline math by a rounding year.
const corpusOnlyAge = computed(() => bc.value?.corpusOnlyFireAge ?? null);

// Option-D unlock-timeline viz inputs. The dominant "locked till" age = the earliest unlock
// event (EPF/PPF/NPS converge on 60 for the urban-salaried accumulator); default 60 when the
// timeline is empty but locked money exists.
const lockedUntilAge = computed(() => {
  const ages = (bc.value?.unlockTimeline ?? []).map((u) => u.age).filter((a): a is number => Number.isFinite(a));
  return ages.length ? Math.min(...ages) : 60;
});

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
    class="bridge-card pa-5"
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
      density="compact"
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
      density="compact"
      class="mb-4"
    >
      Your corpus stays liquid enough through retirement — locked savings unlock before your liquid
      runway runs out.
    </v-alert>

    <!-- Reachable vs locked — Option-D unlock-timeline bar (amounts live in the segment
         labels; the SVG's own role="img" aria-label carries the accessible name). -->
    <div class="mb-4">
      <BridgeUnlockTimeline
        :spendable="reachable"
        :locked="locked"
        :bridge-income-per-year="bc!.bridgeIncomeAnnual"
        :fire-age="bc!.effectiveFireAge ?? null"
        :locked-until-age="lockedUntilAge"
        data-testid="bridge-unlock-viz"
      />
    </div>

    <!-- Unlock timeline (full only — dropped on the compact dashboard card) -->
    <template v-if="!isCompact && bc!.unlockTimeline.length">
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

    <!-- #74 Transparency (full only): collapsible "What we assumed", default-collapsed.
         The estimate COUNT stays in the header so the honesty caveats remain discoverable
         even while the per-holding rows are tucked away. -->
    <template v-if="!isCompact && bc!.assumptions.length">
      <v-divider class="my-3" />
      <button
        type="button"
        class="section-label assumptions-toggle"
        :aria-expanded="assumptionsExpanded"
        aria-controls="bridge-assumptions-region"
        data-testid="bridge-assumptions-toggle"
        @click="assumptionsExpanded = !assumptionsExpanded"
      >
        <span>
          What we assumed
          <span class="assumption-hint">
            — {{ bc!.assumptions.length }} estimate{{ bc!.assumptions.length === 1 ? "" : "s" }} you can correct
          </span>
        </span>
        <v-icon
          :icon="assumptionsExpanded ? 'mdi-chevron-up' : 'mdi-chevron-down'"
          size="18"
          class="assumptions-chevron"
          aria-hidden="true"
        />
      </button>
      <v-expand-transition>
        <div v-if="assumptionsExpanded" id="bridge-assumptions-region">
          <div
            v-for="(a, i) in bc!.assumptions"
            :key="a.id + i"
            class="assumption-row"
            data-testid="bridge-assumption-row"
          >
            <div class="flex-grow-1">
              <div class="text-body-2 font-weight-medium">{{ a.assumed }}</div>
              <div class="text-caption text-medium-emphasis">{{ withPeriod(a.why) }}</div>
              <div v-if="a.impact" class="text-caption text-medium-emphasis">{{ withPeriod(a.impact) }}</div>
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
        </div>
      </v-expand-transition>
    </template>

    <!-- #76 Compact (Dashboard): the per-holding wall lives on Readiness (the "can I stop?"
         decision home). Link there so the honesty caveats stay one click away. -->
    <template v-if="isCompact && bc!.assumptions.length">
      <v-divider class="my-3" />
      <v-btn
        variant="text"
        color="primary"
        size="small"
        class="px-0 text-none"
        prepend-icon="mdi-information-outline"
        append-icon="mdi-arrow-right"
        :to="{ name: 'fire-readiness' }"
        data-testid="bridge-see-assumptions-link"
      >
        See what we assumed on Readiness
      </v-btn>
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
/* #74 — the "What we assumed" header is a native <button> toggle (keyboard-operable by
   default), styled to read like the section label but with a chevron on the right. */
.assumptions-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  background: none;
  border: none;
  /* .section-label already supplies the bottom margin — no extra padding, so the
     toggle's vertical rhythm matches the other section labels. */
  padding: 0;
  text-align: left;
  cursor: pointer;
}
.assumptions-toggle:focus-visible {
  outline: 2px solid rgba(var(--v-theme-primary), 0.6);
  outline-offset: 2px;
  border-radius: 2px;
}
.assumptions-chevron {
  color: var(--text-muted);
  flex-shrink: 0;
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
