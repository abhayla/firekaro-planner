import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { makeAdapter } from "@/lib/storage-adapter";
import { getAuthProvider } from "@/lib/auth-provider";
import { getCurrentFinancialYear } from "@/lib/expense-history";
import type { LifecycleSnapshot } from "@/lib/lifecycle-digest";

// Storage now routes through @/lib/storage-adapter — namespaced by userId per ADR-0001.
const ENTITY_KEY = "ui";

interface UiPersistedShape {
  isFamilyView?: boolean;
  viewingMemberId?: string | null;
  // NOTE: `currentFY` is intentionally NOT persisted — it is auto-derived from
  // the wall clock on every hydrate (getCurrentFinancialYear). A legacy blob may
  // still carry a stale `currentFY`; hydrate silently ignores it so an old
  // stored year can never override the current FY (see hydrate below).
  // "Since you were away" lifecycle digest baseline — rides the existing `ui`
  // blob (no new entity key, no Prisma migration). Older shapes lacking it
  // backfill to null on hydrate.
  lifecycleSnapshot?: LifecycleSnapshot | null;
}

// Q10.1 (v3) — dark mode removed. darkMode field dropped from this store; older
// localStorage shapes are tolerated by hydrate (extra keys are simply ignored).
export const useUiStore = defineStore("ui", () => {
  const isFamilyView = ref(false);
  const viewingMemberId = ref<string | null>(null);
  // Auto-derived from the wall clock — NOT user-selectable globally and NOT
  // persisted. derive()/forms/nudges read this as "the current FY". A page-local
  // picker on the tax-planning screen owns manual FY selection for regime
  // comparison (it never writes here).
  const currentFY = ref(getCurrentFinancialYear());
  const lifecycleSnapshot = ref<LifecycleSnapshot | null>(null);
  const adapter = makeAdapter(getAuthProvider());

  function hydrate() {
    // Always recompute the current FY from the wall clock — never restore a
    // (possibly stale) persisted value. A legacy blob carrying `currentFY:
    // "2024-25"` must NOT override the real current FY.
    currentFY.value = getCurrentFinancialYear();
    const parsed = adapter.get<UiPersistedShape>(ENTITY_KEY);
    if (parsed) {
      if (typeof parsed.isFamilyView === "boolean") isFamilyView.value = parsed.isFamilyView;
      if (typeof parsed.viewingMemberId === "string") viewingMemberId.value = parsed.viewingMemberId;
      // Migration-on-hydrate: absent (older blob) → null; present object → adopt.
      lifecycleSnapshot.value =
        parsed.lifecycleSnapshot && typeof parsed.lifecycleSnapshot === "object"
          ? parsed.lifecycleSnapshot
          : null;
    }
  }

  function persist() {
    adapter.set<UiPersistedShape>(ENTITY_KEY, {
      isFamilyView: isFamilyView.value,
      viewingMemberId: viewingMemberId.value,
      lifecycleSnapshot: lifecycleSnapshot.value,
    });
  }

  // currentFY is derived (not user state) → not watched/persisted.
  watch([isFamilyView, viewingMemberId, lifecycleSnapshot], persist, { deep: true });

  function toggleFamilyView() {
    isFamilyView.value = !isFamilyView.value;
  }
  function setViewingMemberId(id: string | null) {
    viewingMemberId.value = id;
  }
  /** Re-baseline the lifecycle digest (called on dismiss/acknowledge + silent first load). */
  function captureLifecycleSnapshot(snapshot: LifecycleSnapshot) {
    lifecycleSnapshot.value = snapshot;
  }

  return {
    isFamilyView,
    viewingMemberId,
    currentFY,
    lifecycleSnapshot,
    hydrate,
    toggleFamilyView,
    setViewingMemberId,
    captureLifecycleSnapshot,
  };
});
