/**
 * A2.5b — EMPTY / PARTIAL state honesty sweep (closes gh #39's unfinished sibling sweep).
 *
 * gh #39 ("a ₹0 user is told 'FIRE achieved'") is CLOSED, but its sibling audit was
 * explicitly left unfinished: the fix patched the FIRE headline while the SAME
 * empty-as-achieved class can live in every other FIRE consumer. This file is that sweep —
 * for a brand-new user with NO real plan, NO consumer may show a false achieved / 100% /
 * on-track / crossover-year / positive-freedom signal. An optimistic empty-state is the
 * Tier-0 honesty regression (`output-plausibility-verification.md`, rule 31).
 *
 * Three input states (the RCA of #39 was input-state blindness — every persona fixture has
 * full data):
 *   EMPTY      — profile only (no income/expenses/investments) ⇒ zero FIRE target
 *   PARTIAL-A  — profile + real expenses, NO income/corpus      ⇒ real target, no progress
 *   PARTIAL-B  — profile + income, NO expenses                  ⇒ income alone ≠ achievement
 *
 * Consumers swept (the dashboard's FIRE single-source `derive()` + the score modules the
 * FIRE/health screens build from it): FIRE headline (yearsTo*), progress %, crossover
 * labels, freedom score, Coast/Barista chips.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { derive } from "@/lib/derive";
import { computeFreedomScore } from "@/lib/freedom-score";
import { calculateCoastFire, calculateBaristaFire, realReturnForCoast } from "@/lib/coast-fire";

const LENS = { isFamilyView: false, viewingMemberId: null, currentFY: "2025-26" } as const;

function newEarner() {
  return {
    id: "you",
    name: "You",
    dateOfBirth: "1990-01-01",
    role: "EARNER",
    targetRetirementAge: 50,
    planToAge: 90,
    city: "Metro",
    health: "Healthy",
    riskAppetite: "Moderate",
    marital: "Married",
    employmentStatus: "Employed",
  };
}

// The freedom-score input the FIRE + health dashboards build from a derive() result
// (mirrors HealthScore.vue / fire-goals/Dashboard.vue — gh #40 zero-income guard included).
function freedomFromDerive(k: ReturnType<typeof derive>, monthlyTakeHome: number) {
  return computeFreedomScore({
    savingsRatePercent: k.savingsRate,
    dtiPercent: 0,
    hasIncome: monthlyTakeHome > 0,
    emergencyMonths: 0,
    lifeAdequate: false,
    healthAdequate: false,
    fireProgressPercent: k.progressPercent,
  });
}

function expectNoCrossoverClaimed(k: ReturnType<typeof derive>, ctx: string) {
  for (const c of [k.crossovers.regular, k.crossovers.lean, k.crossovers.fat]) {
    expect(c.year, `${ctx} — ${c.variant} crossover year must be null (not within horizon)`).toBeNull();
    expect(c.yearsFromNow, `${ctx} — ${c.variant} yearsFromNow must be null`).toBeNull();
  }
}

describe("A2.5b EMPTY/PARTIAL honesty sweep (gh #39 sibling sweep)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("EMPTY (profile only): no FIRE consumer shows a false achieved/100%/crossover/score", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    h.addMember(newEarner() as never);
    const k = derive(h.data, a.values, LENS);
    const ctx = "EMPTY";

    // FIRE headline — non-finite years are the honest "not within horizon" (a FINITE ≤0 is
    // the #39 bug: it renders "already at Regular FIRE — congratulations!" on ₹0).
    expect(Number.isFinite(k.yearsToRegular), `${ctx} — Regular years non-finite`).toBe(false);
    expect(Number.isFinite(k.yearsToLean), `${ctx} — Lean years non-finite`).toBe(false);
    expect(Number.isFinite(k.yearsToFat), `${ctx} — Fat years non-finite`).toBe(false);

    // Zero target, zero progress (never 100, never NaN).
    expect(k.fireNumber, `${ctx} — zero expenses ⇒ zero FIRE target`).toBe(0);
    expect(k.progressPercent, `${ctx} — progress must be 0, never 100`).toBe(0);

    // Crossover labels — no predicted "you'll reach FIRE in year X".
    expectNoCrossoverClaimed(k, ctx);

    // Freedom score — the gh #40 zero-income guard means an empty user scores essentially 0
    // (no savings, no income, no corpus, no cover). A falsely-awarded score is the regression.
    const fs = freedomFromDerive(k, 0);
    expect(fs.score, `${ctx} — freedom score must be ~0, never falsely high`).toBeLessThan(10);
    // The only "free/achieved" headline computeFreedomScore can emit is "Excellent" (others:
    // Good/Fair/Developing/Starting) — an empty user must NOT land there.
    expect(fs.status.toLowerCase(), `${ctx} — status not 'Excellent'`).not.toMatch(/excellent/);
  });

  it("PARTIAL-A (real expenses, NO income/corpus): real target but zero progress, nothing achieved", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    h.addMember(newEarner() as never);
    // Inject a real monthly expense → a genuine FIRE target, but no income and no corpus.
    h.data.expenses.avgMonthly = 50_000;
    const k = derive(h.data, a.values, LENS);
    const ctx = "PARTIAL-A (expenses only)";

    // Now there IS a real target...
    expect(k.fireNumber, `${ctx} — real expenses ⇒ positive FIRE target`).toBeGreaterThan(0);
    // ...but ZERO corpus ⇒ zero progress, and unreachable with no savings ⇒ non-finite years.
    expect(k.progressPercent, `${ctx} — no corpus ⇒ 0% progress`).toBe(0);
    expect(Number.isFinite(k.yearsToRegular), `${ctx} — unreachable ⇒ non-finite, never 0`).toBe(false);
    expectNoCrossoverClaimed(k, ctx);

    // Coast/Barista chips MUST NOT show "reached" with a real target and zero corpus/income.
    const coast = calculateCoastFire({
      fireNumber: k.fireNumber,
      yearsToRetirement: k.targetRetirementAge - k.anchorAge,
      realReturn: realReturnForCoast(a.values.equityReturn, k.householdInflation),
    });
    expect(coast.hasReachedCoast(0), `${ctx} — Coast NOT reached on ₹0 corpus`).toBe(false);
    expect(coast.hasReachedCoast(k.fireWithdrawableCorpus), `${ctx} — Coast NOT reached`).toBe(false);

    const barista = calculateBaristaFire({
      annualExpenses: k.annualExpensesToday,
      baristaIncome: 0,
      swr: k.effectiveSWR,
    });
    expect(barista.hasReachedBarista(0), `${ctx} — Barista NOT reached on ₹0 corpus + ₹0 part-time`).toBe(false);

    // Freedom score still low (no savings, no corpus, no income).
    expect(freedomFromDerive(k, 0).score, `${ctx} — freedom score low`).toBeLessThan(50);
  });

  it("PARTIAL-B (income, NO expenses): income alone never fabricates a FIRE achievement", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    h.addMember(newEarner() as never);
    // Give the member real salary income (the actual memberSalarySchema shape) but leave
    // expenses at zero — so there is genuine income but no FIRE target yet.
    h.data.members[0].salary = { annualCTC: 2_400_000, hikePercent: 5 } as never;
    const k = derive(h.data, a.values, LENS);
    const ctx = "PARTIAL-B (income only)";

    // Non-vacuous guard: the income MUST actually have flowed (else this degenerates into a
    // second no-expenses test). A real take-home proves we're testing the income-present path.
    expect(k.annualIncome.total, `${ctx} — salary income must actually be present`).toBeGreaterThan(0);
    expect(k.monthlyTakeHome, `${ctx} — take-home must be positive`).toBeGreaterThan(0);

    // No expenses ⇒ no FIRE target ⇒ no achievement, regardless of income.
    expect(k.fireNumber, `${ctx} — no expenses ⇒ zero FIRE target`).toBe(0);
    expect(k.progressPercent, `${ctx} — progress 0`).toBe(0);
    expect(Number.isFinite(k.yearsToRegular), `${ctx} — Regular years non-finite`).toBe(false);
    expect(Number.isFinite(k.yearsToLean), `${ctx} — Lean years non-finite`).toBe(false);
    expect(Number.isFinite(k.yearsToFat), `${ctx} — Fat years non-finite`).toBe(false);
    expectNoCrossoverClaimed(k, ctx);
    // No NaN/∞ leaked into the money fields despite the lopsided (income, no-expense) shape.
    expect(Number.isFinite(k.annualSavings) && Number.isFinite(k.totalCorpus)).toBe(true);
  });
});
