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
 * Wati's "templateMessageSent_v2" webhook is the ONLY delivery event that carries
 * the recipient (waId) + templateName; it also carries the whatsappMessageId.
 * Stash that id on the latest matching not-yet-linked row so the later
 * DELIVERED/READ/FAILED events (which carry ONLY the id) can find the row.
 * Returns rows linked (0/1).
 */
export async function linkProviderMessageId(params: {
  toNumber: string;
  templateName: string;
  providerMessageId: string;
}): Promise<number> {
  const row = await prisma.whatsAppSendLog.findFirst({
    where: { toNumber: params.toNumber, templateName: params.templateName, providerMessageId: null },
    orderBy: { sentAt: "desc" },
  });
  if (!row) return 0;
  await prisma.whatsAppSendLog.update({
    where: { id: row.id },
    data: { providerMessageId: params.providerMessageId },
  });
  return 1;
}

/**
 * Update a send-log row's status by the Wati whatsappMessageId (the only key the
 * DELIVERED/READ/FAILED webhooks carry). Returns rows updated (0/1).
 */
export async function updateStatusByProviderId(params: {
  providerMessageId: string;
  status: string;
  failedDetail?: string | null;
  errorCode?: string | null;
}): Promise<number> {
  const res = await prisma.whatsAppSendLog.updateMany({
    where: { providerMessageId: params.providerMessageId },
    data: {
      status: params.status,
      failedDetail: params.failedDetail ?? null,
      errorCode: params.errorCode ?? null,
    },
  });
  return res.count;
}
