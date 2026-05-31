/**
 * useDismissedNudges — tracks which nudge IDs the user has dismissed.
 *
 * Phase 6 Stage R per docs/goals/build-firekaro-mvp-v5.md §9.
 * Audit Entry #6 A6.9 — dismissals persist per-userId via the storage
 * adapter (ADR-0001).
 *
 * Lightweight Pinia-free composable; the dismissed-set is just a string
 * Set persisted as an array via the adapter. Re-enable surfaced on
 * /preferences §Family (Stage R also exposes a "Re-enable dismissed
 * nudges" button there).
 */
import { computed, ref, watch } from "vue";
import { makeAdapter } from "@/lib/storage-adapter";
import { getAuthProvider } from "@/lib/auth-provider";

const ENTITY_KEY = "dismissed-nudges";

// Singleton state — shared across all components calling useDismissedNudges.
const adapter = makeAdapter(getAuthProvider());
const initialIds = adapter.get<string[]>(ENTITY_KEY) ?? [];
const dismissed = ref(new Set<string>(initialIds));

// Auto-persist on changes.
watch(
  dismissed,
  (set) => {
    adapter.set(ENTITY_KEY, Array.from(set));
  },
  { deep: true },
);

export function useDismissedNudges() {
  function isDismissed(id: string): boolean {
    return dismissed.value.has(id);
  }
  function dismiss(id: string): void {
    const next = new Set(dismissed.value);
    next.add(id);
    dismissed.value = next;
  }
  function undismiss(id: string): void {
    const next = new Set(dismissed.value);
    next.delete(id);
    dismissed.value = next;
  }
  function reEnableAll(): void {
    dismissed.value = new Set();
  }
  const dismissedCount = computed(() => dismissed.value.size);
  return { isDismissed, dismiss, undismiss, reEnableAll, dismissedCount, dismissed };
}
