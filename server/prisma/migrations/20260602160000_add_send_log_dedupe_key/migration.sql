-- Phase 1 (comms-lifecycle-loop, D6): per-period/threshold idempotency key on the
-- send-log so the lifecycle evaluator fires each nudge once. Additive + nullable —
-- zero impact on existing rows. Applied to Supabase via the Supabase migration API;
-- this file mirrors it so Prisma history stays consistent (recorded via
-- `prisma migrate resolve --applied`).

ALTER TABLE "whatsapp_send_log" ADD COLUMN "dedupeKey" TEXT;
CREATE INDEX "whatsapp_send_log_userId_dedupeKey_idx" ON "whatsapp_send_log"("userId", "dedupeKey");
