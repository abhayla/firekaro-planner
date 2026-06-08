<script setup lang="ts">
// #81 Phase 1 — the reusable expense owner picker. Rendered on the recurring + planned
// expense forms so an itemised cost can be attributed to a member / the shared Household /
// the children. Hidden entirely for a solo household (no one to attribute to). The option
// list comes from the canonical buildExpenseOwnerOptions() — never re-built inline.
import { computed } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { buildExpenseOwnerOptions, EXPENSE_OWNER_HOUSEHOLD } from "@/lib/expense-attribution";

const props = defineProps<{ modelValue: string | undefined; density?: "compact" | "comfortable" }>();
const emit = defineEmits<{ (e: "update:modelValue", v: string): void }>();

const household = useHouseholdStore();
const isSolo = computed(() => household.data.members.length <= 1);
const options = computed(() => buildExpenseOwnerOptions(household.data.members));
const selected = computed({
  // Coerce an absent OR stale (since-deleted member) owner id back to "Household" so the
  // picker never renders blank and a save can't persist an orphaned id.
  get: () => {
    const v = props.modelValue ?? EXPENSE_OWNER_HOUSEHOLD;
    return options.value.some((o) => o.value === v) ? v : EXPENSE_OWNER_HOUSEHOLD;
  },
  set: (v: string) => emit("update:modelValue", v),
});
</script>

<template>
  <v-select
    v-if="!isSolo"
    v-model="selected"
    :items="options"
    item-title="label"
    item-value="value"
    label="Attribute to"
    :density="density ?? 'compact'"
    prepend-inner-icon="mdi-account-multiple-outline"
    hint="Whose cost this is — used only for the per-member view; the household total is unchanged."
    persistent-hint
    data-testid="expense-owner-select"
  />
</template>
