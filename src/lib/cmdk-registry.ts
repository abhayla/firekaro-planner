// Stage E — Cmd-K command registry. Three categories: Navigate / Actions / Glossary.
import type { Router } from "vue-router";
import { TERM_GLOSSARY, glossaryCategory } from "@/lib/glossary";
import { loadSeed, SEED_META, type SeedName } from "@/seeds";
import { isServerMode } from "@/lib/runtime-mode";

export type CmdCategory = "Navigate" | "Actions" | "Glossary";

export interface CmdItem {
  id: string;
  category: CmdCategory;
  label: string;
  hint?: string;
  icon: string;
  keywords?: string;
  run: (ctx: CmdContext) => void | Promise<void>;
}

export interface CmdContext {
  router: Router;
}

const NAV: Array<Pick<CmdItem, "id" | "label" | "icon" | "keywords"> & { path: string }> = [
  { id: "nav-dashboard", label: "FIRE Dashboard", path: "/fire-goals/dashboard", icon: "mdi-fire", keywords: "home main hero" },
  { id: "nav-whatif", label: "What-If sandbox", path: "/fire-goals/what-if", icon: "mdi-tune-variant", keywords: "scenario lever simulator" },
  { id: "nav-goals", label: "Goals", path: "/fire-goals/goals", icon: "mdi-flag-checkered", keywords: "milestone target" },
  { id: "nav-income-overview", label: "Income — Overview", path: "/income/overview", icon: "mdi-cash-multiple" },
  { id: "nav-income-salary", label: "Income — Salary", path: "/income/salary", icon: "mdi-account-tie" },
  { id: "nav-income-business", label: "Income — Business", path: "/income/business", icon: "mdi-briefcase-outline" },
  { id: "nav-income-other", label: "Income — Other Sources", path: "/income/other-sources", icon: "mdi-cash-plus" },
  { id: "nav-taxes", label: "Taxes", path: "/tax-planning", icon: "mdi-calculator-variant", keywords: "tax planning regime old new" },
  { id: "nav-expenses-overview", label: "Expenses — Overview", path: "/expenses/overview", icon: "mdi-cart-outline" },
  { id: "nav-expenses-recurring", label: "Expenses — Recurring", path: "/expenses/recurring", icon: "mdi-repeat" },
  { id: "nav-expenses-planned", label: "Expenses — Planned", path: "/expenses/planned", icon: "mdi-calendar-clock" },
  { id: "nav-inv-overview", label: "Investments — Overview", path: "/investments/overview", icon: "mdi-chart-line" },
  { id: "nav-inv-holdings", label: "Investments — Holdings", path: "/investments/holdings", icon: "mdi-format-list-bulleted" },
  { id: "nav-liab-overview", label: "Liabilities — Overview", path: "/liabilities/overview", icon: "mdi-credit-card-outline" },
  { id: "nav-liab-loans", label: "Liabilities — Loans", path: "/liabilities/loans", icon: "mdi-bank-outline" },
  { id: "nav-ins-overview", label: "Insurance — Overview", path: "/insurance/overview", icon: "mdi-shield-check" },
  { id: "nav-ins-policies", label: "Insurance — Policies", path: "/insurance/policies", icon: "mdi-file-document-multiple" },
  { id: "nav-health-score", label: "Financial Health — Score", path: "/financial-health", icon: "mdi-finance" },
  { id: "nav-health-networth", label: "Financial Health — Net Worth", path: "/financial-health/net-worth", icon: "mdi-chart-line-variant" },
  { id: "nav-health-cashflow", label: "Financial Health — Cash Flow", path: "/financial-health/cash-flow", icon: "mdi-cash-flow" },
  { id: "nav-health-banking", label: "Financial Health — Banking", path: "/financial-health/banking", icon: "mdi-bank" },
  { id: "nav-health-emergency", label: "Financial Health — Emergency Fund", path: "/financial-health/emergency-fund", icon: "mdi-shield-alert" },
  { id: "nav-health-reports", label: "Financial Health — Reports", path: "/financial-health/reports", icon: "mdi-file-chart" },
  { id: "nav-profile", label: "Profile", path: "/profile", icon: "mdi-account-multiple" },
  { id: "nav-glossary", label: "Glossary", path: "/glossary", icon: "mdi-book-open-page-variant", keywords: "terms definitions jargon reference" },
];

