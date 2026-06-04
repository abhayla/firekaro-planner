import { Hono } from "hono";
import { timingSafeEqual } from "node:crypto";
import { apiSuccess, apiError, ErrorCode } from "../lib/api-utils";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";

/** Constant-time token compare (guards length first — timingSafeEqual throws on a
 * length mismatch). Mirrors the helper in lifecycle-internal.ts; duplicated rather
 * than shared to keep this prod-smoke route decoupled from the comms-critical
 * lifecycle route (only two call sites — under the rule-of-three for extraction). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Post-deploy production SMOKE endpoint (Tier 1 — testing-strategy.md). After a
 * deploy, a token-guarded GET proves the live app can run a real ORM query through
 * the Supabase pooler — richer than /api/health's raw `SELECT 1`, because it
 * exercises the generated Prisma client against a real table and so catches
 * "prisma generate didn't run", "a migration left the schema broken", or "the User
 * table is missing". Guarded by SMOKE_TOKEN via the x-smoke-token header (NOT a user
 * session) so it is mounted OUTSIDE authMiddleware, like the lifecycle scheduler.
 * Read-only — it never writes, so it is safe against live multi-tenant data; a
 * write->read->delete probe via a dedicated probe table is a documented future
 * upgrade if the read-only check ever proves insufficient.
 *
 * Smoke test (post-deploy):
 *   curl -H "x-smoke-token: $SMOKE_TOKEN" https://firekaro.com/api/internal/smoke
 */

const app = new Hono();

app.get("/smoke", async (c) => {
  const token = process.env.SMOKE_TOKEN;
  if (!token) {
    // Fail-closed: an unconfigured smoke endpoint reports disabled (500), never runs
    // unguarded. SMOKE_TOKEN unset is the normal state in dev/test (mirrors lifecycle).
    return apiError(c, "Smoke endpoint not configured", 500, ErrorCode.INTERNAL_ERROR);
  }
  if (!safeEqual(c.req.header("x-smoke-token") ?? "", token)) {
    return apiError(c, "Unauthorized", 401, ErrorCode.UNAUTHORIZED);
  }

  const startedAt = Date.now();
  try {
    const count = await prisma.user.count();
    const ms = Date.now() - startedAt;
    logger.info({ probe: "user.count", count, ms }, "prod smoke ok");
    return apiSuccess(c, { ok: true, database: "connected", probe: "user.count", count, ms });
  } catch (e) {
    const ms = Date.now() - startedAt;
    logger.error({ err: e instanceof Error ? e.message : String(e), ms }, "prod smoke failed");
    return apiError(c, "Smoke probe failed: database unreachable", 500, ErrorCode.INTERNAL_ERROR);
  }
});

export default app;
