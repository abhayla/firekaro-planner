/**
 * Stage B (Option-D dashboard) — red-first spec for the five SVG viz primitives.
 *
 * All five are PURE presentational components (typed props in → SVG out; no store access),
 * so they render server-side with @vue/server-renderer in the node test env — no DOM, no
 * new dependencies (the goal contract's no-new-npm-deps guardrail outranks the
 * @vue/test-utils suggestion; renderToString asserts the same props→markup contract).
 *
 * Honesty locks (contract §3): the waterfall renders NO bars when attribution is all-zero
 * (the sign-mismatch guard's honest fallback — never fabricate bars); the market-dependent
 * win renders a striped RANGE with BOTH bounds labeled (never only the upside).
 */
import { describe, it, expect } from "vitest";
import { createSSRApp, type Component } from "vue";
import { renderToString } from "@vue/server-renderer";
import BridgeUnlockTimeline from "./BridgeUnlockTimeline.vue";
import RunwayGauge from "./RunwayGauge.vue";
import PlanVarianceWaterfall from "./PlanVarianceWaterfall.vue";
import WinsImpactBars from "./WinsImpactBars.vue";
import MilestoneLadder from "./MilestoneLadder.vue";

async function render(comp: Component, props: Record<string, unknown>): Promise<string> {
  return renderToString(createSSRApp(comp, props));
}
const count = (html: string, needle: string): number => html.split(needle).length - 1;

describe("BridgeUnlockTimeline", () => {
  const base = { spendable: 92_000_000, locked: 5_754_000, bridgeIncomePerYear: 271_000, fireAge: 55 };

  it("renders three segments (spendable / locked / bridge income) with ₹ labels", async () => {
    const html = await render(BridgeUnlockTimeline, base);
    expect(count(html, 'data-testid="bridge-tl-segment"')).toBe(3);
    expect(html).toContain("₹9.20 Cr");
    expect(html).toContain("₹57.54 L");
    expect(html).toContain("₹2.71 L");
  });

  it("drops the bridge-income segment when it is zero", async () => {
    const html = await render(BridgeUnlockTimeline, { ...base, bridgeIncomePerYear: 0 });
    expect(count(html, 'data-testid="bridge-tl-segment"')).toBe(2);
  });

  it("renders the age axis starting at the FIRE age and an accessible name", async () => {
    const html = await render(BridgeUnlockTimeline, base);
    expect(html).toContain("FIRE @55");
    expect(html).toContain("60 (EPF/PPF/NPS unlock)");
    expect(html).toMatch(/aria-label="[^"]*bridge[^"]*"/i);
  });

  it("never renders a self-contradicting axis: the unlock tick is dropped when FIRE ≥ unlock age", async () => {
    const html = await render(BridgeUnlockTimeline, { ...base, fireAge: 62 });
    expect(html).not.toContain("60 (EPF/PPF/NPS unlock)");
    expect(html).toContain("FIRE @62");
    expect(html).toContain("67"); // end label moves past the FIRE age
  });
});

describe("RunwayGauge", () => {
  it("renders the months figure (y/m form) and the gauge label", async () => {
    const html = await render(RunwayGauge, { months: 40, conservativeMonths: 1, zone: "warn" });
    expect(html).toContain("3y 4m");
    expect(html).toContain("full-burn runway");
    expect(html).toMatch(/aria-label="[^"]*runway[^"]*"/i);
  });

  it("renders sub-year months plainly", async () => {
    const html = await render(RunwayGauge, { months: 8, conservativeMonths: 2, zone: "bad" });
    expect(html).toContain("8m");
  });

  it("colors the filled arc by zone (ok→success, warn→warning, bad→error)", async () => {
    const ok = await render(RunwayGauge, { months: 40, conservativeMonths: 1, zone: "ok" });
    const warn = await render(RunwayGauge, { months: 9, conservativeMonths: 1, zone: "warn" });
    const bad = await render(RunwayGauge, { months: 3, conservativeMonths: 1, zone: "bad" });
    expect(ok).toContain("--v-theme-success");
    expect(warn).toContain("--v-theme-warning");
    expect(bad).toContain("--v-theme-error");
  });
});

