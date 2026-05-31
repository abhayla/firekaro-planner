<script setup lang="ts">
import { useRouter } from "vue-router";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import TrustPill from "@/components/shared/TrustPill.vue";

const router = useRouter();
const household = useHouseholdStore();
const assumptions = useAssumptionsStore();

household.hydrate();
assumptions.hydrate();

function exploreWithSample() {
  household.resetAll();
  assumptions.reset();
  loadSeedPersona(household, assumptions);
  router.push({ name: "fire-dashboard" });
}

function startMyOwnPlan() {
  household.resetAll();
  router.push({ name: "wizard", params: { step: "profile" } });
}

function continuePlan() {
  if (household.wizardCompleted) router.push({ name: "fire-dashboard" });
  else if (household.profileComplete) router.push({ name: "wizard", params: { step: "income" } });
  else router.push({ name: "wizard", params: { step: "profile" } });
}
</script>

<template>
  <v-container tag="main" aria-label="FIREKaro intro" class="splash-container fill-height" fluid>
    <v-row justify="center" align="center" class="w-100">
      <v-col cols="12" md="8" lg="6">
        <div class="text-center mb-8">
          <div class="hero-icon mb-4">
            <v-icon icon="mdi-fire" size="80" color="fire-orange" />
          </div>
          <h1 class="text-h3 font-weight-bold font-display mb-2">FIREKaro</h1>
          <p class="text-h6 text-medium-emphasis mb-1">
            Plan your path to Financial Independence
          </p>
          <p class="text-body-2 text-medium-emphasis">
            A simplified FIRE advisor for Indian households · no spreadsheets, no jargon walls
          </p>
        </div>

        <v-row dense>
          <v-col cols="12" md="6">
            <v-card
              variant="outlined"
              class="splash-card lift-on-hover interactive-card pa-6 h-100 d-flex flex-column"
              @click="exploreWithSample"
            >
              <v-icon icon="mdi-account-group" size="48" color="primary" class="mb-3" />
              <h2 class="text-h6 font-weight-bold font-display mb-2">Explore with sample data</h2>
              <p class="text-body-2 text-medium-emphasis flex-grow-1">
                See FIREKaro with the Sharma family — couple in their early 30s,
                two kids, mid-career professionals. Lands you on the Dashboard in one click.
              </p>
              <v-btn color="primary" variant="flat" class="mt-3" @click.stop="exploreWithSample">
                Try the sample
                <v-icon icon="mdi-arrow-right" class="ml-1" />
              </v-btn>
            </v-card>
          </v-col>

          <v-col cols="12" md="6">
            <v-card
              variant="outlined"
              class="splash-card lift-on-hover interactive-card pa-6 h-100 d-flex flex-column"
              @click="startMyOwnPlan"
            >
              <v-icon icon="mdi-pencil-plus" size="48" color="fire-orange" class="mb-3" />
              <h2 class="text-h6 font-weight-bold font-display mb-2">Start my own plan</h2>
              <p class="text-body-2 text-medium-emphasis flex-grow-1">
                Six-step wizard tailored to your household. Profile takes 30 seconds —
                the rest are skippable, every input auto-saves, and you can resume any time.
              </p>
              <v-btn color="fire-orange" variant="flat" class="mt-3" @click.stop="startMyOwnPlan">
                Begin wizard
                <v-icon icon="mdi-arrow-right" class="ml-1" />
              </v-btn>
            </v-card>
          </v-col>
        </v-row>

        <div v-if="household.members.length > 0" class="text-center mt-6">
          <v-btn variant="text" @click="continuePlan">
            Continue where I left off
            <v-icon icon="mdi-arrow-right" class="ml-1" />
          </v-btn>
        </div>

        <!-- Phase 7 Stage U — extended 4-claim trust pill. -->
        <TrustPill variant="splash" />
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.splash-container {
  min-height: 100vh;
}
.splash-card {
  cursor: pointer;
  border-width: 1.5px;
  /* Hover lift + transitions inherited from .lift-on-hover + .interactive-card in motion.css */
}
.splash-card:hover {
  border-color: rgba(var(--v-theme-primary), 0.5);
}
.hero-icon {
  filter: drop-shadow(0 4px 8px rgba(249, 115, 22, 0.3));
}
.trust-pill {
  background: var(--surface-muted);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-full);
  color: var(--text-secondary);
}
</style>
