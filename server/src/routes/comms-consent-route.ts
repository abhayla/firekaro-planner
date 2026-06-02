import { Hono } from "hono";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { apiSuccess, apiError, ErrorCode } from "../lib/api-utils";
import { prisma } from "../lib/prisma";

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
});

interface ConsentDto {
  channel: string;
  marketingOptIn: boolean;
  revokedAt: string | null;
}
const toDto = (r: { channel: string; marketingOptIn: boolean; revokedAt: Date | null }): ConsentDto => ({
  channel: r.channel,
  marketingOptIn: r.marketingOptIn,
  revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
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
  const { channel, marketingOptIn, revoked } = parsed.data;
  const revokedAt = revoked ? new Date() : null;
  const row = await prisma.commsConsent.upsert({
    where: { userId_channel: { userId, channel } },
    create: { userId, channel, marketingOptIn, revokedAt },
    update: { marketingOptIn, revokedAt },
  });
  return apiSuccess(c, toDto(row));
});

export default app;
