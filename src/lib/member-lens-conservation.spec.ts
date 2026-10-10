/**
 * gh #232 round 1 — the member lens projects like the household and conserves savings.
 *
 * Invariants:
 *   1. A one-adult household's member lens equals its household lens (income, tax, expenses,
 *      corpus, savings, and — once the household-only family layer is absent — FIRE age).
 *   2. Σ over adults of annual savings == the household's annual savings, on every seed, at any split.
 *   3. Orientation: at split 60 the ANCHOR adult carries 60% of a Joint row, the other adult 40%.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { loadSeedPersona } from "@/lib/seed-persona";
import { loadRaviSeed } from "@/seeds/ravi";
import { loadMehtasSeed } from "@/seeds/mehtas";
import { loadIyersSeed } from "@/seeds/iyers";
import { loadMauryasSeed } from "@/seeds/mauryas";
import { derive } from "@/lib/derive";
import { jointAnchorMemberId } from "@/lib/tax-deductions";
import { requiredMonthlyContributionFor } from "@/lib/required-contribution";
import { useUiStore } from "@/stores/ui";
import { useFireDerive } from "@/lib/useFireDerive";

const LENS = { isFamilyView: true, viewingMemberId: null, currentFY: "2025-26", asOfDate: "2026-10-10" };
type Loader = Parameters<typeof loadRaviSeed>;
const SEEDS: Record<string, (h: Loader[0], a: Loader[1]) => void> = {
  Sharmas: loadSeedPersona,
  Iyers: loadIyersSeed,
  Mehtas: loadMehtasSeed,
  Mauryas: loadMauryasSeed,
  Ravi: loadRaviSeed,
};

function load(name: string, split: number) {
  const h = useHouseholdStore();
  const a = useAssumptionsStore();
  SEEDS[name](h, a);
  a.values.householdSplitPercent = split;
  return { h, a };
}

describe("#232 member lens — one-adult household equals the household lens", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("Ravi: income, tax, expenses, corpus and savings are the household's to the rupee", () => {
    const { h, a } = load("Ravi", 50);
    const k = derive(h.data, a.values, LENS);
    expect(k.individualFireByMember).toHaveLength(1);
    const r = k.individualFireByMember[0];
    expect(r.attributableAnnualIncome).toBe(Math.round(k.annualIncome.total));
    expect(r.attributableAnnualTax).toBe(Math.round(k.annualTax));
    expect(r.attributableAnnualExpenses).toBe(Math.round(k.annualExpensesToday));
    expect(r.attributableCorpus).toBe(Math.round(k.totalCorpus));
    expect(r.attributableAnnualSavings).toBeCloseTo(k.annualSavings, 6);
  });

  it("Ravi without the household-only family layer: member FIRE age == household FIRE age", () => {
    const { h, a } = load("Ravi", 50);
    // The family layer (extended-family contingency, planned goals) is a household obligation the
    // member target excludes by contract §3; with it absent the two targets are the same target.
    h.data.extendedFamilyContingencyPercent = 0;
    h.data.expenses.plannedFuture = [];
    const k = derive(h.data, a.values, LENS);
    const r = k.individualFireByMember[0];
    expect(k.familyLayerCorpus).toBe(0);
    expect(r.individualFireNumber).toBe(Math.round(k.fireNumber));
    expect(Number.isFinite(r.individualFireAge)).toBe(true);
    // Same projection method, same target, same rounding: the RAW years are equal, not "within 1".
    expect(Number.isFinite(r.yearsToIndividualFire)).toBe(true);
    expect(Math.abs(r.yearsToIndividualFire - k.yearsToRegular)).toBeLessThan(1e-6);
    expect(r.individualFireAge).toBe(k.householdFireAge);
  });
});

describe("#232 member lens — the family layer is the ONLY gap to the household", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("Ravi with the family layer: member target and age never exceed the household's", () => {
    const { h, a } = load("Ravi", 50);
    const k = derive(h.data, a.values, LENS);
    const r = k.individualFireByMember[0];
    expect(k.familyLayerCorpus).toBeGreaterThan(0);
    expect(r.individualFireNumber).toBeLessThan(Math.round(k.fireNumber));
    expect(r.individualFireAge).toBeLessThanOrEqual(k.householdFireAge as number);
    expect(r.yearsToIndividualFire).toBeLessThanOrEqual(k.yearsToRegular + 1e-6);
  });
});

describe("#232 member lens — Σ member savings == household savings", () => {
  beforeEach(() => setActivePinia(createPinia()));

  for (const name of Object.keys(SEEDS)) {
    for (const split of [30, 50, 60, 70]) {
      it(`${name} at split ${split}`, () => {
        const { h, a } = load(name, split);
        const k = derive(h.data, a.values, LENS);
        const sum = k.individualFireByMember.reduce((s, r) => s + r.attributableAnnualSavings, 0);
        expect(sum).toBeCloseTo(k.annualSavings, 4);
        for (const r of k.individualFireByMember) expect(r.attributableAnnualSavings).toBeGreaterThanOrEqual(0);
      });
    }
  }

  it("Mauryas: the earner carries the non-earner's shortfall (not ₹24.85L/yr on ₹15.11L)", () => {
    const { h, a } = load("Mauryas", 50);
    const k = derive(h.data, a.values, LENS);
    const earner = k.individualFireByMember.reduce((best, r) =>
      r.attributableAnnualIncome > best.attributableAnnualIncome ? r : best,
    );
    expect(earner.attributableAnnualSavings).toBeCloseTo(k.annualSavings, 4);
    expect(earner.attributableAnnualSavings).toBeLessThan(
      earner.attributableAnnualIncome - earner.attributableAnnualTax - earner.attributableAnnualExpenses,
    );
  });
});

describe("#232 member lens — anchor orientation of a Joint row", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("at split 60 the ANCHOR adult gains +10% of the Joint corpus vs split 50, the other loses it", () => {
    const at = (split: number) => {
      setActivePinia(createPinia());
      const { h, a } = load("Sharmas", split);
      return { h, k: derive(h.data, a.values, LENS) };
    };
    const s50 = at(50);
    const s60 = at(60);
    const jointCorpus = s50.h.data.investments
      .filter((i) => i.ownerId === "Joint" && !(i.type === "RealEstate" && i.realEstateRole === "PrimaryResidence"))
      .reduce((s, i) => s + i.value, 0);
    expect(jointCorpus).toBeGreaterThan(0);
    const anchorId = jointAnchorMemberId(s60.h.data);
    expect(anchorId).toBeTruthy();
    const corpusOf = (k: typeof s50.k, id: string) =>
      k.individualFireByMember.find((r) => r.memberId === id)!.attributableCorpus;
    const otherId = s60.k.individualFireByMember.find((r) => r.memberId !== anchorId)!.memberId;
    expect(corpusOf(s60.k, anchorId!) - corpusOf(s50.k, anchorId!)).toBeCloseTo(0.1 * jointCorpus, -1);
    expect(corpusOf(s60.k, otherId) - corpusOf(s50.k, otherId)).toBeCloseTo(-0.1 * jointCorpus, -1);
  });
});

describe("#232 member lens — anchor orientation of shared EXPENSES and Joint INCOME", () => {
  beforeEach(() => setActivePinia(createPinia()));

  const at = (split: number) => {
    setActivePinia(createPinia());
    const { h, a } = load("Sharmas", split);
    // Two shared-expense paths: a recurring "Household" row (₹12L/yr) and the avgMonthly lump (₹6L/yr).
    h.data.expenses.recurring = [
      { id: "shared-row", label: "Shared", amount: 100_000, frequency: "M", source: "manual", ownerId: "Household" },
    ];
    h.data.expenses.avgMonthly = 50_000;
    h.data.otherIncome = [
      {
        id: "joint-inc",
        type: "Other",
        source: "Direct",
        amount: 1_000_000,
        frequency: "A",
        ownerId: "Joint",
        isTaxExempt: true,
      },
    ];
    return { h, k: derive(h.data, a.values, LENS) };
  };

  it("at split 60 the ANCHOR adult carries 60% of shared expenses and gets 60% of Joint income", () => {
    const s50 = at(50);
    const s60 = at(60);
    const anchorId = jointAnchorMemberId(s60.h.data)!;
    const otherId = s60.k.individualFireByMember.find((r) => r.memberId !== anchorId)!.memberId;
    const row = (x: typeof s50, id: string) => x.k.individualFireByMember.find((r) => r.memberId === id)!;
    expect(row(s60, anchorId).attributableAnnualExpenses - row(s50, anchorId).attributableAnnualExpenses).toBe(180_000);
    expect(row(s60, otherId).attributableAnnualExpenses - row(s50, otherId).attributableAnnualExpenses).toBe(-180_000);
    expect(row(s60, anchorId).attributableAnnualExpenses).toBeGreaterThan(row(s60, otherId).attributableAnnualExpenses);
    expect(row(s60, anchorId).attributableAnnualIncome - row(s50, anchorId).attributableAnnualIncome).toBeCloseTo(100_000, -1);
    expect(row(s60, otherId).attributableAnnualIncome - row(s50, otherId).attributableAnnualIncome).toBeCloseTo(-100_000, -1);
  });
});

describe("#232 round-0 guards — committed-EMI floor and shared-loan FH shares", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("the OTHER adult's own loan EMI never enters this adult's committed floor (required-contribution)", () => {
    const solveFor = (withLoan: boolean) => {
      setActivePinia(createPinia());
      const { h, a } = load("Mehtas", 50);
      const adults = h.data.members.filter((m) => m.role === "ADULT");
      const [viewer, other] = adults;
      if (withLoan) {
        // A large loan owned by the OTHER adult alone, not shared: 0% of it is the viewer's.
        h.addLiability({
          name: "Other adult's own loan",
          type: "PersonalLoan",
          outstandingBalance: 20_000_000,
          monthlyEMI: 700_000,
          interestRate: 10,
          ownerId: other.id,
          isSharedWithSpouse: false,
        } as Parameters<typeof h.addLiability>[0]);
      }
      return requiredMonthlyContributionFor({
        snapshot: h.data,
        assumptions: a.values,
        lens: { ...LENS, isFamilyView: false, viewingMemberId: viewer.id },
        targetAge: 60,
      }).requiredMonthlyReal;
    };
    const baseline = solveFor(false);
    expect(Number.isFinite(baseline)).toBe(true);
    // A `split × every committed row` floor charges the viewer ₹3.5L/mo of the other's EMI, which
    // exceeds the viewer's take-home and turns the answer into Infinity.
    expect(solveFor(true)).toBe(baseline);
  });

  it("a shared loan's balance and EMI split complementarily across the two adults (memberFinancials)", () => {
    const h = useHouseholdStore();
    const a = useAssumptionsStore();
    const ui = useUiStore();
    loadSeedPersona(h, a);
    a.values.householdSplitPercent = 60;
    const loan = h.addLiability({
      name: "Shared car loan",
      type: "CarLoan",
      outstandingBalance: 1_000_000,
      monthlyEMI: 20_000,
      interestRate: 9,
      ownerId: "rohit",
      isSharedWithSpouse: true,
    } as Parameters<typeof h.addLiability>[0]);
    const fire = useFireDerive();
    const rowFor = (id: string) => {
      ui.setViewingMemberId(id);
      return fire.memberFinancials.value.scopedLiabilities.find((l) => l.id === loan.id)!;
    };
    const rohit = rowFor("rohit");
    const priya = rowFor("priya");
    expect(rohit.outstandingBalance + priya.outstandingBalance).toBe(1_000_000);
    expect(rohit.monthlyEMI + priya.monthlyEMI).toBe(20_000);
    const anchorShare = jointAnchorMemberId(h.data) === "rohit" ? 0.6 : 0.4;
    expect(rohit.outstandingBalance).toBe(Math.round(1_000_000 * anchorShare));
  });
});
