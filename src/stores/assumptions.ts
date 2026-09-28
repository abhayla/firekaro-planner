import { defineStore } from "pinia";
import { ref, watch, computed } from "vue";
import { DEFAULT_ASSUMPTIONS, type Assumptions } from "@/types/assumptions";
import { getAdjustedSWR } from "@/lib/fire-math";
import {
  resolveHouseholdBasket,
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
 * The migration version stamped into every hydrated assumptions document. Bump ONLY when adding
 * a new one-shot migration below, and give that migration its own `< N` guard.
 */
export const ASSUMPTIONS_MIGRATION_VERSION = 2;

/**
 * ADR-0006 migration-on-hydrate: `householdSavingsStepUpPercent`'s default moved 0 → 2.
 *
 * Every household persisted before 2026-08-27 carries a stored `0` that was never a CHOICE —
 * it is the old default, written out by the store's deep `watch` the first time anything in
 * `/preferences` was touched. Merging it verbatim would pin the entire existing user base to
 * zero real wage growth forever, i.e. exactly the pessimism ADR-0006 corrects, while every new
 * signup got the corrected default — two different products from one kernel.
 *
 * ONE-SHOT (Phase 1b). The first version of this sniffed the VALUE (`=== 0`) on EVERY hydrate,
 * so a user who deliberately set the step-up to 0 in /preferences got 2 back on the next reload —
 * a setting the product refused to let them keep, and a silent, repeating override of an explicit
 * choice. The document now carries `assumptionsMigratedV`: the lift runs only while that stamp is
 * absent, and the stamp is written on every hydrate (including a first-run document that had
 * nothing stored), so a later deliberate 0 survives set → persist → re-hydrate indefinitely.
 *
 * Pure + exported so the idempotence is unit-testable without a storage round-trip.
 */
export function migrateStepUpDefault(parsed: Partial<Assumptions>): Partial<Assumptions> {
  const storedV = parsed.assumptionsMigratedV ?? 0;
  const stamped = { ...parsed, assumptionsMigratedV: ASSUMPTIONS_MIGRATION_VERSION };

  // --- v2 (ADR-0007 / gh #185): the step-up is no longer the WAGE-GROWTH proxy ---
  // `derive()` now grows each earner's INCOME (`salaryGrowthRealPercent`, default 2% real) and lets
  // the savings residual fall out. A stored `householdSavingsStepUpPercent` of exactly 2 — the v1
  // default, written out by this very migration or by the deep `watch` for every household hydrated
  // since 2026-08-27 — was never a CHOICE either: it is the old proxy. Merging it verbatim would
  // compound the same wage growth TWICE (once through income, once through the residual) and pull
  // every existing user's FIRE date optimistically in, which is the Tier-0 direction. So a stored
  // value of exactly the v1 default is DROPPED so the new default (0) applies. A value the user
  // deliberately typed (anything but 2) survives untouched, and once the v2 stamp is written this
  // never runs again — so a user who later chooses 2 on purpose keeps it.
  if (storedV < 2 && parsed.householdSavingsStepUpPercent === 2) {
    const { householdSavingsStepUpPercent: _v1ProxyDefault, ...rest } = stamped;
    return rest;
  }

  // --- v1 (ADR-0006): a stored 0 was the pre-ADR-0006 default, not a choice ---
  // Kept for documents that have never been hydrated since v1 landed. With the default now back at
  // 0 this is a no-op in VALUE terms (dropping a stored 0 re-applies a default of 0); it is retained
  // so the one-shot semantics and the unit locks around it stay honest rather than silently deleted.
  if (storedV < 1 && parsed.householdSavingsStepUpPercent === 0) {
    const { householdSavingsStepUpPercent: _legacyZero, ...rest } = stamped;
    return rest;
  }
  return stamped;
}

export const useAssumptionsStore = defineStore("assumptions", () => {
  const values = ref<Assumptions>({ ...DEFAULT_ASSUMPTIONS });
  const hydrated = ref(false);
  const adapter = makeAdapter(getAuthProvider());

  function hydrate() {
    if (hydrated.value) return;
    const parsed = adapter.get<Partial<Assumptions>>(ENTITY_KEY);
    // The stamp is written even when NOTHING was stored: a brand-new user who types 0 into the
    // /preferences step-up field must have that 0 survive their next reload, and it only can if
    // the document they are about to persist already carries the stamp.
    values.value = { ...DEFAULT_ASSUMPTIONS, ...migrateStepUpDefault(parsed ?? {}) };
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
   * The household expense basket — the SAME rate `derive().householdInflation` plans with
   * (ADR-0006 one-basket, ADR-0007 (d) creep folded in). Thin wrapper over the ONE shared
   * resolver: with lifestyle creep > 0 this used to return the creep-FREE blend while the kernel
   * grew the target at the creep-adjusted one, putting a different number on the expense-trend
   * chart and the /preferences readout from the number in the plan (the gh #180 class). Locked by
   * the creep ∈ {0, 1, 5} equality tests in `src/stores/assumptions.spec.ts`.
   */
  function householdInflation(): number {
    return resolveHouseholdBasket(values.value);
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
