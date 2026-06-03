/**
 * Send-log PII retention (DPDP data-minimization, gh-issue #10).
 *
 * `whatsapp_send_log` stores recipient PII in TWO columns: `toNumber` (the phone
 * number, plaintext + indexed) and `failedDetail` (provider-controlled Wati error
 * text, which routinely echoes the recipient number — e.g. "9179… is not a valid
 * WhatsApp contact"). India's DPDP Act requires data minimization: we KEEP the row
 * (template / status / timestamp are useful, non-PII analytics) but clear BOTH PII
 * fields once the row is older than the retention window. The per-row decision
 * lives here as a pure function; the DB executor (`comms-repo.purgeSendLogPii`)
 * mirrors it as one atomic `updateMany`.
 */

export const SEND_LOG_RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The timestamp before which a send-log row's recipient PII may be purged. */
export function retentionCutoff(now: Date, retentionDays: number = SEND_LOG_RETENTION_DAYS): Date {
  return new Date(now.getTime() - retentionDays * DAY_MS);
}

/**
 * True when a send-log row's recipient PII should be purged: STRICTLY older than
 * the retention window AND still carrying PII in EITHER field. The "still carrying
 * PII" guard (toNumber non-blank OR failedDetail non-null) is what makes a re-run
 * a no-op — once both are cleared, the row is never re-selected. Both fields must
 * be considered or a FAILED row keeps the number in `failedDetail` forever.
 */
export function shouldPurgeSendLogPii(
  row: { sentAt: Date; toNumber: string; failedDetail?: string | null },
  now: Date,
  retentionDays: number = SEND_LOG_RETENTION_DAYS,
): boolean {
  const stillHasPii = !!row.toNumber || row.failedDetail != null;
  if (!stillHasPii) return false; // already purged (or never had PII) → no-op on re-run
  return row.sentAt.getTime() < retentionCutoff(now, retentionDays).getTime();
}
