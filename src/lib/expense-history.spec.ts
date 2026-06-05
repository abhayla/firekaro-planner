import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  captureSnapshot,
  loadAllSnapshots,
  analyzeLifestyleInflation,
  detectGoalPostShift,
  periodKey,
  financialYearOf,
  getCurrentFinancialYear,
  hasSnapshotForPeriod,
} from "./expense-history";
import { LocalAuthProvider, setAuthProvider } from "./auth-provider";
import type { Household } from "@/types/household";

// Integration-style: expense-history persists snapshots through the storage
// adapter (firekaro-mvp:<userId>:expense-history), so these tests exercise the
// real capture → persist → load → analyze round-trip. vitest env is 'node', so
// we polyfill localStorage (same subset the adapter spec uses) and reset it +
// the auth provider before each test for FIRST-independent isolation.

beforeAll(() => {
  if (typeof (globalThis as { localStorage?: unknown }).localStorage === "undefined") {
    const store = new Map<string, string>();
    (globalThis as { localStorage: Storage }).localStorage = {
      get length() {
        return store.size;
      },
      key(i: number) {
        return Array.from(store.keys())[i] ?? null;
      },
      getItem(k: string) {
        return store.has(k) ? store.get(k)! : null;
      },
      setItem(k: string, v: string) {
        store.set(k, v);
      },
      removeItem(k: string) {
        store.delete(k);
      },
      clear() {
        store.clear();
      },
    };
  }
});

beforeEach(() => {
  localStorage.clear();
  setAuthProvider(new LocalAuthProvider()); // userId === 'self'
});

function hh(over: Partial<Household["expenses"]> = {}): Household {
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
    expenses: { avgMonthly: 0, recurring: [], plannedFuture: [], ...over },
  };
}

// A recurring line with frequency 'A' contributes exactly `amount`/yr — the
// cleanest way to dial a snapshot's totalAnnual to a round number.
function annualLine(amount: number, inflationBucket?: "general" | "healthcare" | "education" | "housing") {
  return { id: `r-${amount}`, label: "Line", amount, frequency: "A" as const, source: "manual" as const, inflationBucket };
}

describe("periodKey + financialYearOf (A29.1/A30.1)", () => {
  it("periodKey returns zero-padded YYYY-MM", () => {
    expect(periodKey(new Date(2026, 4, 15))).toBe("2026-05"); // May (month index 4)
    expect(periodKey(new Date(2026, 0, 1))).toBe("2026-01");
    expect(periodKey(new Date(2026, 11, 31))).toBe("2026-12");
  });

  it("financialYearOf maps Apr–Mar to the Indian FY", () => {
    expect(financialYearOf(new Date(2026, 4, 1))).toBe("2026-27"); // May → FY 2026-27
    expect(financialYearOf(new Date(2026, 2, 31))).toBe("2025-26"); // Mar → prior FY
    expect(financialYearOf(new Date(2026, 3, 1))).toBe("2026-27"); // Apr 1 → new FY
  });
});

describe("getCurrentFinancialYear (auto-derived current FY)", () => {
  it("returns the FY for a mid-year date", () => {
    expect(getCurrentFinancialYear(new Date("2025-06-15"))).toBe("2025-26");
  });

  it("maps a Jan–Mar date to the prior FY", () => {
    expect(getCurrentFinancialYear(new Date("2025-02-10"))).toBe("2024-25");
  });

  it("maps the Apr 1 boundary to the new FY", () => {
    expect(getCurrentFinancialYear(new Date("2025-04-01"))).toBe("2025-26");
  });

  it("delegates to financialYearOf (no clamping to configured FYs)", () => {
    // A far-future date must still yield its true wall-clock FY — clamping is
    // the tax-screen picker's job, not this helper's.
    expect(getCurrentFinancialYear(new Date("2099-08-01"))).toBe("2099-00");
  });
});

