import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { logger } from "./logger";
import type { CommsChannel, ConsentRecord } from "./comms-consent";
import { retentionCutoff, SEND_LOG_RETENTION_DAYS } from "./send-log-retention";

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

/** The user's stored WhatsApp number (digits-only), or null if none on record (D1). */
export async function getWhatsAppNumber(userId: string): Promise<string | null> {
  const row = await prisma.commsConsent.findUnique({
    where: { userId_channel: { userId, channel: "whatsapp" } },
    select: { whatsappNumber: true },
  });
  return row?.whatsappNumber ?? null;
}

/**
 * True when this user already received a non-blocked send under `dedupeKey` — the
 * idempotency check the lifecycle evaluator uses to fire each nudge once per
 * period/threshold (D6). BLOCKED rows don't count (the send never went out).
 */
export async function alreadySent(userId: string, dedupeKey: string): Promise<boolean> {
  const row = await prisma.whatsAppSendLog.findFirst({
    where: { userId, dedupeKey, status: { not: "BLOCKED" } },
    select: { id: true },
  });
  return row !== null;
}

export interface ConsentingWhatsAppUser {
  userId: string;
  whatsappNumber: string;
}

/**
 * Every user the scheduled lifecycle evaluator may message: an un-revoked WhatsApp
 * consent row WITH a stored number. The consent gate + fail-closed allowlist still
 * apply per-send downstream — this is just the candidate set.
 */
export async function listConsentingWhatsAppUsers(): Promise<ConsentingWhatsAppUser[]> {
  const rows = await prisma.commsConsent.findMany({
    where: { channel: "whatsapp", revokedAt: null, whatsappNumber: { not: null } },
    select: { userId: true, whatsappNumber: true },
  });
  return rows
    .filter((r): r is { userId: string; whatsappNumber: string } => !!r.whatsappNumber)
    .map((r) => ({ userId: r.userId, whatsappNumber: r.whatsappNumber }));
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
  /** Per-period/threshold idempotency key (D6); null for ad-hoc sends. */
  dedupeKey?: string | null;
}

export async function recordSend(input: RecordSendInput): Promise<{ id: string }> {
  try {
    const row = await prisma.whatsAppSendLog.create({ data: input });
    return { id: row.id };
  } catch (e) {
    // gh-issue #10: the partial unique index (userId, dedupeKey WHERE status<>'BLOCKED')
    // is the DB-level dedup backstop. A concurrent run that already recorded this
    // (userId, dedupeKey) non-blocked send loses the race here — treat the P2002 as
    // "already deduped" (not an error) and return the winning row's id.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && input.dedupeKey) {
      const existing = await prisma.whatsAppSendLog.findFirst({
        where: { userId: input.userId, dedupeKey: input.dedupeKey, status: { not: "BLOCKED" } },
        orderBy: { sentAt: "desc" },
      });
      logger.warn(
        { userId: input.userId, dedupeKey: input.dedupeKey },
        "send-log dedup race — duplicate non-blocked record suppressed by partial unique index",
      );
      if (existing) return { id: existing.id };
    }
    throw e;
  }
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

/**
 * DPDP data-minimization (gh-issue #10): clear BOTH recipient-PII columns —
 * `toNumber` (phone) and `failedDetail` (provider error text that can echo the
 * number) — on send-log rows older than the retention window, KEEPING the row for
 * template/status/timestamp analytics. One atomic updateMany whose WHERE mirrors
 * `shouldPurgeSendLogPii` (sentAt < cutoff AND (toNumber <> '' OR failedDetail
 * IS NOT NULL)). Idempotent — once both PII fields are cleared the row is excluded,
 * so a re-run updates 0. Returns the number of rows purged. Run daily from the
 * lifecycle cron.
 */
export async function purgeSendLogPii(
  now: Date = new Date(),
  retentionDays: number = SEND_LOG_RETENTION_DAYS,
): Promise<number> {
  const cutoff = retentionCutoff(now, retentionDays);
  const res = await prisma.whatsAppSendLog.updateMany({
    where: {
      sentAt: { lt: cutoff },
      OR: [{ toNumber: { not: "" } }, { failedDetail: { not: null } }],
    },
    data: { toNumber: "", failedDetail: null },
  });
  return res.count;
}
