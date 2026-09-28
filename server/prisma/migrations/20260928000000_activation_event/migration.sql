-- #44 — the five funnel counters (activation_event).
--
-- ADDITIVE ONLY: one new enum + one new table. No existing table, column, index or constraint is
-- touched, so this migration cannot change the behaviour of anything already deployed and needs no
-- backfill. AUTHORED, NOT APPLIED — no remote database has run it yet (the deploy window applies it
-- with `npm run prisma:migrate:deploy`).
--
-- Why one row per event rather than a counter column: a counter can only answer the question it was
-- created for. Rows can be re-sliced by day, by cohort, or by anonId → userId join without a second
-- migration — which is exactly what the two conversion ratios in scripts/funnel-report.ts need.
--
-- `userId` is NULLABLE because the first two events happen before there is a user at all
-- (quick_opened / quick_completed on the public /quick route, #187). `anonId` is always present —
-- it is the browser-minted uuid that joins a pre-signup visit to the account that visit became.
-- Bare userId with NO foreign key, matching every other v6 table (document-model convention).

-- CreateEnum
CREATE TYPE "ActivationEventType" AS ENUM ('quick_opened', 'quick_completed', 'signed_up', 'returned_7d', 'data_refreshed');

-- CreateTable
CREATE TABLE "activation_event" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "anonId" TEXT NOT NULL,
    "event" "ActivationEventType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activation_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activation_event_event_createdAt_idx" ON "activation_event"("event", "createdAt");

-- CreateIndex
CREATE INDEX "activation_event_anonId_idx" ON "activation_event"("anonId");

-- CreateIndex
CREATE INDEX "activation_event_userId_idx" ON "activation_event"("userId");