describe("captureSnapshot — persist + round-trip (period-keyed)", () => {
  it("captures total annual expenses and persists through the adapter", () => {
    const snap = captureSnapshot(hh({ avgMonthly: 100_000 }), { period: "2024-05", fy: "2024-25" });
    expect(snap.totalAnnual).toBe(1_200_000); // 100k * 12

    const loaded = loadAllSnapshots();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].period).toBe("2024-05");
    expect(loaded[0].fy).toBe("2024-25");
    expect(loaded[0].totalAnnual).toBe(1_200_000);
  });

  it("routes recurring lines into their inflation bucket; avgMonthly into general", () => {
    const snap = captureSnapshot(
      hh({ avgMonthly: 100_000, recurring: [annualLine(120_000, "healthcare")] }),
      { period: "2024-05", fy: "2024-25" },
    );
    expect(snap.byBucket.healthcare).toBe(120_000);
    expect(snap.byBucket.general).toBe(1_200_000); // avgMonthly*12
    // Buckets sum to the total.
    const sum = Object.values(snap.byBucket).reduce((s, v) => s + v, 0);
    expect(sum).toBe(snap.totalAnnual);
  });

  it("defaults an untagged recurring line to the general bucket", () => {
    const snap = captureSnapshot(hh({ recurring: [annualLine(50_000)] }), { period: "2024-05", fy: "2024-25" });
    expect(snap.byBucket.general).toBe(50_000);
  });

  it("stores the FIRE target year + headline FIRE number for the trajectory chart", () => {
    const snap = captureSnapshot(hh({ avgMonthly: 50_000 }), {
      period: "2024-05",
      fy: "2024-25",
      fireTargetYear: 2045,
      fireNumber: 85_700_000,
    });
    expect(snap.fireTargetYear).toBe(2045);
    expect(snap.fireNumber).toBe(85_700_000);
  });

  it("is idempotent within a period — re-capturing the same month replaces, not duplicates", () => {
    captureSnapshot(hh({ avgMonthly: 100_000 }), { period: "2024-05", fy: "2024-25" });
    captureSnapshot(hh({ avgMonthly: 150_000 }), { period: "2024-05", fy: "2024-25" }); // same month, new data
    const loaded = loadAllSnapshots();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].totalAnnual).toBe(1_800_000); // the replacement value
  });

  it("keeps distinct months as separate points (monthly accrual)", () => {
    captureSnapshot(hh({ avgMonthly: 100_000 }), { period: "2024-05", fy: "2024-25" });
    captureSnapshot(hh({ avgMonthly: 110_000 }), { period: "2024-06", fy: "2024-25" }); // same FY, next month
    expect(loadAllSnapshots()).toHaveLength(2);
  });

  it("hasSnapshotForPeriod reflects what is stored", () => {
    expect(hasSnapshotForPeriod("2024-05")).toBe(false);
    captureSnapshot(hh({ avgMonthly: 100_000 }), { period: "2024-05", fy: "2024-25" });
    expect(hasSnapshotForPeriod("2024-05")).toBe(true);
    expect(hasSnapshotForPeriod("2024-06")).toBe(false);
  });

  it("returns snapshots in chronological period order regardless of capture order", () => {
    captureSnapshot(hh({ avgMonthly: 100_000 }), { period: "2024-05", fy: "2024-25" });
    captureSnapshot(hh({ avgMonthly: 80_000 }), { period: "2022-05", fy: "2022-23" });
    captureSnapshot(hh({ avgMonthly: 90_000 }), { period: "2023-05", fy: "2023-24" });
    expect(loadAllSnapshots().map((s) => s.period)).toEqual(["2022-05", "2023-05", "2024-05"]);
  });
});

