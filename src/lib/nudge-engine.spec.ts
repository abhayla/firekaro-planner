import { describe, it, expect } from "vitest";
import { evaluateNudges, type NudgeContext } from "./nudge-engine";
import type { DerivedFamilyLayer } from "./derived-records";
import type { Household, Investment, Member } from "@/types/household";

// evaluateNudges is a pure (context → Nudge[]) recommendation engine. Tests
// pin a representative subset of the ~15 nudge types — the firing conditions,
// the no-false-positive empty case, and the severity sort order.

function emptyHousehold(over: Partial<Household> = {}): Household {
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
    ...over,
  };
}

function emptyFamily(): DerivedFamilyLayer {
  return {
    parentsRecurring: [],
    educationGoals: [],
    marriageEvents: [],
    extendedContingency: null,
    totalAnnualCost: 0,
    hasFamilyLayer: false,
  };
}

function ctx(over: Partial<NudgeContext> = {}): NudgeContext {
  return {
    household: emptyHousehold(),
    family: emptyFamily(),
    annualExpenses: 0,
    taxableIncome: 0,
    fy: "2025-26",
    marginalSlabRate: 0.3,
    currentMonth: 6, // July — outside the Jan–Mar LTCG-harvest window by default
    ...over,
  };
}

function inv(o: Partial<Investment> = {}): Investment {
  return { id: "i1", type: "MutualFunds", value: 0, ownerId: "self", ...o } as Investment;
}

function parentMember(): Member {
  return {
    id: "m-parent",
    name: "Mother",
    dateOfBirth: "1955-01-01",
    role: "DEPENDENT",
    relation: "Parent",
    city: "Metro",
    health: "Healthy",
    riskAppetite: "Conservative",
    marital: "Widowed",
  };
}

const kinds = (ns: ReturnType<typeof evaluateNudges>) => ns.map((n) => n.kind);

describe("evaluateNudges — no false positives", () => {
  it("returns no nudges for a truly empty household", () => {
    expect(evaluateNudges(ctx())).toEqual([]);
  });
});

describe("evaluateNudges — tax & family", () => {
  it("fires marginal-relief when taxable income sits in the rebate-cliff band", () => {
    const out = evaluateNudges(ctx({ taxableIncome: 1_230_000, fy: "2025-26" }));
    const mr = out.find((n) => n.kind === "marginal-relief");
    expect(mr).toBeDefined();
    expect(mr!.severity).toBe("warning");
  });

  it("does NOT fire marginal-relief outside the band", () => {
    expect(kinds(evaluateNudges(ctx({ taxableIncome: 800_000 })))).not.toContain("marginal-relief");
  });

  it("fires sandwich-gen-tax AND family-parents-bucket when parents present but untracked", () => {
    const out = evaluateNudges(
      ctx({ household: emptyHousehold({ members: [parentMember()] }), family: emptyFamily() }),
    );
    expect(kinds(out)).toContain("sandwich-gen-tax");
    expect(kinds(out)).toContain("family-parents-bucket");
  });

  it("suppresses family-parents-bucket once a parents recurring line exists", () => {
    const family = { ...emptyFamily(), parentsRecurring: [{ id: "r", label: "Parents", amount: 1, frequency: "M", source: "manual", kind: "parents" }] as DerivedFamilyLayer["parentsRecurring"] };
    const out = evaluateNudges(ctx({ household: emptyHousehold({ members: [parentMember()] }), family }));
    expect(kinds(out)).toContain("sandwich-gen-tax"); // still fires
    expect(kinds(out)).not.toContain("family-parents-bucket"); // suppressed
  });
});

