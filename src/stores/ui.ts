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
  // T-377 (QN-2) — the Quick-Number metadata blob. DECLARED + READ here (QN-2); WRITTEN by
  // the /quick express path (QN-1). Rides the existing `ui` document (userUiPrefs.prefs JSON)
  // — no new entity key, no Prisma migration. Older shapes lacking it backfill to null.
  quick?: QuickPrefs | null;
}

/**
 * T-377 (QN-2) — Quick-Number answers metadata. Every field optional: a user who never took
 * the express path simply has no `quick` blob, and the hero's gut-feel line stays hidden.
 */
export interface QuickPrefs {
  /** The user's own gut-feel FIRE number (₹) from card 1 — compared with the math in the hero. */
  guess?: number;
  /** ISO timestamp of the run that completed setup (the path taken; NOT a second "done" flag). */
  completedAt?: string;
  /** Ids of the household lines the quick path created, so a re-run updates instead of duplicating. */
  createdIds?: string[];
  /** True ONLY when the user said their mutual funds are direct plans (gates the QN-5 TER lever). */
  directPlans?: boolean;
}

/** T-377: the ONE retirement-age range both the dashboard hero and /what-if honour. */
export const SHARED_TARGET_AGE_MIN = 40;
export const SHARED_TARGET_AGE_MAX = 75;

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
  // T-377: Quick-Number metadata (persisted — see UiPersistedShape).
  const quick = ref<QuickPrefs | null>(null);
  // T-377: the ONE retirement-age the hero slider and /fire-goals/what-if share (#64 class —
  // two controls for the same idea must never drift). SESSION-ONLY: deliberately NOT in
  // UiPersistedShape, NOT in persist(), NOT in the watch list below — dragging the slider is a
  // what-if, not a plan change. Persisting the target is the explicit "Set as my target" action,
  // which writes the household member's targetRetirementAge instead. null = follow the household.
  const whatIfTargetAge = ref<number | null>(null);
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
      // Migration-on-hydrate: absent (every pre-T-377 blob) → null.
      quick.value = parsed.quick && typeof parsed.quick === "object" ? parsed.quick : null;
    }
  }

  function persist() {
    // `quick` is OMITTED when null, never sent as null. The server merges `{...existingPrefs,
    // ...body}`, so a null would CLOBBER a stored quick blob — and this store writes on every
    // family-view toggle, including before hydrate() has run. Omitting the key is what makes the
    // server's merge-not-replace guarantee reachable from the real client (code-review L1).
    adapter.set<UiPersistedShape>(ENTITY_KEY, {
      isFamilyView: isFamilyView.value,
      viewingMemberId: viewingMemberId.value,
      lifecycleSnapshot: lifecycleSnapshot.value,
      ...(quick.value != null ? { quick: quick.value } : {}),
    });
  }

  // currentFY is derived (not user state) → not watched/persisted. whatIfTargetAge is a
  // session-only what-if → deliberately excluded from BOTH the blob and this watch list.
  watch([isFamilyView, viewingMemberId, lifecycleSnapshot, quick], persist, { deep: true });

  function toggleFamilyView() {
    isFamilyView.value = !isFamilyView.value;
  }
  function setViewingMemberId(id: string | null) {
    viewingMemberId.value = id;
  }
  /**
   * T-377: set (or clear with null) the shared hero/What-If retirement age. Session-only.
   *
   * Clamped HERE, once, to the shared range — so the two sliders can never render different
   * numbers for the same stored value (the hero used 40-70, What-If clamps to
   * [anchorAge + 1, 75]; a hero value of 42 for a 45-year-old showed 42 on one screen and 46 on
   * the other — code-review M4). Callers pass their own floor when they know the anchor age.
   */
  function setWhatIfTargetAge(age: number | null, floor = SHARED_TARGET_AGE_MIN) {
    if (age == null || !Number.isFinite(age)) {
      whatIfTargetAge.value = null;
      return;
    }
    const lo = Math.max(SHARED_TARGET_AGE_MIN, Math.round(floor));
    whatIfTargetAge.value = Math.min(SHARED_TARGET_AGE_MAX, Math.max(lo, Math.round(age)));
  }
  /** T-377: merge a partial Quick-Number blob (QN-1 writes; QN-2 only reads). */
  function setQuickPrefs(next: QuickPrefs | null) {
    quick.value = next == null ? null : { ...(quick.value ?? {}), ...next };
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
    quick,
    whatIfTargetAge,
    hydrate,
    setWhatIfTargetAge,
    setQuickPrefs,
    toggleFamilyView,
    setViewingMemberId,
    captureLifecycleSnapshot,
  };
});
