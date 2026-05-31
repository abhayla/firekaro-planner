<script setup lang="ts">
/**
 * /glossary — searchable, category-filterable index of every financial term
 * (audit Entry #33 A33.3). Each term has an anchor (id="term-<key>") so other
 * surfaces (e.g. the estate checklist, A35.3) can deep-link to it.
 */
import { computed, ref, onMounted, nextTick } from "vue";
import { useRoute } from "vue-router";
import {
  glossaryItems,
  searchGlossary,
  GLOSSARY_CATEGORIES,
  type GlossaryCategory,
} from "@/lib/glossary";
import LeafPageHeader from "@/components/income-layout/LeafPageHeader.vue";

const route = useRoute();
const query = ref("");
const category = ref<GlossaryCategory | "All">("All");

const allItems = glossaryItems();
const filtered = computed(() => searchGlossary(allItems, query.value, category.value));

const categoryColor: Record<GlossaryCategory, string> = {
  Tax: "primary",
  Instruments: "success",
  Strategy: "fire-orange",
  Risk: "error",
  Behavioral: "info",
};

// On load, if the URL carries #term-<key>, scroll it into view + highlight.
const highlightKey = ref<string | null>(null);
onMounted(async () => {
  const hash = route.hash?.replace(/^#/, "");
  if (hash?.startsWith("term-")) {
    const key = hash.slice("term-".length);
    highlightKey.value = key;
    await nextTick();
    document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
});
</script>

<template>
  <v-container fluid class="py-6 glossary-page">
    <LeafPageHeader
      eyebrow="Reference · Glossary"
      title="Glossary"
      description="Every financial term used across FireKaro, in plain language — search or filter by category. Deep-linkable: each term has its own anchor."
    />

    <!-- Search + category filter -->
    <v-card variant="outlined" class="pa-4 mb-4">
      <v-text-field
        v-model="query"
        label="Search terms"
        prepend-inner-icon="mdi-magnify"
        variant="outlined"
        density="comfortable"
        clearable
        hide-details
        data-testid="glossary-search"
      />
      <div class="d-flex flex-wrap mt-3" style="gap: 8px">
        <v-chip
          :variant="category === 'All' ? 'flat' : 'outlined'"
          :color="category === 'All' ? 'primary' : undefined"
          size="small"
          data-testid="glossary-filter-all"
          @click="category = 'All'"
        >
          All ({{ allItems.length }})
        </v-chip>
        <v-chip
          v-for="c in GLOSSARY_CATEGORIES"
          :key="c"
          :variant="category === c ? 'flat' : 'outlined'"
          :color="category === c ? categoryColor[c] : undefined"
          size="small"
          :data-testid="`glossary-filter-${c}`"
          @click="category = c"
        >
          {{ c }}
        </v-chip>
      </div>
    </v-card>

    <div class="text-caption text-medium-emphasis mb-2" data-testid="glossary-count">
      {{ filtered.length }} term{{ filtered.length === 1 ? "" : "s" }}
    </div>

    <div v-if="filtered.length" class="glossary-list">
      <v-card
        v-for="item in filtered"
        :id="`term-${item.key}`"
        :key="item.key"
        variant="outlined"
        class="pa-4 glossary-term"
        :class="{ 'glossary-term--highlight': highlightKey === item.key }"
        :data-testid="`glossary-term-${item.key}`"
      >
        <div class="d-flex align-center justify-space-between mb-1" style="gap: 8px">
          <h3 class="text-subtitle-1 font-weight-bold">{{ item.label }}</h3>
          <v-chip size="x-small" variant="tonal" :color="categoryColor[item.category]">
            {{ item.category }}
          </v-chip>
        </div>
        <p class="text-body-2 text-medium-emphasis mb-0">{{ item.explanation }}</p>
        <p v-if="item.formula" class="text-caption font-mono mt-2 mb-0 glossary-formula">
          {{ item.formula }}
        </p>
      </v-card>
    </div>

    <v-card v-else variant="outlined" class="pa-8 text-center text-medium-emphasis">
      <v-icon icon="mdi-book-search-outline" size="48" class="mb-2" />
      <div>No terms match “{{ query }}”{{ category !== 'All' ? ` in ${category}` : '' }}.</div>
    </v-card>
  </v-container>
</template>

<style scoped>
.glossary-page {
  max-width: 1000px;
}
.glossary-list {
  display: grid;
  gap: 12px;
}
.glossary-formula {
  background: rgba(var(--v-theme-on-surface), 0.04);
  border-radius: 8px;
  padding: 6px 10px;
}
.glossary-term {
  scroll-margin-top: 80px;
  transition: box-shadow 200ms ease, border-color 200ms ease;
}
.glossary-term--highlight {
  border-color: rgb(var(--v-theme-primary));
  box-shadow: 0 0 0 2px rgba(var(--v-theme-primary), 0.25);
}
.font-mono {
  font-family: "JetBrains Mono", monospace;
}
</style>
