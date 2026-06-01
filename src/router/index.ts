import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import { useHouseholdStore } from "@/stores/household";
import { useFeaturesStore } from "@/stores/features";
import { useAssumptionsStore } from "@/stores/assumptions";
import { featuresGuardingRoute } from "@/lib/features";
import { getAuthProvider } from "@/lib/auth-provider";

function realRoute(
  path: string,
  name: string,
  loader: () => Promise<unknown>,
): RouteRecordRaw {
  // Cast to RouteRecordRaw — the union expansion in vue-router 4 picks RouteRecordRedirect
  // when 'redirect' is undefined; cast resolves to RouteRecordSingleView.
  return {
    path,
    name,
    component: loader as RouteRecordRaw["component"],
    meta: { layout: "sidebar" },
  } as RouteRecordRaw;
}

const routes: RouteRecordRaw[] = [
  // ---- Public routes (no sidebar layout) ----
  { path: "/", name: "splash", component: () => import("@/pages/Splash.vue") },
  { path: "/login", name: "login", component: () => import("@/pages/Login.vue") },
  { path: "/wizard", redirect: "/wizard/profile" },
  {
    path: "/wizard/:step",
    name: "wizard",
    component: () => import("@/pages/Wizard.vue"),
    props: true,
  },

  // ---- Income (Q12B) ----
  { path: "/income", redirect: "/income/overview" },
  realRoute("/income/overview", "income-overview", () => import("@/pages/income/Overview.vue")),
  realRoute("/income/salary", "income-salary", () => import("@/pages/income/Salary.vue")),
  realRoute("/income/business", "income-business", () => import("@/pages/income/Business.vue")),
  realRoute("/income/other-sources", "income-other-sources", () => import("@/pages/income/OtherSources.vue")),

  // ---- Tax Planning (Q9A) ----
  realRoute("/tax-planning", "tax-planning", () => import("@/pages/tax-planning/Index.vue")),

  // ---- Expenses (Q13b) ----
  { path: "/expenses", redirect: "/expenses/overview" },
  realRoute("/expenses/overview", "expenses-overview", () => import("@/pages/expenses/Overview.vue")),
  realRoute("/expenses/recurring", "expenses-recurring", () => import("@/pages/expenses/Recurring.vue")),
  realRoute("/expenses/planned", "expenses-planned", () => import("@/pages/expenses/Planned.vue")),

  // ---- Investments (Q6B) ----
  { path: "/investments", redirect: "/investments/overview" },
  realRoute("/investments/overview", "investments-overview", () => import("@/pages/investments/Overview.vue")),
  realRoute("/investments/holdings", "investments-holdings", () => import("@/pages/investments/Holdings.vue")),
  // Phase 5 Stage N — time-horizon buckets (audit Entry #8).
  realRoute("/investments/buckets", "investments-buckets", () => import("@/pages/investments/Buckets.vue")),

  // ---- Liabilities (Q7B) ----
  { path: "/liabilities", redirect: "/liabilities/overview" },
  realRoute("/liabilities/overview", "liabilities-overview", () => import("@/pages/liabilities/Overview.vue")),
  realRoute("/liabilities/loans", "liabilities-loans", () => import("@/pages/liabilities/Loans.vue")),

  // ---- Insurance (Q8B) ----
  { path: "/insurance", redirect: "/insurance/overview" },
  realRoute("/insurance/overview", "insurance-overview", () => import("@/pages/insurance/Overview.vue")),
  realRoute("/insurance/policies", "insurance-policies", () => import("@/pages/insurance/Policies.vue")),

  // ---- Financial Health (Q10D + Q11B) ----
  realRoute("/financial-health", "fh-health-score", () => import("@/pages/financial-health/HealthScore.vue")),
  realRoute("/financial-health/net-worth", "fh-net-worth", () => import("@/pages/financial-health/NetWorth.vue")),
  realRoute("/financial-health/cash-flow", "fh-cash-flow", () => import("@/pages/financial-health/CashFlow.vue")),
  realRoute("/financial-health/banking", "fh-banking", () => import("@/pages/financial-health/Banking.vue")),
  realRoute("/financial-health/emergency-fund", "fh-emergency-fund", () => import("@/pages/financial-health/EmergencyFund.vue")),
  realRoute("/financial-health/reports", "fh-reports", () => import("@/pages/financial-health/Reports.vue")),

  // ---- FIRE & Goals (Q3C) ----
  { path: "/fire-goals", redirect: "/fire-goals/dashboard" },
  realRoute("/fire-goals/dashboard", "fire-dashboard", () => import("@/pages/fire-goals/Dashboard.vue")),
  realRoute("/fire-goals/goals", "fire-goals-roadmap", () => import("@/pages/fire-goals/Goals.vue")),
  realRoute("/fire-goals/what-if", "fire-what-if", () => import("@/pages/fire-goals/WhatIf.vue")),
  // Phase 5 Stage O — stress test (audit Entry #27). Feature-gated on
  // fire.stressTest via the router guard (Stage A4).
  realRoute("/fire-goals/stress-test", "fire-goals-stress-test", () => import("@/pages/fire-goals/StressTest.vue")),
  // Legacy alias — old "Calculators" deep links redirect to the new What-If page.
  { path: "/fire-goals/calculators", redirect: "/fire-goals/what-if" },

  // ---- Profile (Q1 v3) — bottom of sidebar; dedicated members + household CRUD ----
  realRoute("/profile", "profile", () => import("@/pages/profile/Index.vue")),

  // ---- Preferences (Phase 3 Stage G) — canonical home for editable assumptions (R1.2) ----
  realRoute("/preferences", "preferences", () => import("@/pages/Preferences.vue")),

  // ---- Estate planning (Phase 5 Stage P) — feature-gated on estate.planning. ----
  realRoute("/estate-planning", "estate-planning", () => import("@/pages/EstatePlanning.vue")),

  // ---- Glossary (Phase 7 Stage S / A33.3) — searchable term index with anchors. ----
  realRoute("/glossary", "glossary", () => import("@/pages/Glossary.vue")),

  // ---- Legacy alias: /dashboard → /fire-goals/dashboard ----
  { path: "/dashboard", redirect: "/fire-goals/dashboard" },
  { path: "/dashboard/:any(.*)*", redirect: "/fire-goals/dashboard" },

  // ---- Catch-all ----
  { path: "/:pathMatch(.*)*", redirect: "/" },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

// Phase 0 Stage A4 — feature-flag route guard.
// Routes whose `name` appears in any featureRegistry entry's `routes[]` are
// gated on ALL referenced features being enabled. Disabled => redirect to
// /preferences#features (Stage G) with the originally-requested route name
// captured in query so the toast can render specific guidance.
//
// Routes in the existing v4 sidebar are NEVER gated by this guard (Q3 Hybrid
// lock: sidebar always shows 12 items). Only NEW routes added in v5 stages
// (N: /investments/buckets, O: /fire-goals/stress-test, P: /estate-planning)
// participate in the gate.
// Auth gate (v6) — runs FIRST, before feature-gate + onboarding. In server mode an
// unauthenticated session installs UnauthenticatedAuthProvider (main.ts) →
// isAuthenticated() is false → bounce to /login before any store hydrates. In
// demo/localStorage mode the provider is LocalAuthProvider (always authed), so this
// guard is a no-op and the demo flow is UNCHANGED (the non-negotiable spine).
router.beforeEach((to) => {
  const authed = getAuthProvider().isAuthenticated();
  if (!authed && to.name !== "login") return { name: "login" };
  if (authed && to.name === "login") return { name: "splash" };
  return true;
});

router.beforeEach((to) => {
  const guardingFeatures = featuresGuardingRoute(String(to.name ?? ""));
  if (guardingFeatures.length === 0) return true;
  const features = useFeaturesStore();
  features.hydrate();
  const allEnabled = guardingFeatures.every((f) => features.isEnabled(f.key));
  if (allEnabled) return true;
  // Stage G — /preferences route now lands. Disabled-feature routes redirect
  // to /preferences#features with the originally-requested route name in
  // ?from so the page can render a contextual toast.
  return {
    name: "preferences",
    hash: "#pref-section-features",
    query: {
      featureDisabled: guardingFeatures.map((f) => f.key).join(","),
      from: String(to.name ?? ""),
    },
  };
});

router.beforeEach((to) => {
  if (to.name === "splash") {
    // Q18A: returning users with completed wizard skip splash and land
    // directly on the FIRE Dashboard. Splash stays as the entry for
    // first-timers + the explicit "reset to empty" path from Assumptions panel.
    const household = useHouseholdStore();
    household.hydrate();
    if (household.wizardCompleted) {
      return { name: "fire-dashboard" };
    }
    return true;
  }

  const household = useHouseholdStore();
  household.hydrate();
  // Hydrate assumptions too so /preferences edits (returns, inflation, variant
  // multipliers, SWR) survive a full reload onto any route — not just the
  // splash/preferences pages that previously owned the only hydrate calls.
  useAssumptionsStore().hydrate();

  if (String(to.name ?? "").startsWith("wizard")) return true;

  if (to.meta?.layout === "sidebar") {
    if (household.members.length === 0) return { name: "splash" };
    if (!household.profileComplete) return { name: "wizard", params: { step: "profile" } };
  }

  return true;
});

export default router;
