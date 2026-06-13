<script setup lang="ts">
/**
 * Readiness page (#obj-3, /fire-goals/readiness) — the "can I pull the trigger and
 * stop working?" surface. Composes the decision-support verdict (ReadinessVerdictCard)
 * ABOVE the existing accessible-money bridge breakdown (BridgeBreakdownCard, the
 * supporting detail). Read-only — no write path (rule 25 N/A).
 */
import { computed } from "vue";
import { useHouseholdStore } from "@/stores/household";
import ReadinessVerdictCard from "@/components/dashboard/ReadinessVerdictCard.vue";
import BridgeBreakdownCard from "@/components/dashboard/BridgeBreakdownCard.vue";
import LeafPageHeader from "@/components/income-layout/LeafPageHeader.vue";
// gh #66 / D-2026-06-13-03: this readiness verdict is a WHOLE-HOUSEHOLD figure ("is the family
// safe to stop?") — it does NOT lens per member (per-member readiness is the deferred #162 work).
// The self-gating badge makes that explicit under a member lens; renders nothing on the default view.
import WholeHouseholdBadge from "@/components/shared/WholeHouseholdBadge.vue";

const household = useHouseholdStore();
const showEmpty = computed(() => household.members.length === 0);
</script>

<template>
  <v-container fluid class="py-4 px-md-6">
    <div v-if="showEmpty" class="empty-state text-center py-12" data-testid="readiness-empty">
      <v-icon icon="mdi-flag-checkered" size="72" color="fire-orange" />
      <h2 class="text-h5 font-weight-bold mt-4 mb-2">Can I retire?</h2>
      <p class="text-body-2 text-medium-emphasis mb-4">
        Add at least one earner so we can tell you whether your plan supports stopping.
      </p>
      <v-btn color="primary" variant="flat" :to="{ name: 'wizard', params: { step: 'profile' } }">
        Open the wizard
      </v-btn>
    </div>

    <template v-else>
      <LeafPageHeader
        eyebrow="FIRE · Readiness"
        title="Can I retire?"
        description="An honest read on whether your plan supports stopping work — now, or at what age — and what's setting the date. Decision support, not advice."
      />

      <WholeHouseholdBadge class="mb-4" />

      <!-- The verdict, layered on the accessible-money bridge. -->
      <ReadinessVerdictCard />

      <!-- The supporting detail: reachable vs locked, unlock timeline, shortfall,
           and every assumption with a one-tap fix. Self-hides for a fully-liquid
           household (then the verdict above stands on its own). -->
      <BridgeBreakdownCard />
    </template>
  </v-container>
</template>

<style scoped>
.empty-state {
  margin-top: 6rem;
}
</style>
