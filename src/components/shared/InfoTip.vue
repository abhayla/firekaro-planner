<script setup lang="ts">
/**
 * Q7 (v3) — inline tooltip for financial-jargon terms. Renders an info-icon next to
 * its slot/text; v-tooltip shows label + explanation + formula on hover/click.
 *
 * Use:
 *   <InfoTip term="fire-number" />
 *   <InfoTip term="swr">your label override</InfoTip>
 */
import { computed } from "vue";
import { TERM_GLOSSARY, type TermKey, type GlossaryEntry } from "@/lib/glossary";

const props = withDefaults(
  defineProps<{
    term: TermKey;
    /** Override icon size. Default xx-small fits inline with body-2 text. */
    size?: "x-small" | "small" | "default";
  }>(),
  { size: "x-small" },
);

const entry = computed<GlossaryEntry>(() => TERM_GLOSSARY[props.term] as GlossaryEntry);
</script>

<template>
  <span class="info-tip d-inline-flex align-center ga-1">
    <slot>{{ entry.label }}</slot>
    <v-tooltip location="top" max-width="320" :aria-label="`More info: ${entry.label}`">
      <template #activator="{ props: tipProps }">
        <button
          type="button"
          v-bind="tipProps"
          class="info-tip__btn"
          :aria-label="`More info about ${entry.label}`"
        >
          <v-icon
            icon="mdi-information-outline"
            :size="size"
            color="grey-darken-1"
            class="info-tip__icon"
            aria-hidden="true"
          />
        </button>
      </template>
      <div class="text-body-2">
        <div class="font-weight-bold mb-1">{{ entry.label }}</div>
        <div>{{ entry.explanation }}</div>
        <div v-if="entry.formula" class="text-body-2 mt-1 font-italic">
          {{ entry.formula }}
        </div>
      </div>
    </v-tooltip>
  </span>
</template>

<style scoped>
.info-tip__btn {
  background: transparent;
  border: none;
  padding: 0;
  display: inline-flex;
  align-items: center;
  cursor: help;
  border-radius: var(--radius-xs);
}
.info-tip__btn:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: 1px;
}
.info-tip__icon {
  opacity: 0.65;
}
.info-tip__btn:hover .info-tip__icon {
  opacity: 1;
}
</style>
