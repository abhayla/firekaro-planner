/**
 * Phase A (#15 accumulation bridge) — accessibility classifier.
 *
 * Pins WHEN (unlock age) and HOW MUCH GROSS lump / income stream each
 * instrument makes spendable in retirement, plus the assumption notes the UI
 * surfaces (principle 1). The whole stance is CONSERVATIVE: where the engine
 * must guess, it assumes the LATER unlock / SMALLER cash — the honest direction
 * for the salaried accumulator (an optimistic FIRE date is the worst error).
 *
 * No derive() change here — this is the pure foundation Phase C builds on.
 */
import { describe, it, expect } from "vitest";
import { accessibleAtAge } from "./accessibility";
import type { Investment, InvestmentType } from "@/types/household";

// A fixed clock so unlock-age arithmetic is deterministic (testing.md: no
// wall-clock). 2026-01-01 with a member born 1990 → age 36 this run.
const ASOF = new Date("2026-01-01T00:00:00Z");
const DOB_1990 = "1990-01-01"; // age 36 as of ASOF

function makeInv(type: InvestmentType, extras: Partial<Investment> = {}): Investment {
  return { id: `t-${type}`, type, value: 1_000_000, ownerId: "self", ...extras };
}

describe("accessibleAtAge — liquid instruments unlock at the FIRE age", () => {
  const liquidTypes: InvestmentType[] = [
    "Stocks",
    "MutualFunds",
    "FD",
    "Gold",
    "Crypto",
    "International",
    "REIT",
  ];
  it.each(liquidTypes)("%s → full value accessible at the FIRE age, no income stream", (type) => {
    const r = accessibleAtAge(makeInv(type, { value: 2_000_000 }), 50, DOB_1990, ASOF);
    expect(r.unlockAge).toBe(50);
    expect(r.accessibleLumpGross).toBe(2_000_000);
    expect(r.incomeStream).toBeUndefined();
    expect(r.illiquid).toBeFalsy();
    expect(r.assumption).toBeUndefined();
  });

  it("vested ESOP → vested value is liquid at the FIRE age", () => {
    const r = accessibleAtAge(
      makeInv("ESOP", { value: 3_000_000, vestedValueINR: 1_200_000 }),
      55,
      DOB_1990,
      ASOF,
    );
    expect(r.unlockAge).toBe(55);
    expect(r.accessibleLumpGross).toBe(1_200_000);
  });
});

describe("accessibleAtAge — EPF/VPF unlocks at the FIRE age (job exit)", () => {
  it("EPF_VPF → full value accessible at the FIRE age", () => {
    const r = accessibleAtAge(makeInv("EPF_VPF", { value: 4_000_000 }), 48, DOB_1990, ASOF);
    expect(r.unlockAge).toBe(48);
    expect(r.accessibleLumpGross).toBe(4_000_000);
    expect(r.incomeStream).toBeUndefined();
  });
});

describe("accessibleAtAge — PPF 15-year lock from the opening year", () => {
  it("with openingYear → unlocks at openingYear+15 expressed as an age", () => {
    // Opened 2020, member age 36 in 2026 → matures 2035 → age 45.
    const r = accessibleAtAge(
      makeInv("PPF", { value: 1_500_000, openingYear: 2020 }),
      50,
      DOB_1990,
      ASOF,
    );
    // Matures (age 45) BEFORE the FIRE age (50) → liquid by retirement → FIRE age.
    expect(r.unlockAge).toBe(50);
    expect(r.assumption).toBeUndefined();
  });

  it("a recently-opened PPF matures AFTER an early FIRE age → bridge gap", () => {
    // Opened 2024, member retires at 40 (year 2030, age 40). Matures 2039 → age 49.
    const r = accessibleAtAge(
      makeInv("PPF", { value: 800_000, openingYear: 2024 }),
      40,
      DOB_1990,
      ASOF,
    );
    expect(r.unlockAge).toBe(49); // locked past the FIRE age → creates a bridge year span
    expect(r.accessibleLumpGross).toBe(800_000);
  });

  it("WITHOUT openingYear → conservatively assumed locked until age 60 + assumption note", () => {
    const r = accessibleAtAge(makeInv("PPF", { value: 800_000 }), 47, DOB_1990, ASOF);
    expect(r.unlockAge).toBe(60);
    expect(r.assumption).toBeDefined();
    expect(r.assumption!.assumed).toMatch(/60/);
    expect(r.assumption!.fixField).toMatch(/openingYear/i);
  });

  it("WITHOUT openingYear but retiring at/after 60 → no bridge gap (still notes the assumption)", () => {
    const r = accessibleAtAge(makeInv("PPF", { value: 800_000 }), 62, DOB_1990, ASOF);
    expect(r.unlockAge).toBe(62); // max(retireAge, 60)
    expect(r.assumption).toBeDefined();
  });

  it("openingYear present but DOB MISSING → does NOT collapse to the FIRE age (conservative fallback)", () => {
    // The maturity year is known (2024+15=2039) but without a DOB it can't be
    // dated to an age. The honest answer is the locked-till-60 fallback, NOT a
    // silent "liquid at 40" off an age-0 DOB. Regression lock for the optimistic
    // collapse both reviewers flagged on the Phase-A gate.
    const r = accessibleAtAge(makeInv("PPF", { value: 800_000, openingYear: 2024 }), 40, null, ASOF);
    expect(r.unlockAge).toBe(60); // max(40, 60) — NOT 40
    expect(r.assumption).toBeDefined();
    expect(r.assumption!.why).toMatch(/date of birth/i);
    expect(r.assumption!.fixField).toBe("dateOfBirth");
  });
});

