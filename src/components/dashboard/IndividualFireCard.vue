<script setup lang="ts">
// #81 Phase 2 — "Household vs each adult + the gap" comparison + honesty caveat. The HOUSEHOLD
// number is the primary, decision-driving figure (rendered first, emphasised). Each adult's
// STANDALONE personal FIRE is a clearly-caveated secondary view; when an adult is selected in the
// "Viewing as" filter their personal FIRE is highlighted and the caveat (decision 4) is shown
// prominently so it is never misread as "the family can stop". Self-hides when the comparison adds
// nothing (a solo adult with no dependents/unsplit gap).
import { computed } from "vue";
import { useFireDerive } from "@/lib/useFireDerive";
import { useUiStore } from "@/stores/ui";
import { formatINRCompact } from "@/lib/formatters";

const fire = useFireDerive();
const ui = useUiStore();

const adults = computed(() => fire.individualFireByMember.value);
// Show when the comparison is actually informative: 2+ adults, OR a single adult with a gap
// (dependents/unsplit costs the household funds beyond that adult). A solo adult with no gap sees
// individual ≈ household, so the card self-hides (avoids a redundant restatement).
const show = computed(() => adults.value.length >= 2 || fire.individualFireExpenseGapAnnual.value > 0);
const householdFireNumber = computed(() => fire.fireNumber.value);
// Canonical household FIRE age from the kernel — identical to the FireHero headline (no
// round-vs-ceil drift). null when FIRE is unreachable within the horizon.
const householdFireAge = computed(() => fire.householdFireAge.value);
const gapAnnual = computed(() => fire.individualFireExpenseGapAnnual.value);
const selected = computed(
  () => adults.value.find((r) => r.memberId === ui.viewingMemberId) ?? null,
);

function ageLabel(age: number | null): string {
  return age == null || !Number.isFinite(age) ? "not within horizon" : `age ${age}`;
}
</script>

<template>
  <v-card v-if="show" variant="outlined" rounded="xl" class="pa-4" data-testid="individual-fire-card">
    <div class="d-flex align-center mb-1">
      <v-icon icon="mdi-account-group-outline" color="primary" class="mr-2" />
      <span class="text-subtitle-1 font-weight-medium">Household vs individual FIRE</span>
    </div>

    <v-alert
      v-if="selected"
      type="info"
      variant="tonal"
      density="compact"
      class="mb-3 mt-1"
      data-testid="individual-fire-caveat"
    >
      <strong>{{ selected.name }}'s personal FIRE</strong> funds only their own lifestyle — it
      excludes the children and their split of the shared costs. The <strong>household FIRE</strong>
      ({{ formatINRCompact(householdFireNumber) }}<template v-if="householdFireAge != null">,
      {{ ageLabel(householdFireAge) }}</template>) decides when the family can actually stop.
    </v-alert>

    <!-- Household — the primary, decision-driving number. -->
    <div class="d-flex justify-space-between align-center py-2">
      <div>
        <div class="text-caption text-medium-emphasis">Whole household · the decision-driving number</div>
        <div class="text-h6 font-weight-bold">{{ formatINRCompact(householdFireNumber) }}</div>
      </div>
      <div class="text-right">
        <div class="text-caption text-medium-emphasis">FIRE</div>
        <div class="text-subtitle-1 font-weight-medium">{{ ageLabel(householdFireAge) }}</div>
      </div>
    </div>
    <v-divider />

    <!-- Each adult's standalone personal FIRE (secondary). -->
    <div
      v-for="r in adults"
      :key="r.memberId"
      class="d-flex justify-space-between align-center py-2 ifire-adult"
      :class="{ 'ifire-selected': r.memberId === ui.viewingMemberId }"
      :data-testid="`individual-fire-row-${r.memberId}`"
    >
      <div>
        <div class="text-body-2 font-weight-medium">
          {{ r.name }} <span class="text-caption text-medium-emphasis">· personal</span>
        </div>
        <div class="text-caption text-medium-emphasis">own lifestyle + their split of shared (excl. children)</div>
      </div>
      <div class="text-right">
        <div class="text-body-1">{{ formatINRCompact(r.individualFireNumber) }}</div>
        <div class="text-caption text-medium-emphasis">{{ ageLabel(r.individualFireAge) }}</div>
      </div>
    </div>

    <!-- The gap: what no individual view covers (children + unsplit remainder). -->
    <template v-if="gapAnnual > 0">
      <v-divider />
      <div class="d-flex justify-space-between align-center py-2" data-testid="individual-fire-gap">
        <div class="text-caption text-medium-emphasis">
          Children + shared remainder — funded by the household, in no individual view
        </div>
        <div class="text-body-2 font-weight-medium">{{ formatINRCompact(gapAnnual) }}/yr</div>
      </div>
    </template>
  </v-card>
</template>

<style scoped>
.ifire-selected {
  background: rgba(var(--v-theme-primary), 0.06);
  border-radius: 8px;
  padding-left: 8px;
  padding-right: 8px;
}
</style>
