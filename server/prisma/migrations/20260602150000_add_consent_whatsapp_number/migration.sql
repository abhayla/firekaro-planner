-- Phase 0 (comms-lifecycle-loop, D1): store the WhatsApp recipient number on the
-- consent row so the sender can resolve a real target. Additive + nullable — zero
-- impact on existing rows. Applied to Supabase via the Supabase migration API; this
-- file mirrors it so Prisma history stays consistent (recorded via
-- `prisma migrate resolve --applied`).

ALTER TABLE "comms_consent" ADD COLUMN "whatsappNumber" TEXT;
