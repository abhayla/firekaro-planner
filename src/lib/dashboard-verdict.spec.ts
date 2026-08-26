import { describe, it, expect } from "vitest";
import { resolveHeroTone, resolveGapTone } from "./dashboard-verdict";

/**
 * Stage A (Option-D dashboard) — verdict-tone mapping for the hero tint + "Vs your plan" KPI.
 * Written RED-FIRST per the goal contract §2.1: no baseline / |Δ| < 1 / Δ ≥ +1 / Δ ≤ −1.
 * Honesty rule: a non-finite delta makes NO claim — neutral "no-baseline" tone, never a
 * fabricated "on track" (rule 20/31).
 */
describe("resolveHeroTone", () => {
  it("returns no-baseline when no plan baseline is locked", () => {
    expect(resolveHeroTone({ hasBaseline: false, fireDateDeltaMonths: null })).toBe("no-baseline");
    // Even a (stale) delta value cannot manufacture a verdict without a baseline.
    expect(resolveHeroTone({ hasBaseline: false, fireDateDeltaMonths: 5 })).toBe("no-baseline");
  });

  it("returns on-track when |Δ| < 1 month", () => {
    expect(resolveHeroTone({ hasBaseline: true, fireDateDeltaMonths: 0 })).toBe("on-track");
    expect(resolveHeroTone({ hasBaseline: true, fireDateDeltaMonths: 0.99 })).toBe("on-track");
    expect(resolveHeroTone({ hasBaseline: true, fireDateDeltaMonths: -0.99 })).toBe("on-track");
  });

  it("returns ahead at the +1 month boundary and beyond (+ = earlier than plan)", () => {
    expect(resolveHeroTone({ hasBaseline: true, fireDateDeltaMonths: 1 })).toBe("ahead");
    expect(resolveHeroTone({ hasBaseline: true, fireDateDeltaMonths: 36 })).toBe("ahead");
    // Plan that became reachable vs an unreachable baseline — honestly "ahead".
    expect(resolveHeroTone({ hasBaseline: true, fireDateDeltaMonths: Infinity })).toBe("ahead");
  });

  it("returns behind at the −1 month boundary and beyond (− = later than plan)", () => {
    expect(resolveHeroTone({ hasBaseline: true, fireDateDeltaMonths: -1 })).toBe("behind");
    expect(resolveHeroTone({ hasBaseline: true, fireDateDeltaMonths: -18 })).toBe("behind");
    // Plan that became unreachable since locking — honestly "behind".
    expect(resolveHeroTone({ hasBaseline: true, fireDateDeltaMonths: -Infinity })).toBe("behind");
  });

  it("makes NO claim on a non-finite/absent delta even with a baseline (neutral, never a false ✓)", () => {
    expect(resolveHeroTone({ hasBaseline: true, fireDateDeltaMonths: NaN })).toBe("no-baseline");
    expect(resolveHeroTone({ hasBaseline: true, fireDateDeltaMonths: null })).toBe("no-baseline");
  });
});

describe("T-377/QN-2 — resolveGapTone (the second, independent hero signal)", () => {
  it("positive gap = short, zero-or-negative = surplus", () => {
    expect(resolveGapTone(1)).toBe("short");
    expect(resolveGapTone(50_00_000)).toBe("short");
    expect(resolveGapTone(0)).toBe("surplus");
    expect(resolveGapTone(-1)).toBe("surplus");
  });

  it("makes NO claim on NaN, ±Infinity, null or undefined (rule 31)", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, null, undefined]) {
      expect(resolveGapTone(bad)).toBe("unknown");
    }
  });

  it("is INDEPENDENT of resolveHeroTone — the plan-variance contract is untouched", () => {
    // A locked plan can be "ahead" while the money is still short of the number, and
    // vice-versa. Neither resolver may be derived from the other.
    expect(resolveHeroTone({ hasBaseline: true, fireDateDeltaMonths: 6 })).toBe("ahead");
    expect(resolveGapTone(10_00_000)).toBe("short");
    expect(resolveHeroTone({ hasBaseline: false, fireDateDeltaMonths: null })).toBe("no-baseline");
    expect(resolveGapTone(-10_00_000)).toBe("surplus");
  });
});
