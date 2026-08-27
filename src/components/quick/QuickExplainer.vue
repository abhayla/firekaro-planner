<script setup lang="ts">
/**
 * T-378 (QN-4) — "why is the number so big?" + "how we got this", rendered from LIVE kernel
 * outputs. Design SSOT: docs/design/2026-08-27-quick-number-gap-hero/option-c-merged.html.
 *
 * Store-driven on purpose (no props): the same component renders on the `/quick` result AND
 * collapsed inside the dashboard hero, and both must show the SAME numbers as the hero beside them.
 * Every figure comes from `useFireDerive()` / `required-contribution.ts` — nothing is re-computed
 * here (contract section 5), which is what makes the explainer safe to trust.
 */
import { computed } from "vue";
import { useFireDerive } from "@/lib/useFireDerive";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { useUiStore } from "@/stores/ui";
import {
  assumptionsLine,
  howWeGotThis,
  whySoBigBullets,
  type ExplainerInput,
} from "@/lib/quick-number-copy";

withDefaults(defineProps<{ dense?: boolean }>(), { dense: false });

const fire = useFireDerive();
const h = useHouseholdStore();
const a = useAssumptionsStore();
const ui = useUiStore();

const req = computed(() => fire.requiredContribution.value);

/** Today-rupee sum of every planned goal — the same lines T-376 made count toward the number. */
const plannedGoalsLumpToday = computed(() =>
  h.data.expenses.plannedFuture.reduce((s, p) => s + (p.todayAmount ?? 0), 0),
);

const input = computed<ExplainerInput>(() => ({
  // NET of post-tax NPS annuity income — the base the kernel actually capitalises.
  annualExpensesToday: req.value.netAnnualExpensesReal,
  baseCorpus: req.value.needBaseReal,
  swrUsed: req.value.swrUsed,
  targetAge: fire.heroTargetAge.value,
  planToAge: fire.planToAge.value,
  plannedGoalsLumpToday: plannedGoalsLumpToday.value,
  // The two components an earlier draft left out — without them the four steps explained only
  // ~83% of the headline they sit beside (code-review H5 / FinTech HIGH 7).
  // From the AT-TARGET solver run, never the stored-target one — otherwise dragging the hero
  // slider recomputes step 1's SWR while steps 2 and 3 stay pinned to the old age, and the five
  // steps stop summing to the headline six inches above them (blind verification finding 2).
  plannedGoalsCorpus: req.value.needPlannedGoalsReal,
  healthcareReservation: req.value.needHealthcareReservationReal,
  currentCorpus: fire.totalCorpus.value,
  monthlyContributionReal: req.value.currentMonthlyReal,
  expectedReturn: fire.blendedReturn.value,
  // ADR-0006 — two DIFFERENT rates, and the copy names both: general CPI is only the display
  // deflator; the household basket is what the target itself grows at. Both come from the kernel.
  inflation: a.values.inflation,
  householdInflation: fire.householdInflation.value,
  yearsToTarget: req.value.yearsToTarget,
  haveAtTargetReal: req.value.haveAtTargetReal,
  needReal: req.value.needReal,
  needNominal: req.value.needNominal,
  targetYear: new Date().getFullYear() + req.value.yearsToTarget,
  guess: ui.quick?.guess,
}));

// Rule 31: with no FIRE target there is nothing honest to explain — make NO claim rather than
// narrating a story around zeroes.
const hasTarget = computed(() => req.value.hasTarget && req.value.needReal > 0);
const bullets = computed(() => whySoBigBullets(input.value));
const steps = computed(() => howWeGotThis(input.value));
const assumptions = computed(() => assumptionsLine(input.value));
</script>

<template>
  <div v-if="hasTarget" class="quick-explainer" data-testid="quick-explainer">
    <v-card variant="outlined" :class="dense ? 'pa-4' : 'pa-6'" class="mb-4">
      <h3 class="text-subtitle-1 font-weight-bold font-display mb-3">
        Why is the number so big?
      </h3>
      <ul class="quick-explainer__list" data-testid="quick-why-list">
        <li v-for="(line, i) in bullets" :key="i" class="text-body-2 mb-2">{{ line }}</li>
      </ul>
    </v-card>

    <v-card variant="outlined" :class="dense ? 'pa-4' : 'pa-6'">
      <h3 class="text-subtitle-1 font-weight-bold font-display mb-3">
        How we got this — no magic
      </h3>
      <ol class="quick-explainer__list" data-testid="quick-steps-list">
        <li v-for="(line, i) in steps" :key="i" class="text-body-2 mb-2">{{ line }}</li>
      </ol>
      <p class="text-caption text-medium-emphasis mt-3" data-testid="quick-assumptions">
        {{ assumptions }}
      </p>
      <RouterLink class="text-caption" to="/preferences#pref-section-assumptions">
        Change any assumption in the full planner
      </RouterLink>
    </v-card>
  </div>
</template>

<style scoped>
.quick-explainer__list {
  padding-left: 1.1rem;
}
.quick-explainer__list li {
  line-height: 1.5;
}
</style>
