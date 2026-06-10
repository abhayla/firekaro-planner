/**
 * #138 — the "Lock my baseline" plan-baseline composable. Reads/writes the dedicated
 * `plan-baseline` storage entityKey (its own key — NOT an extension of ExpenseSnapshot; SRP),
 * which the ServerAdapter persists via GET/PUT /api/planner/plan-baseline in server mode and the
 * LocalStorageAdapter persists locally in demo mode. Capture is an EXPLICIT user action — never an
 * auto-snapshot — so the user consciously locks "this is my plan" and later sees the honest delta.
 */
import { ref } from "vue";
import { makeAdapter } from "@/lib/storage-adapter";
import { getAuthProvider } from "@/lib/auth-provider";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { useUiStore } from "@/stores/ui";
import { captureBaselineFrom, type PlanBaseline } from "@/lib/plan-variance";

export const PLAN_BASELINE_KEY = "plan-baseline";

export function usePlanBaseline() {
  const h = useHouseholdStore();
  const a = useAssumptionsStore();
  const ui = useUiStore();
  // The active adapter — the v6 ServerAdapter when installed (server mode), else a userId-scoped
  // LocalStorageAdapter (demo). MUST go through makeAdapter (the store pattern), NOT getAdapter()
  // which is null on the demo path.
  const adapter = makeAdapter(getAuthProvider());

  // Hydrate synchronously from the active adapter (warm cache in server mode, localStorage in demo).
  const baseline = ref<PlanBaseline | null>(adapter.get<PlanBaseline>(PLAN_BASELINE_KEY) ?? null);

  /** Lock the CURRENT FIRE picture (+ a copy of the assumptions in force) as the plan baseline. */
  function lockBaseline(): void {
    const snapshot = captureBaselineFrom(
      h.data,
      a.values,
      { isFamilyView: ui.isFamilyView, viewingMemberId: ui.viewingMemberId, currentFY: ui.currentFY },
      new Date().toISOString(),
    );
    baseline.value = snapshot;
    adapter.set(PLAN_BASELINE_KEY, snapshot);
  }

  return { baseline, lockBaseline };
}
