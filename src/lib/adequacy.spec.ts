import { describe, it, expect } from "vitest";
import { lifeCoverAdequacy, healthCoverAdequacy, allocationByAge, educationAdequacy } from "./adequacy";

describe("lifeCoverAdequacy", () => {
  it("returns advisory for non-earner (zero income)", () => {
    const r = lifeCoverAdequacy(5000000, 0);
    expect(r.status).toBe("advisory");
    expect(r.message).toContain("non-earner");
  });

  it("returns adequate when cover ≥ 10× income", () => {
    const r = lifeCoverAdequacy(25000000, 2500000); // 10× ₹25L = ₹2.5Cr
    expect(r.status).toBe("adequate");
  });

  it("returns under when cover < 10× income", () => {
    const r = lifeCoverAdequacy(10000000, 2500000); // only 4×
    expect(r.status).toBe("under");
    expect(r.message).toContain("10×");
  });

  it("borderline case at exactly 10×", () => {
    const r = lifeCoverAdequacy(25000000, 2500000);
    expect(r.status).toBe("adequate");
  });
});

describe("healthCoverAdequacy", () => {
  it("returns adequate at ₹5L metro benchmark", () => {
    expect(healthCoverAdequacy(500000, true).status).toBe("adequate");
    expect(healthCoverAdequacy(1000000, true).status).toBe("adequate");
  });

  it("returns under when below ₹5L metro", () => {
    expect(healthCoverAdequacy(300000, true).status).toBe("under");
  });

  it("uses ₹3L threshold for non-metro", () => {
    expect(healthCoverAdequacy(300000, false).status).toBe("adequate");
    expect(healthCoverAdequacy(200000, false).status).toBe("under");
  });
});

describe("allocationByAge", () => {
  it("recommends 60-100% equity for under 45", () => {
    const r = allocationByAge(30, 800000, 1000000); // 80% equity
    expect(r.status).toBe("adequate");
    expect(r.recommendedMinEquity).toBe(60);
    expect(r.recommendedMaxEquity).toBe(100);
  });

  it("flags under when 30-yr-old has only 30% equity", () => {
    const r = allocationByAge(30, 300000, 1000000);
    expect(r.status).toBe("under");
    expect(r.message).toContain("rebalanc");
  });

  it("uses 40-60% range for 45-55", () => {
    const r = allocationByAge(50, 500000, 1000000); // 50% equity
    expect(r.status).toBe("adequate");
    expect(r.recommendedMinEquity).toBe(40);
  });

  it("uses 0-40% range for 55+", () => {
    const r = allocationByAge(60, 350000, 1000000); // 35% equity
    expect(r.status).toBe("adequate");
    expect(r.recommendedMaxEquity).toBe(40);
  });

  it("handles zero corpus gracefully (0% equity)", () => {
    const r = allocationByAge(30, 0, 0);
    expect(r.equityPercent).toBe(0);
  });
});

describe("educationAdequacy (Sharma S1 — education goal funding)", () => {
  const common = {
    educationInflation: 0.09,
    expectedReturn: 0.11,
    currentYear: 2026,
  };

  it("inflates the target at the education rate and computes a positive required SIP", () => {
    const r = educationAdequacy({
      ...common,
      goals: [{ label: "Aarav UG", todayAmount: 5_000_000, targetYear: 2040 }],
      availableMonthlySIP: 100_000,
    });
    expect(r.rows).toHaveLength(1);
    const row = r.rows[0];
    expect(row.yearsToTarget).toBe(14);
    // FV must exceed today's amount (14 yrs of 9% inflation).
    expect(row.futureValue).toBeGreaterThan(5_000_000);
    expect(row.requiredMonthlySIP).toBeGreaterThan(0);
  });

  it("flags on-track when available savings cover the total required SIP", () => {
    const r = educationAdequacy({
      ...common,
      goals: [{ label: "Aarav", todayAmount: 2_000_000, targetYear: 2044 }],
      availableMonthlySIP: 1_000_000,
    });
    expect(r.onTrack).toBe(true);
    expect(r.shortfallMonthly).toBe(0);
  });

  it("flags shortfall when required SIP exceeds available savings", () => {
    const r = educationAdequacy({
      ...common,
      goals: [{ label: "Overseas Masters", todayAmount: 15_000_000, targetYear: 2032 }],
      availableMonthlySIP: 10_000,
    });
    expect(r.onTrack).toBe(false);
    expect(r.shortfallMonthly).toBeGreaterThan(0);
  });

  it("aggregates required SIP across multiple education goals", () => {
    const r = educationAdequacy({
      ...common,
      goals: [
        { label: "Aarav", todayAmount: 5_000_000, targetYear: 2040 },
        { label: "Meera", todayAmount: 5_000_000, targetYear: 2042 },
      ],
      availableMonthlySIP: 50_000,
    });
    expect(r.rows).toHaveLength(2);
    expect(r.totalRequiredMonthlySIP).toBe(
      r.rows[0].requiredMonthlySIP + r.rows[1].requiredMonthlySIP,
    );
  });

  it("a goal due now needs the full lump (months <= 0)", () => {
    const r = educationAdequacy({
      ...common,
      goals: [{ todayAmount: 1_000_000, targetYear: 2026 }],
      availableMonthlySIP: 0,
    });
    expect(r.rows[0].yearsToTarget).toBe(0);
    expect(r.rows[0].requiredMonthlySIP).toBe(r.rows[0].futureValue);
  });
});
