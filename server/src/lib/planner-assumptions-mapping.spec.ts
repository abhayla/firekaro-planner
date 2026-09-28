import { describe, it, expect } from "vitest";
import type { UserAssumptions } from "@prisma/client";
import { assumptionsSchema, DEFAULT_ASSUMPTIONS, type Assumptions } from "@planner/types/assumptions";
import { persistedAssumptionsSchema } from "./planner-schemas";
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
 * The guard is structural, not a list of three names: every key of the schema PUT validates
 * against (`persistedAssumptionsSchema`) must appear in the write payload, and a fully-populated
 * Assumptions object must survive Assumptions → write payload → row → Assumptions with no field
 * lost or altered. A new field added to the ACCEPTED schema without a column + both mapping sides
 * fails here, with no DB needed.
 *
 * ADR-0007 / gh #185 — the three income-path knobs (`salaryGrowthRealPercent`,
 * `salaryGrowthTaperAge`, `expenseGrowthAboveInflationPercent`) are declared on the CANONICAL
 * frontend `assumptionsSchema` (the `Assumptions` type and `derive()` need them) and have no
 * column yet. The resolution is that the server does not ACCEPT what it cannot STORE: PUT
 * validates `persistedAssumptionsSchema`, which omits them, so a client sending one gets a 422
 * naming the field instead of a false 200. The third test below locks that omission both ways, so
 * step 6 (the columns) cannot land the schema half without the column half.
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
  // The three #185 income-path knobs are pinned at their RESEARCH DEFAULTS, not at non-default
  // values like every field above. That is deliberate: they have no column, so `mapAssumptionsRow`
  // resolves them from `DEFAULT_ASSUMPTIONS`, and the round-trip test below asserts equality with
  // this object. Step 6 (columns) flips them to non-default values here like the rest.
  salaryGrowthRealPercent: DEFAULT_ASSUMPTIONS.salaryGrowthRealPercent,
  salaryGrowthTaperAge: DEFAULT_ASSUMPTIONS.salaryGrowthTaperAge,
  expenseGrowthAboveInflationPercent: DEFAULT_ASSUMPTIONS.expenseGrowthAboveInflationPercent,
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
  it("the write payload covers EVERY field the server ACCEPTS (persistedAssumptionsSchema)", () => {
    const declared = Object.keys(persistedAssumptionsSchema.shape).sort();
    const persisted = Object.keys(buildAssumptionsWriteData(FULL)).sort();
    const missing = declared.filter((k) => !persisted.includes(k));
    expect(
      missing,
      `accepted assumptions fields with no column in the upsert payload (they would be accepted by ` +
        `PUT and then silently dropped): ${missing.join(", ")}`,
    ).toEqual([]);
  });

  // ADR-0006 invariant, stated as an equality in BOTH directions: the set the server accepts and
  // the set it can store are the same set. A field added to `persistedAssumptionsSchema` without a
  // column fails the test above; a column added without widening the accepted schema fails here.
  it("nothing is stored that the server does not accept (accepted set === column set)", () => {
    const accepted = Object.keys(persistedAssumptionsSchema.shape).sort();
    const columns = Object.keys(buildAssumptionsWriteData(FULL)).sort();
    expect(columns).toEqual(accepted);
  });

  // The three ADR-0007 income-path knobs: on the canonical frontend schema (derive() reads them),
  // OFF the accepted schema until #185 step 6 adds the columns. Step 6 deletes this test's
  // `not.toContain` half and adds all three to both mapping sides in the same change.
  it("the #185 income-path knobs are declared frontend-side but NOT accepted by PUT (step 6 adds columns)", () => {
    const INCOME_PATH_FIELDS = [
      "salaryGrowthRealPercent",
      "salaryGrowthTaperAge",
      "expenseGrowthAboveInflationPercent",
    ] as const;
    const canonical = Object.keys(assumptionsSchema.shape);
    const accepted = Object.keys(persistedAssumptionsSchema.shape);
    for (const f of INCOME_PATH_FIELDS) {
      expect(canonical, `${f} must stay on the canonical frontend schema`).toContain(f);
      expect(accepted, `${f} has no user_assumptions column — accepting it would silently drop it`).not.toContain(f);
    }
    // ...and a PUT body carrying one is REJECTED, not accepted-and-discarded (Zod strips unknown
    // keys by default, so the omission alone would be a silent drop of a different colour).
    const body = { ...FULL, salaryGrowthRealPercent: 7 };
    const parsed = persistedAssumptionsSchema.strict().safeParse(body);
    expect(parsed.success, "a body carrying an unstorable knob must not validate under .strict()").toBe(false);
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
    // 0, not 2: ADR-0007 / gh #185 moved this default back to 0 when the income path replaced the
    // step-up as the wage-growth carrier. Read from DEFAULT_ASSUMPTIONS so the next re-basing of a
    // default cannot leave a stale literal asserting the old product here.
    expect(round.householdSavingsStepUpPercent).toBe(DEFAULT_ASSUMPTIONS.householdSavingsStepUpPercent);
    expect(round.householdSplitPercent).toBe(DEFAULT_ASSUMPTIONS.householdSplitPercent);
    // The stamp must stay ABSENT — its absence is the "migration has not run" signal.
    expect(round.assumptionsMigratedV).toBeUndefined();
  });
});
