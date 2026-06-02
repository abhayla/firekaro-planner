import { Hono } from "hono";
import { apiSuccess, apiError, ErrorCode } from "../lib/api-utils";
import { logger } from "../lib/logger";
import { linkProviderMessageId, updateStatusByProviderId } from "../lib/comms-repo";

/**
 * Wati delivery webhooks — captures the ASYNC status the HTTP 200 hides
 * (template-message sent/delivered/read/failed) into WhatsAppSendLog. This is how
 * "200 != delivered" becomes a real recorded status. Unauthenticated by transport
 * (external caller); optionally gated by a shared secret if WATI_WEBHOOK_SECRET is
 * set (?token=...). NOT behind authMiddleware — Wati has no session.
 */

const app = new Hono();

function mapStatus(raw: string): string | null {
  const s = raw.toLowerCase();
  if (s.includes("deliver")) return "DELIVERED";
  if (s.includes("read")) return "READ";
  if (s.includes("fail")) return "FAILED";
  if (s.includes("sent")) return "SENT";
  return null;
}

app.post("/wati", async (c) => {
  const secret = process.env.WATI_WEBHOOK_SECRET;
  if (secret && c.req.query("token") !== secret) {
    return apiError(c, "Unauthorized webhook", 401, ErrorCode.UNAUTHORIZED);
  }

  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return apiError(c, "Invalid JSON", 400, ErrorCode.VALIDATION_ERROR);
  }

  // Wati event correlation: the templateMessageSent_v2 event carries waId +
  // templateName + whatsappMessageId; DELIVERED/READ/FAILED carry ONLY the
  // whatsappMessageId. So: on "sent" link the id to our row; on the rest, match by id.
  const status = mapStatus(String(body.eventType ?? body.type ?? body.statusString ?? ""));
  const wamid = String(body.whatsappMessageId ?? "");
  const waId = String(body.waId ?? body.whatsappNumber ?? body.number ?? "").replace(/\D/g, "");
  const template = String(body.templateName ?? body.elementName ?? "");

  try {
    if (status === "SENT" && wamid && waId && template) {
      await linkProviderMessageId({ toNumber: waId, templateName: template, providerMessageId: wamid });
    } else if (wamid && status) {
      await updateStatusByProviderId({
        providerMessageId: wamid,
        status,
        failedDetail: body.failedDetail ? String(body.failedDetail) : null,
      });
    }
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : String(e) }, "webhook status update failed");
  }

  // Always 200 so Wati does not retry-storm on a payload we don't recognize.
  return apiSuccess(c, { received: true });
});

export default app;
