import { Hono } from "hono";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { apiSuccess, apiError, ErrorCode } from "../lib/api-utils";
import { prisma } from "../lib/prisma";
import { normalizeWhatsAppNumber } from "../lib/wati-client";
import { maybeSendWelcome } from "../lib/comms-signup";
import { logger } from "../lib/logger";

/**
 * /api/comms/consent — the DPDP consent surface the preference centre + onboarding
 * write to. GET lists the signed-in user's per-channel consent; PUT upserts it
 * (opt-in / opt-out). userId comes from the session, never the body (like planner).
 */

const app = new Hono();
app.use("*", authMiddleware);

const consentSchema = z.object({
  channel: z.enum(["whatsapp", "email"]),
  marketingOptIn: z.boolean(),
  revoked: z.boolean().optional(),
  // Optional recipient number (digits-only after normalize). Present ⇒ set/clear;
  // absent ⇒ leave the stored number untouched (e.g. a marketing-only toggle).
  whatsappNumber: z.string().optional(),
});

interface ConsentDto {
  channel: string;
  marketingOptIn: boolean;
  revokedAt: string | null;
  whatsappNumber: string | null;
}
const toDto = (r: {
  channel: string;
  marketingOptIn: boolean;
  revokedAt: Date | null;
  whatsappNumber: string | null;
}): ConsentDto => ({
  channel: r.channel,
  marketingOptIn: r.marketingOptIn,
  revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
  whatsappNumber: r.whatsappNumber ?? null,
});

app.get("/consent", async (c) => {
  const userId = c.get("userId");
  const rows = await prisma.commsConsent.findMany({ where: { userId } });
  return apiSuccess(c, rows.map(toDto));
});

app.put("/consent", async (c) => {
  const userId = c.get("userId");
  const parsed = consentSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiError(c, "Invalid consent payload", 400, ErrorCode.VALIDATION_ERROR);
  }
  const { channel, marketingOptIn, revoked, whatsappNumber } = parsed.data;
  const revokedAt = revoked ? new Date() : null;

  // Number is set/cleared ONLY when the key is present (absent ⇒ leave untouched).
  // Empty after normalize ⇒ explicit clear (null).
  const numberPatch: { whatsappNumber?: string | null } = {};
  if (whatsappNumber !== undefined) {
    const n = normalizeWhatsAppNumber(whatsappNumber);
    numberPatch.whatsappNumber = n.length ? n : null;
  }

  const row = await prisma.commsConsent.upsert({
    where: { userId_channel: { userId, channel } },
    create: { userId, channel, marketingOptIn, revokedAt, ...numberPatch },
    update: { marketingOptIn, revokedAt, ...numberPatch },
  });

  // D3 — fire the welcome the FIRST time a number is saved with un-revoked consent
  // on the whatsapp channel. Best-effort: a Wati hiccup must not fail the save.
  if (channel === "whatsapp") {
    try {
      const user = c.get("user") as { name?: string | null } | undefined;
      const firstName = (user?.name ?? "").trim().split(/\s+/)[0] || "there";
      const res = await maybeSendWelcome({
        userId,
        whatsappNumber: row.whatsappNumber,
        revoked: !!row.revokedAt,
        firstName,
      });
      if (res.fired) logger.info({ userId }, "welcome WhatsApp fired on consent save");
    } catch (e) {
      logger.warn({ err: e instanceof Error ? e.message : String(e), userId }, "welcome send failed");
    }
  }

  return apiSuccess(c, toDto(row));
});

export default app;
