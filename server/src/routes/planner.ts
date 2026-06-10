import { Hono } from "hono";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { householdSchema } from "@planner/types/household";
import { assumptionsSchema } from "@planner/types/assumptions";
import { authMiddleware } from "../middleware/auth";
import { apiSuccess, apiError, ErrorCode } from "../lib/api-utils";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { readHousehold, applyHouseholdPlan } from "../lib/household-repo";
import { mapAssumptionsRow } from "../lib/planner-read";
import { diffHousehold } from "../lib/household-diff";

/**
 * /api/planner — DOCUMENT endpoints (GET+PUT per entityKey), mirroring
 * StorageAdapter.get/set(key) 1:1. NOT granular REST. userId comes from the
 * authenticated session (c.get('userId')), NEVER from the request body.
 *
 * 8 paths: household, assumptions, scenarios, features, ui, expense-history,
 * plan-baseline (GET+PUT each) + DELETE /all + GET /me. The household PUT runs the
 * server-side diff inside one transaction (household-repo + household-diff).
 */

const app = new Hono();
app.use("*", authMiddleware);

// ---------- Inline Zod for the shapes that aren't Zod in mvp/src/types ----------

const scenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  leverValues: z.record(z.unknown()),
  createdAt: z.number(),
});
const scenariosBodySchema = z.array(scenarioSchema);

const featuresBodySchema = z.object({
  flags: z.record(z.boolean()),
  wizardCompleted: z.boolean(),
  userId: z.string().optional(), // ignored — server uses the session userId
});

// "Since you were away" lifecycle digest baseline — rides inside the `ui` prefs
// Json blob (no migration). Additive + nullable so older ServerAdapter writes and
// the frontend's null default both validate, and the snapshot isn't stripped on PUT.
const lifecycleSnapshotSchema = z.object({
  capturedAt: z.string(),
  fireAge: z.number(),
  fireYear: z.number(),
  currentCorpus: z.number(),
  fireNumber: z.number(),
  savingsRatePct: z.number(),
  milestoneBand: z.number(),
  activeNudgeIds: z.array(z.string()),
  monteCarloP50Age: z.number().nullable(),
});

const uiBodySchema = z.object({
  isFamilyView: z.boolean().optional(),
  viewingMemberId: z.string().nullable().optional(),
  currentFY: z.string().optional(),
  lifecycleSnapshot: lifecycleSnapshotSchema.nullable().optional(),
});

const expenseSnapshotSchema = z.object({
  period: z.string(),
  fy: z.string(),
  capturedAt: z.string(),
  totalAnnual: z.number(),
  byBucket: z.record(z.number()),
  fireTargetYear: z.number().optional(),
  fireNumber: z.number().optional(),
  netWorth: z.number().optional(),
});
const expenseHistoryBodySchema = z.array(expenseSnapshotSchema);

// #138 — the locked plan baseline (a dedicated entity; SRP, NOT an ExpenseSnapshot extension).
// Stored as a JSON blob inside the userUiPrefs.prefs row under the `planBaseline` key — NO new
// Prisma table / migration (the lifecycleSnapshot precedent), so it never touches the shared schema.
const planBaselineSchema = z.object({
  capturedAt: z.string(),
  fireNumber: z.number(),
  fireAge: z.number(),
  yearsToFire: z.number(),
  netWorth: z.number(),
  monthlyContribution: z.number(),
  annualExpenses: z.number(),
  assumptions: assumptionsSchema, // a copy of the assumptions in force at lock time
});

// ---------- ownerId refinement (the "Joint" sentinel; NO FK) ----------

/** Validate every ownerId references a member id OR the literal "Joint". */
function validateOwnerRefs(h: z.infer<typeof householdSchema>): string[] {
  const valid = new Set<string>(h.members.map((m) => m.id));
  valid.add("Joint");
  const errors: string[] = [];
  const check = (kind: string, id: string, ownerId: string) => {
    if (!valid.has(ownerId)) errors.push(`${kind} ${id}: ownerId "${ownerId}" is not a member id or "Joint"`);
  };
  for (const b of h.businesses) check("business", b.id, b.ownerId);
  for (const o of h.otherIncome) check("otherIncome", o.id, o.ownerId);
  for (const i of h.investments) check("investment", i.id, i.ownerId);
  for (const l of h.liabilities) check("liability", l.id, l.ownerId);
  return errors;
}

// ============================ household ============================

app.get("/household", async (c) => {
  const userId = c.get("userId");
  try {
    const household = await readHousehold(prisma, userId);
    return apiSuccess(c, household);
  } catch (err) {
    logger.error({ err, userId }, "GET /planner/household failed");
    return apiError(c, "Failed to read household", 500, ErrorCode.INTERNAL_ERROR);
  }
});

