import { describe, it, expect } from "vitest";
import { buildAccelerationLevers, makeSaveMoreLever, type AccelerationContext } from "./lever-catalog";
import { computeLeverImpact, rankLeverImpacts, yearsToFire, type FireBaseline } from "./lever-impact";
import { LIMIT_80CCD_1B } from "./tax-deductions";

const BASE: FireBaseline = {
  currentCorpus: 5_000_000,
  targetCorpus: 40_000_000,
  monthlySavings: 60_000,
  expectedReturn: 0.07,
};

const CTX: AccelerationContext = {
  baseline: BASE,
  monthlyExpenses: 100_000,
  realisticExpenseTrimPct: 0.1,
  swr: 0.035,
  currentEquityPct: 55,
  maxEquityPct: 75,
  realReturnPerEquityPoint: 0.0005, // +0.05% real return per +1pp equity
  currentNps80ccd1bUsed: 20_000, // ₹20k of the ₹50k 80CCD(1B) sub-limit already claimed
  marginalTaxRate: 0.3, // 30% slab (incl. cess in the real wiring) — a typical accumulator
  regime: "OLD", // 80CCD(1B) only saves tax in the OLD regime
};

describe("buildAccelerationLevers — realistic max-effort catalog", () => {
  it("emits the expense-trim and allocation levers when each has headroom", () => {
    const keys = buildAccelerationLevers(CTX).map((l) => l.key);
    expect(keys).toContain("trim-expenses");
    expect(keys).toContain("risk-notch");
  });

  it("never emits an invest-surplus lever (moot — surplus is already invested per derive, D-11)", () => {
    expect(buildAccelerationLevers(CTX).map((l) => l.key)).not.toContain("invest-surplus");
  });

  it("every lever carries a transparent bound note (honesty requirement)", () => {
    for (const lever of buildAccelerationLevers(CTX)) {
      expect(lever.note, `${lever.key} must show its realistic bound`).toBeTruthy();
    }
  });

  it("trim-expenses BOTH lowers the FIRE target and raises savings (modeled via SWR)", () => {
    const lever = buildAccelerationLevers(CTX).find((l) => l.key === "trim-expenses")!;
    const perturbed = lever.apply(BASE);
    const monthlyCut = CTX.realisticExpenseTrimPct * CTX.monthlyExpenses; // 10k
    expect(perturbed.monthlySavings).toBe(BASE.monthlySavings + monthlyCut);
    // freed target = (annual cut) / SWR
    expect(perturbed.targetCorpus).toBeCloseTo(BASE.targetCorpus - (monthlyCut * 12) / CTX.swr, 0);
    expect(perturbed.targetCorpus).toBeLessThan(BASE.targetCorpus);
  });

  it("risk-notch raises expected real return by one bounded equity notch", () => {
    const lever = buildAccelerationLevers(CTX).find((l) => l.key === "risk-notch")!;
    const perturbed = lever.apply(BASE);
    const notch = Math.min(10, CTX.maxEquityPct - CTX.currentEquityPct); // 10
    expect(perturbed.expectedReturn).toBeCloseTo(BASE.expectedReturn + notch * CTX.realReturnPerEquityPoint, 6);
  });

  // HONESTY LOCK (FinTech review, 2026-06-06): the risk-notch lever raises return on a deterministic
  // yardstick, so without a caveat it reads as a free lunch next to the risk-neutral levers. Its note
  // MUST disclose the added market/volatility risk — assert the substance so it can't regress.
  it("risk-notch discloses the added market risk in its note (not a free lunch)", () => {
    const lever = buildAccelerationLevers(CTX).find((l) => l.key === "risk-notch")!;
    expect(lever.note).toMatch(/risk|volatil|range of outcomes/i);
  });

  it("every emitted lever is a genuine ACCELERATOR (saves years) on a reachable baseline", () => {
    const ranked = rankLeverImpacts(BASE, buildAccelerationLevers(CTX));
    expect(ranked.length).toBeGreaterThan(0);
    for (const r of ranked) {
      expect(r.deltaYears, `${r.key} should not delay FIRE`).toBeGreaterThan(0);
    }
    // sanity: a real accumulator with these levers reaches FIRE sooner than baseline
    expect(yearsToFire(BASE)).toBeGreaterThan(0);
  });
});

