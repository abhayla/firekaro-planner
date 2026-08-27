import { z } from "zod";
// Relative (not "@planner/...") imports so this file resolves identically from BOTH
// vitest configs — server/vitest.config.ts (which has the "@planner" alias) and the
// root vitest.config.ts (which does not, and must not need one just to prove parity).
import { householdSchema } from "../../../src/types/household";
import { assumptionsSchema } from "../../../src/types/assumptions";

/**
 * Pure Zod schemas for the /api/planner document endpoints — extracted out of
 * routes/planner.ts (T-379-fix) so a no-Hono/no-Prisma consumer (the root
 * `server-schema-parity.spec.ts`) can import them without pulling in the
 * Hono app, the Prisma client, or auth middleware at module-load time.
 *
 * routes/planner.ts re-exports the ones it always exported (uiBodySchema,
 * quickPrefsSchema) and imports the rest for its own route handlers — no
 * behaviour change, pure move.
 */

export const scenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  leverValues: z.record(z.unknown()),
  createdAt: z.number(),
});
export const scenariosBodySchema = z.array(scenarioSchema);

export const featuresBodySchema = z.object({
  flags: z.record(z.boolean()),
  wizardCompleted: z.boolean(),
  userId: z.string().optional(), // ignored — server uses the session userId
});

// "Since you were away" lifecycle digest baseline — rides inside the `ui` prefs
// Json blob (no migration). Additive + nullable so older ServerAdapter writes and
// the frontend's null default both validate, and the snapshot isn't stripped on PUT.
//
// STRIP-MODE WARNING (T-379-fix, HIGH bug fixed here): z.object() defaults to STRIP
// mode — any key present on the frontend `LifecycleSnapshot` type
// (src/lib/lifecycle-digest.ts) but NOT declared below is silently dropped on PUT,
// even though the frontend read it back as `undefined` with no error. `frameVersion`
// (ADR-0006) was exactly this bug: the frontend types + persisted it, this schema
// never declared it, so every server-adapter round-trip silently lost it. See the
// `server-schema-parity.spec.ts` at the repo root — it enumerates every optional
// field on the frontend type and fails if this schema drops any of them.
export const lifecycleSnapshotSchema = z.object({
  capturedAt: z.string(),
  fireAge: z.number(),
  fireYear: z.number(),
  currentCorpus: z.number(),
  fireNumber: z.number(),
  savingsRatePct: z.number(),
  milestoneBand: z.number(),
  activeNudgeIds: z.array(z.string()),
  monteCarloP50Age: z.number().nullable(),
  // ADR-0006 — the modelling frame this snapshot was captured under. See the
  // matching field + strip-mode warning above.
  frameVersion: z.string().optional(),
});

// T-377 (QN-2) — the Quick-Number metadata blob (frontend SSOT: src/stores/ui.ts QuickPrefs).
// It rides the EXISTING userUiPrefs.prefs JSON row (like lifecycleSnapshot / planBaseline) — no
// Prisma change. It MUST be declared here: uiBodySchema is a strip-mode z.object, so an unknown
// `quick` key would be silently dropped on PUT and the user's gut-feel guess would vanish.
export const quickPrefsSchema = z.object({
  guess: z.number().min(0).optional(),
  completedAt: z.string().optional(),
  createdIds: z.array(z.string()).optional(),
  directPlans: z.boolean().optional(),
});

export const uiBodySchema = z.object({
  isFamilyView: z.boolean().optional(),
  viewingMemberId: z.string().nullable().optional(),
  currentFY: z.string().optional(),
  lifecycleSnapshot: lifecycleSnapshotSchema.nullable().optional(),
  quick: quickPrefsSchema.nullable().optional(),
});

export const expenseSnapshotSchema = z.object({
  period: z.string(),
  fy: z.string(),
  capturedAt: z.string(),
  totalAnnual: z.number(),
  byBucket: z.record(z.number()),
  fireTargetYear: z.number().optional(),
  fireNumber: z.number().optional(),
  netWorth: z.number().optional(),
});
export const expenseHistoryBodySchema = z.array(expenseSnapshotSchema);

// #138 — the locked plan baseline (a dedicated entity; SRP, NOT an ExpenseSnapshot extension).
// Stored as a JSON blob inside the userUiPrefs.prefs row under the `planBaseline` key — NO new
// Prisma table / migration (the lifecycleSnapshot precedent), so it never touches the shared schema.
//
// See the STRIP-MODE WARNING on `lifecycleSnapshotSchema` above — `frameVersion` (ADR-0006) had
// the identical bug here: declared on the frontend `PlanBaseline` type, never declared here.
export const planBaselineSchema = z.object({
  capturedAt: z.string(),
  fireNumber: z.number(),
  fireAge: z.number(),
  yearsToFire: z.number(),
  netWorth: z.number(),
  monthlyContribution: z.number(),
  annualExpenses: z.number(),
  assumptions: assumptionsSchema, // a copy of the assumptions in force at lock time
  // ADR-0006 — the modelling frame this baseline was captured under. See the
  // matching field + strip-mode warning above.
  frameVersion: z.string().optional(),
});

export { householdSchema, assumptionsSchema };