describe("analyzeLifestyleInflation", () => {
  it("returns zero growth when fewer than 2 snapshots exist", () => {
    captureSnapshot(hh({ avgMonthly: 100_000 }), { period: "2024-05", fy: "2024-25" });
    const r = analyzeLifestyleInflation();
    expect(r.averageYoYGrowth).toBe(0);
    expect(r.isLifestyleInflating).toBe(false);
  });

  it("flags lifestyle inflation when growth exceeds general+2pp", () => {
    captureSnapshot(hh({ recurring: [annualLine(1_000_000)] }), { period: "2023-05", fy: "2023-24" });
    captureSnapshot(hh({ recurring: [annualLine(1_200_000)] }), { period: "2024-05", fy: "2024-25" }); // +20%
    const r = analyzeLifestyleInflation(0.06); // threshold 8%
    expect(r.averageYoYGrowth).toBeCloseTo(0.2, 5);
    expect(r.isLifestyleInflating).toBe(true);
  });

  it("does NOT flag when growth tracks general inflation", () => {
    captureSnapshot(hh({ recurring: [annualLine(1_000_000)] }), { period: "2023-05", fy: "2023-24" });
    captureSnapshot(hh({ recurring: [annualLine(1_050_000)] }), { period: "2024-05", fy: "2024-25" }); // +5% < 8%
    const r = analyzeLifestyleInflation(0.06);
    expect(r.averageYoYGrowth).toBeCloseTo(0.05, 5);
    expect(r.isLifestyleInflating).toBe(false);
  });

  it("computes per-bucket growth", () => {
    captureSnapshot(hh({ recurring: [annualLine(200_000, "healthcare")] }), { period: "2023-05", fy: "2023-24" });
    captureSnapshot(hh({ recurring: [annualLine(260_000, "healthcare")] }), { period: "2024-05", fy: "2024-25" }); // +30%
    const r = analyzeLifestyleInflation();
    expect(r.byBucket.healthcare).toBeCloseTo(0.3, 5);
  });
});

describe("detectGoalPostShift", () => {
  it("counts only outward FIRE-target moves and sums the years added", () => {
    captureSnapshot(hh({ avgMonthly: 50_000 }), { period: "2022-05", fy: "2022-23", fireTargetYear: 2045 });
    captureSnapshot(hh({ avgMonthly: 50_000 }), { period: "2023-05", fy: "2023-24", fireTargetYear: 2048 }); // +3 outward
    captureSnapshot(hh({ avgMonthly: 50_000 }), { period: "2024-05", fy: "2024-25", fireTargetYear: 2047 }); // pulled in
    const r = detectGoalPostShift();
    expect(r.shiftCount).toBe(1);
    expect(r.totalYearsAdded).toBe(3);
  });

  it("reports no shift when the target holds steady or improves", () => {
    captureSnapshot(hh({ avgMonthly: 50_000 }), { period: "2022-05", fy: "2022-23", fireTargetYear: 2045 });
    captureSnapshot(hh({ avgMonthly: 50_000 }), { period: "2023-05", fy: "2023-24", fireTargetYear: 2045 });
    captureSnapshot(hh({ avgMonthly: 50_000 }), { period: "2024-05", fy: "2024-25", fireTargetYear: 2043 }); // earlier
    const r = detectGoalPostShift();
    expect(r.shiftCount).toBe(0);
    expect(r.totalYearsAdded).toBe(0);
  });

  it("ignores snapshots without a recorded target year", () => {
    captureSnapshot(hh({ avgMonthly: 50_000 }), { period: "2023-05", fy: "2023-24" }); // no target
    captureSnapshot(hh({ avgMonthly: 50_000 }), { period: "2024-05", fy: "2024-25" }); // no target
    expect(detectGoalPostShift()).toEqual({ shiftCount: 0, totalYearsAdded: 0 });
  });
});

describe("multi-tenant isolation", () => {
  it("snapshots are scoped per user — another user sees none", () => {
    captureSnapshot(hh({ avgMonthly: 100_000 }), { period: "2024-05", fy: "2024-25" }); // as 'self'
    expect(loadAllSnapshots()).toHaveLength(1);

    class StubAuth {
      getCurrentUserId() {
        return "other-user";
      }
      isAuthenticated() {
        return true;
      }
    }
    setAuthProvider(new StubAuth());
    expect(loadAllSnapshots()).toHaveLength(0); // 'other-user' has no snapshots
  });
});