app.put("/household", async (c) => {
  const userId = c.get("userId");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return apiError(c, "Invalid JSON body", 400, ErrorCode.VALIDATION_ERROR);
  }
  const parsed = householdSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(c, `Invalid household: ${parsed.error.message}`, 422, ErrorCode.VALIDATION_ERROR);
  }
  const ownerErrors = validateOwnerRefs(parsed.data);
  if (ownerErrors.length) {
    return apiError(c, `Invalid ownerId refs: ${ownerErrors.join("; ")}`, 422, ErrorCode.VALIDATION_ERROR);
  }
  try {
    const current = await readHousehold(prisma, userId);
    const plan = diffHousehold(current, parsed.data);
    const updatedAt = await applyHouseholdPlan(prisma, userId, plan);
    return apiSuccess(c, { updatedAt });
  } catch (err) {
    logger.error({ err, userId }, "PUT /planner/household failed");
    return apiError(c, "Failed to persist household", 500, ErrorCode.INTERNAL_ERROR);
  }
});

// ============================ assumptions ============================

app.get("/assumptions", async (c) => {
  const userId = c.get("userId");
  try {
    const row = await prisma.userAssumptions.findUnique({ where: { userId } });
    if (!row) return apiSuccess(c, null);
    return apiSuccess(c, mapAssumptionsRow(row));
  } catch (err) {
    logger.error({ err, userId }, "GET /planner/assumptions failed");
    return apiError(c, "Failed to read assumptions", 500, ErrorCode.INTERNAL_ERROR);
  }
});

app.put("/assumptions", async (c) => {
  const userId = c.get("userId");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return apiError(c, "Invalid JSON body", 400, ErrorCode.VALIDATION_ERROR);
  }
  const parsed = assumptionsSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(c, `Invalid assumptions: ${parsed.error.message}`, 422, ErrorCode.VALIDATION_ERROR);
  }
  const a = parsed.data;
  const data = {
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
  };
  try {
    const saved = await prisma.userAssumptions.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return apiSuccess(c, { updatedAt: saved.updatedAt });
  } catch (err) {
    logger.error({ err, userId }, "PUT /planner/assumptions failed");
    return apiError(c, "Failed to persist assumptions", 500, ErrorCode.INTERNAL_ERROR);
  }
});

// ============================ scenarios ============================

app.get("/scenarios", async (c) => {
  const userId = c.get("userId");
  try {
    const rows = await prisma.scenario.findMany({ where: { userId } });
    if (rows.length === 0) return apiSuccess(c, null); // store seeds defaults on null
    const scenarios = rows.map((s) => ({
      id: s.entityId,
      name: s.name,
      leverValues: s.leverValues,
      createdAt: Number(s.docCreatedAt),
    }));
    return apiSuccess(c, scenarios);
  } catch (err) {
    logger.error({ err, userId }, "GET /planner/scenarios failed");
    return apiError(c, "Failed to read scenarios", 500, ErrorCode.INTERNAL_ERROR);
  }
});

app.put("/scenarios", async (c) => {
  const userId = c.get("userId");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return apiError(c, "Invalid JSON body", 400, ErrorCode.VALIDATION_ERROR);
  }
  const parsed = scenariosBodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(c, `Invalid scenarios: ${parsed.error.message}`, 422, ErrorCode.VALIDATION_ERROR);
  }
  const incoming = parsed.data;
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.scenario.findMany({ where: { userId }, select: { entityId: true } });
      const incomingIds = new Set(incoming.map((s) => s.id));
      const toDelete = existing.filter((e) => !incomingIds.has(e.entityId)).map((e) => e.entityId);
      if (toDelete.length) {
        await tx.scenario.deleteMany({ where: { userId, entityId: { in: toDelete } } });
      }
      for (const s of incoming) {
        const data = {
          userId,
          entityId: s.id,
          name: s.name,
          leverValues: s.leverValues as Prisma.InputJsonValue,
          docCreatedAt: BigInt(s.createdAt),
        };
        await tx.scenario.upsert({
          where: { userId_entityId: { userId, entityId: s.id } },
          create: data,
          update: { name: s.name, leverValues: s.leverValues as Prisma.InputJsonValue, docCreatedAt: BigInt(s.createdAt) },
        });
      }
    });
    return apiSuccess(c, { count: incoming.length });
  } catch (err) {
    logger.error({ err, userId }, "PUT /planner/scenarios failed");
    return apiError(c, "Failed to persist scenarios", 500, ErrorCode.INTERNAL_ERROR);
  }
});

// ============================ features ============================

