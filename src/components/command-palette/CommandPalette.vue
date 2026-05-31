<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { buildCommands, fuzzyMatch, type CmdItem } from "@/lib/cmdk-registry";

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ (e: "update:modelValue", v: boolean): void }>();

const router = useRouter();
const query = ref("");
const selectedIndex = ref(0);
const inputRef = ref<{ focus: () => void } | null>(null);

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v),
});

const allCommands = computed(() => buildCommands());
const results = computed(() => fuzzyMatch(query.value, allCommands.value));

const grouped = computed(() => {
  const groups: Record<string, CmdItem[]> = { Navigate: [], Actions: [], Glossary: [] };
  for (const cmd of results.value) {
    groups[cmd.category].push(cmd);
  }
  return Object.entries(groups).filter(([, items]) => items.length > 0);
});

watch(open, async (v) => {
  if (v) {
    query.value = "";
    selectedIndex.value = 0;
    await nextTick();
    inputRef.value?.focus();
  }
});

watch(query, () => {
  selectedIndex.value = 0;
});

function onKey(e: KeyboardEvent) {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    selectedIndex.value = Math.min(selectedIndex.value + 1, results.value.length - 1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0);
  } else if (e.key === "Enter") {
    e.preventDefault();
    const cmd = results.value[selectedIndex.value];
    if (cmd) execute(cmd);
  } else if (e.key === "Escape") {
    open.value = false;
  }
}

function execute(cmd: CmdItem) {
  void cmd.run({ router });
  open.value = false;
}

function indexOf(cmd: CmdItem): number {
  return results.value.indexOf(cmd);
}
</script>

<template>
  <v-dialog v-model="open" max-width="640" scrollable>
    <v-card class="cmdk-card" rounded="lg" @keydown="onKey">
      <div class="cmdk-search-row">
        <v-icon icon="mdi-magnify" size="20" class="cmdk-search-icon" />
        <input
          ref="inputRef"
          v-model="query"
          class="cmdk-input"
          placeholder="Search routes, actions, glossary…"
          autocomplete="off"
          spellcheck="false"
        />
        <kbd class="cmdk-esc">esc</kbd>
      </div>
      <div class="cmdk-results">
        <div v-if="results.length === 0" class="cmdk-empty">
          <v-icon icon="mdi-magnify-close" size="32" />
          <div>No commands match "{{ query }}"</div>
        </div>
        <template v-for="[group, items] in grouped" :key="group">
          <div class="cmdk-group-label">{{ group }}</div>
          <button
            v-for="cmd in items"
            :key="cmd.id"
            type="button"
            class="cmdk-item"
            :class="{ 'cmdk-item--active': indexOf(cmd) === selectedIndex }"
            @click="execute(cmd)"
            @mouseenter="selectedIndex = indexOf(cmd)"
          >
            <v-icon :icon="cmd.icon" size="18" class="cmdk-item-icon" />
            <div class="cmdk-item-text">
              <div class="cmdk-item-label">{{ cmd.label }}</div>
              <div v-if="cmd.hint" class="cmdk-item-hint">{{ cmd.hint }}</div>
            </div>
            <v-icon icon="mdi-arrow-right" size="14" class="cmdk-item-chevron" />
          </button>
        </template>
      </div>
      <div class="cmdk-footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
        <span><kbd>↵</kbd> run</span>
        <span><kbd>esc</kbd> close</span>
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.cmdk-card {
  background: var(--surface-base);
  border: 1px solid var(--border-default);
}

.cmdk-search-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
}

.cmdk-search-icon {
  color: var(--text-muted);
}

.cmdk-input {
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  font-family: var(--font-sans);
  font-size: var(--type-base);
  color: var(--text-primary);
}

.cmdk-input::placeholder {
  color: var(--text-muted);
}

.cmdk-esc {
  padding: 2px 6px;
  border-radius: var(--radius-xs);
  background: var(--surface-muted);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 10px;
  border: 1px solid var(--border-subtle);
}

.cmdk-results {
  max-height: 420px;
  overflow-y: auto;
  padding: var(--space-2);
}

.cmdk-empty {
  text-align: center;
  padding: var(--space-7);
  color: var(--text-muted);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
}

.cmdk-group-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--text-muted);
  font-weight: var(--weight-semibold);
  padding: var(--space-3) var(--space-3) var(--space-1);
}

.cmdk-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  text-align: left;
  cursor: pointer;
  color: var(--text-primary);
  font-family: var(--font-sans);
  transition: background-color var(--duration-fast) var(--ease-out);
}

.cmdk-item--active {
  background: var(--color-primary-50);
}

.cmdk-item-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.cmdk-item--active .cmdk-item-icon {
  color: var(--color-primary);
}

.cmdk-item-text {
  flex: 1;
  min-width: 0;
}

.cmdk-item-label {
  font-size: var(--type-sm);
  font-weight: var(--weight-medium);
  color: var(--text-primary);
}

.cmdk-item-hint {
  font-size: var(--type-xs);
  color: var(--text-muted);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cmdk-item-chevron {
  color: var(--text-muted);
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-out);
}

.cmdk-item--active .cmdk-item-chevron {
  opacity: 1;
}

.cmdk-footer {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-2) var(--space-4);
  border-top: 1px solid var(--border-subtle);
  background: var(--surface-muted);
  font-size: 11px;
  color: var(--text-muted);
}

.cmdk-footer kbd {
  display: inline-block;
  padding: 1px 5px;
  margin-right: 4px;
  border-radius: var(--radius-xs);
  background: var(--surface-base);
  border: 1px solid var(--border-subtle);
  font-family: var(--font-mono);
  font-size: 10px;
}
</style>