describe("80CCD(1B) NPS headroom lever — tax-saved-only model (double-count guard, D-2026-06-06-11)", () => {
  it("emits the 80CCD lever when there is unused 80CCD(1B) headroom", () => {
    const keys = buildAccelerationLevers(CTX).map((l) => l.key);
    expect(keys).toContain("nps-80ccd1b");
  });

  it("adds ONLY the marginal tax SAVED on the headroom to savings — NOT the ₹50k itself (no double-count)", () => {
    const lever = buildAccelerationLevers(CTX).find((l) => l.key === "nps-80ccd1b")!;
    const headroom = LIMIT_80CCD_1B - CTX.currentNps80ccd1bUsed; // 30k
    const annualTaxSaved = headroom * CTX.marginalTaxRate; // 9k
    const perturbed = lever.apply(BASE);
    // savings rises by tax-saved/12 — the surplus (₹50k) is ALREADY invested per derive (D-11),
    // so adding it again would double-count. Only the freed TAX is genuinely new cashflow.
    expect(perturbed.monthlySavings).toBeCloseTo(BASE.monthlySavings + annualTaxSaved / 12, 6);
    // explicit anti-double-count assertion: savings did NOT jump by the full headroom/12
    expect(perturbed.monthlySavings).toBeLessThan(BASE.monthlySavings + headroom / 12);
    // target unchanged (80CCD does not lower the FIRE number)
    expect(perturbed.targetCorpus).toBe(BASE.targetCorpus);
    // NPS lock-in honesty (FinTech 2026-06-06): only the freed TAX (liquid) enters savings — the
    // ₹50k NPS principal is locked till 60 with forced annuitisation, so it MUST NOT enter the
    // liquid corpus base. currentCorpus is untouched.
    expect(perturbed.currentCorpus).toBe(BASE.currentCorpus);
  });

  it("omits the 80CCD lever when the headroom is already exhausted (locked, no fake impact)", () => {
    const keys = buildAccelerationLevers({ ...CTX, currentNps80ccd1bUsed: LIMIT_80CCD_1B }).map((l) => l.key);
    expect(keys).not.toContain("nps-80ccd1b");
  });

  it("omits the 80CCD lever when the marginal rate is 0 (no tax to save ⇒ no acceleration)", () => {
    const keys = buildAccelerationLevers({ ...CTX, marginalTaxRate: 0 }).map((l) => l.key);
    expect(keys).not.toContain("nps-80ccd1b");
  });

  // FinTech HIGH lock (2026-06-06): 80CCD(1B) is an OLD-regime-only deduction. Under the NEW regime
  // (the persona majority post-Budget-2025) it saves ₹0 — the lever MUST be locked, never showing a
  // phantom "years sooner" for a benefit the user legally cannot claim (rule 31 optimistic-skew guard).
  it("omits the 80CCD lever for a NEW-regime household (deduction disallowed ⇒ ₹0 saved)", () => {
    const keys = buildAccelerationLevers({ ...CTX, regime: "NEW" }).map((l) => l.key);
    expect(keys).not.toContain("nps-80ccd1b");
  });

  it("carries a transparent bound note naming the headroom and the tax saved", () => {
    const lever = buildAccelerationLevers(CTX).find((l) => l.key === "nps-80ccd1b")!;
    expect(lever.note).toMatch(/80CCD|NPS/i);
    expect(lever.note).toMatch(/tax/i);
  });

  it("is a genuine accelerator (saves years) on a reachable baseline", () => {
    const lever = buildAccelerationLevers(CTX).find((l) => l.key === "nps-80ccd1b")!;
    const impact = computeLeverImpact(BASE, lever);
    expect(impact.reachable).toBe(true);
    expect(impact.deltaYears).toBeGreaterThan(0);
  });

  it("does not mutate the baseline", () => {
    const snapshot = JSON.stringify(BASE);
    buildAccelerationLevers(CTX).forEach((l) => l.apply(BASE));
    expect(JSON.stringify(BASE)).toBe(snapshot);
  });
});

describe("makeSaveMoreLever — user-parameterised save-more sensitivity (pure factory)", () => {
  it("perturbs ONLY monthlySavings by the extra amount, leaving the target untouched", () => {
    const lever = makeSaveMoreLever(15_000);
    const perturbed = lever.apply(BASE);
    expect(perturbed.monthlySavings).toBe(BASE.monthlySavings + 15_000);
    expect(perturbed.targetCorpus).toBe(BASE.targetCorpus);
    expect(perturbed.currentCorpus).toBe(BASE.currentCorpus);
    expect(perturbed.expectedReturn).toBe(BASE.expectedReturn);
  });

  it("has the stable key 'save-more' and a transparent note naming the amount", () => {
    const lever = makeSaveMoreLever(15_000);
    expect(lever.key).toBe("save-more");
    expect(lever.note).toMatch(/15|more/i);
  });

  it("produces a positive years-saved for a positive amount on a reachable baseline", () => {
    const impact = computeLeverImpact(BASE, makeSaveMoreLever(20_000));
    expect(impact.reachable).toBe(true);
    expect(impact.deltaYears).toBeGreaterThan(0);
  });

  it("a zero/negative amount yields no acceleration (caller is expected to omit it)", () => {
    expect(computeLeverImpact(BASE, makeSaveMoreLever(0)).deltaYears).toBeCloseTo(0, 6);
  });

  it("does not mutate the baseline", () => {
    const snapshot = JSON.stringify(BASE);
    makeSaveMoreLever(25_000).apply(BASE);
    expect(JSON.stringify(BASE)).toBe(snapshot);
  });
});

describe("buildAccelerationLevers — no-headroom levers are LOCKED, not faked", () => {
  it("omits risk-notch when already at the equity ceiling", () => {
    const keys = buildAccelerationLevers({ ...CTX, currentEquityPct: 75, maxEquityPct: 75 }).map((l) => l.key);
    expect(keys).not.toContain("risk-notch");
  });

  it("omits trim-expenses when there are no expenses to trim", () => {
    const keys = buildAccelerationLevers({ ...CTX, monthlyExpenses: 0 }).map((l) => l.key);
    expect(keys).not.toContain("trim-expenses");
  });

  it("guards against a non-positive SWR (no divide-by-zero in the expense lever)", () => {
    const levers = buildAccelerationLevers({ ...CTX, swr: 0 });
    // either omitted, or applied without producing a non-finite target
    const trim = levers.find((l) => l.key === "trim-expenses");
    if (trim) expect(Number.isFinite(trim.apply(BASE).targetCorpus)).toBe(true);
  });

  it("does not mutate the baseline", () => {
    const snapshot = JSON.stringify(BASE);
    buildAccelerationLevers(CTX).forEach((l) => l.apply(BASE));
    expect(JSON.stringify(BASE)).toBe(snapshot);
  });
});
