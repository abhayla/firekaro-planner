import { describe, it, expect } from "vitest";
import {
  buildContributionResolver,
  scalarToSegments,
  canonicalizeSegments,
  type ContributionSegments,
} from "@/lib/contribution-schedule";

describe("contribution-schedule — buildContributionResolver", () => {
  it("scalar segment resolves to the same amount for every year (the byte-identity seed)", () => {
    // scalarToSegments(5000) → one open segment from age 0 → resolver returns 5000 forever,
    // regardless of anchor age. This is the invariant that keeps a constant contribution
    // byte-identical to the prior flat projection loop.
    const resolve = buildContributionResolver(scalarToSegments(5000), 30);
    for (const yearIndex of [0, 1, 5, 20, 40]) {
      expect(resolve(yearIndex)).toBe(5000);
    }
    // anchor-independent: a different anchor still yields the constant.
    const resolve45 = buildContributionResolver(scalarToSegments(5000), 45);
    expect(resolve45(0)).toBe(5000);
    expect(resolve45(10)).toBe(5000);
  });

  it("applies a REAL step-up compounded from the segment start", () => {
    const segs: ContributionSegments = [{ amount: 10000, startAtAge: 30, stepUpPercentPerYear: 10 }];
    const resolve = buildContributionResolver(segs, 30);
    expect(resolve(0)).toBeCloseTo(10000, 6); // year 0 = base
    expect(resolve(1)).toBeCloseTo(11000, 6); // base * 1.10
    expect(resolve(2)).toBeCloseTo(12100, 6); // base * 1.21
  });

  it("clamps the step-up to 15%/yr (50% resolves as 15%)", () => {
    const segs: ContributionSegments = [{ amount: 10000, startAtAge: 30, stepUpPercentPerYear: 50 }];
    const resolve = buildContributionResolver(segs, 30);
    expect(resolve(1)).toBeCloseTo(11500, 6); // clamped 15% → base * 1.15, NOT 1.50
  });

  it("treats a missing step-up as 0% (flat)", () => {
    const segs: ContributionSegments = [{ amount: 7000, startAtAge: 25 }];
    const resolve = buildContributionResolver(segs, 25);
    expect(resolve(0)).toBe(7000);
    expect(resolve(3)).toBe(7000);
  });

  it("stops contributing after endAtAge (exclusive)", () => {
    const segs: ContributionSegments = [{ amount: 8000, startAtAge: 30, endAtAge: 45 }];
    const resolve = buildContributionResolver(segs, 30);
    expect(resolve(14)).toBe(8000); // age 44 — still active
    expect(resolve(15)).toBe(0); // age 45 — endAtAge is exclusive → stopped
    expect(resolve(30)).toBe(0); // age 60 — long past end
  });

  it("returns 0 in a gap with no covering segment", () => {
    const segs: ContributionSegments = [{ amount: 5000, startAtAge: 40 }];
    const resolve = buildContributionResolver(segs, 30);
    expect(resolve(0)).toBe(0); // age 30 — before the segment starts
    expect(resolve(9)).toBe(0); // age 39 — still before
    expect(resolve(10)).toBe(5000); // age 40 — segment begins
  });

  it("on overlap the latest-starting matching segment wins", () => {
    const segs: ContributionSegments = [
      { amount: 100, startAtAge: 30 },
      { amount: 200, startAtAge: 40 },
    ];
    const resolve = buildContributionResolver(segs, 30);
    expect(resolve(5)).toBe(100); // age 35 — only the age-30 segment covers
    expect(resolve(15)).toBe(200); // age 45 — both cover; latest start (40) wins
  });

  it("is defensive — non-finite year, negative/NaN amount → 0, never NaN", () => {
    const resolve = buildContributionResolver([{ amount: -5000, startAtAge: 0 }], 30);
    expect(resolve(0)).toBe(0); // negative amount floored to 0
    const resolveNaN = buildContributionResolver([{ amount: Number.NaN, startAtAge: 0 }], 30);
    expect(resolveNaN(5)).toBe(0);
    const resolveOk = buildContributionResolver(scalarToSegments(5000), 30);
    expect(resolveOk(Number.NaN)).toBe(0);
    expect(Number.isNaN(resolveOk(Number.POSITIVE_INFINITY))).toBe(false);
  });

  it("a stopping schedule never contributes MORE than the equivalent open one", () => {
    // Honesty monotonicity seed (Stage D #4): stopping reduces total contribution, never raises it.
    const open = buildContributionResolver([{ amount: 6000, startAtAge: 30 }], 30);
    const stops = buildContributionResolver([{ amount: 6000, startAtAge: 30, endAtAge: 50 }], 30);
    for (const y of [0, 10, 19, 20, 30]) {
      expect(stops(y)).toBeLessThanOrEqual(open(y));
    }
  });
});

describe("contribution-schedule — scalarToSegments", () => {
  it("maps a scalar to one open segment from age 0", () => {
    expect(scalarToSegments(5000)).toEqual([{ amount: 5000, startAtAge: 0 }]);
  });

  it("maps undefined to an empty schedule", () => {
    expect(scalarToSegments(undefined)).toEqual([]);
  });
});

describe("contribution-schedule — canonicalizeSegments", () => {
  it("sorts by startAtAge and rounds amounts + step-up so deepEqual stays idempotent", () => {
    const input: ContributionSegments = [
      { amount: 200.7, startAtAge: 40, stepUpPercentPerYear: 10.123456 },
      { amount: 100.4, startAtAge: 30 },
    ];
    const out = canonicalizeSegments(input);
    expect(out).toEqual([
      { amount: 100, startAtAge: 30 },
      { amount: 201, startAtAge: 40, stepUpPercentPerYear: 10.1235 },
    ]);
  });

  it("is stable — canonicalising twice yields a deep-equal result", () => {
    const input: ContributionSegments = [
      { amount: 9000, startAtAge: 35, endAtAge: 55, stepUpPercentPerYear: 5 },
      { amount: 3000, startAtAge: 30 },
    ];
    const once = canonicalizeSegments(input);
    const twice = canonicalizeSegments(once);
    expect(twice).toEqual(once);
  });
});
