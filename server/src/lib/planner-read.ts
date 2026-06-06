import type { PrismaClient, UserAssumptions } from "@prisma/client";
import { DEFAULT_ASSUMPTIONS, type Assumptions } from "@planner/types/assumptions";

/**
 * Server-side read helpers for the planner documents. `mapAssumptionsRow` is the
 * single source of truth for the UserAssumptions row → Assumptions shape (used by
 * GET /api/planner/assumptions AND the lifecycle runner's derive() call), so the
 * 20-field mapping lives in exactly one place.
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
    // #46 — the household savings step-up is NOT persisted to UserAssumptions in Phase 1 (the
    // What-If lever is non-persisting; default 0). Map to the research default so the server
    // derive()/lifecycle path stays byte-identical to today.
    householdSavingsStepUpPercent: DEFAULT_ASSUMPTIONS.householdSavingsStepUpPercent,
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
