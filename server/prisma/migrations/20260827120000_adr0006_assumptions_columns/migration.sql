-- ADR-0006 / #46 / #81: persist the three `Assumptions` fields the write layer was dropping.
--
-- `assumptionsSchema` (src/types/assumptions.ts) declares `householdSavingsStepUpPercent`,
-- `householdSplitPercent` and `assumptionsMigratedV`, so PUT /api/planner/assumptions VALIDATED
-- and 200-accepted them — but `user_assumptions` had no columns for them, so the upsert silently
-- discarded the values and GET always returned the research defaults. A user's deliberate
-- step-up/split choice never survived a reload, and the one-shot ADR-0006 migration stamp could
-- never be recorded server-side.
--
-- All three columns are NULLABLE with NO default. NULL means "this row predates the column";
-- `mapAssumptionsRow` (server/src/lib/planner-read.ts) falls back to DEFAULT_ASSUMPTIONS for the
-- two percents, so every existing row keeps byte-identical behaviour and no backfill is required.
-- `assumptionsMigratedV` stays nullable forever on purpose: its ABSENCE is precisely the signal
-- the client-side store uses to decide the one-shot migration has not yet run.

ALTER TABLE "user_assumptions" ADD COLUMN "householdSavingsStepUpPercent" DOUBLE PRECISION;
ALTER TABLE "user_assumptions" ADD COLUMN "householdSplitPercent" DOUBLE PRECISION;
ALTER TABLE "user_assumptions" ADD COLUMN "assumptionsMigratedV" INTEGER;
