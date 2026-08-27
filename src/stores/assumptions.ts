import { defineStore } from "pinia";
import { ref, watch, computed } from "vue";
import { DEFAULT_ASSUMPTIONS, type Assumptions } from "@/types/assumptions";
import { getAdjustedSWR } from "@/lib/fire-math";
import {
  resolveHouseholdInflation,
  resolveEffectiveSWRByHorizon,
  blendPortfolioReturn,
  type PortfolioReturnWeights,
} from "@/lib/assumption-math";
import { makeAdapter } from "@/lib/storage-adapter";
import { getAuthProvider } from "@/lib/auth-provider";

// Storage now routes through @/lib/storage-adapter — namespaced by userId per ADR-0001.
// This flat `Assumptions` store is the single canonical R1 model (the layered
// resolver was retired in Stage-T0b — see ADR-0002).
const ENTITY_KEY = "assumptions";

/**
 * ADR-0006 migration-on-hydrate: `householdSavingsStepUpPercent`'s default moved 0 → 2.
 *
 * Every household persisted before 2026-08-27 carries a stored `0` that was never a CHOICE —
 * it is the old default, written out by the store's deep `watch` the first time anything in
 * `/preferences` was touched. Merging it verbatim would pin the entire existing user base to
 * zero real wage growth forever, i.e. exactly the pessimism ADR-0006 corrects, while every new
 * signup got the corrected default — two different products from one kernel.
 *
 * So a stored value of EXACTLY 0 is treated as unset and takes the new default. This is
 * deliberately irreversible-by-silence and NOT idempotent-preserving: a user who genuinely wants
 * 0 re-sets it in /preferences, and that choice then survives (it is re-set from the UI, and the
 * next hydrate would lift it again — which is why the release note discloses the change rather
 * than the store trying to distinguish "chose 0" from "defaulted to 0" it has no field for).
 * Any other stored value (including a deliberate 0.5 or 3) is honoured untouched.
 */
function migrateStepUpDefault(parsed: Partial<Assumptions>): Partial<Assumptions> {
  if (parsed.householdSavingsStepUpPercent !== 0) return parsed;
  const { householdSavingsStepUpPercent: _legacyZero, ...rest } = parsed;
  return rest;
}

export const useAssumptionsStore = defineStore("assumptions", () => {
  const values = ref<Assumptions>({ ...DEFAULT_ASSUMPTIONS });
  const hydrated = ref(false);
  const adapter = makeAdapter(getAuthProvider());

  function hydrate() {
    if (hydrated.value) return;
    const parsed = adapter.get<Partial<Assumptions>>(ENTITY_KEY);
    if (parsed) {
      values.value = { ...DEFAULT_ASSUMPTIONS, ...migrateStepUpDefault(parsed) };
    }
    hydrated.value = true;
  }

  watch(
    values,
    (v) => {
      adapter.set(ENTITY_KEY, v);
    },
    { deep: true },
  );

  function set<K extends keyof Assumptions>(key: K, value: Assumptions[K]) {
    values.value[key] = value;
  }

  function reset() {
    values.value = { ...DEFAULT_ASSUMPTIONS };
  }

  /**
   * @deprecated Age-driven SWR (v4). Prefer {@link effectiveSWRByHorizon} —
   * SWR is a function of retirement horizon, not current age (audit Entry #1).
   */
  function effectiveSWR(age?: number): number {
    if (values.value.swrOverride && values.value.swrOverride > 0) return values.value.swrOverride;
    return getAdjustedSWR(age);
  }

  /**
   * Horizon-driven effective SWR (audit Entry #1 A1.1). A user swrOverride
   * still wins (R1 — explicit user choice trumps the resolver). Otherwise the
   * 5-step horizon bracket resolves from retirementAge + planToAge.
   */
  function effectiveSWRByHorizon(retirementAge?: number, planToAge?: number): number {
    return resolveEffectiveSWRByHorizon(values.value, retirementAge, planToAge);
  }

  /**
   * Household 4-bucket blended inflation (audit Entry #3 A3.1 + A3.2). Thin
   * wrapper over the pure resolver shared with the derive() kernel.
   */
  function householdInflation(): number {
    return resolveHouseholdInflation(values.value);
  }

  /**
   * Blended expected return for whole portfolio. Thin wrapper over the pure
   * resolver shared with the derive() kernel (audit A15.3 EPF after-tax drag
   * applies when an override is supplied).
   */
  function blendedReturn(weights: PortfolioReturnWeights, epfReturnOverride?: number): number {
    return blendPortfolioReturn(values.value, weights, epfReturnOverride);
  }

  const summaryRow = computed(() => values.value);

  return {
    values,
    hydrate,
    set,
    reset,
    effectiveSWR,
    effectiveSWRByHorizon,
    householdInflation,
    blendedReturn,
    summaryRow,
  };
});
