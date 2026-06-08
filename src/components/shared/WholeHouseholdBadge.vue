<script setup lang="ts">
// gh #66: shown on the HOUSEHOLD-scoped screens (expenses, financial-health, fire-goals) when a
// member is selected in the global "Viewing as" control. These screens are intentionally NOT lensed
// — expenses have no owner, and FIRE/adequacy is inherently a whole-household figure (the #22/#23
// honesty guardrail). The badge makes that explicit so the user never mistakes an unchanged
// household figure for a member-scoped one. It renders nothing on the default ("Whole household")
// view — only when a specific member is active.
import { computed } from "vue";
import { useUiStore } from "@/stores/ui";
import { useHouseholdStore } from "@/stores/household";

const ui = useUiStore();
const household = useHouseholdStore();

const activeMemberName = computed(() => {
  if (household.isSolo || ui.viewingMemberId == null) return null;
  return household.members.find((m) => m.id === ui.viewingMemberId)?.name || "this member";
});
</script>

<template>
  <v-chip
    v-if="activeMemberName"
    size="small"
    variant="tonal"
    color="info"
    prepend-icon="mdi-home-account"
    class="whole-household-badge"
    data-testid="whole-household-badge"
  >
    Whole household
    <v-tooltip activator="parent" location="bottom">
      This is a whole-household figure — it does not change when you view {{ activeMemberName }}.
      FIRE, expenses and financial health are shared across the household.
    </v-tooltip>
  </v-chip>
</template>

<style scoped>
.whole-household-badge {
  font-weight: 600;
}
</style>
