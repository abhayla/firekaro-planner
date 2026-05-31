<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch, nextTick } from "vue";
import type { TourStepDef } from "@/lib/tour-steps";

interface Props {
  step: TourStepDef;
  index: number;
  total: number;
}
const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "next"): void;
  (e: "prev"): void;
  (e: "skip"): void;
  (e: "done"): void;
}>();

const targetRect = ref<DOMRect | null>(null);
const tooltipRef = ref<HTMLElement | null>(null);

function measureTarget() {
  const el = document.querySelector(props.step.target);
  if (!el) {
    targetRect.value = null;
    return;
  }
  el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  // Defer rect measurement to next frame so post-scroll layout settles.
  requestAnimationFrame(() => {
    const rect = el.getBoundingClientRect();
    targetRect.value = rect;
  });
}

watch(() => props.step.target, () => {
  void nextTick(measureTarget);
}, { immediate: false });

onMounted(() => {
  void nextTick(measureTarget);
  window.addEventListener("resize", measureTarget);
  window.addEventListener("scroll", measureTarget, { passive: true });
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", measureTarget);
  window.removeEventListener("scroll", measureTarget);
});

const highlightStyle = computed(() => {
  if (!targetRect.value) return { display: "none" };
  const pad = 6;
  return {
    top: `${targetRect.value.top - pad}px`,
    left: `${targetRect.value.left - pad}px`,
    width: `${targetRect.value.width + pad * 2}px`,
    height: `${targetRect.value.height + pad * 2}px`,
  };
});

const tooltipStyle = computed(() => {
  if (!targetRect.value) {
    // Fallback: center on screen
    return {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    };
  }
  const placement = props.step.placement ?? "bottom";
  const rect = targetRect.value;
  const gap = 16;
  // Tooltip width ~360px; height ~200px (approx for placement math).
  const tw = 360;
  const th = 200;
  let top = rect.bottom + gap;
  let left = rect.left + rect.width / 2 - tw / 2;
  if (placement === "top") {
    top = rect.top - th - gap;
    left = rect.left + rect.width / 2 - tw / 2;
  } else if (placement === "right") {
    top = rect.top + rect.height / 2 - th / 2;
    left = rect.right + gap;
  } else if (placement === "left") {
    top = rect.top + rect.height / 2 - th / 2;
    left = rect.left - tw - gap;
  } else if (placement === "center") {
    top = window.innerHeight / 2 - th / 2;
    left = window.innerWidth / 2 - tw / 2;
  }
  // Clamp to viewport
  top = Math.max(16, Math.min(top, window.innerHeight - th - 16));
  left = Math.max(16, Math.min(left, window.innerWidth - tw - 16));
  return { top: `${top}px`, left: `${left}px` };
});

const isLast = computed(() => props.index === props.total - 1);
const isFirst = computed(() => props.index === 0);
</script>

<template>
  <teleport to="body">
    <div class="tour-overlay" @click="emit('skip')">
      <div class="tour-highlight" :style="highlightStyle" />
      <div
        ref="tooltipRef"
        class="tour-tooltip"
        :style="tooltipStyle"
        role="dialog"
        aria-modal="true"
        :aria-label="step.title"
        @click.stop
      >
        <div class="tour-tooltip__meta">
          Step {{ index + 1 }} of {{ total }}
        </div>
        <h3 class="tour-tooltip__title font-display">{{ step.title }}</h3>
        <p class="tour-tooltip__copy">{{ step.copy }}</p>
        <div class="tour-tooltip__actions">
          <v-btn
            v-if="!isFirst"
            size="small"
            variant="text"
            @click="emit('prev')"
          >
            Back
          </v-btn>
          <v-btn
            size="small"
            variant="text"
            @click="emit('skip')"
          >
            Skip tour
          </v-btn>
          <v-spacer />
          <v-btn
            v-if="!isLast"
            size="small"
            color="primary"
            variant="flat"
            @click="emit('next')"
          >
            Next
            <v-icon icon="mdi-arrow-right" size="14" class="ml-1" />
          </v-btn>
          <v-btn
            v-else
            size="small"
            color="primary"
            variant="flat"
            @click="emit('done')"
          >
            Done
            <v-icon icon="mdi-check" size="14" class="ml-1" />
          </v-btn>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.tour-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(2px);
  animation: tourFadeIn 200ms var(--ease-out);
}
.tour-highlight {
  position: absolute;
  border-radius: var(--radius-md);
  box-shadow:
    0 0 0 4px rgba(59, 130, 246, 0.6),
    0 0 0 9999px rgba(15, 23, 42, 0.55);
  pointer-events: none;
  transition: all 220ms var(--ease-out);
}
.tour-tooltip {
  position: absolute;
  width: 360px;
  background: var(--surface-base);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
  padding: 20px;
  transition: top 220ms var(--ease-out), left 220ms var(--ease-out);
}
.tour-tooltip__meta {
  font-size: var(--type-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--text-secondary);
  font-weight: var(--weight-semibold);
  margin-bottom: 8px;
}
.tour-tooltip__title {
  font-size: var(--type-lg);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-tight);
  margin: 0 0 8px 0;
  color: var(--text-primary);
}
.tour-tooltip__copy {
  font-size: var(--type-sm);
  line-height: var(--leading-normal);
  color: var(--text-secondary);
  margin: 0 0 16px 0;
}
.tour-tooltip__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
@keyframes tourFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .tour-overlay {
    animation: none;
  }
  .tour-highlight, .tour-tooltip {
    transition: none;
  }
}
</style>
