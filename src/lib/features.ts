/**
 * Feature registry — the runtime mechanism for the v5 hybrid feature-gating
 * model (contract §1.1 Decision 3: always-12-sidebar + 6-section onboarding
 * questionnaire that gates per-feature content).
 *
 * Phase 0 Stage A4 per docs/goals/build-firekaro-mvp-v5.md §3
 * (Concern #6 from /improve-codebase-architecture: "No feature-flag seam").
 *
 * Every gateable feature in v5 has exactly one row in `featureRegistry`.
 * Per-section forms / cards / sub-routes conditionally render via
 * `useFeatures(userId).isEnabled(key)`. The 12 top-level sidebar items
 * always render (per Q3 Hybrid lock) — gating happens INSIDE those routes.
 *
 * Questionnaire flow (Stage F):
 *   Q1 Investments held -> enable Stocks/MF/Gold/FD/PPF/etc.
 *   Q2 Liabilities      -> enable HomeLoan/PersonalLoan/CC/etc.
 *   Q3 Insurance        -> enable Life/Health/Vehicle insurance
 *   Q4 Family situation -> enable Parents bucket / Education / Marriage
 *                          / Extended-contingency
 *   Q5 Tax situation    -> enable Sandwich-gen tax nudges / HRA
 *   Q6 Planning concerns -> opt-IN-by-default: Coast/Barista FIRE,
 *                          stress-test, estate planning, healthcare
 *                          buffer; user opts OUT
 *
 * Skip path (Principle 3 alignment): the wizard always exposes "Skip — show
 * me everything" which enables EVERY feature in one click and lands the
 * user on the dashboard with the v4-faithful surface.
 */

import type { Ref } from "vue";
import { computed, ref } from "vue";

// ---------- Feature shape ----------

export type QuestionnaireSection = 1 | 2 | 3 | 4 | 5 | 6;

export interface Feature {
  /** Stable identifier referenced by route meta + sub-section v-if checks. */
  key: string;
  /** Display label rendered on /preferences §Features + wizard checkboxes. */
  label: string;
  /** One-sentence helper text rendered next to the toggle. */
  description: string;
  /** Default enabled state when no user answer exists yet. */
  defaultEnabled: boolean;
  /** Wizard step that gates this feature (1-6). */
  questionnaireSection: QuestionnaireSection;
  /**
   * Vue Router route names that disappear when this feature is disabled.
   * Empty array means the feature only gates in-page content (not a route).
   */
  routes: string[];
  /**
   * Sidebar section grouping for /preferences §Features rendering. NOT used
   * for the actual sidebar visibility (sidebar always shows 12 items per Q3).
   */
  sidebarSection?: string;
  /**
   * One-line copy rendered in the Discovery footer when this feature is
   * disabled on a route it would otherwise gate. Format: "<feature name>".
   * The footer wraps multiple disabled features into a list.
   */
  discoveryCopy?: string;
  /**
   * Other feature keys that must be enabled for this feature to activate.
   * Example: REIT requires Investments (always enabled); Marriage event
   * requires Family situation answered.
   */
  dependsOn?: string[];
}

// ---------- Registry ----------

/**
 * 30 features covering the v5 surface. Each section number maps to a
 * wizard step (Stage F). Adding a new gateable surface? Add an entry
 * here — the wizard, /preferences §Features, and Discovery footer all
 * consume this registry.
 */
