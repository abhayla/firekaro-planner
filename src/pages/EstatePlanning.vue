<script setup lang="ts">
/**
 * /estate-planning — the 7-step estate checklist (audit Entry #35 + #36).
 *
 * Phase 5 Stage P per docs/goals/build-firekaro-mvp-v5.md §8.
 *
 * Each checklist item: completed boolean + optional date + optional notes.
 * Persists via household.estateChecklist (Stage B schema).
 *
 * Feature-gated via the router guard on estate.planning.
 */
import { computed } from "vue";
import { useHouseholdStore } from "@/stores/household";
import type { EstateChecklistKey, EstateChecklistItem } from "@/types/household";
import type { TermKey } from "@/lib/glossary";
import { TERM_GLOSSARY } from "@/lib/glossary";
import DiscoveryFooter from "@/components/shared/DiscoveryFooter.vue";
import LeafPageHeader from "@/components/income-layout/LeafPageHeader.vue";

const household = useHouseholdStore();

interface ChecklistItem {
  key: EstateChecklistKey;
  title: string;
  description: string;
  /** A35.3 — glossary term(s) this checklist item links to. */
  terms: TermKey[];
}

// Per audit Entry #35 A35.2 + research Ch 05 §5.7.
const CHECKLIST: ChecklistItem[] = [
  {
    key: "will",
    title: "Will",
    description: "Registered will distributing assets per your intent. Without one, intestate succession applies — court process + family disputes.",
    // The will is also where minor-children guardianship is named (A35.3).
    terms: ["will", "guardianship"],
  },
  {
    key: "nominees",
    title: "Nominees on every account",
    description: "Bank · demat · mutual fund · EPF · NPS · life insurance. Nomination is the lowest-friction transfer; updates over the years (e.g., post-marriage).",
    terms: ["nominee"],
  },
  {
    key: "powerOfAttorney",
    title: "Power of Attorney",
    description: "Financial + medical POA naming a trusted family member. Critical for incapacitation events; routes around weeks-of-paperwork.",
    terms: ["power-of-attorney"],
  },
  {
    key: "jointAccounts",
    title: "Either-or-survivor joint accounts",
    description: "Bank + investment accounts with spouse as either-or-survivor. Bypasses succession on the joint share at first death.",
    terms: ["joint-survivor"],
  },
  {
    key: "digitalEstate",
    title: "Digital estate inventory",
    description: "List of digital accounts, passwords, 2FA recovery codes (in a sealed envelope or password manager with emergency-access). Crypto wallets explicitly included.",
    terms: ["digital-estate"],
  },
  {
    key: "hufKarta",
    title: "HUF Karta succession",
    description: "If you operate a HUF, name the next karta + transition plan. HUF dissolution is a complex tax event if Karta passes without succession.",
    terms: ["huf"],
  },
  {
    key: "termLifeBypass",
    title: "Term life — nominee bypass",
    description: "Confirm term life policy nominee is set + claim process is documented. Term life proceeds skip probate when nominee is on file — fastest dependent payout.",
    terms: ["hlv", "nominee"],
  },
];

function termLabel(key: TermKey): string {
  return TERM_GLOSSARY[key].label;
}

const checklist = computed(() => household.data.estateChecklist ?? []);

function findItem(key: EstateChecklistKey): EstateChecklistItem | undefined {
  return checklist.value.find((i) => i.key === key);
}

function isCompleted(key: EstateChecklistKey): boolean {
  return findItem(key)?.completed ?? false;
}

function setCompleted(key: EstateChecklistKey, completed: boolean) {
  if (!household.data.estateChecklist) household.data.estateChecklist = [];
  const existing = household.data.estateChecklist.find((i) => i.key === key);
  if (existing) {
    existing.completed = completed;
    if (completed && !existing.date) {
      existing.date = new Date().toISOString().slice(0, 10);
    }
  } else {
    household.data.estateChecklist.push({
      key,
      completed,
      date: completed ? new Date().toISOString().slice(0, 10) : undefined,
    });
  }
}

function setNotes(key: EstateChecklistKey, notes: string) {
  if (!household.data.estateChecklist) household.data.estateChecklist = [];
  const existing = household.data.estateChecklist.find((i) => i.key === key);
  if (existing) {
    existing.notes = notes;
  } else {
    household.data.estateChecklist.push({ key, completed: false, notes });
  }
}

const completedCount = computed(
  () => CHECKLIST.filter((c) => isCompleted(c.key)).length,
);
const completionPct = computed(
  () => Math.round((completedCount.value / CHECKLIST.length) * 100),
);
</script>

<template>
  <v-container fluid class="py-6 estate-page">
    <LeafPageHeader
      eyebrow="Planning · Estate"
      title="Estate planning"
      description="Track wills, nominations, power of attorney and succession docs — a 7-step checklist for sandwich-gen households (audit Entry #35 · research Ch 05 §5.7)."
    />

    <!-- Progress summary -->
    <v-card variant="outlined" class="pa-4 mb-4" data-testid="estate-progress">
      <div class="d-flex align-center justify-space-between">
        <div>
          <div class="text-overline">Completion</div>
          <div class="text-h4 font-weight-bold font-mono">
            {{ completedCount }} / {{ CHECKLIST.length }}
          </div>
        </div>
        <v-progress-circular
          :model-value="completionPct"
          color="primary"
          :size="80"
          :width="8"
        >
          {{ completionPct }}%
        </v-progress-circular>
      </div>
    </v-card>

    <!-- 7-step checklist -->
    <v-card variant="outlined">
      <v-list>
        <v-list-item
          v-for="item in CHECKLIST"
          :key="item.key"
          :data-testid="`estate-item-${item.key}`"
        >
          <template #prepend>
            <v-checkbox-btn
              :model-value="isCompleted(item.key)"
              @update:model-value="(v: boolean | null) => setCompleted(item.key, !!v)"
            />
          </template>
          <v-list-item-title class="d-flex align-center" style="gap: 8px">
            {{ item.title }}
            <v-chip
              v-if="findItem(item.key)?.date"
              size="x-small"
              variant="tonal"
              color="success"
            >
              {{ findItem(item.key)?.date }}
            </v-chip>
          </v-list-item-title>
          <v-list-item-subtitle class="text-wrap">
            {{ item.description }}
          </v-list-item-subtitle>
          <!-- A35.3 — glossary definition links per checklist item. -->
          <div class="d-flex flex-wrap align-center mt-1" style="gap: 6px">
            <span class="text-caption text-medium-emphasis">Learn more:</span>
            <v-chip
              v-for="term in item.terms"
              :key="term"
              :to="`/glossary#term-${term}`"
              size="x-small"
              variant="tonal"
              color="primary"
              prepend-icon="mdi-book-open-page-variant"
              :data-testid="`estate-glossary-${term}`"
            >
              {{ termLabel(term) }}
            </v-chip>
          </div>
          <v-text-field
            :model-value="findItem(item.key)?.notes ?? ''"
            label="Notes (optional)"
            density="compact"
            variant="underlined"
            class="mt-2"
            hide-details
            @update:model-value="(v: string) => setNotes(item.key, v)"
          />
        </v-list-item>
      </v-list>
    </v-card>

    <DiscoveryFooter />
  </v-container>
</template>
