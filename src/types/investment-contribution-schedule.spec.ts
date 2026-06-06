import { describe, it, expect } from "vitest";
import { investmentSchema } from "@/types/household";

/**
 * Back-compat lock for the Temporal Phase 1 `contributionSchedule` field (gh-issue #46, Stage B).
 * The field is OPTIONAL and FLAT so persisted localStorage investments written before this change
 * still parse, and the scalar `monthlyContribution` path keeps working untouched.
 */
describe("investmentSchema — contributionSchedule back-compat (#46)", () => {
  const legacy = {
    id: "inv-1",
    type: "MutualFunds",
    value: 500000,
    monthlyContribution: 25000, // the simple/default path — no schedule
    ownerId: "you",
  };

  it("parses a legacy investment that has only the scalar monthlyContribution (read-path backfill safe)", () => {
    const parsed = investmentSchema.parse(legacy);
    expect(parsed.contributionSchedule).toBeUndefined();
    expect(parsed.monthlyContribution).toBe(25000);
  });

  it("parses an investment carrying an opt-in contributionSchedule", () => {
    const parsed = investmentSchema.parse({
      ...legacy,
      contributionSchedule: [
        { amount: 25000, startAtAge: 30, stepUpPercentPerYear: 10 },
        { amount: 0, startAtAge: 50 }, // a "stop" segment
      ],
    });
    expect(parsed.contributionSchedule).toHaveLength(2);
    expect(parsed.contributionSchedule?.[0].stepUpPercentPerYear).toBe(10);
  });

  it("rejects an out-of-band step-up (> 15%) at the schema boundary", () => {
    expect(() =>
      investmentSchema.parse({
        ...legacy,
        contributionSchedule: [{ amount: 25000, startAtAge: 30, stepUpPercentPerYear: 25 }],
      }),
    ).toThrow();
  });
});
