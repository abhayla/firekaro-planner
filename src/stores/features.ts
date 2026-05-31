import { defineStore } from "pinia";
import { ref, watch, computed } from "vue";
import {
  useFeatures,
  type FeatureFlagState,
  featureRegistry,
} from "@/lib/features";
import { makeAdapter } from "@/lib/storage-adapter";
import { getAuthProvider } from "@/lib/auth-provider";

// Storage now routes through @/lib/storage-adapter — namespaced by userId per ADR-0001.
const ENTITY_KEY = "features";

interface FeaturesPersistedShape {
  flags: Record<string, boolean>;
  wizardCompleted: boolean;
  userId: string;
}

/**
 * Pinia wrapper around the useFeatures composable. Adds:
 *   - storage-adapter persistence (userId-namespaced per ADR-0001)
 *   - wizardCompleted flag — gates the Wizard route (Stage F)
 *   - convenience getters for /preferences §Features section grouping
 */
export const useFeaturesStore = defineStore("features", () => {
  const auth = getAuthProvider();
  const adapter = makeAdapter(auth);
  const state = ref<FeatureFlagState>({ userId: auth.getCurrentUserId(), flags: {} });
  const wizardCompleted = ref<boolean>(false);
  const hydrated = ref<boolean>(false);

  // Compose the read API over the reactive state.
  const api = useFeatures(state);

  function hydrate() {
    if (hydrated.value) return;
    const parsed = adapter.get<Partial<FeaturesPersistedShape>>(ENTITY_KEY);
    if (parsed) {
      state.value = {
        userId: parsed.userId ?? auth.getCurrentUserId(),
        flags: parsed.flags ?? {},
      };
      wizardCompleted.value = !!parsed.wizardCompleted;
    }
    hydrated.value = true;
  }

  function persist() {
    adapter.set<FeaturesPersistedShape>(ENTITY_KEY, {
      userId: state.value.userId,
      flags: state.value.flags,
      wizardCompleted: wizardCompleted.value,
    });
  }

  watch([state, wizardCompleted], persist, { deep: true });

  function markWizardCompleted() {
    wizardCompleted.value = true;
  }

  function resetWizardAnswers() {
    wizardCompleted.value = false;
    api.resetToDefaults();
  }

  /**
   * Group features by sidebar section / questionnaire section for the
   * /preferences §Features rendering (Stage G). Keys: sidebarSection ?? '*'.
   */
  const featuresBySection = computed(() => {
    const out: Record<string, typeof featureRegistry> = {};
    for (const f of featureRegistry) {
      const key = f.sidebarSection ?? `Section ${f.questionnaireSection}`;
      out[key] = out[key] ?? [];
      out[key].push(f);
    }
    return out;
  });

  return {
    // state
    state,
    wizardCompleted,
    hydrate,
    persist,

    // feature flag API (re-exposed from useFeatures)
    flags: api.flags,
    isEnabled: api.isEnabled,
    enable: api.enable,
    disable: api.disable,
    setEnabled: api.setEnabled,
    enableAll: api.enableAll,
    resetToDefaults: api.resetToDefaults,
    disabledFeatureKeysForRoute: api.disabledFeatureKeysForRoute,

    // wizard
    markWizardCompleted,
    resetWizardAnswers,

    // grouping
    featuresBySection,
  };
});
