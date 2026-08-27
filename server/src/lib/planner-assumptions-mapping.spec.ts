import { describe, it, expect } from "vitest";
import type { UserAssumptions } from "@prisma/client";
import { assumptionsSchema, type Assumptions } from "@planner/types/assumptions";
import { buildAssumptionsWriteData, mapAssumptionsRow } from "./planner-read";

/**
 * No-DB mechanism test for the bug class "the Prisma write layer drops an ACCEPTED
 * assumptions field".
 *
 * ADR-0006 found three fields (`householdSavingsStepUpPercent`, `householdSplitPercent`,
 * `assumptionsMigratedV`) that `assumptionsSchema` validated — so PUT /api/planner/assumptions
 * returned 200 — but that had no `user_assumptions` column, so the upsert silently discarded
 * them and GET always returned the research default. Zod said yes; Postgres never heard about it.
 *
 * The guard is structural, not a list of three names: every key of `assumptionsSchema.shape`
 * must appear in the write payload, and a fully-populated Assumptions object must survive
 * Assumptions → write payload → row → Assumptions with no field lost or altered. A new field
 * added to the Zod schema without a column + both mapping sides fails here, with no DB needed.
 */

// A FULLY-populated Assumptions — every field non-default, including both optionals, so a
// dropped field cannot hide behind a fallback that happens to equal the input.
const FULL: Assumptions = {
  inflation: 0.055,
  equityReturn: 0.115,
  debtReturn: 0.068,
  realEstateReturn: 0.058,
  goldReturn: 0.072,
  npsReturn: 0.101,
  ppfReturn: 0.0705,
  epfReturn: 0.0824,
  internationalReturn: 0.099,
  reitReturn: 0.081,
  cryptoReturn: 0.02,
  healthcareInflation: 0.091,
  educationInflation: 0.092,
  housingInflation: 0.061,
  inflationWeights: { general: 70, healthcare: 10, education: 5, housing: 15 },
  swrOverride: 0.036,
  leanMultiplier: 0.65,
  fatMultiplier: 1.6,
  withdrawalRule: "FloorCeiling",
  householdSavingsStepUpPercent: 4,
  householdSplitPercent: 40,
  assumptionsMigratedV: 1,
};

/** The write payload IS the row's column set — wrap it with the DB-managed metadata. */
function asRow(data: ReturnType<typeof buildAssumptionsWriteData>): UserAssumptions {
  return {
    id: "row-1",
    userId: "user-1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...data,
  } as unknown as UserAssumptions;
}

describe("assumptions persistence mapping (no DB)", () => {
  it("the write payload covers EVERY field declared on assumptionsSchema", () => {
    const declared = Object.keys(assumptionsSchema.shape).sort();
    const persisted = Object.keys(buildAssumptionsWriteData(FULL)).sort();
    const missing = declared.filter((k) => !persisted.includes(k));
    expect(
      missing,
      `assumptionsSchema fields with no column in the upsert payload (they would be accepted by ` +
        `PUT and then silently dropped): ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("a fully-populated Assumptions round-trips through write payload → row → Assumptions", () => {
    const round = mapAssumptionsRow(asRow(buildAssumptionsWriteData(FULL)));
    expect(round).toEqual(FULL);
    // Named explicitly — these three are the fields the ADR-0006 gap lost.
    expect(round.householdSavingsStepUpPercent).toBe(4);
    expect(round.householdSplitPercent).toBe(40);
    expect(round.assumptionsMigratedV).toBe(1);
  });

  it("omitted optionals persist as NULL and read back as undefined (a cleared value is not resurrected)", () => {
    const { swrOverride: _s, assumptionsMigratedV: _m, ...rest } = FULL;
    const data = buildAssumptionsWriteData(rest as Assumptions);
    expect(data.swrOverride).toBeNull();
    expect(data.assumptionsMigratedV).toBeNull();
    const round = mapAssumptionsRow(asRow(data));
    expect(round.swrOverride).toBeUndefined();
    expect(round.assumptionsMigratedV).toBeUndefined();
  });

  it("a pre-migration row (NULL columns) still reads back the research defaults, unchanged", () => {
    const row = asRow(buildAssumptionsWriteData(FULL));
    const legacy = {
      ...row,
      householdSavingsStepUpPercent: null,
      householdSplitPercent: null,
      assumptionsMigratedV: null,
    } as unknown as UserAssumptions;
    const round = mapAssumptionsRow(legacy);
    expect(round.householdSavingsStepUpPercent).toBe(2);
    expect(round.householdSplitPercent).toBe(50);
    // The stamp must stay ABSENT — its absence is the "migration has not run" signal.
    expect(round.assumptionsMigratedV).toBeUndefined();
  });
});
