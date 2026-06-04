// Seed orchestration — 4 anonymized personas for the v5 mvp switcher.
// Per contract Q7: Sharmas (default median-33 sandwich-gen) / Iyers (late-30s sandwich-gen) /
//                  Mehtas (DINK near-FIRE) / Empty (wizard launch).
// Storage key 'firekaro-mvp:active-seed' persists user's last choice. Iyers seed lands in Stage V.

import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import { loadEmptySeed } from "./empty";
import { loadMehtasSeed } from "./mehtas";
import { loadIyersSeed } from "./iyers";
import { loadMauryasSeed } from "./mauryas";
import { makeAdapter } from "@/lib/storage-adapter";
import { getAuthProvider } from "@/lib/auth-provider";

// Phase 8 Stage V — 4 personas including new "Iyers" (Q7 grill resolution).
export type SeedName = "sharmas" | "empty" | "mehtas" | "iyers" | "mauryas";

export interface SeedMeta {
  id: SeedName;
  label: string;
  description: string;
  icon: string;
}

export const SEED_META: Record<SeedName, SeedMeta> = {
  sharmas: {
    id: "sharmas",
    label: "The Sharmas",
    description: "Family of 4 · mid-FIRE journey · still building the corpus",
    icon: "mdi-home-heart",
  },
  empty: {
    id: "empty",
    label: "Empty Sheet",
    description: "Start fresh · the wizard launches automatically",
    icon: "mdi-file-document-outline",
  },
  mehtas: {
    id: "mehtas",
    label: "The Mehtas",
    description: "DINK couple · near FIRE · ~2 yrs out",
    icon: "mdi-rocket-launch",
  },
  iyers: {
    id: "iyers",
    label: "The Iyers",
    description: "Late-30s sandwich-gen · 2 kids + 2 parents · joint home loan",
    icon: "mdi-account-group",
  },
  mauryas: {
    id: "mauryas",
    label: "The Mauryas",
    description: "Single-income mid-40s · homemaker spouse · school-age child · full-spread portfolio",
    icon: "mdi-home-account",
  },
};

const ACTIVE_SEED_ENTITY_KEY = "active-seed";

export function loadSeed(name: SeedName) {
  const household = useHouseholdStore();
  const assumptions = useAssumptionsStore();

  if (name === "sharmas") {
    loadSeedPersona(household, assumptions);
  } else if (name === "mehtas") {
    loadMehtasSeed(household, assumptions);
  } else if (name === "iyers") {
    loadIyersSeed(household, assumptions);
  } else if (name === "mauryas") {
    loadMauryasSeed(household, assumptions);
  } else {
    loadEmptySeed(household, assumptions);
  }

  makeAdapter(getAuthProvider()).set(ACTIVE_SEED_ENTITY_KEY, name);
}

export function getActiveSeed(): SeedName {
  const stored = makeAdapter(getAuthProvider()).get<string>(ACTIVE_SEED_ENTITY_KEY);
  if (isSeedName(stored)) return stored;
  return "sharmas";
}

export function isSeedName(value: unknown): value is SeedName {
  return (
    value === "sharmas" ||
    value === "empty" ||
    value === "mehtas" ||
    value === "iyers" ||
    value === "mauryas"
  );
}
