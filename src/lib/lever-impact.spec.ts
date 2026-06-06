import { describe, it, expect } from "vitest";
import {
  yearsToFire,
  computeLeverImpact,
  rankLeverImpacts,
  type FireBaseline,
  type Lever,
} from "./lever-impact";

// A realistic accumulator baseline: ₹50L corpus, ₹4Cr target, ₹60k/mo, 7% real.
const BASE: FireBaseline = {
  currentCorpus: 5_000_000,
  targetCorpus: 40_000_000,
  monthlySavings: 60_000,
  expectedReturn: 0.07,
};

describe("yearsToFire", () => {
  it("wraps calculateYearsToTarget with the resolved baseline inputs", () => {
    const y = yearsToFire(BASE);
    expect(y).toBeGreaterThan(0);
    expect(Number.isFinite(y)).toBe(true);
  });

  it("returns 0 when the corpus already meets the target", () => {
    expect(yearsToFire({ ...BASE, currentCorpus: BASE.targetCorpus })).toBe(0);
  });

  it("returns Infinity when a non-positive contribution can never reach the target", () => {
    expect(yearsToFire({ ...BASE, monthlySavings: 0 })).toBe(Infinity);
  });
});

describe("computeLeverImpact", () => {
  it("reports POSITIVE deltaYears (years SAVED) for a lever that raises savings", () => {
    const sipUp: Lever = {
      key: "sip",
      label: "Increase SIP",
      apply: (b) => ({ ...b, monthlySavings: b.monthlySavings + 20_000 }),
    };
    const impact = computeLeverImpact(BASE, sipUp);
    expect(impact.key).toBe("sip");
    expect(impact.baselineYears).toBeCloseTo(yearsToFire(BASE), 5);
    expect(impact.perturbedYears).toBeLessThan(impact.baselineYears);
    expect(impact.deltaYears).toBeGreaterThan(0); // earlier FIRE = years saved
    expect(impact.reachable).toBe(true);
  });

  it("reports a NEGATIVE deltaYears for a lever that worsens the plan", () => {
    const spendMore: Lever = {
      key: "spend",
      label: "Spend more",
      apply: (b) => ({ ...b, monthlySavings: b.monthlySavings - 20_000 }),
    };
    expect(computeLeverImpact(BASE, spendMore).deltaYears).toBeLessThan(0);
  });

  it("reports ~0 deltaYears for a no-op lever", () => {
    const noop: Lever = { key: "noop", label: "No change", apply: (b) => ({ ...b }) };
    expect(Math.abs(computeLeverImpact(BASE, noop).deltaYears)).toBeLessThan(1e-9);
  });

  it("marks a lever unreachable when either path never reaches FIRE", () => {
    const killSavings: Lever = {
      key: "kill",
      label: "Stop saving",
      apply: (b) => ({ ...b, monthlySavings: 0 }),
    };
    const impact = computeLeverImpact(BASE, killSavings);
    expect(impact.reachable).toBe(false);
    expect(Number.isFinite(impact.deltaYears)).toBe(false);
  });

  // HONESTY LOCK (FinTech + code review, 2026-06-06): the kernel caps at 100yr and returns a FINITE
  // 100 (not Infinity) when FIRE is never reached. A capped-out baseline MUST be treated as
  // unreachable — never as a real "year 100" off which a meaningless saved-years delta is measured.
  it("treats a baseline that only caps out at the 100yr horizon as UNREACHABLE, not a finite delta", () => {
    // ₹10k corpus + ₹1/mo can never reach ₹4Cr in 100yr → kernel caps at 100 (finite).
    const hopeless: FireBaseline = {
      currentCorpus: 10_000,
      targetCorpus: 40_000_000,
      monthlySavings: 1,
      expectedReturn: 0.07,
    };
    expect(yearsToFire(hopeless)).toBeGreaterThanOrEqual(100); // capped, finite
    const sipUp: Lever = { key: "sip", label: "SIP", apply: (b) => ({ ...b, monthlySavings: 5_000 }) };
    const impact = computeLeverImpact(hopeless, sipUp);
    expect(impact.reachable).toBe(false); // NOT reachable despite a finite baselineYears
    expect(Number.isFinite(impact.deltaYears)).toBe(false);
  });

  // A lever that RESCUES an otherwise-unreachable baseline reports reachable=false (saved-years is
  // undefined) but still exposes a finite perturbedYears so the caller can surface the rescue.
  it("reports a baseline-rescuing lever as reachable=false but with a finite perturbedYears", () => {
    const hopeless: FireBaseline = {
      currentCorpus: 10_000,
      targetCorpus: 40_000_000,
      monthlySavings: 1,
      expectedReturn: 0.07,
    };
    const rescue: Lever = { key: "rescue", label: "Big SIP", apply: (b) => ({ ...b, monthlySavings: 200_000 }) };
    const impact = computeLeverImpact(hopeless, rescue);
    expect(impact.reachable).toBe(false); // baseline never reaches → delta undefined
    expect(impact.perturbedYears).toBeLessThan(100); // but the rescue IS reachable — caller-detectable
  });
});

