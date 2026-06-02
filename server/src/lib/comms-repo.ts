import { prisma } from "./prisma";
import type { CommsChannel, ConsentRecord } from "./comms-consent";

/**
 * Persistence for the comms gate + send-log (CommsConsent / WhatsAppSendLog).
 * Thin Prisma layer the sender service depends on; the pure decision lives in
 * comms-consent.ts. Integration-tested against a live DB (gated on DATABASE_URL).
 */

export async function getConsent(
  userId: string,
  channel: CommsChannel,
): Promise<ConsentRecord | null> {
  const row = await prisma.commsConsent.findUnique({
    where: { userId_channel: { userId, channel } },
  });
  if (!row) return null;
  return {
    channel: row.channel as CommsChannel,
    marketingOptIn: row.marketingOptIn,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
  };
}

/** ISO timestamps of non-blocked WhatsApp sends to this user within the window. */
export async function recentWhatsAppTimestamps(
  userId: string,
  sinceHours: number,
): Promise<string[]> {
  const cutoff = new Date(Date.now() - Math.max(0, sinceHours) * 3_600_000);
  const rows = await prisma.whatsAppSendLog.findMany({
    where: { userId, sentAt: { gte: cutoff }, status: { not: "BLOCKED" } },
    select: { sentAt: true },
  });
  return rows.map((r) => r.sentAt.toISOString());
}

export interface RecordSendInput {
  userId: string;
  toNumber: string;
  templateName: string;
  category: string;
  status: string;
  failedDetail?: string | null;
  errorCode?: string | null;
  providerMessageId?: string | null;
}

export async function recordSend(input: RecordSendInput): Promise<{ id: string }> {
  const row = await prisma.whatsAppSendLog.create({ data: input });
  return { id: row.id };
}

/**
 * Update the latest send-log row for a number+template with its async delivery
 * status (called by the Wati webhook). Returns the number of rows updated (0/1).
 */
export async function markDeliveryStatus(params: {
  toNumber: string;
  templateName: string;
  status: string;
  failedDetail?: string | null;
  errorCode?: string | null;
}): Promise<number> {
  const latest = await prisma.whatsAppSendLog.findFirst({
    where: { toNumber: params.toNumber, templateName: params.templateName },
    orderBy: { sentAt: "desc" },
  });
  if (!latest) return 0;
  await prisma.whatsAppSendLog.update({
    where: { id: latest.id },
    data: {
      status: params.status,
      failedDetail: params.failedDetail ?? null,
      errorCode: params.errorCode ?? null,
    },
  });
  return 1;
}