export const featureRegistry: Feature[] = [
  // Section 1 — Investments held
  {
    key: "investments.stocks",
    label: "Stocks (direct equity)",
    description: "Individual listed stocks held in a demat account.",
    defaultEnabled: true,
    questionnaireSection: 1,
    routes: [],
    discoveryCopy: "Direct stock holdings",
  },
  {
    key: "investments.mutualFunds",
    label: "Mutual Funds",
    description: "Equity / debt / hybrid mutual fund holdings.",
    defaultEnabled: true,
    questionnaireSection: 1,
    routes: [],
    discoveryCopy: "Mutual fund holdings",
  },
  {
    key: "investments.nps",
    label: "NPS",
    description: "National Pension System Tier-I / Tier-II contributions.",
    defaultEnabled: true,
    questionnaireSection: 1,
    routes: [],
    discoveryCopy: "NPS withdrawal planning",
  },
  {
    key: "investments.epf",
    label: "EPF / VPF",
    description: "Employees' Provident Fund + Voluntary contributions.",
    defaultEnabled: true,
    questionnaireSection: 1,
    routes: [],
    discoveryCopy: "EPF / VPF threshold breakdown",
  },
  {
    key: "investments.ppf",
    label: "PPF",
    description: "Public Provident Fund (15-year lock-in, EEE).",
    defaultEnabled: true,
    questionnaireSection: 1,
    routes: [],
  },
  {
    key: "investments.esop",
    label: "ESOP / RSU",
    description: "Employee stock options and restricted stock units.",
    defaultEnabled: false,
    questionnaireSection: 1,
    routes: [],
    discoveryCopy: "ESOP / RSU tracking",
  },
  {
    key: "investments.realEstate",
    label: "Real Estate",
    description: "Self-owned, rented out, or co-owned property.",
    defaultEnabled: true,
    questionnaireSection: 1,
    routes: [],
  },
  {
    key: "investments.reit",
    label: "REIT",
    description: "Listed real estate investment trusts (new in v5).",
    defaultEnabled: false,
    questionnaireSection: 1,
    routes: [],
    discoveryCopy: "REIT holdings",
  },
  {
    key: "investments.gold",
    label: "Gold (Physical / SGB / ETF)",
    description: "Physical, sovereign gold bonds, or gold ETFs.",
    defaultEnabled: true,
    questionnaireSection: 1,
    routes: [],
  },
  {
    key: "investments.fd",
    label: "Fixed Deposits",
    description: "Bank FDs and corporate deposits.",
    defaultEnabled: true,
    questionnaireSection: 1,
    routes: [],
  },
  {
    key: "investments.crypto",
    label: "Crypto",
    description: "Cryptocurrency holdings (slab-taxed in India).",
    defaultEnabled: false,
    questionnaireSection: 1,
    routes: [],
    discoveryCopy: "Crypto holdings",
  },
  {
    key: "investments.international",
    label: "International Equity",
    description: "Foreign equity via LRS / FoF / GIFT City (new in v5).",
    defaultEnabled: false,
    questionnaireSection: 1,
    routes: [],
    discoveryCopy: "International equity (LRS / FoF / GIFT City)",
  },
  {
    key: "investments.scss",
    label: "SCSS (Senior Citizens)",
    description: "Senior Citizens Savings Scheme (parents-only post 60).",
    defaultEnabled: false,
    questionnaireSection: 1,
    routes: [],
    discoveryCopy: "SCSS for parents",
  },
  {
    key: "investments.sukanya",
    label: "Sukanya Samriddhi",
    description: "Government savings scheme for daughters under 10.",
    defaultEnabled: false,
    questionnaireSection: 1,
    routes: [],
    discoveryCopy: "Sukanya Samriddhi (daughter under 10)",
  },

  // Section 2 — Liabilities
  {
    key: "liabilities.homeLoan",
    label: "Home Loan",
    description: "Mortgage / housing loan EMIs.",
    defaultEnabled: true,
    questionnaireSection: 2,
    routes: [],
  },
  {
    key: "liabilities.personalLoan",
    label: "Personal Loan",
    description: "Unsecured personal loans.",
    defaultEnabled: false,
    questionnaireSection: 2,
    routes: [],
    discoveryCopy: "Personal loan tracking",
  },
  {
    key: "liabilities.creditCard",
    label: "Credit Card Debt",
    description: "Revolving credit-card balances.",
    defaultEnabled: false,
    questionnaireSection: 2,
    routes: [],
    discoveryCopy: "Credit card debt",
  },
  {
    key: "liabilities.carLoan",
    label: "Car Loan",
    description: "Vehicle finance EMIs.",
    defaultEnabled: false,
    questionnaireSection: 2,
    routes: [],
    discoveryCopy: "Car loan tracking",
  },

  // Section 3 — Insurance
  {
    key: "insurance.life",
    label: "Life Insurance",
    description: "Term + traditional life insurance policies.",
    defaultEnabled: true,
    questionnaireSection: 3,
    routes: [],
  },
  {
    key: "insurance.health",
    label: "Health Insurance",
    description: "Self + family floater + parents senior cover.",
    defaultEnabled: true,
    questionnaireSection: 3,
    routes: [],
  },
  {
    key: "insurance.vehicle",
    label: "Vehicle Insurance",
    description: "Car / two-wheeler insurance policies.",
    defaultEnabled: false,
    questionnaireSection: 3,
    routes: [],
    discoveryCopy: "Vehicle insurance",
  },

  // Section 4 — Family situation
  {
    key: "family.parentsBucket",
    label: "Aging Parents Bucket",
    description: "Dedicated expense + healthcare bucket for elders.",
    defaultEnabled: false,
    questionnaireSection: 4,
    routes: [],
    discoveryCopy: "Parents bucket (sandwich-gen)",
  },
  {
    key: "family.educationTarget",
    label: "Children's Education Target",
    description: "Goal-funded education corpus per child.",
    defaultEnabled: false,
    questionnaireSection: 4,
    routes: [],
    discoveryCopy: "Education targets",
  },
  {
    key: "family.marriageEvent",
    label: "Marriage Event",
    description: "One-time marriage corpus per child.",
    defaultEnabled: false,
    questionnaireSection: 4,
    routes: [],
    discoveryCopy: "Marriage event planning",
  },
  {
    key: "family.extendedContingency",
    label: "Extended-family Contingency",
    description: "7.5% buffer for unexpected family obligations.",
    defaultEnabled: false,
    questionnaireSection: 4,
    routes: [],
    discoveryCopy: "Extended-family contingency",
  },

  // Section 5 — Tax situation
  {
    key: "tax.sandwichGenNudges",
    label: "Sandwich-gen Tax Nudges",
    description: "Cross-pillar tax suggestions (parents 80D, daughter Sukanya).",
    defaultEnabled: false,
    questionnaireSection: 5,
    routes: [],
    discoveryCopy: "Sandwich-gen tax nudges",
  },

  // Section 6 — Planning concerns (default opt-IN; user opts OUT)
  {
    key: "fire.coast",
    label: "Coast FIRE Milestone",
    description: "Stop-saving point where corpus alone grows to FIRE number.",
    defaultEnabled: true,
    questionnaireSection: 6,
    routes: [],
    discoveryCopy: "Coast FIRE milestone",
  },
  {
    key: "fire.barista",
    label: "Barista FIRE Alternative",
    description: "Reduced-work alternative path to financial independence.",
    defaultEnabled: true,
    questionnaireSection: 6,
    routes: [],
    discoveryCopy: "Barista FIRE alternative",
  },
  {
    key: "fire.stressTest",
    label: "Stress Testing",
    description: "Batch-run 10 stress scenarios (SORR, drawdown, healthcare).",
    defaultEnabled: true,
    questionnaireSection: 6,
    routes: ["fire-goals-stress-test"],
    discoveryCopy: "Stress testing",
  },
  {
    key: "estate.planning",
    label: "Estate Planning",
    description: "7-step checklist: will / nominees / POA / digital / HUF.",
    defaultEnabled: true,
    questionnaireSection: 6,
    routes: ["estate-planning"],
    discoveryCopy: "Estate planning",
  },
  {
    key: "fire.healthcareBuffer",
    label: "Healthcare Corpus Buffer",
    description: "Dedicated 20% reservation for healthcare in FIRE corpus.",
    defaultEnabled: true,
    questionnaireSection: 6,
    discoveryCopy: "Healthcare corpus buffer",
    routes: [],
  },
  {
    key: "fire.incomeBucketMethod",
    label: "Income-bucket Method (Pattu)",
    description: "Glossary stub only in MVP-1 — full implementation in MVP-2.",
    defaultEnabled: false,
    questionnaireSection: 6,
    routes: [],
  },
];