app.get("/features", async (c) => {
  const userId = c.get("userId");
  try {
    const row = await prisma.userFeatures.findUnique({ where: { userId } });
    if (!row) return apiSuccess(c, null);
    return apiSuccess(c, { flags: row.flags, wizardCompleted: row.wizardCompleted, userId });
  } catch (err) {
    logger.error({ err, userId }, "GET /planner/features failed");
    return apiError(c, "Failed to read features", 500, ErrorCode.INTERNAL_ERROR);
  }
});

app.put("/features", async (c) => {
  const userId = c.get("userId");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return apiError(c, "Invalid JSON body", 400, ErrorCode.VALIDATION_ERROR);
  }
  const parsed = featuresBodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(c, `Invalid features: ${parsed.error.message}`, 422, ErrorCode.VALIDATION_ERROR);
  }
  const data = {
    flags: parsed.data.flags as Prisma.InputJsonValue,
    wizardCompleted: parsed.data.wizardCompleted,
  };
  try {
    const saved = await prisma.userFeatures.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return apiSuccess(c, { updatedAt: saved.updatedAt });
  } catch (err) {
    logger.error({ err, userId }, "PUT /planner/features failed");
    return apiError(c, "Failed to persist features", 500, ErrorCode.INTERNAL_ERROR);
  }
});

// ============================ ui ============================

app.get("/ui", async (c) => {
  const userId = c.get("userId");
  try {
    const row = await prisma.userUiPrefs.findUnique({ where: { userId } });
    if (!row) return apiSuccess(c, null);
    return apiSuccess(c, row.prefs);
  } catch (err) {
    logger.error({ err, userId }, "GET /planner/ui failed");
    return apiError(c, "Failed to read ui prefs", 500, ErrorCode.INTERNAL_ERROR);
  }
});

app.put("/ui", async (c) => {
  const userId = c.get("userId");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return apiError(c, "Invalid JSON body", 400, ErrorCode.VALIDATION_ERROR);
  }
  const parsed = uiBodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(c, `Invalid ui prefs: ${parsed.error.message}`, 422, ErrorCode.VALIDATION_ERROR);
  }
  try {
    // MERGE, not wholesale replace: the prefs blob ALSO carries the #138 `planBaseline` sub-key
    // (written by the dedicated /plan-baseline endpoint). A wholesale replace from the ui store —
    // which doesn't know about planBaseline — would silently strip it. Overlay the incoming ui
    // fields onto the existing prefs so a co-resident sub-blob survives. The read-modify-write runs
    // in a SERIALIZABLE transaction so a concurrent /plan-baseline write to the same row can't
    // lost-update (the ServerAdapter flushes keys independently — code-reviewer H2).
    const saved = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.userUiPrefs.findUnique({ where: { userId } });
        const existingPrefs = (existing?.prefs as Record<string, unknown> | null) ?? {};
        const merged = { ...existingPrefs, ...parsed.data } as Prisma.InputJsonValue;
        return tx.userUiPrefs.upsert({ where: { userId }, create: { userId, prefs: merged }, update: { prefs: merged } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return apiSuccess(c, { updatedAt: saved.updatedAt });
  } catch (err) {
    logger.error({ err, userId }, "PUT /planner/ui failed");
    return apiError(c, "Failed to persist ui prefs", 500, ErrorCode.INTERNAL_ERROR);
  }
});

// ============================ plan-baseline (#138) ============================

app.get("/plan-baseline", async (c) => {
  const userId = c.get("userId");
  try {
    const row = await prisma.userUiPrefs.findUnique({ where: { userId } });
    const prefs = (row?.prefs as Record<string, unknown> | null) ?? {};
    return apiSuccess(c, prefs.planBaseline ?? null);
  } catch (err) {
    logger.error({ err, userId }, "GET /planner/plan-baseline failed");
    return apiError(c, "Failed to read plan baseline", 500, ErrorCode.INTERNAL_ERROR);
  }
});

app.put("/plan-baseline", async (c) => {
  const userId = c.get("userId");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return apiError(c, "Invalid JSON body", 400, ErrorCode.VALIDATION_ERROR);
  }
  const parsed = planBaselineSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(c, `Invalid plan baseline: ${parsed.error.message}`, 422, ErrorCode.VALIDATION_ERROR);
  }
  try {
    // Read-modify-write the prefs blob so the ui sub-fields (isFamilyView/currentFY/…) survive.
    // SERIALIZABLE so a concurrent /ui write to the same row can't lost-update the baseline (H2).
    const saved = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.userUiPrefs.findUnique({ where: { userId } });
        const existingPrefs = (existing?.prefs as Record<string, unknown> | null) ?? {};
        const merged = { ...existingPrefs, planBaseline: parsed.data } as Prisma.InputJsonValue;
        return tx.userUiPrefs.upsert({ where: { userId }, create: { userId, prefs: merged }, update: { prefs: merged } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return apiSuccess(c, { updatedAt: saved.updatedAt });
  } catch (err) {
    logger.error({ err, userId }, "PUT /planner/plan-baseline failed");
    return apiError(c, "Failed to persist plan baseline", 500, ErrorCode.INTERNAL_ERROR);
  }
});

