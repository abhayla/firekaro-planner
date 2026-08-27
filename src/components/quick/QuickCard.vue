<script setup lang="ts">
/**
 * T-378 (QN-1) — the shell every one of the ten express-path cards renders inside: progress dots,
 * the question, the hint, the answer slot, and the back/next pair. Design SSOT:
 * docs/design/2026-08-27-quick-number-gap-hero/option-c-merged.html.
 */
defineProps<{
  question: string;
  hint: string;
  step: number;
  total: number;
  isLast: boolean;
}>();

defineEmits<{ (e: "next"): void; (e: "back"): void }>();
</script>

<template>
  <div class="quick-card">
    <div class="quick-card__dots" role="progressbar" :aria-valuenow="step + 1" :aria-valuemin="1"
      :aria-valuemax="total" :aria-label="`Question ${step + 1} of ${total}`">
      <i v-for="j in total" :key="j" :class="{ on: j - 1 <= step }" />
    </div>

    <v-card variant="outlined" class="pa-6">
      <h2 class="text-h6 font-weight-bold font-display mb-1" data-testid="quick-question">
        {{ question }}
      </h2>
      <p class="text-body-2 text-medium-emphasis mb-4" data-testid="quick-hint">{{ hint }}</p>
      <slot />
    </v-card>

    <div class="quick-card__nav mt-4">
      <!-- Back on the first card returns to the splash, so it is never disabled. -->
      <v-btn variant="outlined" data-testid="quick-back" @click="$emit('back')">
        <v-icon icon="mdi-arrow-left" class="mr-1" /> Back
      </v-btn>
      <v-btn color="fire-orange" variant="flat" data-testid="quick-next" @click="$emit('next')">
        {{ isLast ? "See my number" : "Next" }}
        <v-icon icon="mdi-arrow-right" class="ml-1" />
      </v-btn>
    </div>
  </div>
</template>

<style scoped>
.quick-card__dots {
  display: flex;
  gap: 6px;
  margin-bottom: 14px;
}
.quick-card__dots i {
  height: 4px;
  flex: 1;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.12);
  transition: background 0.2s ease;
}
.quick-card__dots i.on {
  background: rgb(var(--v-theme-fire-orange));
}
.quick-card__nav {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
</style>
