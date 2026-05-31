import { describe, it, expect } from "vitest";
import {
  computeFreedomScore,
  getScoreMessage,
  statusColor,
  type FreedomScoreInput,
} from "./freedom-score";

// The 0-100 Freedom Score is the headline number on the Health Score screen.
// Weights: savings 25 + DTI 20 + emergency 20 + insurance 15 + FIRE 20 = 100.
// Tests pin the per-factor scoring curves, the inverse (lower-is-better) DTI
// factor, the clamps, and the status thresholds.

function baseInput(overrides: Partial<FreedomScoreInput> = {}): FreedomScoreInput {
  return {
    savingsRatePercent: 0,
    dtiPercent: 0,
    emergencyMonths: 0,
    lifeAdequate: false,
    healthAdequate: false,
    fireProgressPercent: 0,
    ...overrides,
  };
}

describe("computeFreedomScore — totals", () => {
  it("scores a perfect profile at 100", () => {
    const r = computeFreedomScore(
      baseInput({
        savingsRatePercent: 30, // maxes the 25-pt factor
        dtiPercent: 0, // ≤30 target → full 20
        emergencyMonths: 6, // maxes the 20-pt factor
        lifeAdequate: true,
        healthAdequate: true, // 15
        fireProgressPercent: 100, // maxes the 20-pt factor
      }),
    );
    expect(r.score).toBe(100);
    expect(r.status).toBe("Excellent");
  });

  it("scores an all-zero / no-insurance profile at 20 (DTI 0 still earns full 20)", () => {
    // savings 0, EF 0, insurance 0, FIRE 0 → 0; DTI 0% ≤ 30% target → full 20.
    const r = computeFreedomScore(baseInput());
    expect(r.score).toBe(20);
  });

  it("matches the live Sharmas Health Score screen (67)", () => {
    // From the rendered screen: savings 18/25, DTI 20/20, EF 9/20,
    // insurance 15/15, FIRE 5/20 → 67.
    const r = computeFreedomScore(
      baseInput({
        savingsRatePercent: 21.6, // 21.6/30*25 = 18.0
        dtiPercent: 0, // full 20
        emergencyMonths: 2.7, // 2.7/6*20 = 9.0
        lifeAdequate: true,
        healthAdequate: true, // 15
        fireProgressPercent: 25, // 25/100*20 = 5
      }),
    );
    expect(r.score).toBe(67);
    expect(r.status).toBe("Fair");
  });
});

describe("computeFreedomScore — per-factor scoring", () => {
  it("savings rate scores linearly to a 30% target and clamps at the 25 weight", () => {
    const half = computeFreedomScore(baseInput({ savingsRatePercent: 15 }));
    expect(half.factors[0].score).toBe(13); // 15/30*25 = 12.5 → round 13
    const over = computeFreedomScore(baseInput({ savingsRatePercent: 60 }));
    expect(over.factors[0].score).toBe(25); // clamped at weight
  });

  it("DTI is inverse: full 20 at/below target, decays above, floors at 0", () => {
    expect(computeFreedomScore(baseInput({ dtiPercent: 30 })).factors[1].score).toBe(20);
    expect(computeFreedomScore(baseInput({ dtiPercent: 45 })).factors[1].score).toBe(10); // 20 - (15/30)*20
    expect(computeFreedomScore(baseInput({ dtiPercent: 90 })).factors[1].score).toBe(0); // fully decayed, clamped
  });

  it("emergency fund scores linearly to 6 months, clamps at 20", () => {
    expect(computeFreedomScore(baseInput({ emergencyMonths: 3 })).factors[2].score).toBe(10);
    expect(computeFreedomScore(baseInput({ emergencyMonths: 12 })).factors[2].score).toBe(20);
  });

  it("insurance is 7.5 per adequate cover (life + health)", () => {
    expect(computeFreedomScore(baseInput({ lifeAdequate: true })).factors[3].score).toBe(8); // round(7.5)
    expect(
      computeFreedomScore(baseInput({ lifeAdequate: true, healthAdequate: true })).factors[3].score,
    ).toBe(15);
    expect(computeFreedomScore(baseInput()).factors[3].score).toBe(0);
  });

  it("FIRE progress scores linearly to 100%, clamps at 20", () => {
    expect(computeFreedomScore(baseInput({ fireProgressPercent: 50 })).factors[4].score).toBe(10);
    expect(computeFreedomScore(baseInput({ fireProgressPercent: 150 })).factors[4].score).toBe(20);
  });
});

describe("computeFreedomScore — factor statuses", () => {
  it("flags savings rate excellent/good/fair/poor by ratio to target", () => {
    expect(computeFreedomScore(baseInput({ savingsRatePercent: 36 })).factors[0].status).toBe("excellent"); // ≥1.2
    expect(computeFreedomScore(baseInput({ savingsRatePercent: 28 })).factors[0].status).toBe("good"); // ≥0.9
    expect(computeFreedomScore(baseInput({ savingsRatePercent: 18 })).factors[0].status).toBe("fair"); // ≥0.5
    expect(computeFreedomScore(baseInput({ savingsRatePercent: 6 })).factors[0].status).toBe("poor"); // <0.5
  });

  it("DTI status uses the inverse scale (lower DTI = better)", () => {
    expect(computeFreedomScore(baseInput({ dtiPercent: 10 })).factors[1].status).toBe("excellent"); // ≤15
    expect(computeFreedomScore(baseInput({ dtiPercent: 30 })).factors[1].status).toBe("good"); // ≤30
    expect(computeFreedomScore(baseInput({ dtiPercent: 40 })).factors[1].status).toBe("fair"); // ≤45
    expect(computeFreedomScore(baseInput({ dtiPercent: 60 })).factors[1].status).toBe("poor"); // >45
  });

  it("insurance status: both=excellent, one=fair, none=poor", () => {
    expect(computeFreedomScore(baseInput({ lifeAdequate: true, healthAdequate: true })).factors[3].status).toBe("excellent");
    expect(computeFreedomScore(baseInput({ lifeAdequate: true })).factors[3].status).toBe("fair");
    expect(computeFreedomScore(baseInput()).factors[3].status).toBe("poor");
  });
});

describe("getScoreMessage thresholds", () => {
  it("maps score bands to status labels", () => {
    expect(getScoreMessage(90).status).toBe("Excellent");
    expect(getScoreMessage(85).status).toBe("Excellent");
    expect(getScoreMessage(70).status).toBe("Good");
    expect(getScoreMessage(50).status).toBe("Fair");
    expect(getScoreMessage(30).status).toBe("Developing");
    expect(getScoreMessage(29).status).toBe("Starting");
    expect(getScoreMessage(0).status).toBe("Starting");
  });
});

describe("statusColor", () => {
  it("maps factor statuses to Vuetify theme colors", () => {
    expect(statusColor("excellent")).toBe("success");
    expect(statusColor("good")).toBe("primary");
    expect(statusColor("fair")).toBe("warning");
    expect(statusColor("poor")).toBe("error");
  });
});
