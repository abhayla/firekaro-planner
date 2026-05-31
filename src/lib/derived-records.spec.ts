import { describe, it, expect } from "vitest";
import { derivedFamilyLayer } from "./derived-records";
import type { Household, RecurringExpenseLine, PlannedFutureLine } from "@/types/household";

// derivedFamilyLayer is a PURE read-time derivation: household → the
// sandwich-gen family layer (parents bucket, education/marriage goals,
// synthesized extended-family contingency, aggregate annual cost).
// Tests pin the filters, the amortization, the synthesized contingency,
// and the hasFamilyLayer gate.

// targetYear arithmetic uses new Date().getFullYear(); compute it the same
// way so the expectation is relative (repeatable), not a fixed date.
const NOW = new Date().getFullYear();

function hh(over: Partial<Household["expenses"]> = {}, top: Partial<Household> = {}): Household {
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
    ...top,
  };
}

function recurring(o: Partial<RecurringExpenseLine> = {}): RecurringExpenseLine {
  return { id: "r1", label: "Line", amount: 10_000, frequency: "M", source: "manual", ...o };
}
function planned(o: Partial<PlannedFutureLine> = {}): PlannedFutureLine {
  return { id: "p1", label: "Goal", todayAmount: 1_000_000, targetYear: NOW + 10, isMultiYear: false, ...o };
}

describe("derivedFamilyLayer — filtering", () => {
  it("buckets parents recurring, education + marriage goals by kind", () => {
    const household = hh({
      recurring: [
        recurring({ id: "r-par", kind: "parents", amount: 20_000 }),
        recurring({ id: "r-gen", kind: "general", amount: 50_000 }),
      ],
      plannedFuture: [
        planned({ id: "p-edu", kind: "education" }),
        planned({ id: "p-mar", kind: "marriage" }),
        planned({ id: "p-gen", kind: "general" }),
      ],
    });
    const d = derivedFamilyLayer(household);
    expect(d.parentsRecurring.map((r) => r.id)).toEqual(["r-par"]);
    expect(d.educationGoals.map((p) => p.id)).toEqual(["p-edu"]);
    expect(d.marriageEvents.map((p) => p.id)).toEqual(["p-mar"]);
  });
});

describe("derivedFamilyLayer — synthesized extended-family contingency", () => {
  it("synthesizes a contingency line at the default 7.5% of non-contingency annual expenses", () => {
    // avgMonthly 100000 → baseAnnual 1,200,000; 7.5% = 90,000/yr → 7,500/mo
    const d = derivedFamilyLayer(hh({ avgMonthly: 100_000 }));
    expect(d.extendedContingency).not.toBeNull();
    expect(d.extendedContingency!.amount).toBe(7_500);
    expect(d.extendedContingency!.kind).toBe("extended-contingency");
    expect(d.hasFamilyLayer).toBe(true); // contingency alone trips the gate
  });

  it("honors a custom extendedFamilyContingencyPercent", () => {
    const d = derivedFamilyLayer(hh({ avgMonthly: 100_000 }, { extendedFamilyContingencyPercent: 0.1 }));
    expect(d.extendedContingency!.amount).toBe(10_000); // 10% of 1.2M = 120k/yr = 10k/mo
  });

  it("excludes existing extended-contingency lines from the contingency base (no double-count)", () => {
    const d = derivedFamilyLayer(
      hh({
        avgMonthly: 100_000,
        recurring: [recurring({ kind: "extended-contingency", amount: 99_999 })],
      }),
    );
    // base stays 1.2M (the existing contingency line is excluded) → 90k/yr
    expect(d.extendedContingency!.amount).toBe(7_500);
  });

  it("produces no contingency line and no family layer for a truly empty household", () => {
    const d = derivedFamilyLayer(hh());
    expect(d.extendedContingency).toBeNull();
    expect(d.hasFamilyLayer).toBe(false);
    expect(d.totalAnnualCost).toBe(0);
  });
});

describe("derivedFamilyLayer — aggregate annual cost", () => {
  it("amortizes planned goals over years-to-target and sums all family costs", () => {
    const household = hh(
      {
        avgMonthly: 0,
        recurring: [recurring({ kind: "parents", amount: 25_000, frequency: "M" })], // 300k/yr
        plannedFuture: [
          planned({ kind: "education", todayAmount: 4_000_000, targetYear: NOW + 10 }), // 400k/yr
          planned({ kind: "marriage", todayAmount: 2_000_000, targetYear: NOW + 10 }), // 200k/yr
        ],
      },
      { extendedFamilyContingencyPercent: 0 }, // isolate the goal/parents math
    );
    const d = derivedFamilyLayer(household);
    // parents 300k + education 400k + marriage 200k + contingency 0 = 900k
    expect(d.totalAnnualCost).toBe(900_000);
  });

  it("clamps years-to-target at a minimum of 1 (no divide-by-zero for past/this-year goals)", () => {
    const household = hh({
      plannedFuture: [planned({ kind: "education", todayAmount: 500_000, targetYear: NOW })], // yrs→max(1,0)=1
    });
    const d = derivedFamilyLayer(household);
    expect(d.totalAnnualCost).toBe(500_000); // full amount amortized over 1 yr
  });
});
