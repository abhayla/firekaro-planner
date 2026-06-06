-- gh-issue #46 (Temporal contributions Phase 1): per-investment time-varying contribution plan.
-- A nullable JSONB column holding an age-relative ContributionSchedule (segments with a REAL
-- step-up). DISPLAY/PLAN metadata only — never an input to corpus inflow (the gh-issue #11 lock;
-- corpus inflow is the single household savings residual in the FIRE engine). Nullable + additive:
-- existing rows read back as NULL ⇒ no behaviour change for investments without a planned change.
--
-- AUTHORED, NOT APPLIED — applying this to Supabase is the production deploy step (Abhay's gate).
ALTER TABLE "investments" ADD COLUMN "contributionSchedule" JSONB;
