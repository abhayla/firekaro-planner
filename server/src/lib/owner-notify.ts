import { logger } from "./logger";

/**
 * Fire-and-forget owner alerting → the Notifier gateway (separate service,
 * github.com/abhayla/Notifier). This is a DETECTOR client: FireKaro calls
 * notifyOwner() at events worth telling Abhay about; Notifier routes them to
 * Telegram/WhatsApp/email per its own config.
 *
 * NON-BREAKING BY CONSTRUCTION:
 *  - no-op when NOTIFIER_URL / NOTIFIER_KEY are unset (dev, test, or before the
 *    env lands on the VPS) — so nothing changes for local/CI runs.
 *  - fire-and-forget with a 2s timeout: never awaited in a request's critical
 *    path, never throws. A dead/slow Notifier can NEVER break FireKaro.
 */
export type OwnerSeverity = "P0" | "P1" | "P2" | "info";

export function notifyOwner(
  severity: OwnerSeverity,
  title: string,
  opts: { body?: string; type?: string; dedupeKey?: string } = {},
): void {
  const url = process.env.NOTIFIER_URL;
  const key = process.env.NOTIFIER_KEY;
  if (!url || !key) return; // not configured → silent no-op

  void (async () => {
    try {
      await fetch(`${url.replace(/\/$/, "")}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": key },
        body: JSON.stringify({
          project: "firekaro",
          severity,
          title,
          body: opts.body,
          type: opts.type,
          dedupeKey: opts.dedupeKey,
        }),
        signal: AbortSignal.timeout(2000),
      });
    } catch (err) {
      // Owner-alerting must never disturb the host app — log at debug and move on.
      logger.debug({ err: err instanceof Error ? err.message : String(err) }, "notifyOwner failed (non-fatal)");
    }
  })();
}