// Sanity check — registry has 30+ features per DoD.
// Performed at module load; throws loud during dev if entries are dropped.
if (featureRegistry.length < 30) {
  throw new Error(
    `featureRegistry expected ≥30 entries; found ${featureRegistry.length}. ` +
      `See docs/goals/build-firekaro-mvp-v5.md Stage A4 DoD.`,
  );
}

/**
 * Lookup helper — find a feature definition by key. Returns undefined for
 * unknown keys so callers can decide whether to throw or no-op.
 */
export function getFeature(key: string): Feature | undefined {
  return featureRegistry.find((f) => f.key === key);
}

/**
 * All feature keys that gate the given route name. Used by the router guard
 * (a route MAY require multiple features all-enabled). Returns empty for
 * routes with no gating features.
 */
export function featuresGuardingRoute(routeName: string): Feature[] {
  return featureRegistry.filter((f) => f.routes.includes(routeName));
}

// ---------- useFeatures composable ----------

/**
 * Per-user feature-flag state. Keyed by feature.key. Missing keys fall back
 * to feature.defaultEnabled.
 *
 * Multi-tenant per ADR-0001 — every flag set carries a userId. v5 runtime
 * always uses 'self'; v6 SaaS keys by the real authenticated user id.
 */
export interface FeatureFlagState {
  userId: string;
  flags: Record<string, boolean>;
}

