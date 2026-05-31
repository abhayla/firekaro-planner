<script setup lang="ts">
import { computed, useSlots } from "vue";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton.vue";
import EmptyState from "@/components/shared/EmptyState.vue";
import ErrorRetry from "@/components/shared/ErrorRetry.vue";
import { resolvePanelRegion } from "@/lib/panel-card-region";

type HeadingLevel = 2 | 3 | 4 | 5 | 6;

/**
 * Canonical content card for the MVP screen standard (see mvp/SCREEN-STANDARD.md §5).
 * A smart container: standardized header (icon + title + eyebrow + actions) and a
 * single body region resolved in strict priority loading → error → empty → body,
 * composing the shared LoadingSkeleton / ErrorRetry / EmptyState primitives.
 */
const props = withDefaults(
  defineProps<{
    /** Header title. Omit (with no icon/eyebrow/actions) for a header-less card. */
    title?: string;
    /** Leading MDI icon in the header, e.g. "mdi-cash-multiple". */
    icon?: string;
    /** Vuetify color name for the icon. */
    iconColor?: string;
    /** Small uppercase kicker above the title. */
    eyebrow?: string;
    /** Heading element for the title, for a correct document outline (a11y). */
    headingLevel?: HeadingLevel;
    /** Show the loading skeleton instead of the body. */
    loading?: boolean;
    /** Truthy → show the error state. A string is used as the error message. */
    error?: boolean | string;
    /** Show the empty state instead of the body. */
    empty?: boolean;
    /** When set, the whole card becomes a link to this route (interactive). */
    to?: string;
    /** Loading skeleton shape. */
    loadingVariant?: "card" | "list";
    loadingRows?: number;
    /** EmptyState pass-through (slot #empty overrides). */
    emptyIcon?: string;
    emptyTitle?: string;
    emptyCopy?: string;
    emptyCtaLabel?: string;
    /** When set, the empty-state CTA navigates here (EmptyState handles it). */
    emptyCtaRoute?: string;
    /** ErrorRetry pass-through (slot #error overrides). */
    errorTitle?: string;
    errorRetryLabel?: string;
  }>(),
  {
    headingLevel: 3,
    loading: false,
    error: false,
    empty: false,
    loadingVariant: "list",
    loadingRows: 3,
  },
);

defineEmits<{
  (e: "retry"): void;
  (e: "cta"): void;
}>();

const slots = useSlots();

const headingTag = computed(() => `h${props.headingLevel}` as `h${HeadingLevel}`);
const hasHeader = computed(
  () => !!(props.title || props.icon || props.eyebrow || slots.actions),
);
const errorMessage = computed(() =>
  typeof props.error === "string" && props.error ? props.error : undefined,
);
const region = computed(() =>
  resolvePanelRegion({ loading: props.loading, error: props.error, empty: props.empty }),
);
</script>

<template>
  <v-card
    variant="outlined"
    class="panel-card pa-4"
    :class="{ 'panel-card--interactive': !!to }"
    :to="to || undefined"
  >
    <div v-if="hasHeader" class="panel-card__head">
      <v-icon v-if="icon" :icon="icon" :color="iconColor" class="panel-card__icon" />
      <div class="panel-card__titles">
        <div v-if="eyebrow" class="panel-card__eyebrow">{{ eyebrow }}</div>
        <component :is="headingTag" v-if="title" class="panel-card__title">{{ title }}</component>
      </div>
      <div v-if="slots.actions" class="panel-card__actions">
        <slot name="actions" />
      </div>
    </div>

    <div class="panel-card__body" :aria-busy="region === 'loading' || undefined">
      <slot v-if="region === 'loading'" name="loading">
        <LoadingSkeleton :variant="loadingVariant" :rows="loadingRows" />
      </slot>

      <slot v-else-if="region === 'error'" name="error">
        <ErrorRetry
          :title="errorTitle"
          :message="errorMessage"
          :retry-label="errorRetryLabel"
          @retry="$emit('retry')"
        />
      </slot>

      <slot v-else-if="region === 'empty'" name="empty">
        <EmptyState
          :icon="emptyIcon"
          :title="emptyTitle"
          :copy="emptyCopy"
          :cta-label="emptyCtaLabel"
          :cta-route="emptyCtaRoute"
          @cta="$emit('cta')"
        />
      </slot>

      <slot v-else />
    </div>
  </v-card>
</template>

<style scoped>
.panel-card {
  border-radius: var(--radius-md);
}
.panel-card--interactive {
  cursor: pointer;
  transition: box-shadow 150ms ease, border-color 150ms ease, transform 150ms ease;
}
.panel-card--interactive:hover {
  box-shadow: var(--shadow-md);
  border-color: rgba(var(--v-theme-primary), 0.4);
  transform: translateY(-1px);
}
@media (prefers-reduced-motion: reduce) {
  .panel-card--interactive {
    transition: none;
  }
  .panel-card--interactive:hover {
    transform: none;
  }
}

.panel-card__head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 14px;
}
.panel-card__icon {
  margin-top: 2px;
}
.panel-card__titles {
  flex: 1 1 auto;
  min-width: 0;
}
.panel-card__eyebrow {
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.5);
  margin-bottom: 2px;
}
.panel-card__title {
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1.3;
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.92);
}
.panel-card__actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
