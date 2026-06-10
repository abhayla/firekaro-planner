/**
 * Regression lock for #74 + #76 — BridgeBreakdownCard variant (compact ⟷ full) +
 * collapsible "What we assumed" block.
 *
 * #74: the per-holding "What we assumed" wall was always-expanded → clutter. Now it is
 *      collapsible on Readiness (default-collapsed, estimate COUNT in the header so the
 *      honesty caveats stay discoverable).
 * #76: the SAME component was rendered in full on BOTH Dashboard and Readiness → read as
 *      repetitive. Now ONE component, parameterized by a `variant` prop: Dashboard renders
 *      `compact` (verdict + bar + bridge-income + a "see what we assumed → Readiness" link;
 *      drops the assumptions wall + unlock timeline), Readiness renders `full` (default).
 *
 * These are static template-source assertions (no DOM render) — a full Vuetify component
 * mount is infeasible in this repo's `node` test env (no component-mount precedent; the
 * card depends on useFireDerive + many Vuetify components). The structural wiring is what
 * we pin here; the live render/behaviour (expand/collapse, link navigation) is verified
 * in-browser via Rules 24/32/26. Written red-first: every assertion targets a string that
 * did NOT exist before the fix.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const read = (rel: string) => readFileSync(here + rel, "utf8");

const card = read("../components/dashboard/BridgeBreakdownCard.vue");
const dashboard = read("../pages/fire-goals/Dashboard.vue");
const readiness = read("../pages/fire-goals/Readiness.vue");

describe("#76 — one component, parameterized by a `variant` prop (default full)", () => {
  it("BridgeBreakdownCard declares a variant?: 'full' | 'compact' prop, default 'full'", () => {
    expect(card).toMatch(/variant\?:\s*["']full["']\s*\|\s*["']compact["']/);
    // withDefaults pins the default so Readiness's bare <BridgeBreakdownCard /> stays full.
    expect(card).toMatch(/withDefaults\([^)]*defineProps[\s\S]*?variant:\s*["']full["']/);
    expect(card).toMatch(/const\s+isCompact\s*=\s*computed/);
  });

  it("Dashboard host passes variant=\"compact\"", () => {
    // Option-D: the host also passes a layout class (h-100 inside the paired grid row) —
    // the lock cares that the COMPACT variant is requested, whatever other attrs ride along.
    expect(dashboard).toMatch(/<BridgeBreakdownCard\s+variant="compact"[^>]*\/>/);
  });

  it("Readiness host stays the default (full) — NO variant prop passed", () => {
    expect(readiness).toMatch(/<BridgeBreakdownCard\s*\/>/);
    expect(readiness).not.toMatch(/<BridgeBreakdownCard\s+variant=/);
  });

  it("still ONE component — no second bridge component was introduced", () => {
    // Dashboard imports the single shared card, not a compact-specific sibling.
    expect(dashboard).toMatch(/import BridgeBreakdownCard from "@\/components\/dashboard\/BridgeBreakdownCard\.vue"/);
  });
});

describe("#76 — compact variant (Dashboard) drops the wall + timeline, keeps the honesty", () => {
  it("unlock-timeline list is gated to the full variant (hidden in compact)", () => {
    // The unlock <template v-if> now also requires !isCompact.
    expect(card).toMatch(/v-if="!isCompact && bc!\.unlockTimeline\.length"/);
  });

  it("the assumptions wall is gated to the full variant (hidden in compact)", () => {
    expect(card).toMatch(/v-if="!isCompact && bc!\.assumptions\.length"/);
  });

  it("compact renders a 'see what we assumed → Readiness' link to the fire-readiness route", () => {
    expect(card).toMatch(/data-testid="bridge-see-assumptions-link"/);
    expect(card).toMatch(/name:\s*['"]fire-readiness['"]/);
    // gated to compact so the full card does not also show the link.
    expect(card).toMatch(/v-if="isCompact && bc!\.assumptions\.length"/);
  });

  it("the FIRE-age honesty (verdict alert) is NOT variant-gated — stays on both screens", () => {
    // The shortfall verdict alert keeps bc!.effectiveFireAge visible on the dashboard too.
    expect(card).toMatch(/data-testid="bridge-shortfall-alert"/);
    expect(card).toMatch(/age \{\{ bc!\.effectiveFireAge \}\}/);
  });
});

describe("#74 — full variant: 'What we assumed' is collapsible, default-collapsed, count-in-header", () => {
  it("an assumptionsExpanded ref defaults to false (collapsed)", () => {
    expect(card).toMatch(/const\s+assumptionsExpanded\s*=\s*ref\(false\)/);
  });

  it("the header is a clickable toggle with aria-expanded + a count of estimates", () => {
    expect(card).toMatch(/data-testid="bridge-assumptions-toggle"/);
    expect(card).toMatch(/:aria-expanded="assumptionsExpanded"/);
    expect(card).toMatch(/@click="assumptionsExpanded = !assumptionsExpanded"/);
    // the estimate COUNT stays visible when collapsed → caveats remain discoverable.
    expect(card).toMatch(/\{\{ bc!\.assumptions\.length \}\}/);
    // a chevron that flips with state.
    expect(card).toMatch(/assumptionsExpanded \? ['"]mdi-chevron-up['"] : ['"]mdi-chevron-down['"]/);
  });

  it("the assumption rows are wrapped in v-expand-transition + v-if (project standard, not v-show)", () => {
    expect(card).toMatch(/<v-expand-transition>\s*<div v-if="assumptionsExpanded"[\s>]/);
    expect(card).toMatch(/data-testid="bridge-assumption-row"/);
    // never a bare v-show for the collapse (form-validation-patterns.md standard).
    expect(card).not.toMatch(/v-show="assumptionsExpanded"/);
  });
});