export function buildCommands(): CmdItem[] {
  const navCmds: CmdItem[] = NAV.map((n) => ({
    id: n.id,
    category: "Navigate" as const,
    label: n.label,
    hint: n.path,
    icon: n.icon,
    keywords: n.keywords ?? "",
    run: ({ router }) => {
      void router.push(n.path);
    },
  }));

  const seedNames = Object.keys(SEED_META) as SeedName[];
  const actionCmds: CmdItem[] = [
    {
      id: "act-add-expense",
      category: "Actions",
      label: "Add expense",
      hint: "Recurring",
      icon: "mdi-cart-plus",
      keywords: "create new spending bill",
      run: ({ router }) => router.push("/expenses/recurring?addNew=true"),
    },
    {
      id: "act-add-member",
      category: "Actions",
      label: "Add member",
      hint: "Profile",
      icon: "mdi-account-plus",
      keywords: "add earner dependent family",
      run: ({ router }) => router.push("/profile?addNew=true"),
    },
    {
      id: "act-add-investment",
      category: "Actions",
      label: "Add investment",
      hint: "Holdings",
      icon: "mdi-chart-line-variant",
      keywords: "create equity sip ppf",
      run: ({ router }) => router.push("/investments/holdings?addNew=true"),
    },
    {
      id: "act-add-loan",
      category: "Actions",
      label: "Add loan",
      hint: "Liabilities",
      icon: "mdi-bank-plus",
      keywords: "create emi debt",
      run: ({ router }) => router.push("/liabilities/loans?addNew=true"),
    },
    {
      id: "act-add-policy",
      category: "Actions",
      label: "Add insurance policy",
      hint: "Insurance",
      icon: "mdi-shield-plus",
      keywords: "create life health term",
      run: ({ router }) => router.push("/insurance/policies?addNew=true"),
    },
    {
      id: "act-open-whatif",
      category: "Actions",
      label: "Open What-If sandbox",
      hint: "FIRE",
      icon: "mdi-tune-variant",
      keywords: "simulator lever scenario",
      run: ({ router }) => router.push("/fire-goals/what-if"),
    },
    // DEMO-ONLY: seed-switch commands call loadSeed(), which overwrites the
    // household — they MUST NOT exist in server/authenticated mode (gh #36), else
    // a logged-in user could destroy their real account via Cmd-K.
    ...(isServerMode()
      ? []
      : seedNames.map((s) => ({
          id: `act-seed-${s}`,
          category: "Actions" as const,
          label: `Switch to ${SEED_META[s].label}`,
          hint: "Seed",
          icon: SEED_META[s].icon,
          keywords: `seed switch persona ${s}`,
          run: ({ router }: CmdContext) => {
            loadSeed(s);
            const path = s === "empty" ? "/wizard" : "/fire-goals/dashboard";
            router.push(path).then(() => setTimeout(() => window.location.reload(), 50));
          },
        }))),
  ];

  const glossaryCmds: CmdItem[] = Object.entries(TERM_GLOSSARY).map(([key, entry]) => {
    const cat = glossaryCategory(key as keyof typeof TERM_GLOSSARY);
    return {
      id: `gloss-${key}`,
      category: "Glossary" as const,
      label: entry.label,
      hint: `${cat} · ${entry.explanation.slice(0, 72)}${entry.explanation.length > 72 ? "…" : ""}`,
      icon: "mdi-book-open-page-variant",
      keywords: `${cat} ${entry.label} ${entry.explanation}`.toLowerCase(),
      // A33.3 — glossary commands now deep-link to the term on the /glossary index.
      run: ({ router }) => {
        void router.push(`/glossary#term-${key}`);
      },
    };
  });

  return [...navCmds, ...actionCmds, ...glossaryCmds];
}

export function fuzzyMatch(query: string, items: CmdItem[]): CmdItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  const scored = items
    .map((item) => {
      const hay = `${item.label} ${item.hint ?? ""} ${item.keywords ?? ""}`.toLowerCase();
      // Cheap fuzzy: substring match + bonus for label prefix
      let score = 0;
      if (item.label.toLowerCase().startsWith(q)) score += 100;
      if (item.label.toLowerCase().includes(q)) score += 50;
      if (hay.includes(q)) score += 10;
      // Char-by-char in order (loose fuzzy)
      let qi = 0;
      for (const c of hay) {
        if (c === q[qi]) qi++;
        if (qi === q.length) break;
      }
      if (qi === q.length) score += 5;
      return { item, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
  return scored.map((s) => s.item);
}