describe("accessibleAtAge — NPS split depends on the FIRE age (< 60 = premature)", () => {
  it("retire ≥ 60 → 60% lump at the FIRE age + 40% annuity income stream", () => {
    const r = accessibleAtAge(makeInv("NPS", { value: 10_000_000 }), 60, DOB_1990, ASOF);
    expect(r.unlockAge).toBe(60);
    expect(r.accessibleLumpGross).toBe(6_000_000); // 60%
    expect(r.incomeStream).toBeDefined();
    expect(r.incomeStream!.startAge).toBe(60);
    expect(r.incomeStream!.annualGross).toBe(240_000); // 40% × 10M × 6%
    expect(r.incomeStream!.taxable).toBe(true);
    expect(r.assumption).toBeDefined(); // both-options disclosure
  });

  it("retire < 60 → early exit: only 20% lump + 80% annuity (conservative)", () => {
    const r = accessibleAtAge(makeInv("NPS", { value: 10_000_000 }), 47, DOB_1990, ASOF);
    expect(r.unlockAge).toBe(47);
    expect(r.accessibleLumpGross).toBe(2_000_000); // 20%
    expect(r.incomeStream!.annualGross).toBe(480_000); // 80% × 10M × 6%
    expect(r.incomeStream!.startAge).toBe(47);
    // The both-options note exposes that waiting till 60 would free 60% instead of 20%.
    expect(r.assumption).toBeDefined();
    expect(r.assumption!.assumed).toMatch(/20%|early/i);
  });

  it("small NPS (≤ ₹2.5L) on early exit → full lump, no annuity", () => {
    const r = accessibleAtAge(makeInv("NPS", { value: 200_000 }), 47, DOB_1990, ASOF);
    expect(r.accessibleLumpGross).toBe(200_000);
    expect(r.incomeStream).toBeUndefined();
  });
});

describe("accessibleAtAge — real estate", () => {
  it("primary residence → no-op (already excluded from corpus), zero bridge lump", () => {
    const r = accessibleAtAge(
      makeInv("RealEstate", { value: 20_000_000, realEstateRole: "PrimaryResidence" }),
      50,
      DOB_1990,
      ASOF,
    );
    expect(r.accessibleLumpGross).toBe(0);
    expect(r.illiquid).toBe(true);
  });

  it("investment property → illiquid: NOT in the bridge runway (rent counts elsewhere) + note", () => {
    const r = accessibleAtAge(
      makeInv("RealEstate", { value: 15_000_000, realEstateRole: "Investment" }),
      50,
      DOB_1990,
      ASOF,
    );
    expect(r.accessibleLumpGross).toBe(0);
    expect(r.illiquid).toBe(true);
    expect(r.assumption).toBeDefined();
    expect(r.assumption!.assumed).toMatch(/illiquid|not.*sell/i);
  });

  it("inherited property → illiquid too", () => {
    const r = accessibleAtAge(
      makeInv("RealEstate", { value: 8_000_000, realEstateRole: "Inherited" }),
      50,
      DOB_1990,
      ASOF,
    );
    expect(r.illiquid).toBe(true);
    expect(r.accessibleLumpGross).toBe(0);
  });
});

describe("accessibleAtAge — purity / determinism", () => {
  it("is pure: same inputs → deep-equal result across calls", () => {
    const inv = makeInv("NPS", { value: 9_000_000 });
    expect(accessibleAtAge(inv, 47, DOB_1990, ASOF)).toEqual(
      accessibleAtAge(inv, 47, DOB_1990, ASOF),
    );
  });
});
