<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { getActiveSeed } from "@/seeds";
import {
  getTourSteps,
  getTourDismissed,
  setTourDismissed,
} from "@/lib/tour-steps";
import TourStep from "./TourStep.vue";

// DEMO-ONLY: the seed-driven product tour must not run in server/authenticated
// mode (it's keyed off a demo seed; gh #36). Self-gate so any caller is safe.
const isServerMode = computed(
  () =>
    import.meta.env.VITE_USE_SERVER_ADAPTER === "on" ||
    import.meta.env.VITE_USE_SERVER_ADAPTER === "true",
);
const activeSeed = ref(getActiveSeed());
const steps = computed(() => getTourSteps(activeSeed.value));
const currentIndex = ref(0);
const visible = ref(false);

const currentStep = computed(() => steps.value[currentIndex.value]);

function start() {
  if (isServerMode.value) return;
  if (!steps.value.length) return;
  currentIndex.value = 0;
  visible.value = true;
}

function next() {
  if (currentIndex.value < steps.value.length - 1) {
    currentIndex.value++;
  } else {
    done();
  }
}

function prev() {
  if (currentIndex.value > 0) currentIndex.value--;
}

function skip() {
  visible.value = false;
  setTourDismissed(activeSeed.value);
}

function done() {
  visible.value = false;
  setTourDismissed(activeSeed.value);
}

onMounted(() => {
  // Auto-launch on first visit for non-dismissed seeds with defined tours.
  if (isServerMode.value) return;
  if (!steps.value.length) return;
  if (getTourDismissed(activeSeed.value)) return;
  // Defer one frame so the dashboard finishes hydrating before the tour
  // measures DOM rects of target selectors.
  requestAnimationFrame(() => {
    setTimeout(start, 300);
  });
});

defineExpose({ start, skip });
</script>

<template>
  <TourStep
    v-if="visible && currentStep"
    :step="currentStep"
    :index="currentIndex"
    :total="steps.length"
    @next="next"
    @prev="prev"
    @skip="skip"
    @done="done"
  />
</template>