/**
 * Reactive state container — held by the Pinia features store (separate
 * file mvp/src/stores/features.ts wires this into Pinia + the storage
 * adapter).
 *
 * The composable's job: expose the read API (isEnabled, disabledKeysForRoute,
 * etc.) so consumer surfaces don't import the store directly. Mutators
 * (enable/disable/enableAll) write to the same reactive state.
 *
 * This is the seam Concern #6 names. With this in place, adding a new
 * gateable surface = one row in featureRegistry + a v-if in the consuming
 * component. No store edits, no router config, no scattered defaults.
 */
export interface UseFeaturesReturn {
  /** Reactive — current full flag map (defaults filled in). */
  flags: Ref<Record<string, boolean>>;
  /** True when the feature is enabled, considering dependsOn chains. */
  isEnabled: (key: string) => boolean;
  /** Set a single feature on. */
  enable: (key: string) => void;
  /** Set a single feature off. */
  disable: (key: string) => void;
  /** Set a single feature explicitly. */
  setEnabled: (key: string, value: boolean) => void;
  /** Enable every feature in the registry (the "Skip — show everything" path). */
  enableAll: () => void;
  /** Reset all features to their registry defaults. */
  resetToDefaults: () => void;
  /** All feature keys disabled on a given route — feeds Discovery footer copy. */
  disabledFeatureKeysForRoute: (routeName: string) => string[];
}

/**
 * Standalone composable usable in tests + non-Pinia contexts. The Pinia
 * store (stores/features.ts) calls this internally and re-exposes the
 * result so consumers can grab the API via either path.
 *
 * @param state — reactive ref the composable mutates. Caller owns
 * persistence; the composable is pure reactivity over the ref.
 */
export function useFeatures(
  state: Ref<FeatureFlagState>,
): UseFeaturesReturn {
  // Compute the EFFECTIVE flag map: registry defaults overlaid with the
  // user's explicit toggles. Looking up `.value[key]` returns boolean
  // whether or not the user has touched the toggle.
  const flags = computed<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    for (const f of featureRegistry) {
      out[f.key] = state.value.flags[f.key] ?? f.defaultEnabled;
    }
    return out;
  });

  function isEnabled(key: string): boolean {
    const feature = getFeature(key);
    if (!feature) return false;
    if (!flags.value[key]) return false;
    // Walk dependsOn chain — short-circuit on first disabled ancestor.
    if (feature.dependsOn) {
      for (const dep of feature.dependsOn) {
        if (!isEnabled(dep)) return false;
      }
    }
    return true;
  }

  function setEnabled(key: string, value: boolean) {
    state.value = {
      ...state.value,
      flags: { ...state.value.flags, [key]: value },
    };
  }

  function enable(key: string) {
    setEnabled(key, true);
  }
  function disable(key: string) {
    setEnabled(key, false);
  }

  function enableAll() {
    const flagsOn: Record<string, boolean> = {};
    for (const f of featureRegistry) flagsOn[f.key] = true;
    state.value = { ...state.value, flags: flagsOn };
  }

  function resetToDefaults() {
    state.value = { ...state.value, flags: {} };
  }

  function disabledFeatureKeysForRoute(routeName: string): string[] {
    return featuresGuardingRoute(routeName)
      .filter((f) => !isEnabled(f.key))
      .map((f) => f.key);
  }

  return {
    flags,
    isEnabled,
    enable,
    disable,
    setEnabled,
    enableAll,
    resetToDefaults,
    disabledFeatureKeysForRoute,
  };
}

/**
 * Test helper — build a fresh reactive state for unit tests.
 * Not used by production code; the Pinia store creates its own ref.
 */
export function createFeatureState(
  userId = "self",
  initialFlags: Record<string, boolean> = {},
): Ref<FeatureFlagState> {
  return ref({ userId, flags: { ...initialFlags } });
}