describe("rankLeverImpacts", () => {
  const levers: Lever[] = [
    { key: "small", label: "Small SIP bump", apply: (b) => ({ ...b, monthlySavings: b.monthlySavings + 5_000 }) },
    { key: "big", label: "Big SIP bump", apply: (b) => ({ ...b, monthlySavings: b.monthlySavings + 40_000 }) },
    { key: "return", label: "Higher return", apply: (b) => ({ ...b, expectedReturn: b.expectedReturn + 0.01 }) },
  ];

  it("ranks levers by years saved, biggest first", () => {
    const ranked = rankLeverImpacts(BASE, levers);
    // SUBSTANCE: the first element IS the biggest saver (not merely present in the list).
    const maxDelta = Math.max(...ranked.filter((r) => r.reachable).map((r) => r.deltaYears));
    expect(ranked[0].deltaYears).toBe(maxDelta);
    // monotonic non-increasing deltaYears among reachable levers
    const deltas = ranked.filter((r) => r.reachable).map((r) => r.deltaYears);
    for (let i = 1; i < deltas.length; i++) {
      expect(deltas[i - 1]).toBeGreaterThanOrEqual(deltas[i]);
    }
    // the bigger SIP bump must save at least as many years as the smaller one
    const big = ranked.find((r) => r.key === "big")!;
    const small = ranked.find((r) => r.key === "small")!;
    expect(big.deltaYears).toBeGreaterThanOrEqual(small.deltaYears);
  });

  it("returns [] for an empty levers array", () => {
    expect(rankLeverImpacts(BASE, [])).toEqual([]);
  });

  it("preserves input order among MULTIPLE unreachable levers (stable sort)", () => {
    const stop = (key: string): Lever => ({ key, label: key, apply: (b) => ({ ...b, monthlySavings: 0 }) });
    const ranked = rankLeverImpacts(BASE, [stop("deadA"), levers[1], stop("deadB")]);
    const deadOrder = ranked.filter((r) => !r.reachable).map((r) => r.key);
    expect(deadOrder).toEqual(["deadA", "deadB"]); // relative input order kept
  });

  it("pushes unreachable levers to the end", () => {
    const withDead: Lever[] = [
      ...levers,
      { key: "dead", label: "Stop saving", apply: (b) => ({ ...b, monthlySavings: 0 }) },
    ];
    const ranked = rankLeverImpacts(BASE, withDead);
    expect(ranked[ranked.length - 1].key).toBe("dead");
    expect(ranked[ranked.length - 1].reachable).toBe(false);
  });

  it("does not mutate the baseline or the input levers array", () => {
    const snapshot = JSON.stringify(BASE);
    const arr = [...levers];
    rankLeverImpacts(BASE, levers);
    expect(JSON.stringify(BASE)).toBe(snapshot);
    expect(levers).toEqual(arr);
  });
});
