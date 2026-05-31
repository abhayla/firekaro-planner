import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { makeAdapter } from "@/lib/storage-adapter";
import { getAuthProvider } from "@/lib/auth-provider";

// Storage now routes through @/lib/storage-adapter — namespaced by userId per ADR-0001.
const ENTITY_KEY = "scenarios";

/**
 * Q8.3 (v3) — named What-If scenarios. Each scenario captures a partial set of lever
 * overrides (the levers the user changed from baseline). Missing levers fall back to
 * baseline computed from household + assumptions.
 *
 * Lever keys map to LeverValues below; perEarnerHikePct / kidsCollegeYears are nested
 * maps keyed by memberId / dependentId.
 */
export interface LeverValues {
  annualExpenses?: number;
  monthlyContribution?: number;
  /** Expected return as decimal (e.g. 0.10 for 10%). */
  expectedReturn?: number;
  /** SWR as decimal (e.g. 0.035 for 3.5%). */
  swr?: number;
  /** Target retirement age for the primary earner. */
  retirementAge?: number;
  /** Inflation as decimal. */
  inflation?: number;
  /** One-time lump-sum windfall added to corpus at year 0. */
  lumpSumWindfall?: number;
  /** Per-earner hike % overrides (memberId -> percent). */
  perEarnerHikePct?: Record<string, number>;
  /** Healthcare inflation as decimal. */
  healthcareInflation?: number;
  /** Equity allocation % (0-100). */
  equityAllocationPct?: number;
  /** Per-dependent kid's college start year. */
  kidsCollegeYears?: Record<string, number>;
  /** Marriage goal year. */
  marriageYear?: number;
}

export interface Scenario {
  id: string;
  name: string;
  leverValues: LeverValues;
  createdAt: number;
}

function newId(): string {
  return `scn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Phase 4 Stage M — 6 audit-mandated seed scenarios (Entry #26 A26.1)
// grouped into "Positive variations" + "Stress tests" per Entry #26 A26.3.
function seedScenarios(): Scenario[] {
  return [
    // ---- Positive variations (3) ----
    {
      id: newId(),
      name: "Positive · Aggressive savings",
      leverValues: {
        monthlyContribution: 80000,
        expectedReturn: 0.11,
        equityAllocationPct: 75,
      },
      createdAt: Date.now() - 86400000 * 6,
    },
    {
      id: newId(),
      name: "Positive · Windfall received",
      leverValues: {
        lumpSumWindfall: 2500000,
      },
      createdAt: Date.now() - 86400000 * 5,
    },
    {
      id: newId(),
      name: "Positive · Hike + promotion",
      leverValues: {
        // Conservative 15% hike per earner per Ch 02 §2.8.
        perEarnerHikePct: { default: 15 },
      },
      createdAt: Date.now() - 86400000 * 4,
    },
    // ---- Stress tests (3) ----
    {
      id: newId(),
      name: "Stress · Conservative outlook",
      leverValues: {
        expectedReturn: 0.07,
        inflation: 0.07,
        swr: 0.03,
        equityAllocationPct: 35,
      },
      createdAt: Date.now() - 86400000 * 3,
    },
    {
      id: newId(),
      name: "Stress · Healthcare shock",
      leverValues: {
        healthcareInflation: 0.12,
        // Conservative one-time medical expense bump.
        lumpSumWindfall: -1500000,
      },
      createdAt: Date.now() - 86400000 * 2,
    },
    {
      id: newId(),
      name: "Stress · SORR + market correction",
      leverValues: {
        // Sequence-of-returns risk simulator — drop SWR + expected return.
        swr: 0.025,
        expectedReturn: 0.06,
        equityAllocationPct: 40,
      },
      createdAt: Date.now() - 86400000,
    },
  ];
}

export const useScenariosStore = defineStore("scenarios", () => {
  const scenarios = ref<Scenario[]>([]);
  const hydrated = ref(false);
  const adapter = makeAdapter(getAuthProvider());

  function hydrate() {
    if (hydrated.value) return;
    const parsed = adapter.get<Scenario[]>(ENTITY_KEY);
    if (Array.isArray(parsed)) {
      scenarios.value = parsed.filter(
        (s) => s && typeof s.id === "string" && typeof s.name === "string",
      );
    } else {
      scenarios.value = seedScenarios();
    }
    hydrated.value = true;
  }

  function persist() {
    adapter.set(ENTITY_KEY, scenarios.value);
  }

  watch(scenarios, persist, { deep: true });

  function addScenario(name: string, leverValues: LeverValues): Scenario {
    const s: Scenario = { id: newId(), name, leverValues, createdAt: Date.now() };
    scenarios.value.push(s);
    return s;
  }
  function updateScenario(id: string, patch: Partial<Scenario>) {
    const s = scenarios.value.find((x) => x.id === id);
    if (s) Object.assign(s, patch);
  }
  function removeScenario(id: string) {
    scenarios.value = scenarios.value.filter((s) => s.id !== id);
  }
  function reset() {
    scenarios.value = seedScenarios();
  }

  return { scenarios, hydrate, addScenario, updateScenario, removeScenario, reset };
});