describe("PlanVarianceWaterfall", () => {
  it("renders the four bars with signed month labels", async () => {
    const html = await render(PlanVarianceWaterfall, {
      progressMonths: 4,
      realityMonths: -2,
      goalpostMonths: 1,
      netMonths: 3,
    });
    expect(count(html, 'data-testid="wf-bar"')).toBe(4);
    expect(html).toContain("+4 mo");
    expect(html).toContain("−2 mo");
    expect(html).toContain("+1 mo");
    expect(html).toContain("corpus growth");
    expect(html).toContain("expense changes");
    expect(html).toContain("net vs plan");
    expect(html).toMatch(/= 3 mo earlier/);
  });

  it("HONESTY FALLBACK: all-zero attribution renders NO bars even when the net delta is non-zero", async () => {
    // The sign-mismatch guard in plan-variance.ts zeroes the drivers when the first-order
    // model broke down — fabricating bars there would misattribute the move (Tier-0 class).
    const html = await render(PlanVarianceWaterfall, {
      progressMonths: 0,
      realityMonths: 0,
      goalpostMonths: 0,
      netMonths: 5,
    });
    expect(count(html, 'data-testid="wf-bar"')).toBe(0);
  });

  it("renders nothing for the zero-delta, zero-bars state (the card owns the on-plan copy)", async () => {
    const html = await render(PlanVarianceWaterfall, {
      progressMonths: 0,
      realityMonths: 0,
      goalpostMonths: 0,
      netMonths: 0,
    });
    expect(count(html, 'data-testid="wf-bar"')).toBe(0);
    expect(html).not.toContain("net vs plan");
  });
});

describe("WinsImpactBars", () => {
  const wins = [
    { label: "Trim spending 10%", kind: "sure" as const, deltaYears: 2.3 },
    { label: "Invest +₹10K/mo", kind: "sure" as const, deltaYears: 0.75 },
    { label: "Risk notch 50→60%", kind: "market" as const, range: [-6.5, 8.4] as [number, number] },
  ];

  it("renders one row per win with its label", async () => {
    const html = await render(WinsImpactBars, { wins });
    expect(count(html, 'data-testid="win-row"')).toBe(3);
    expect(html).toContain("Trim spending 10%");
    expect(html).toContain("Risk notch 50→60%");
  });

  it("deterministic wins render solid bars; the market win renders a striped range bar", async () => {
    const html = await render(WinsImpactBars, { wins });
    expect(count(html, 'data-testid="win-bar-sure"')).toBe(2);
    expect(count(html, 'data-testid="win-bar-market"')).toBe(1);
    expect(html).toContain("<pattern"); // the stripe pattern def
  });

  it("HONESTY: the market range labels BOTH bounds (never only the upside)", async () => {
    const html = await render(WinsImpactBars, { wins });
    expect(html).toContain("−6.5");
    expect(html).toContain("+8.4");
  });

  it("renders nothing when no wins rank", async () => {
    const html = await render(WinsImpactBars, { wins: [] });
    expect(count(html, 'data-testid="win-row"')).toBe(0);
  });

  it("drops corrupt rows (NaN delta / missing range) instead of rendering a lying bar", async () => {
    const html = await render(WinsImpactBars, {
      wins: [
        { label: "Good", kind: "sure", deltaYears: 1.2 },
        { label: "Corrupt", kind: "sure", deltaYears: NaN },
        { label: "Rangeless market", kind: "market", range: undefined },
      ],
    });
    expect(count(html, 'data-testid="win-row"')).toBe(1);
    expect(html).not.toContain("Corrupt");
  });

  it("a11y: the lever names + both range bounds are real text (not hidden behind role=img)", async () => {
    const html = await render(WinsImpactBars, { wins });
    expect(html).not.toMatch(/<div[^>]*role="img"/);
    expect(count(html, 'aria-hidden="true"')).toBeGreaterThanOrEqual(3); // decorative track SVGs
  });
});

describe("MilestoneLadder", () => {
  const milestones = [
    { label: "Lean", amount: 79_900_000, age: 42, color: "#7cb342" },
    { label: "Regular", amount: 105_500_000, age: 55, color: "#16a34a" },
    { label: "Fat", amount: 137_400_000, age: 58, color: "#1976d2" },
  ];

  it("renders a pin per milestone plus the You pin at the current corpus", async () => {
    const html = await render(MilestoneLadder, { corpusNow: 11_000_000, milestones });
    expect(count(html, 'data-testid="ladder-pin"')).toBe(4);
    expect(html).toContain("₹1.10 Cr"); // You
    expect(html).toContain("₹10.55 Cr"); // Regular
  });

  it("labels milestones with name and age", async () => {
    const html = await render(MilestoneLadder, { corpusNow: 11_000_000, milestones });
    expect(html).toContain("Lean");
    expect(html).toMatch(/age 55|Regular · 55|· 55/);
  });

  it("renders an accessible name and the progress fill", async () => {
    const html = await render(MilestoneLadder, { corpusNow: 11_000_000, milestones });
    expect(html).toMatch(/aria-label="[^"]*milestone[^"]*"/i);
    expect(count(html, 'data-testid="ladder-fill"')).toBe(1);
  });

  it("HONESTY: zero corpus renders a ZERO-width fill — never a fabricated minimum progress", async () => {
    // The empty-as-progress class (bug-filing-and-sibling-audit.md): a clamped fill floor
    // would show a brand-new zero-data user ≥6% of the way to FIRE.
    const html = await render(MilestoneLadder, { corpusNow: 0, milestones });
    const fill = html.match(/<rect[^>]*data-testid="ladder-fill"[^>]*>/)?.[0] ?? "";
    expect(fill).toMatch(/width="0"/);
  });
});
