/**
 * #138 — the "Lock my baseline" plan-baseline composable. Reads/writes the dedicated
 * `plan-baseline` storage entityKey (its own key — NOT an extension of ExpenseSnapshot; SRP),
 * which the ServerAdapter persists via GET/PUT /api/planner/plan-baseline in server mode and the
 * LocalStorageAdapter persists locally in demo mode. Capture is an EXPLICIT user action — never an
 * auto-snapshot — so the user consciously locks "this is my plan" and later sees the honest delta.
 *
 * The baseline ref is MODULE-SHARED (Option-D): the hero hosts the lock CTA while the
 * plan-variance card renders the locked state, so both components must observe the same
 * reactive value — a per-call ref would leave the card stuck on its empty state after the
 * hero locks. Hydration from the adapter happens once per session (the adapter is the
 * single persistence source; every lock writes through it).
 */
import { ref } from "vue";
import { makeAdapter } from "@/lib/storage-adapter";
import { getAuthProvider } from "@/lib/auth-provider";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { useUiStore } from "@/stores/ui";
import { captureBaselineFrom, type PlanBaseline } from "@/lib/plan-variance";

export const PLAN_BASELINE_KEY = "plan-baseline";

const sharedBaseline = ref<PlanBaseline | null>(null);

export function usePlanBaseline() {
  const h = useHouseholdStore();
  const a = useAssumptionsStore();
  const ui = useUiStore();
  // The active adapter — the v6 ServerAdapter when installed (server mode), else a userId-scoped
  // LocalStorageAdapter (demo). MUST go through makeAdapter (the store pattern), NOT getAdapter()
  // which is null on the demo path.
  const adapter = makeAdapter(getAuthProvider());

  // Re-read the adapter on EVERY call (component setup), not once per session: the no-reload
  // data-wipe paths (Splash sample/own-plan resets, AssumptionsPanel resetEmpty) delete the
  // key without reloading, and a once-hydrated singleton would keep claiming a verdict against
  // the deleted plan (code-review H2, 2026-06-10). Per-call re-read keeps the shared ref both
  // reactive across components AND fresh across wipes (components remount on navigation).
  sharedBaseline.value = adapter.get<PlanBaseline>(PLAN_BASELINE_KEY) ?? null;

  /** Lock the CURRENT FIRE picture (+ a copy of the assumptions in force) as the plan baseline. */
  function lockBaseline(): void {
    const snapshot = captureBaselineFrom(
      h.data,
      a.values,
      { isFamilyView: ui.isFamilyView, viewingMemberId: ui.viewingMemberId, currentFY: ui.currentFY },
      new Date().toISOString(),
    );
    sharedBaseline.value = snapshot;
    adapter.set(PLAN_BASELINE_KEY, snapshot);
  }

  return { baseline: sharedBaseline, lockBaseline };
}