// ============================ expense-history ============================

app.get("/expense-history", async (c) => {
  const userId = c.get("userId");
  try {
    const rows = await prisma.expenseSnapshot.findMany({
      where: { userId },
      orderBy: { period: "asc" },
    });
    const snapshots = rows.map((s) => ({
      period: s.period,
      fy: s.fy,
      capturedAt: s.capturedAt,
      totalAnnual: s.totalAnnual,
      byBucket: s.byBucket,
      fireTargetYear: s.fireTargetYear ?? undefined,
      fireNumber: s.fireNumber ?? undefined,
      netWorth: s.netWorth ?? undefined,
    }));
    return apiSuccess(c, snapshots);
  } catch (err) {
    logger.error({ err, userId }, "GET /planner/expense-history failed");
    return apiError(c, "Failed to read expense history", 500, ErrorCode.INTERNAL_ERROR);
  }
});

app.put("/expense-history", async (c) => {
  const userId = c.get("userId");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return apiError(c, "Invalid JSON body", 400, ErrorCode.VALIDATION_ERROR);
  }
  const parsed = expenseHistoryBodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(c, `Invalid expense history: ${parsed.error.message}`, 422, ErrorCode.VALIDATION_ERROR);
  }
  const incoming = parsed.data;
  try {
    // Reconcile by (userId, period) — the snapshot de-dup key (NOT by id).
    await prisma.$transaction(async (tx) => {
      const existing = await tx.expenseSnapshot.findMany({ where: { userId }, select: { period: true } });
      const incomingPeriods = new Set(incoming.map((s) => s.period));
      const toDelete = existing.filter((e) => !incomingPeriods.has(e.period)).map((e) => e.period);
      if (toDelete.length) {
        await tx.expenseSnapshot.deleteMany({ where: { userId, period: { in: toDelete } } });
      }
      for (const s of incoming) {
        const data = {
          userId,
          period: s.period,
          fy: s.fy,
          capturedAt: s.capturedAt,
          totalAnnual: s.totalAnnual,
          byBucket: s.byBucket as Prisma.InputJsonValue,
          fireTargetYear: s.fireTargetYear ?? null,
          fireNumber: s.fireNumber ?? null,
          netWorth: s.netWorth ?? null,
        };
        await tx.expenseSnapshot.upsert({
          where: { userId_period: { userId, period: s.period } },
          create: data,
          update: data,
        });
      }
    });
    return apiSuccess(c, { count: incoming.length });
  } catch (err) {
    logger.error({ err, userId }, "PUT /planner/expense-history failed");
    return apiError(c, "Failed to persist expense history", 500, ErrorCode.INTERNAL_ERROR);
  }
});

// ============================ all (clearForCurrentUser) ============================

app.delete("/all", async (c) => {
  const userId = c.get("userId");
  try {
    await prisma.$transaction([
      prisma.liabilityCoBorrower.deleteMany({ where: { userId } }),
      prisma.member.deleteMany({ where: { userId } }),
      prisma.business.deleteMany({ where: { userId } }),
      prisma.otherIncomeLine.deleteMany({ where: { userId } }),
      prisma.investment.deleteMany({ where: { userId } }),
      prisma.liability.deleteMany({ where: { userId } }),
      prisma.insurancePolicy.deleteMany({ where: { userId } }),
      prisma.recurringExpenseLine.deleteMany({ where: { userId } }),
      prisma.plannedFutureLine.deleteMany({ where: { userId } }),
      prisma.estateChecklistItem.deleteMany({ where: { userId } }),
      prisma.expenseSnapshot.deleteMany({ where: { userId } }),
      prisma.householdConfig.deleteMany({ where: { userId } }),
      prisma.userAssumptions.deleteMany({ where: { userId } }),
      prisma.scenario.deleteMany({ where: { userId } }),
      prisma.userFeatures.deleteMany({ where: { userId } }),
      prisma.userUiPrefs.deleteMany({ where: { userId } }),
    ]);
    return apiSuccess(c, { cleared: true });
  } catch (err) {
    logger.error({ err, userId }, "DELETE /planner/all failed");
    return apiError(c, "Failed to clear user data", 500, ErrorCode.INTERNAL_ERROR);
  }
});

// ============================ me ============================

app.get("/me", (c) => {
  return apiSuccess(c, c.get("user"));
});

export default app;
