-- Comms consent (DPDP) + WhatsApp send-log. Applied to Supabase 2026-06-02 via
-- the Supabase migration API; this file mirrors it so Prisma history stays consistent
-- (recorded via `prisma migrate resolve --applied`). Additive only.

CREATE TABLE "comms_consent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "comms_consent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "comms_consent_userId_channel_key" ON "comms_consent"("userId", "channel");
CREATE INDEX "comms_consent_userId_idx" ON "comms_consent"("userId");

CREATE TABLE "whatsapp_send_log" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "toNumber" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "failedDetail" TEXT,
    "errorCode" TEXT,
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "whatsapp_send_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "whatsapp_send_log_userId_idx" ON "whatsapp_send_log"("userId");
CREATE INDEX "whatsapp_send_log_toNumber_idx" ON "whatsapp_send_log"("toNumber");
CREATE INDEX "whatsapp_send_log_status_idx" ON "whatsapp_send_log"("status");