describe("evaluateNudges — portfolio", () => {
  it("fires international-allocation when corpus is large with zero intl exposure", () => {
    const out = evaluateNudges(
      ctx({ household: emptyHousehold({ investments: [inv({ type: "MutualFunds", value: 3_000_000 })] }) }),
    );
    expect(kinds(out)).toContain("international-allocation");
  });

  it("does NOT fire international-allocation once intl exposure exists", () => {
    const out = evaluateNudges(
      ctx({
        household: emptyHousehold({
          investments: [
            inv({ id: "a", type: "MutualFunds", value: 3_000_000 }),
            inv({ id: "b", type: "International", value: 500_000 }),
          ],
        }),
      }),
    );
    expect(kinds(out)).not.toContain("international-allocation");
  });

  it("fires real-estate-overweight when RE exceeds 60% of corpus", () => {
    const out = evaluateNudges(
      ctx({
        household: emptyHousehold({
          investments: [
            inv({ id: "re", type: "RealEstate", value: 8_000_000 }),
            inv({ id: "mf", type: "MutualFunds", value: 2_000_000 }),
          ],
        }),
      }),
    );
    const re = out.find((n) => n.kind === "real-estate-overweight");
    expect(re).toBeDefined();
    expect(re!.severity).toBe("warning");
  });

  it("fires esop-cliff-tax above the ₹15L ESOP threshold", () => {
    const out = evaluateNudges(
      ctx({ household: emptyHousehold({ investments: [inv({ type: "ESOP", value: 2_000_000 })] }) }),
    );
    expect(kinds(out)).toContain("esop-cliff-tax");
  });

  it("fires emergency-fund-shortfall when liquid cover is under 6 months", () => {
    // annualExpenses present, no FD/Crypto → liquid 0 → 0 months
    const out = evaluateNudges(ctx({ annualExpenses: 600_000 }));
    const ef = out.find((n) => n.kind === "emergency-fund-shortfall");
    expect(ef).toBeDefined();
    expect(ef!.severity).toBe("warning");
  });

  it("does NOT fire emergency-fund-shortfall when an FD covers 6+ months", () => {
    const out = evaluateNudges(
      ctx({
        annualExpenses: 600_000,
        household: emptyHousehold({ investments: [inv({ type: "FD", value: 400_000 })] }), // 8 months
      }),
    );
    expect(kinds(out)).not.toContain("emergency-fund-shortfall");
  });
});

describe("evaluateNudges — over-committed SIPs (#12)", () => {
  it("fires when monthly SIPs exceed the monthly surplus", () => {
    const hh = emptyHousehold({
      investments: [inv({ monthlyContribution: 60_000 }), inv({ id: "i2", monthlyContribution: 30_000 })],
    });
    const out = evaluateNudges(ctx({ household: hh, monthlySurplus: 50_000 }));
    expect(kinds(out)).toContain("over-committed-sips");
  });

  it("does NOT fire when surplus covers the SIPs", () => {
    const hh = emptyHousehold({
      investments: [inv({ monthlyContribution: 40_000 })],
    });
    expect(kinds(evaluateNudges(ctx({ household: hh, monthlySurplus: 50_000 })))).not.toContain(
      "over-committed-sips",
    );
  });

  it("does NOT fire when monthlySurplus is absent (no false positive)", () => {
    const hh = emptyHousehold({ investments: [inv({ monthlyContribution: 99_000 })] });
    expect(kinds(evaluateNudges(ctx({ household: hh })))).not.toContain("over-committed-sips");
  });
});

describe("evaluateNudges — estate", () => {
  it("fires estate-gaps when fewer than half the 7 items are complete", () => {
    const household = emptyHousehold({
      estateChecklist: [
        { key: "will", completed: true },
        { key: "nominees", completed: false },
        { key: "powerOfAttorney", completed: false },
      ],
    });
    const out = evaluateNudges(ctx({ household }));
    expect(kinds(out)).toContain("estate-gaps");
  });
});

describe("evaluateNudges — ordering", () => {
  it("sorts warnings ahead of infos", () => {
    // marginal-relief (warning) + esop-cliff-tax (info) both fire
    const out = evaluateNudges(
      ctx({
        taxableIncome: 1_230_000,
        household: emptyHousehold({ investments: [inv({ type: "ESOP", value: 2_000_000 })] }),
      }),
    );
    const sev = out.map((n) => n.severity);
    const firstInfo = sev.indexOf("info");
    const lastWarning = sev.lastIndexOf("warning");
    if (firstInfo !== -1 && lastWarning !== -1) {
      expect(lastWarning).toBeLessThan(firstInfo);
    }
    expect(out.length).toBeGreaterThanOrEqual(2);
  });
});

