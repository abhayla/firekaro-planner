// Stage G — first-visit storytelling tour definitions, per-seed.
// Each step targets a CSS selector visible on the dashboard for the chosen seed.
// Sharmas tour highlights mid-FIRE journey; Mehtas tour highlights near-FIRE achievement.
// Empty seed has NO tour — the wizard handles onboarding for new users.

import type { SeedName } from "@/seeds";
import { makeAdapter } from "@/lib/storage-adapter";
import { getAuthProvider } from "@/lib/auth-provider";

export interface TourStepDef {
  target: string; // CSS selector or DOM landmark
  title: string;
  copy: string;
  placement?: "top" | "bottom" | "left" | "right" | "center";
}

export const TOUR_STEPS: Partial<Record<SeedName, TourStepDef[]>> = {
  sharmas: [
    {
      target: ".fire-hero",
      title: "Your FIRE number",
      copy:
        "This is what your corpus needs to be — 28× annual expenses — to retire and live off withdrawals indefinitely. The progress bar shows how close you are today.",
      placement: "bottom",
    },
    {
      target: ".fire-hero .stat-block",
      title: "Savings rate · take-home · return",
      copy:
        "These stat blocks summarise the levers that drive your FIRE date. The What-If sandbox lets you see exactly how a tighter budget or higher SIP moves the timeline.",
      placement: "bottom",
    },
    {
      target: "a[href='/fire-goals/what-if']",
      title: "Try the What-If sandbox",
      copy:
        "Adjust 10 levers — expenses, contributions, return assumptions, retirement age — and watch your FIRE date shift live. Save named scenarios to compare later.",
      placement: "right",
    },
    {
      target: ".v-navigation-drawer",
      title: "Sidebar — every section",
      copy:
        "Income, Taxes, Expenses, Investments, Liabilities, Insurance, Health, FIRE. Each surface has an Overview card plus drill-down leaves — built for India-specific instruments (PPF, NPS, ESOP, HUF).",
      placement: "right",
    },
    {
      target: ".cmdk-trigger",
      title: "⌘K — Command Palette",
      copy:
        "Press ⌘K (or Ctrl-K on Windows) to jump anywhere, run actions (add expense, switch seed, toggle family view), or look up any glossary term.",
      placement: "bottom",
    },
    {
      target: ".trust-pill",
      title: "Your data stays on your device",
      copy:
        "No login, no backend, no telemetry. Every input lives in your browser's localStorage. Clearing it resets the demo to factory.",
      placement: "top",
    },
  ],
  mehtas: [
    {
      target: ".fire-hero",
      title: "Near-FIRE corpus",
      copy:
        "The Mehtas have built a ~₹4.2 Cr corpus through 10 years of disciplined SIPs. The progress bar is well past 80% — they're ~18 months from FIRE.",
      placement: "bottom",
    },
    {
      target: ".fire-hero .progress-wrap",
      title: "Under 2 years to FIRE",
      copy:
        "At this stage, the variables that move the date most are healthcare-inflation assumptions and the withdrawal strategy — both editable in What-If.",
      placement: "bottom",
    },
    {
      target: "a[href='/financial-health/net-worth']",
      title: "Net Worth over time",
      copy:
        "10 years of compounding visible on the net-worth chart. This is what shows investors / partners that the plan is working.",
      placement: "right",
    },
    {
      target: "a[href='/fire-goals/what-if']",
      title: "Withdrawal strategy lever",
      copy:
        "Near-FIRE, the SWR (safe withdrawal rate) lever matters more than the savings lever. Drop SWR from 3.5% to 3.0% to see how much extra corpus you'd want as a safety margin.",
      placement: "right",
    },
    {
      target: ".v-navigation-drawer",
      title: "Healthcare + Insurance",
      copy:
        "DINK couples in their 40s focus on health-cover adequacy and post-retirement healthcare-inflation projections — both surfaced under Health and Insurance.",
      placement: "right",
    },
  ],
  // Phase 8 Stage W — Iyers tour highlights the sandwich-gen audit features.
  iyers: [
    {
      target: ".fire-hero",
      title: "Sandwich-gen FIRE",
      copy:
        "The Iyers carry the dual load — 2 kids in primary school AND 2 parents needing health support. Their FIRE math accounts for both layers, not just retirement.",
      placement: "bottom",
    },
    {
      target: ".family-layer-card",
      title: "Family layer breakdown",
      copy:
        "Parents bucket, kids' education target, marriage event, extended-family contingency — each routes to the correct inflation bucket (healthcare 8%, education 10%, general 6%).",
      placement: "bottom",
    },
    {
      target: ".fire-milestones-card",
      title: "Coast + Barista FIRE",
      copy:
        "Two intermediate milestones: Coast FIRE = stop saving and the corpus alone grows to FIRE by retirement. Barista FIRE = part-time work covers half of expenses, corpus covers the rest. Both are 'middle paths' for sandwich-gen.",
      placement: "bottom",
    },
    {
      target: "a[href='/tax-planning']",
      title: "Joint home loan tax win",
      copy:
        "The Iyers' joint home loan unlocks ₹4L Section 24 deduction (₹2L per co-borrower) instead of ₹2L for a single borrower. The /tax-planning surface picks this up automatically.",
      placement: "right",
    },
    {
      target: "a[href='/estate-planning']",
      title: "Estate planning checklist",
      copy:
        "7 audit-grounded steps — will, nominees, POA, joint accounts, digital estate, HUF karta succession, term life nominee. Sandwich-gen households especially need all 7 in place.",
      placement: "right",
    },
    {
      target: "a[href='/fire-goals/stress-test']",
      title: "Stress test the plan",
      copy:
        "10 audit-grounded scenarios — healthcare shock, parents' care escalation, child overseas-ed, market correction, longevity shock. See which scenarios add > 5 years to your FIRE date.",
      placement: "right",
    },
    {
      target: ".trust-pill",
      title: "Research-grounded · no commissions",
      copy:
        "60+ sources from the FIRE-India research evidence base. Zero product affiliations — the recommendations are calibrated against research, not against what we earn from selling you something.",
      placement: "top",
    },
  ],
};

// Storage now routes through @/lib/storage-adapter — namespaced by userId per ADR-0001.
const TOUR_DISMISSED_ENTITY_KEY = "tour-dismissed";

export function getTourDismissed(seed: SeedName): boolean {
  const adapter = makeAdapter(getAuthProvider());
  const dismissed = adapter.get<Record<string, boolean>>(TOUR_DISMISSED_ENTITY_KEY);
  return !!(dismissed && dismissed[seed]);
}

export function setTourDismissed(seed: SeedName): void {
  const adapter = makeAdapter(getAuthProvider());
  const existing = adapter.get<Record<string, boolean>>(TOUR_DISMISSED_ENTITY_KEY) ?? {};
  existing[seed] = true;
  adapter.set(TOUR_DISMISSED_ENTITY_KEY, existing);
}

export function getTourSteps(seed: SeedName): TourStepDef[] {
  return TOUR_STEPS[seed] ?? [];
}
