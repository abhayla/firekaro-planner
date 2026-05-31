<script setup lang="ts">
/**
 * Generic gating step — renders one of the 6 onboarding questionnaire
 * sections per docs/goals/build-firekaro-mvp-v5.md §6 Stage F.
 *
 * Each section is a checkbox list pulled from featureRegistry filtered by
 * questionnaireSection. The user toggles the features that apply to their
 * situation; on "Continue" the step writes the choices to useFeaturesStore.
 *
 * Every step also exposes the persistent "Skip — show me everything"
 * affordance (Principle 3 alignment — degrades to v4-faithful all-features
 * exposure when user wants to skip the questionnaire).
 */
import { computed, ref, watch } from "vue";
import { useFeaturesStore } from "@/stores/features";
import { featureRegistry, type QuestionnaireSection } from "@/lib/features";

const props = defineProps<{
  section: QuestionnaireSection;
  title: string;
  description: string;
}>();

const featuresStore = useFeaturesStore();
featuresStore.hydrate();

const sectionFeatures = computed(() =>
  featureRegistry.filter((f) => f.questionnaireSection === props.section),
);

// Local checked state — initialised from the store's current flags.
const checked = ref<Record<string, boolean>>({});

watch(
  sectionFeatures,
  (features) => {
    const out: Record<string, boolean> = {};
    for (const f of features) {
      out[f.key] = featuresStore.flags[f.key] ?? f.defaultEnabled;
    }
    checked.value = out;
  },
  { immediate: true },
);

function commit() {
  for (const [key, value] of Object.entries(checked.value)) {
    featuresStore.setEnabled(key, value);
  }
}

function skipShowAll() {
  featuresStore.enableAll();
  for (const f of sectionFeatures.value) checked.value[f.key] = true;
}

defineExpose({ commit });
</script>

<template>
  <div class="gating-step">
    <h2 class="text-h5 font-weight-bold mb-2">{{ title }}</h2>
    <p class="text-body-2 text-medium-emphasis mb-4">{{ description }}</p>

    <v-alert
      type="info"
      variant="tonal"
      density="comfortable"
      class="mb-4 skip-affordance"
      data-testid="wizard-skip-all"
    >
      <div class="d-flex align-center justify-space-between flex-wrap" style="gap: 12px">
        <div>
          <div class="font-weight-medium">Not sure? Skip — show me everything</div>
          <div class="text-caption text-medium-emphasis">
            Enables every feature so you can explore the full dashboard.
            You can disable individual items later on
            <router-link to="/preferences#features">Preferences</router-link>.
          </div>
        </div>
        <v-btn color="primary" variant="flat" size="small" @click="skipShowAll">
          Skip — show all
        </v-btn>
      </div>
    </v-alert>

    <v-card variant="outlined" class="pa-2">
      <v-list density="comfortable">
        <v-list-item v-for="f in sectionFeatures" :key="f.key">
          <template #prepend>
            <v-checkbox-btn
              v-model="checked[f.key]"
              :data-testid="`wizard-feature-${f.key}`"
            />
          </template>
          <v-list-item-title>{{ f.label }}</v-list-item-title>
          <v-list-item-subtitle class="text-wrap">
            {{ f.description }}
          </v-list-item-subtitle>
        </v-list-item>
      </v-list>
    </v-card>
  </div>
</template>

<style scoped>
.skip-affordance {
  position: sticky;
  top: 0;
  z-index: 1;
}
</style>
