// Empty seed — wipe household state. UI auto-routes to /wizard after switch.
import type { useHouseholdStore } from "@/stores/household";
import type { useAssumptionsStore } from "@/stores/assumptions";

type HStore = ReturnType<typeof useHouseholdStore>;
type AStore = ReturnType<typeof useAssumptionsStore>;

export function loadEmptySeed(household: HStore, assumptions: AStore) {
  household.resetAll();
  assumptions.reset();
  // No data added — wizard launches automatically per seed switcher logic.
}
