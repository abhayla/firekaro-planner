<script setup lang="ts">
/**
 * LifecycleDigestCard — the in-app "Since you were away" digest.
 *
 * All diff logic lives in the shared composable `useLifecycleDigest` (extracted for the
 * Option-D FireHero, which renders the FIRE-date delta in its subline from the same source).
 * This card is the FULL presentation (fire line + milestone/corpus/savings/nudge chips) and
 * remains the deep-link destination shape the outbound WhatsApp lifecycle nudge targets
 * (?digest=open). The Option-D dashboard assembly (Stage D) unmounts this card from
 * /fire-goals/dashboard — the hero then carries the delta + the deep-link anchor; the
 * file stays for any future consumer.
 */
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { useLifecycleDigest } from "@/composables/useLifecycleDigest";

const route = useRoute();
const {
  show,
  fireLine,
  accentColor,
  accentIcon,
  corpusLine,
  savingsLine,
  nudgeLine,
  milestoneLine,
  sinceLabel,
  acknowledge,
  ensureBaseline,
} = useLifecycleDigest();

const cardRef = ref<HTMLElement | null>(null);

onMounted(() => {
  ensureBaseline();
  // Deep-link (?digest=open) — scroll the open card into view for the WhatsApp nudge landing.
  if (route.query.digest === "open" && show.value) {
    cardRef.value?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
});
</script>

<template>
  <v-card
    v-if="show"
    id="lifecycle-digest"
    ref="cardRef"
    variant="tonal"
    :color="accentColor"
    class="lifecycle-digest mb-4"
    data-testid="lifecycle-digest-card"
  >
    <v-card-text>
      <div class="d-flex align-start" style="gap: 12px">
        <v-icon :icon="accentIcon" :color="accentColor" size="28" />
        <div class="flex-grow-1">
          <div class="text-overline d-flex align-center" style="gap: 6px">
            Since you were away
            <span v-if="sinceLabel" class="text-medium-emphasis text-caption">· {{ sinceLabel }}</span>
          </div>
          <div class="text-subtitle-1 font-weight-bold mt-1" data-testid="lifecycle-digest-fire-line">
            {{ fireLine }}
          </div>
          <div class="d-flex flex-wrap ga-2 mt-2">
            <v-chip v-if="milestoneLine" size="small" color="success" variant="flat" data-testid="lifecycle-digest-milestone">
              <v-icon icon="mdi-flag-checkered" size="x-small" class="mr-1" />
              {{ milestoneLine }}
            </v-chip>
            <v-chip v-if="corpusLine" size="small" variant="tonal" data-testid="lifecycle-digest-corpus">
              <v-icon icon="mdi-cash" size="x-small" class="mr-1" />
              {{ corpusLine }}
            </v-chip>
            <v-chip v-if="savingsLine" size="small" variant="tonal" data-testid="lifecycle-digest-savings">
              <v-icon icon="mdi-percent" size="x-small" class="mr-1" />
              {{ savingsLine }}
            </v-chip>
            <!-- Informational only — the matching suggestions render in the
                 NudgeStack just below on this same dashboard. -->
            <v-chip
              v-if="nudgeLine"
              size="small"
              variant="tonal"
              color="info"
              data-testid="lifecycle-digest-nudges"
            >
              <v-icon icon="mdi-lightbulb-on" size="x-small" class="mr-1" />
              {{ nudgeLine }}
            </v-chip>
          </div>
        </div>
        <v-btn
          icon
          variant="text"
          size="small"
          data-testid="lifecycle-digest-dismiss"
          aria-label="Dismiss the since-you-were-away digest"
          @click="acknowledge"
        >
          <v-icon icon="mdi-close" size="small" />
        </v-btn>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.lifecycle-digest {
  border-radius: var(--radius-lg, 16px);
}
.lifecycle-digest .text-overline {
  letter-spacing: var(--tracking-wide);
  font-weight: var(--weight-semibold);
}
</style>
