<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

const route = useRoute();
const router = useRouter();

interface NavChild {
  title: string;
  path: string;
}
interface NavSection {
  title: string;
  icon: string;
  path: string;
  children: NavChild[];
}

const sections: NavSection[] = [
  {
    title: "Income",
    icon: "mdi-currency-inr",
    path: "/income",
    children: [
      { title: "Overview", path: "/income/overview" },
      { title: "Salary", path: "/income/salary" },
      { title: "Business", path: "/income/business" },
      { title: "Other Sources", path: "/income/other-sources" },
    ],
  },
  {
    title: "Taxes",
    icon: "mdi-calculator-variant",
    path: "/tax-planning",
    children: [],
  },
  {
    title: "Expenses",
    icon: "mdi-cart-outline",
    path: "/expenses",
    children: [
      { title: "Overview", path: "/expenses/overview" },
      { title: "Recurring", path: "/expenses/recurring" },
      { title: "Planned", path: "/expenses/planned" },
    ],
  },
  {
    title: "Investments",
    icon: "mdi-chart-line",
    path: "/investments",
    children: [
      { title: "Overview", path: "/investments/overview" },
      { title: "Holdings", path: "/investments/holdings" },
    ],
  },
  {
    title: "Liabilities",
    icon: "mdi-credit-card-outline",
    path: "/liabilities",
    children: [
      { title: "Overview", path: "/liabilities/overview" },
      { title: "Loans", path: "/liabilities/loans" },
    ],
  },
  {
    title: "Insurance",
    icon: "mdi-shield-check",
    path: "/insurance",
    children: [
      { title: "Overview", path: "/insurance/overview" },
      { title: "Policies", path: "/insurance/policies" },
    ],
  },
  {
    title: "Health",
    icon: "mdi-heart-pulse",
    path: "/financial-health",
    children: [
      { title: "Health Score", path: "/financial-health" },
      { title: "Net Worth", path: "/financial-health/net-worth" },
      { title: "Cash Flow", path: "/financial-health/cash-flow" },
      { title: "Banking", path: "/financial-health/banking" },
      { title: "Emergency Fund", path: "/financial-health/emergency-fund" },
      { title: "Reports", path: "/financial-health/reports" },
    ],
  },
  {
    title: "FIRE",
    icon: "mdi-fire",
    path: "/fire-goals",
    children: [
      { title: "Dashboard", path: "/fire-goals/dashboard" },
      { title: "Goals", path: "/fire-goals/goals" },
      { title: "Can I retire?", path: "/fire-goals/readiness" },
      { title: "After you retire", path: "/fire-goals/drawdown" },
      { title: "What-If", path: "/fire-goals/what-if" },
    ],
  },
  {
    title: "Profile",
    icon: "mdi-account-multiple",
    path: "/profile",
    children: [],
  },
];

function isSectionActive(section: NavSection): boolean {
  return route.path === section.path || route.path.startsWith(section.path + "/");
}

function isChildActive(childPath: string): boolean {
  return route.path === childPath;
}

// Q6 (v3) — strict single-open accordion. We let Vuetify's v-list-group toggle the `opened`
// model freely; a watcher then enforces "at most one open group at a time" by trimming any
// extras whenever the array grows past length 1. Route changes auto-open the active parent.
const opened = ref<string[]>([]);
const lastOpened = ref<string | null>(null);

const activeParentTitle = computed(() => {
  const found = sections.find((s) => s.children.length > 0 && isSectionActive(s));
  return found?.title ?? null;
});

watch(
  activeParentTitle,
  (title) => {
    opened.value = title ? [title] : [];
    lastOpened.value = title;
  },
  { immediate: true },
);

// Enforce single-open: if the model has > 1 entry (user expanded a second group), keep only
// the newly-added one (the one that wasn't in the previous snapshot).
watch(opened, (next, prev) => {
  if (next.length <= 1) {
    lastOpened.value = next[0] ?? null;
    return;
  }
  const prevSet = new Set(prev ?? []);
  const newlyAdded = next.find((t) => !prevSet.has(t));
  opened.value = newlyAdded ? [newlyAdded] : [next[next.length - 1]];
  lastOpened.value = opened.value[0] ?? null;
});

function navigateTo(path: string) {
  router.push(path);
}
</script>

<template>
  <div class="sidebar-nav">
    <div class="brand d-flex align-center pa-4">
      <v-icon icon="mdi-fire" color="fire-orange" size="32" class="mr-2" />
      <span class="text-h6 font-weight-bold">FIREKaro</span>
    </div>
    <v-divider />

    <nav aria-label="Primary navigation">
    <v-list density="compact" nav v-model:opened="opened" role="presentation">
      <template v-for="section in sections" :key="section.title">
        <v-list-item
          v-if="section.children.length === 0"
          :prepend-icon="section.icon"
          :title="section.title"
          :active="isSectionActive(section)"
          @click="navigateTo(section.path)"
        />

        <v-list-group v-else :value="section.title">
          <template #activator="{ props: activatorProps }">
            <v-list-item
              v-bind="activatorProps"
              :prepend-icon="section.icon"
              :title="section.title"
              :active="isSectionActive(section)"
            />
          </template>
          <v-list-item
            v-for="child in section.children"
            :key="child.path"
            :title="child.title"
            :active="isChildActive(child.path)"
            class="pl-8"
            @click="navigateTo(child.path)"
          />
        </v-list-group>
      </template>
    </v-list>
    </nav>
  </div>
</template>

<style scoped>
.sidebar-nav {
  height: 100%;
}
.brand {
  letter-spacing: -0.01em;
}
</style>
