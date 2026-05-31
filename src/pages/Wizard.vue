<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useHouseholdStore } from "@/stores/household";
import { useFeaturesStore } from "@/stores/features";
import ProfileStep from "@/components/wizard/ProfileStep.vue";
import GatingStep from "@/components/wizard/GatingStep.vue";
import { GATING_STEPS } from "@/components/wizard/GatingSteps";

// Phase 3 Stage F — replace v4 intake steps with the 6-step gating
// questionnaire per docs/goals/build-firekaro-mvp-v5.md §6 Stage F.
// Profile is preserved (essential identity); the 5 v4 intake steps
// (income/expenses/investments/liabilities/insurance) move to the
// per-section dashboard surfaces in Phase 4 — data entry happens via
// section "Add your data" CTAs, not in the wizard.
//
// The unused intake components stay in src/components/wizard/ for the
// possible future "first-run intake" mode (deferred MVP-2+); no harm
// from their unused presence.
const STEPS = [
  { key: "profile", label: "Profile", required: true, component: ProfileStep, isGating: false },
  ...GATING_STEPS.map((g) => ({
    key: g.key,
    label: g.label,
    required: false,
    component: GatingStep,
    isGating: true,
    section: g.section,
    title: g.title,
    description: g.description,
  })),
] as const;

const route = useRoute();
const router = useRouter();
const household = useHouseholdStore();
const featuresStore = useFeaturesStore();
household.hydrate();
featuresStore.hydrate();

// Ref to currently-rendered child component so we can call its commit()
// when the user advances past a gating step.
const currentStepRef = ref<{ commit?: () => void } | null>(null);

const currentStepKey = computed(() => String(route.params.step ?? "profile"));
const currentIdx = computed(() => Math.max(0, STEPS.findIndex((s) => s.key === currentStepKey.value)));
const currentStep = computed(() => STEPS[currentIdx.value] ?? STEPS[0]);

// Props passed to the currently-rendered step component. Gating steps need
// section + title + description; profile takes no props. Computed here
// (not inline in template) because Vue SFC parser doesn't handle inline
// `as` type casts well with multi-line v-bind.
const currentStepProps = computed(() => {
  const step = currentStep.value;
  if (!step.isGating) return {};
  const gating = step as {
    section: 1 | 2 | 3 | 4 | 5 | 6;
    title: string;
    description: string;
  };
  return {
    section: gating.section,
    title: gating.title,
    description: gating.description,
  };
});

function go(idx: number) {
  if (idx < 0 || idx >= STEPS.length) return;
  router.push({ name: "wizard", params: { step: STEPS[idx].key } });
}

function onNext() {
  if (currentStep.value.key === "profile") {
    if (!household.profileComplete) return; // ProfileStep marks complete on save
  }
  // Gating steps expose a commit() method via defineExpose — call it to
  // persist the user's checkbox choices into the features store before
  // advancing.
  if (currentStep.value.isGating) {
    currentStepRef.value?.commit?.();
  }
  if (currentIdx.value === STEPS.length - 1) {
    household.markWizardComplete();
    featuresStore.markWizardCompleted();
    router.push({ name: "fire-dashboard" });
    return;
  }
  go(currentIdx.value + 1);
}

function onBack() {
  if (currentIdx.value === 0) {
    router.push({ name: "splash" });
    return;
  }
  go(currentIdx.value - 1);
}

function onSkip() {
  // Profile is required (no skip); for others, advance without saving.
  if (currentStep.value.required) return;
  if (currentIdx.value === STEPS.length - 1) {
    household.markWizardComplete();
    router.push({ name: "fire-dashboard" });
    return;
  }
  go(currentIdx.value + 1);
}

function exitToDashboard() {
  if (household.profileComplete) {
    household.markWizardComplete();
    router.push({ name: "fire-dashboard" });
  }
}

const canSkip = computed(() => !currentStep.value.required);
const isLast = computed(() => currentIdx.value === STEPS.length - 1);

const savedLabel = computed(() => {
  if (!household.lastSavedAt) return "";
  const ms = Date.now() - household.lastSavedAt;
  if (ms < 5_000) return "just now";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  const d = new Date(household.lastSavedAt);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
});
</script>

<template>
  <v-container class="wizard-container py-6" fluid>
    <v-row justify="center">
      <v-col cols="12" md="10" lg="8">
        <!-- Header -->
        <div class="d-flex align-center justify-space-between mb-2">
          <div>
            <span class="text-overline text-medium-emphasis">
              Step {{ currentIdx + 1 }} of {{ STEPS.length }}
            </span>
            <h1 class="text-h4 font-weight-bold font-display mb-0">{{ currentStep.label }}</h1>
          </div>
          <div class="d-flex align-center ga-2">
            <span
              v-if="household.lastSavedAt"
              class="text-caption text-success"
            >
              <v-icon icon="mdi-check-circle" size="x-small" class="mr-1" />
              Saved {{ savedLabel }}
            </span>
            <v-btn
              v-if="household.profileComplete"
              variant="text"
              size="small"
              @click="exitToDashboard"
            >
              <v-icon icon="mdi-view-dashboard" class="mr-1" />
              Go to dashboard
            </v-btn>
          </div>
        </div>

        <!-- Progress dots -->
        <div class="progress-dots d-flex align-center mb-6">
          <template v-for="(s, idx) in STEPS" :key="s.key">
            <div
              :class="[
                'dot',
                idx === currentIdx ? 'active' : '',
                idx < currentIdx ? 'done' : '',
              ]"
              @click="go(idx)"
              :title="s.label"
            />
            <div v-if="idx < STEPS.length - 1" class="dot-bar" :class="{ 'bar-done': idx < currentIdx }" />
          </template>
        </div>

        <!-- Step content -->
        <v-card variant="outlined" class="pa-6 mb-4">
          <component
            :is="currentStep.component"
            ref="currentStepRef"
            v-bind="currentStepProps"
          />
        </v-card>

        <!-- Bottom nav -->
        <div class="d-flex justify-space-between align-center">
          <v-btn variant="outlined" @click="onBack">
            <v-icon icon="mdi-arrow-left" class="mr-1" />
            Back
          </v-btn>
          <div class="d-flex ga-2">
            <v-btn v-if="canSkip" variant="text" @click="onSkip">
              Skip for now
            </v-btn>
            <v-btn color="primary" variant="flat" @click="onNext">
              {{ isLast ? "Finish & view dashboard" : "Next" }}
              <v-icon :icon="isLast ? 'mdi-check' : 'mdi-arrow-right'" class="ml-1" />
            </v-btn>
          </div>
        </div>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.wizard-container {
  min-height: 100vh;
}
.progress-dots {
  user-select: none;
}
.dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: rgba(var(--v-theme-on-surface), 0.18);
  cursor: pointer;
  transition: background 120ms ease, transform 120ms ease;
  flex-shrink: 0;
}
.dot.active {
  background: rgb(var(--v-theme-primary));
  transform: scale(1.2);
}
.dot.done {
  background: rgb(var(--v-theme-success));
}
.dot-bar {
  flex: 1;
  height: 2px;
  margin: 0 6px;
  background: rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 1px;
}
.dot-bar.bar-done {
  background: rgb(var(--v-theme-success));
}
</style>
