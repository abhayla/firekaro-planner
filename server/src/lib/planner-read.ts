import { Prisma, type PrismaClient, type UserAssumptions } from "@prisma/client";
import { DEFAULT_ASSUMPTIONS, type Assumptions } from "@planner/types/assumptions";

/**
 * Server-side mapping helpers for the assumptions document — the ONE place the
 * `UserAssumptions` row ⇄ `Assumptions` correspondence lives, in BOTH directions:
 *
 *   - `mapAssumptionsRow`   row  → Assumptions (GET /api/planner/assumptions + the
 *                                 lifecycle runner's derive() call)
 *   - `buildAssumptionsWriteData` Assumptions → the Prisma upsert payload
 *                                 (PUT /api/planner/assumptions)
 *
 * Keeping the two adjacent is deliberate: the historical bug class here is a field the
 * API validates and accepts but the WRITE layer silently drops (ADR-0006 —
 * `assumptionsMigratedV`, `householdSavingsStepUpPercent`, `householdSplitPercent` were
 * accepted with a 200 and then discarded, so GET always returned the research default).
 * `planner-assumptions-mapping.spec.ts` round-trips a fully-populated Assumptions object
 * through both functions so any newly-added field that misses either side fails a no-DB test.
 */

export function mapAssumptionsRow(row: UserAssumptions): Assumptions {
  return {
    inflation: row.inflation,
    equityReturn: row.equityReturn,
    debtReturn: row.debtReturn,
    realEstateReturn: row.realEstateReturn,
    goldReturn: row.goldReturn,
    npsReturn: row.npsReturn,
    ppfReturn: row.ppfReturn,
    epfReturn: row.epfReturn,
    internationalReturn: row.internationalReturn,
    reitReturn: row.reitReturn,
    cryptoReturn: row.cryptoReturn,
    healthcareInflation: row.healthcareInflation,
    educationInflation: row.educationInflation,
    housingInflation: row.housingInflation,
    inflationWeights: row.inflationWeights as Assumptions["inflationWeights"],
    swrOverride: row.swrOverride ?? undefined,
    leanMultiplier: row.leanMultiplier,
    fatMultiplier: row.fatMultiplier,
    withdrawalRule: row.withdrawalRule as Assumptions["withdrawalRule"],
    // #46 / #81 — persisted since the ADR-0006 columns migration. A NULL column means the row
    // predates that migration, so fall back to the research default and keep pre-migration rows
    // byte-identical to their old behaviour (they used to ALWAYS get the default here).
    householdSavingsStepUpPercent:
      row.householdSavingsStepUpPercent ?? DEFAULT_ASSUMPTIONS.householdSavingsStepUpPercent,
    householdSplitPercent: row.householdSplitPercent ?? DEFAULT_ASSUMPTIONS.householdSplitPercent,
    // ADR-0006 one-shot migration STAMP. Deliberately NOT defaulted: its ABSENCE is the signal
    // the client store uses to decide the migration has not run, so a NULL column must map back
    // to `undefined`, never to 0.
    assumptionsMigratedV: row.assumptionsMigratedV ?? undefined,
  };
}

/**
 * Assumptions → the `user_assumptions` upsert payload. Every field of `Assumptions` MUST be
 * represented here; optional fields map to an explicit `null` so a cleared value overwrites a
 * previously-stored one instead of silently persisting the old value.
 */
export function buildAssumptionsWriteData(a: Assumptions) {
  return {
    inflation: a.inflation,
    equityReturn: a.equityReturn,
    debtReturn: a.debtReturn,
    realEstateReturn: a.realEstateReturn,
    goldReturn: a.goldReturn,
    npsReturn: a.npsReturn,
    ppfReturn: a.ppfReturn,
    epfReturn: a.epfReturn,
    internationalReturn: a.internationalReturn,
    reitReturn: a.reitReturn,
    cryptoReturn: a.cryptoReturn,
    healthcareInflation: a.healthcareInflation,
    educationInflation: a.educationInflation,
    housingInflation: a.housingInflation,
    inflationWeights: a.inflationWeights as unknown as Prisma.InputJsonValue,
    swrOverride: a.swrOverride ?? null,
    leanMultiplier: a.leanMultiplier,
    fatMultiplier: a.fatMultiplier,
    withdrawalRule: a.withdrawalRule,
    householdSavingsStepUpPercent: a.householdSavingsStepUpPercent,
    householdSplitPercent: a.householdSplitPercent,
    assumptionsMigratedV: a.assumptionsMigratedV ?? null,
  };
}

/**
 * The user's resolved Assumptions — their persisted overrides, or the research
 * defaults when they have no row yet. Never null (derive() needs real assumptions),
 * which is why this differs from GET /assumptions (that returns null so the store
 * can seed defaults client-side).
 */
export async function readAssumptions(prisma: PrismaClient, userId: string): Promise<Assumptions> {
  const row = await prisma.userAssumptions.findUnique({ where: { userId } });
  return row ? mapAssumptionsRow(row) : DEFAULT_ASSUMPTIONS;
}
