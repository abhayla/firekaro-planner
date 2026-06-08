<script setup lang="ts">
// #81 Phase 3: shown on the Financial-Health screens that ARE member-lensed (Net Worth, Banking,
// Cash Flow, Emergency Fund, Health Score, Reports). When an ADULT is selected in the global
// "Viewing as" control, it makes explicit that the figures shown are THAT member's own same-scope
// slice (both sides of every ratio use the member scope — never member ÷ household). Renders
// nothing on the default "Whole household" view, and never for a dependent (they aren't selectable).
import { computed } from "vue";
import { useUiStore } from "@/stores/ui";
import { useHouseholdStore } from "@/stores/household";
import { isAdultRole } from "@/types/household";

const ui = useUiStore();
const household = useHouseholdStore();

const activeAdultName = computed(() => {
  const id = ui.viewingMemberId;
  if (!id) return null;
  const m = household.members.find((x) => x.id === id);
  return m && isAdultRole(m.role) ? m.name || "this member" : null;
});
</script>

<template>
  <v-chip
    v-if="activeAdultName"
    size="small"
    variant="tonal"
    color="primary"
    prepend-icon="mdi-account-eye-outline"
    class="member-lens-badge"
    data-testid="member-lens-badge"
  >
    Viewing {{ activeAdultName }}'s own finances
    <v-tooltip activator="parent" location="bottom">
      These figures are {{ activeAdultName }}'s own slice — every ratio uses the same (member) scope
      on both sides. Switch to "Whole household" for the family view.
    </v-tooltip>
  </v-chip>
</template>

<style scoped>
.member-lens-badge {
  font-weight: 600;
}
</style>
