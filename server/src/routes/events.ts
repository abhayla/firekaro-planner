import { Hono } from "hono";
import { z } from "zod";
import { auth } from "../lib/auth";
import { apiSuccess, apiError, ErrorCode } from "../lib/api-utils";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { rateLimit } from "../middleware/rate-limit";

/**
 * POST /api/events — #44, the five funnel counters.
 *
 * DELIBERATELY OUTSIDE authMiddleware: the first two events (`quick_opened`, `quick_completed`)
 * happen on the PUBLIC /quick route (#187), where there is no session by definition. That makes
 * this the only unauthenticated write surface in the app, so it is fenced three ways:
 *   1. a per-IP token bucket (30/min) — the abuse ceiling;
 *   2. a Zod body that accepts NOTHING but an enum event + a bounded anonId (no free-text, no PII);
 *   3. an event allow-list per auth state — the three post-signup events are REFUSED without a
 *      session, and their userId comes from the session, NEVER from the body.
 *
 * The worst a flooder can do is insert junk rows under their own anonId; they cannot attribute an
 * event to somebody else's account, and they cannot write a field the funnel report does not read.
 */

/** Events a visitor with no session may report. */
const ANONYMOUS_EVENTS = ["quick_opened", "quick_completed"] as const;
/** Events that REQUIRE a session — the row carries the session's userId. */
const AUTHED_EVENTS = ["signed_up", "returned_7d", "data_refreshed"] as const;

export const activationEventSchema = z.object({
  event: z.enum([...ANONYMOUS_EVENTS, ...AUTHED_EVENTS]),
  /** The browser-minted uuid. Bounded so a flooder cannot store arbitrary blobs. */
  anonId: z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/),
});

export type ActivationEventBody = z.infer<typeof activationEventSchema>;

/** True when this event may be reported without a session. */
export function isAnonymousEvent(event: ActivationEventBody["event"]): boolean {
  return (ANONYMOUS_EVENTS as readonly string[]).includes(event);
}

const app = new Hono();

// The abuse ceiling for the only unauthenticated write surface in the app. 30/min per IP is far
// above the ~2 events a real visitor emits per /quick run, and far below anything that could load
// the Supabase session pooler.
app.use("*", rateLimit({ windowMs: 60_000, max: 30, prefix: "events" }));

app.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return apiError(c, "Invalid JSON body", 400, ErrorCode.VALIDATION_ERROR);
  }
  const parsed = activationEventSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(c, `Invalid event: ${parsed.error.message}`, 422, ErrorCode.VALIDATION_ERROR);
  }
  const { event, anonId } = parsed.data;

  // userId comes from the session ONLY — never from the body (the same invariant planner.ts holds).
  let userId: string | null = null;
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    userId = session?.user?.id ?? null;
  } catch (err) {
    logger.warn({ err }, "POST /events — session lookup failed; treating as anonymous");
  }

  if (!userId && !isAnonymousEvent(event)) {
    return apiError(c, `Event "${event}" requires a session`, 401, ErrorCode.UNAUTHORIZED);
  }

  try {
    await prisma.activationEvent.create({ data: { event, anonId, userId } });
    return apiSuccess(c, { recorded: true }, 201);
  } catch (err) {
    // A counter must NEVER break the page it is counting. The row is lost, the log line is not.
    logger.error({ err, event }, "POST /events — failed to record activation event");
    return apiError(c, "Failed to record event", 500, ErrorCode.INTERNAL_ERROR);
  }
});

export default app;