describe("evaluateNudges — P2 newly-wired firing logic", () => {
  const count = (ns: ReturnType<typeof evaluateNudges>, kind: string) =>
    ns.filter((n) => n.kind === kind).length;

  // ---- ltcg-harvest (A16.3) ----
  it("ltcg-harvest fires exactly once in FY Q4 with material equity", () => {
    const hh = emptyHousehold({ investments: [inv({ type: "MutualFunds", value: 800_000 })] });
    const out = evaluateNudges(ctx({ household: hh, currentMonth: 1 })); // Feb
    expect(count(out, "ltcg-harvest")).toBe(1);
  });
  it("ltcg-harvest does NOT fire outside Jan–Mar", () => {
    const hh = emptyHousehold({ investments: [inv({ type: "MutualFunds", value: 800_000 })] });
    expect(kinds(evaluateNudges(ctx({ household: hh, currentMonth: 6 })))).not.toContain("ltcg-harvest");
  });
  it("ltcg-harvest does NOT fire with negligible equity even in Q4", () => {
    const hh = emptyHousehold({ investments: [inv({ type: "MutualFunds", value: 100_000 })] });
    expect(kinds(evaluateNudges(ctx({ household: hh, currentMonth: 2 })))).not.toContain("ltcg-harvest");
  });

  // ---- deduction-under-utilization (A17.2) ----
  it("deduction-under-utilization fires with taxable income + fully unused 80C", () => {
    const out = evaluateNudges(ctx({ taxableIncome: 1_200_000 }));
    expect(count(out, "deduction-under-utilization")).toBe(1);
  });
  it("does NOT fire below the basic exemption", () => {
    expect(kinds(evaluateNudges(ctx({ taxableIncome: 400_000 })))).not.toContain("deduction-under-utilization");
  });
  it("does NOT fire when 80C + 80CCD(1B) are maxed", () => {
    const hh = emptyHousehold({
      investments: [
        inv({ id: "ppf", type: "PPF", value: 1_500_000, monthlyContribution: 12_500 }), // 1.5L/yr → 80C max
        inv({ id: "nps", type: "NPS", value: 500_000, monthlyContribution: 4_500 }), // 54k/yr → 80CCD1B max
      ],
    });
    expect(kinds(evaluateNudges(ctx({ household: hh, taxableIncome: 1_200_000 })))).not.toContain(
      "deduction-under-utilization",
    );
  });

  // ---- foreign-rsu-vesting (A24.6) ----
  it("foreign-rsu-vesting fires for a US-granted ESOP", () => {
    const hh = emptyHousehold({ investments: [inv({ type: "ESOP", value: 2_000_000, grantorCountry: "US" })] });
    expect(count(evaluateNudges(ctx({ household: hh })), "foreign-rsu-vesting")).toBe(1);
  });
  it("foreign-rsu-vesting does NOT fire for an India-granted ESOP", () => {
    const hh = emptyHousehold({ investments: [inv({ type: "ESOP", value: 2_000_000, grantorCountry: "India" })] });
    expect(kinds(evaluateNudges(ctx({ household: hh })))).not.toContain("foreign-rsu-vesting");
  });

  // ---- lifestyle-inflation (A29.2) ----
  it("lifestyle-inflation fires when the analysis flags it", () => {
    const out = evaluateNudges(ctx({ lifestyleInflation: { averageYoYGrowth: 0.12, isLifestyleInflating: true } }));
    expect(count(out, "lifestyle-inflation")).toBe(1);
  });
  it("lifestyle-inflation does NOT fire when absent or not flagged", () => {
    expect(kinds(evaluateNudges(ctx()))).not.toContain("lifestyle-inflation");
    expect(
      kinds(evaluateNudges(ctx({ lifestyleInflation: { averageYoYGrowth: 0.04, isLifestyleInflating: false } }))),
    ).not.toContain("lifestyle-inflation");
  });

  // ---- goal-post-shift (A30.2) ----
  it("goal-post-shift fires when the target moved out", () => {
    const out = evaluateNudges(ctx({ goalPostShift: { shiftCount: 2, totalYearsAdded: 5 } }));
    expect(count(out, "goal-post-shift")).toBe(1);
  });
  it("goal-post-shift does NOT fire with no shift or absent", () => {
    expect(kinds(evaluateNudges(ctx()))).not.toContain("goal-post-shift");
    expect(
      kinds(evaluateNudges(ctx({ goalPostShift: { shiftCount: 0, totalYearsAdded: 0 } }))),
    ).not.toContain("goal-post-shift");
  });
});
