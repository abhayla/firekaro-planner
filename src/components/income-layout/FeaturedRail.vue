<script setup lang="ts" generic="T extends { id: string }">
defineProps<{
  title: string;
  icon: string;
  /** Vuetify theme color name, e.g. "primary". */
  accentColor: string;
  total: string; // pre-formatted
  countLabel: string;
  entries: T[];
  /** Lowercase noun shown under the +Add plus, e.g. "rental" / "pvt ltd". */
  addSubLabel: string;
}>();

defineEmits<{
  (e: "edit", entry: T): void;
  (e: "add"): void;
}>();

defineSlots<{
  /** Featured (first) + compact (rest) share these slots; `variant` distinguishes. */
  amount(props: { entry: T }): unknown;
  title(props: { entry: T }): unknown;
  meta(props: { entry: T; variant: "featured" | "compact" }): unknown;
}>();
</script>

<template>
  <div
    class="rail"
    :style="{
      '--rail-accent': `rgb(var(--v-theme-${accentColor}))`,
      '--rail-accent-soft': `rgba(var(--v-theme-${accentColor}), 0.10)`,
      '--rail-accent-mid': `rgba(var(--v-theme-${accentColor}), 0.18)`,
    }"
  >
    <div class="rail__head">
      <v-icon :icon="icon" />
      <span class="rail__name">{{ title }}</span>
      <span class="rail__count">{{ countLabel }}</span>
      <span class="rail__total">{{ total }}</span>
    </div>
    <div class="rail__strip">
      <button
        v-if="entries[0]"
        type="button"
        class="rail-featured"
        @click="$emit('edit', entries[0])"
      >
        <div class="rail-featured__icon"><v-icon :icon="icon" size="32" /></div>
        <div class="rail-featured__tag">FEATURED</div>
        <div class="rail-featured__title"><slot name="title" :entry="entries[0]" /></div>
        <div class="rail-featured__amt"><slot name="amount" :entry="entries[0]" /></div>
        <div class="rail-featured__meta"><slot name="meta" :entry="entries[0]" variant="featured" /></div>
      </button>
      <button
        v-for="entry in entries.slice(1)"
        :key="entry.id"
        type="button"
        class="rail-compact"
        @click="$emit('edit', entry)"
      >
        <div class="rail-compact__amt"><slot name="amount" :entry="entry" /></div>
        <div class="rail-compact__title"><slot name="title" :entry="entry" /></div>
        <div class="rail-compact__meta"><slot name="meta" :entry="entry" variant="compact" /></div>
      </button>
      <button
        type="button"
        class="rail-add"
        :aria-label="`Add new ${addSubLabel}`"
        @click="$emit('add')"
      >
        <div class="rail-add__plus"><v-icon icon="mdi-plus" size="28" /></div>
        <div class="rail-add__label">Add new</div>
        <div class="rail-add__sub">{{ addSubLabel }}</div>
      </button>
    </div>
  </div>
</template>

<style scoped>
.rail__head { display: flex; align-items: center; gap: 8px; padding: 0 4px 10px; }
.rail__head :deep(.v-icon) { color: var(--rail-accent) !important; }
.rail__name { font-size: 1.1rem; font-weight: 800; color: rgba(var(--v-theme-on-surface), 0.92); }
.rail__count { font-size: 0.78rem; color: rgba(var(--v-theme-on-surface), 0.55); }
.rail__total {
  margin-left: auto;
  font-family: "JetBrains Mono", monospace;
  font-weight: 800;
  color: var(--rail-accent);
  font-variant-numeric: tabular-nums;
}
.rail__strip { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 4px; }

.rail-featured {
  flex: 0 0 320px;
  height: 200px;
  border-radius: 16px;
  padding: 20px 22px;
  background: var(--rail-accent);
  color: white;
  display: flex;
  flex-direction: column;
  position: relative;
  text-align: left;
  border: none;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease;
}
.rail-featured::before {
  content: "";
  position: absolute;
  top: 0; right: 0;
  width: 140px; height: 140px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.18), transparent 70%);
  border-radius: 50%;
  pointer-events: none;
}
.rail-featured:hover { transform: translateY(-2px); box-shadow: 0 10px 24px -10px rgba(0, 0, 0, 0.35); }
.rail-featured__icon {
  width: 48px; height: 48px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.2);
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 10px;
}
.rail-featured__icon :deep(.v-icon) { color: white !important; }
.rail-featured__tag {
  position: absolute;
  top: 16px; right: 16px;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.18em;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
}
.rail-featured__title { font-size: 1.05rem; font-weight: 700; }
.rail-featured__amt {
  font-family: "JetBrains Mono", monospace;
  font-size: 2rem;
  font-weight: 800;
  letter-spacing: -0.025em;
  margin-top: auto;
  font-variant-numeric: tabular-nums;
}
.rail-featured__amt :deep(span) { font-size: 0.7rem; opacity: 0.75; font-weight: 600; letter-spacing: 0.06em; }
.rail-featured__meta { font-size: 0.72rem; opacity: 0.85; margin-top: 6px; }

.rail-compact {
  flex: 0 0 180px;
  height: 200px;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  border-left: 4px solid var(--rail-accent);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  text-align: left;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease;
}
.rail-compact:hover { transform: translateY(-2px); box-shadow: 0 8px 20px -10px rgba(0, 0, 0, 0.2); border-color: var(--rail-accent); }
.rail-compact__amt {
  font-family: "JetBrains Mono", monospace;
  font-size: 1.3rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--rail-accent);
  font-variant-numeric: tabular-nums;
  margin-bottom: auto;
}
.rail-compact__title { font-size: 0.88rem; font-weight: 700; color: rgba(var(--v-theme-on-surface), 0.9); }
.rail-compact__meta { font-size: 0.7rem; color: rgba(var(--v-theme-on-surface), 0.55); margin-top: 2px; }

.rail-add {
  flex: 0 0 180px;
  height: 200px;
  border-radius: 14px;
  border: 2px solid var(--rail-accent-mid);
  background: var(--rail-accent-soft);
  color: var(--rail-accent);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  text-align: center;
  transition: all 180ms ease;
}
.rail-add:hover {
  border-color: var(--rail-accent);
  background: var(--rail-accent-mid);
  transform: translateY(-2px);
  box-shadow: 0 10px 24px -10px var(--rail-accent);
}
.rail-add:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--rail-accent-mid), 0 0 0 5px var(--rail-accent); }
.rail-add__plus {
  width: 52px; height: 52px;
  border-radius: 16px;
  background: white;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 14px -4px rgba(0, 0, 0, 0.18);
  transition: transform 180ms ease;
}
.rail-add:hover .rail-add__plus { transform: scale(1.08) rotate(90deg); }
.rail-add__plus :deep(.v-icon) { color: var(--rail-accent) !important; }
.rail-add__label { font-size: 0.95rem; font-weight: 800; letter-spacing: -0.01em; color: var(--rail-accent); }
.rail-add__sub {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--rail-accent);
  opacity: 0.8;
}
</style>
