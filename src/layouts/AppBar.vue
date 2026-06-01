<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useUiStore } from "@/stores/ui";
import { useHouseholdStore } from "@/stores/household";
import { AVAILABLE_FYS } from "@/lib/tax";
import AssumptionsPanel from "@/components/shared/AssumptionsPanel.vue";
import { SEED_META, loadSeed, getActiveSeed, type SeedName } from "@/seeds";
import { authClient } from "@/lib/auth-client";

const ui = useUiStore();
const household = useHouseholdStore();
const router = useRouter();

// Sign-out only applies in real server-adapter (authenticated) mode — the demo /
// localStorage deployment has no account to sign out of.
const isServerMode = computed(
  () =>
    import.meta.env.VITE_USE_SERVER_ADAPTER === "on" ||
    import.meta.env.VITE_USE_SERVER_ADAPTER === "true",
);

async function signOut() {
  await authClient.signOut();
  // Full reload so the main.ts boot seam re-resolves /me (now 401) → router → /login.
  window.location.href = "/login";
}

const showAssumptions = ref(false);

// v4 F.5 — seed switcher: 3 anonymized variants + persistence + route-to-wizard for empty
const activeSeedName = ref<SeedName>(getActiveSeed());
const activeSeedMeta = computed(() => SEED_META[activeSeedName.value]);
const seedOptions = computed(() => Object.values(SEED_META));

// v4 E.8 — Cmd-K trigger dispatches a synthetic keydown so App.vue's global handler picks it up
function openCmdK() {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
}

async function onSwitchSeed(name: SeedName) {
  if (name === activeSeedName.value) return;
  activeSeedName.value = name;
  loadSeed(name);
  if (name === "empty") {
    await router.push("/wizard");
  } else {
    await router.push("/fire-goals/dashboard");
  }
  // Force fresh hydration so any cached computeds re-evaluate against new data
  setTimeout(() => window.location.reload(), 50);
}

const memberOptions = computed(() => [
  { value: "all", label: "Whole household" },
  ...household.members.map((m) => ({ value: m.id, label: m.name || "Member" })),
]);

const viewingValue = computed({
  get: () => ui.viewingMemberId ?? "all",
  set: (v: string) => ui.setViewingMemberId(v === "all" ? null : v),
});

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
  <div class="app-bar-inner d-flex align-center justify-space-between px-3 w-100">
    <div class="d-flex align-center ga-2">
      <span
        v-if="household.lastSavedAt"
        class="text-caption text-success d-none d-sm-flex align-center"
      >
        <v-icon icon="mdi-check-circle" size="x-small" class="mr-1" />
        Saved {{ savedLabel }}
      </span>
    </div>

    <div class="d-flex align-center ga-2 flex-wrap">
      <!-- v4 F.5 — seed switcher dropdown -->
      <v-menu offset="4">
        <template #activator="{ props: menuProps }">
          <v-btn
            v-bind="menuProps"
            size="small"
            variant="outlined"
            :prepend-icon="activeSeedMeta.icon"
            append-icon="mdi-chevron-down"
            class="seed-switcher-btn"
          >
            {{ activeSeedMeta.label }}
          </v-btn>
        </template>
        <v-list density="compact" min-width="280" rounded="md">
          <v-list-subheader>Try a different scenario</v-list-subheader>
          <v-list-item
            v-for="meta in seedOptions"
            :key="meta.id"
            :prepend-icon="meta.icon"
            :active="meta.id === activeSeedName"
            @click="onSwitchSeed(meta.id)"
          >
            <v-list-item-title>{{ meta.label }}</v-list-item-title>
            <v-list-item-subtitle>{{ meta.description }}</v-list-item-subtitle>
          </v-list-item>
        </v-list>
      </v-menu>

      <v-btn
        v-if="!household.isSolo"
        size="small"
        :variant="ui.isFamilyView ? 'flat' : 'outlined'"
        :color="ui.isFamilyView ? 'primary' : undefined"
        @click="ui.toggleFamilyView()"
        prepend-icon="mdi-account-group"
      >
        Family view
      </v-btn>

      <v-select
        v-if="!household.isSolo"
        v-model="viewingValue"
        :items="memberOptions"
        item-title="label"
        item-value="value"
        density="compact"
        hide-details
        prepend-inner-icon="mdi-eye"
        label="Viewing as"
        style="min-width: 180px; max-width: 200px"
      />

      <v-select
        v-model="ui.currentFY"
        :items="AVAILABLE_FYS"
        density="compact"
        hide-details
        prepend-inner-icon="mdi-calendar"
        label="FY"
        style="min-width: 130px; max-width: 140px"
      />

      <!-- v4 E.8 — Cmd-K trigger -->
      <v-btn
        size="small"
        variant="outlined"
        class="cmdk-trigger"
        @click="openCmdK"
        title="Open command palette (⌘K or /)"
      >
        <v-icon icon="mdi-magnify" size="14" class="mr-1" />
        <span class="cmdk-trigger__hint">⌘K</span>
      </v-btn>

      <v-btn
        icon
        size="small"
        variant="text"
        @click="showAssumptions = true"
        title="Adjust assumptions"
      >
        <v-icon icon="mdi-cog" />
      </v-btn>

      <v-btn
        v-if="isServerMode"
        icon
        size="small"
        variant="text"
        @click="signOut"
        title="Sign out"
        aria-label="Sign out"
      >
        <v-icon icon="mdi-logout" />
      </v-btn>
    </div>

    <AssumptionsPanel v-model="showAssumptions" />
  </div>
</template>

<style scoped>
.app-bar-inner {
  letter-spacing: -0.01em;
}

.cmdk-trigger {
  letter-spacing: var(--tracking-wide);
}

.cmdk-trigger__hint {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
}
</style>
