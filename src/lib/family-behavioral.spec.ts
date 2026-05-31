/**
 * Consolidated unit tests for Stage E libs:
 * - lib/derived-records.ts
 * - lib/nudge-engine.ts
 * - lib/expense-history.ts
 * Phase 2 Stage E per docs/goals/build-firekaro-mvp-v5.md §5.
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { derivedFamilyLayer } from "./derived-records";
import { evaluateNudges, type NudgeContext } from "./nudge-engine";
import {
  captureSnapshot,
  loadAllSnapshots,
  analyzeLifestyleInflation,
  detectGoalPostShift,
} from "./expense-history";
import { setAuthProvider, LocalAuthProvider } from "./auth-provider";
import type { Household } from "@/types/household";

// Inline localStorage polyfill — vitest env is 'node' per config.
beforeAll(() => {
  if (typeof (globalThis as { localStorage?: unknown }).localStorage === "undefined") {
    const store = new Map<string, string>();
    (globalThis as { localStorage: Storage }).localStorage = {
      get length() { return store.size; },
      key(i: number) { return Array.from(store.keys())[i] ?? null; },
      getItem(k: string) { return store.has(k) ? store.get(k)! : null; },
      setItem(k: string, v: string) { store.set(k, v); },
      removeItem(k: string) { store.delete(k); },
      clear() { store.clear(); },
    };
  }
});

function emptyHH(): Household {
  return {
    name: "",
    setupMode: "Solo",
    profileComplete: false,
    wizardCompleted: false,
    members: [],
    businesses: [],
    otherIncome: [],
    investments: [],
    liabilities: [],
    insurance: [],
    expenses: { avgMonthly: 0, recurring: [], plannedFuture: [] },
  };
}

// ============================================================================
// derivedFamilyLayer
// ============================================================================

describe("derivedFamilyLayer", () => {
  it("empty household has no family layer", () => {
    const out = derivedFamilyLayer(emptyHH());
    expect(out.parentsRecurring).toEqual([]);
    expect(out.educationGoals).toEqual([]);
    expect(out.marriageEvents).toEqual([]);
    expect(out.extendedContingency).toBeNull();
    expect(out.hasFamilyLayer).toBe(false);
  });

  it("captures parents-kind recurring expenses", () => {
    const hh = emptyHH();
    hh.expenses.recurring = [
      { id: "r1", label: "Parents medical", amount: 10_000, frequency: "M", source: "manual", kind: "parents", inflationBucket: "healthcare" },
      { id: "r2", label: "Rent", amount: 30_000, frequency: "M", source: "manual", kind: "general", inflationBucket: "housing" },
    ];
    const out = derivedFamilyLayer(hh);
    expect(out.parentsRecurring.length).toBe(1);
    expect(out.parentsRecurring[0].label).toBe("Parents medical");
    expect(out.hasFamilyLayer).toBe(true);
  });

  it("captures education + marriage goals", () => {
    const hh = emptyHH();
    hh.expenses.plannedFuture = [
      { id: "g1", label: "Kid college", todayAmount: 5_000_000, targetYear: 2040, isMultiYear: false, kind: "education" },
      { id: "g2", label: "Wedding", todayAmount: 3_000_000, targetYear: 2035, isMultiYear: false, kind: "marriage" },
      { id: "g3", label: "Vacation", todayAmount: 500_000, targetYear: 2027, isMultiYear: false, kind: "general" },
    ];
    const out = derivedFamilyLayer(hh);
    expect(out.educationGoals.length).toBe(1);
    expect(out.marriageEvents.length).toBe(1);
  });

  it("synthesizes extended-contingency line from percentage", () => {
    const hh = emptyHH();
    hh.expenses.avgMonthly = 100_000; // 12L annual
    hh.extendedFamilyContingencyPercent = 0.075;
    const out = derivedFamilyLayer(hh);
    expect(out.extendedContingency).not.toBeNull();
    expect(out.extendedContingency?.kind).toBe("extended-contingency");
    // 12L * 0.075 = 90k annual, /12 = 7500/month
    expect(out.extendedContingency?.amount).toBe(7_500);
  });

  it("totalAnnualCost aggregates all family-layer items", () => {
    const hh = emptyHH();
    hh.expenses.avgMonthly = 50_000; // 6L
    hh.expenses.recurring = [
      { id: "r1", label: "Parents medical", amount: 10_000, frequency: "M", source: "manual", kind: "parents", inflationBucket: "healthcare" },
    ];
    hh.expenses.plannedFuture = [
      { id: "g1", label: "Education", todayAmount: 5_000_000, targetYear: new Date().getFullYear() + 10, isMultiYear: false, kind: "education" },
    ];
    hh.extendedFamilyContingencyPercent = 0.075;
    const out = derivedFamilyLayer(hh);
    expect(out.totalAnnualCost).toBeGreaterThan(0);
    // ~ 120k parents + 500k/yr education amortized + ~52k contingency
    expect(out.totalAnnualCost).toBeGreaterThan(600_000);
  });
});

// ============================================================================
// evaluateNudges
// ============================================================================

function ctx(overrides: Partial<NudgeContext> = {}): NudgeContext {
  const household = overrides.household ?? emptyHH();
  return {
    household,
    family: derivedFamilyLayer(household),
    annualExpenses: 1_200_000,
    taxableIncome: 1_000_000,
    fy: "2025-26",
    marginalSlabRate: 0.30,
    currentMonth: 6, // July — outside the Jan–Mar LTCG window by default
    ...overrides,
  };
}

describe("evaluateNudges — marginal relief", () => {
  it("fires when in 12L-12.75L band", () => {
    const nudges = evaluateNudges(ctx({ taxableIncome: 1_230_000 }));
    expect(nudges.some((n) => n.kind === "marginal-relief")).toBe(true);
  });

  it("does NOT fire below band", () => {
    const nudges = evaluateNudges(ctx({ taxableIncome: 800_000 }));
    expect(nudges.some((n) => n.kind === "marginal-relief")).toBe(false);
  });
});

describe("evaluateNudges — emergency-fund shortfall", () => {
  it("fires when liquid < 6 months expenses", () => {
    const hh = emptyHH();
    hh.investments = [
      { id: "fd1", type: "FD", value: 100_000, ownerId: "self" }, // only 1 month
    ];
    const nudges = evaluateNudges(ctx({ household: hh, annualExpenses: 1_200_000 }));
    expect(nudges.some((n) => n.kind === "emergency-fund-shortfall")).toBe(true);
  });

  it("does NOT fire when liquid covers 12+ months", () => {
    const hh = emptyHH();
    hh.investments = [
      { id: "fd1", type: "FD", value: 1_500_000, ownerId: "self" }, // 15 months
    ];
    const nudges = evaluateNudges(ctx({ household: hh, annualExpenses: 1_200_000 }));
    expect(nudges.some((n) => n.kind === "emergency-fund-shortfall")).toBe(false);
  });
});

describe("evaluateNudges — international + RE concentration", () => {
  it("fires international when corpus large but no Intl exposure", () => {
    const hh = emptyHH();
    hh.investments = [
      { id: "s1", type: "Stocks", value: 5_000_000, ownerId: "self" },
    ];
    const nudges = evaluateNudges(ctx({ household: hh }));
    expect(nudges.some((n) => n.kind === "international-allocation")).toBe(true);
  });

  it("fires RE-overweight when RE > 60% of corpus", () => {
    const hh = emptyHH();
    hh.investments = [
      { id: "re1", type: "RealEstate", value: 8_000_000, ownerId: "self" },
      { id: "s1", type: "Stocks", value: 2_000_000, ownerId: "self" },
    ];
    const nudges = evaluateNudges(ctx({ household: hh }));
    expect(nudges.some((n) => n.kind === "real-estate-overweight")).toBe(true);
  });
});

describe("evaluateNudges — joint loan deduction", () => {
  it("fires when home loan has < 2 coBorrowers and household has >1 member", () => {
    const hh = emptyHH();
    hh.members = [
      { id: "m1", name: "A", dateOfBirth: "1990-01-01", role: "EARNER", city: "Metro", health: "Healthy", riskAppetite: "Moderate", marital: "Married" },
      { id: "m2", name: "B", dateOfBirth: "1992-01-01", role: "EARNER", city: "Metro", health: "Healthy", riskAppetite: "Moderate", marital: "Married" },
    ];
    hh.liabilities = [
      { id: "l1", name: "Home", type: "HomeLoan", outstandingBalance: 5_000_000, monthlyEMI: 50_000, interestRate: 8.0, ownerId: "m1", isSharedWithSpouse: false, coBorrowers: ["m1"] },
    ];
    const nudges = evaluateNudges(ctx({ household: hh }));
    expect(nudges.some((n) => n.kind === "joint-loan-deduction")).toBe(true);
  });
});

describe("evaluateNudges — sorted by severity", () => {
  it("alert before warning before info", () => {
    const hh = emptyHH();
    // Trigger multiple nudges of different severities
    hh.investments = [
      { id: "re1", type: "RealEstate", value: 8_000_000, ownerId: "self" }, // warning
      { id: "fd1", type: "FD", value: 50_000, ownerId: "self" }, // emergency fund warning
    ];
    const nudges = evaluateNudges(ctx({ household: hh, annualExpenses: 1_200_000, taxableIncome: 1_230_000 }));
    // Should have at least: real-estate-overweight (warning), emergency-fund-shortfall (warning),
    // marginal-relief (warning).
    expect(nudges.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < nudges.length; i++) {
      const order = { alert: 0, warning: 1, info: 2 };
      expect(order[nudges[i].severity]).toBeGreaterThanOrEqual(order[nudges[i - 1].severity]);
    }
  });
});

// ============================================================================
// expense-history
// ============================================================================

describe("expense-history snapshots", () => {
  beforeEach(() => {
    setAuthProvider(new LocalAuthProvider());
    localStorage.clear();
  });

  it("captures + loads snapshots", () => {
    const hh = emptyHH();
    hh.expenses.avgMonthly = 100_000;
    captureSnapshot(hh, { period: "2024-05", fy: "2024-25" });
    captureSnapshot(hh, { period: "2025-05", fy: "2025-26" });
    const all = loadAllSnapshots();
    expect(all.length).toBe(2);
    expect(all[0].fy).toBe("2024-25");
    expect(all[1].fy).toBe("2025-26");
  });

  it("re-saving same period replaces (idempotent within period)", () => {
    const hh = emptyHH();
    hh.expenses.avgMonthly = 100_000;
    captureSnapshot(hh, { period: "2024-05", fy: "2024-25" });
    hh.expenses.avgMonthly = 110_000;
    captureSnapshot(hh, { period: "2024-05", fy: "2024-25" });
    const all = loadAllSnapshots();
    expect(all.length).toBe(1);
    expect(all[0].totalAnnual).toBe(110_000 * 12);
  });

  it("buckets expenses by inflation route", () => {
    const hh = emptyHH();
    hh.expenses.avgMonthly = 50_000;
    hh.expenses.recurring = [
      { id: "r1", label: "Rent", amount: 30_000, frequency: "M", source: "manual", inflationBucket: "housing", kind: "general" },
      { id: "r2", label: "Parents medical", amount: 10_000, frequency: "M", source: "manual", inflationBucket: "healthcare", kind: "parents" },
    ];
    captureSnapshot(hh, { period: "2025-05", fy: "2025-26" });
    const all = loadAllSnapshots();
    expect(all[0].byBucket.housing).toBe(360_000);
    expect(all[0].byBucket.healthcare).toBe(120_000);
    expect(all[0].byBucket.general).toBe(600_000); // 50k * 12 avg
  });
});

describe("analyzeLifestyleInflation", () => {
  beforeEach(() => {
    setAuthProvider(new LocalAuthProvider());
    localStorage.clear();
  });

  it("zero growth with single snapshot", () => {
    const hh = emptyHH();
    hh.expenses.avgMonthly = 100_000;
    captureSnapshot(hh, { period: "2024-05", fy: "2024-25" });
    const r = analyzeLifestyleInflation();
    expect(r.averageYoYGrowth).toBe(0);
    expect(r.isLifestyleInflating).toBe(false);
  });

  it("detects growth across snapshots", () => {
    const hh = emptyHH();
    hh.expenses.avgMonthly = 100_000;
    captureSnapshot(hh, { period: "2023-05", fy: "2023-24" });
    hh.expenses.avgMonthly = 110_000;
    captureSnapshot(hh, { period: "2024-05", fy: "2024-25" });
    hh.expenses.avgMonthly = 121_000;
    captureSnapshot(hh, { period: "2025-05", fy: "2025-26" });
    const r = analyzeLifestyleInflation();
    expect(r.averageYoYGrowth).toBeCloseTo(0.1, 2);
    expect(r.isLifestyleInflating).toBe(true); // 10% > 6+2 = 8%
  });

  it("does NOT flag growth at general inflation", () => {
    const hh = emptyHH();
    hh.expenses.avgMonthly = 100_000;
    captureSnapshot(hh, { period: "2023-05", fy: "2023-24" });
    hh.expenses.avgMonthly = 106_000;
    captureSnapshot(hh, { period: "2024-05", fy: "2024-25" });
    const r = analyzeLifestyleInflation(0.06);
    expect(r.isLifestyleInflating).toBe(false);
  });
});

describe("detectGoalPostShift", () => {
  beforeEach(() => {
    setAuthProvider(new LocalAuthProvider());
    localStorage.clear();
  });

  it("zero when no shifts", () => {
    const hh = emptyHH();
    captureSnapshot(hh, { period: "2024-05", fy: "2024-25", fireTargetYear: 2050 });
    captureSnapshot(hh, { period: "2025-05", fy: "2025-26", fireTargetYear: 2050 });
    const r = detectGoalPostShift();
    expect(r.shiftCount).toBe(0);
  });

  it("counts each year the FIRE target moves further out", () => {
    const hh = emptyHH();
    captureSnapshot(hh, { period: "2023-05", fy: "2023-24", fireTargetYear: 2050 });
    captureSnapshot(hh, { period: "2024-05", fy: "2024-25", fireTargetYear: 2052 });
    captureSnapshot(hh, { period: "2025-05", fy: "2025-26", fireTargetYear: 2055 });
    const r = detectGoalPostShift();
    expect(r.shiftCount).toBe(2);
    expect(r.totalYearsAdded).toBe(5);
  });
});
