<script setup lang="ts">
/**
 * DiscoveryFooter — context-aware "Looking for X, Y, Z? Enable in
 * Preferences" footer that lists features disabled on the current
 * route.
 *
 * Phase 3 Stage H per docs/goals/build-firekaro-mvp-v5.md §6 Stage H.
 *
 * Mounted on every page that has gateable content; the component
 * queries the features store for disabled feature keys gating the
 * given route name and renders the disabled features' labels +
 * discoveryCopy as a single CTA row linking to /preferences#features.
 *
 * Rendered only when at least one feature is disabled on this route.
 */
import { computed } from "vue";
import { useFeaturesStore } from "@/stores/features";
import { featureRegistry } from "@/lib/features";
import { useRoute } from "vue-router";

const props = defineProps<{
  /** Vue Router route name to filter against. Defaults to current route. */
  routeName?: string;
  /**
   * Additional feature keys to surface (e.g. for sub-section gating
   * where the route itself isn't gated but content INSIDE it is).
   */
  alsoShowKeys?: string[];
}>();

const route = useRoute();
const features = useFeaturesStore();
features.hydrate();

const effectiveRouteName = computed(
  () => props.routeName ?? String(route.name ?? ""),
);

const disabledFeatures = computed(() => {
  // Route-gated features whose flag is currently OFF.
  const routeGated = featureRegistry.filter(
    (f) =>
      f.routes.includes(effectiveRouteName.value) &&
      !features.isEnabled(f.key),
  );
  // Caller-specified extras.
  const extras = (props.alsoShowKeys ?? [])
    .map((k) => featureRegistry.find((f) => f.key === k))
    .filter((f): f is (typeof featureRegistry)[number] => !!f && !features.isEnabled(f.key));
  // De-dupe.
  const seen = new Set<string>();
  return [...routeGated, ...extras].filter((f) => {
    if (seen.has(f.key)) return false;
    seen.add(f.key);
    return true;
  });
});

/**
 * Show discoveryCopy as a tooltip only when it adds information beyond the
 * label — otherwise it's noise (e.g. "Sandwich-gen Tax Nudges" / "Sandwich-gen
 * tax nudges"). Normalise punctuation + case and compare.
 */
function meaningfulCopy(label: string, copy?: string): string | null {
  if (!copy) return null;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return norm(copy) === norm(label) ? null : copy;
}
</script>

<template>
  <v-card
    v-if="disabledFeatures.length > 0"
    variant="outlined"
    class="discovery-footer mt-6 mb-2"
    data-testid="discovery-footer"
  >
    <v-card-text>
      <div class="d-flex align-start" style="gap: 16px">
        <v-icon icon="mdi-compass-outline" color="primary" size="default" class="mt-1" />
        <div class="flex-grow-1">
          <div class="text-subtitle-2 font-weight-bold mb-1">
            Looking for something else?
          </div>
          <div class="text-body-2 text-medium-emphasis mb-3">
            {{ disabledFeatures.length }}
            {{ disabledFeatures.length === 1 ? "feature is" : "features are" }}
            turned off for this view — tap one to turn it on.
          </div>
          <div class="discovery-chips">
            <v-chip
              v-for="f in disabledFeatures"
              :key="f.key"
              color="primary"
              variant="outlined"
              size="small"
              label
              link
              :to="{ name: 'preferences', hash: '#pref-section-features' }"
              :data-testid="`discovery-chip-${f.key}`"
            >
              <v-icon icon="mdi-plus" size="x-small" class="mr-1" />
              {{ f.label }}
              <v-tooltip
                v-if="meaningfulCopy(f.label, f.discoveryCopy)"
                activator="parent"
                location="top"
              >
                {{ f.discoveryCopy }}
              </v-tooltip>
            </v-chip>
          </div>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.discovery-footer {
  background: rgba(var(--v-theme-primary), 0.04);
}
.discovery-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
