import { Hono } from "hono";
import { timingSafeEqual } from "node:crypto";
import { apiSuccess, apiError, ErrorCode } from "../lib/api-utils";
import { logger } from "../lib/logger";
import { runLifecycle } from "../lib/lifecycle-runner";

/** Constant-time equality (guards length first — timingSafeEqual throws on a mismatch). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Internal lifecycle scheduler endpoint (D5). A daily VPS cron POSTs here to run
 * the lifecycle evaluator over every consenting user. Guarded by a shared secret
 * (LIFECYCLE_RUN_TOKEN via the x-internal-token header) — NOT a user session, so it
 * is mounted OUTSIDE authMiddleware, like the Wati webhook. Using an HTTP endpoint
 * (not an in-process setInterval) keeps it restart-safe, manually triggerable, and
 * observable in the request log.
 *
 * Manual trigger:
 *   curl -X POST -H "x-internal-token: $LIFECYCLE_RUN_TOKEN" \
 *     http://localhost:3100/api/internal/lifecycle/run
 */

const app = new Hono();

app.post("/lifecycle/run", async (c) => {
  const token = process.env.LIFECYCLE_RUN_TOKEN;
  if (!token) {
    // Fail-closed: an unconfigured runner refuses rather than running unguarded.
    return apiError(c, "Lifecycle runner not configured", 500, ErrorCode.INTERNAL_ERROR);
  }
  if (!safeEqual(c.req.header("x-internal-token") ?? "", token)) {
    return apiError(c, "Unauthorized", 401, ErrorCode.UNAUTHORIZED);
  }
  try {
    const result = await runLifecycle();
    logger.info({ result }, "lifecycle endpoint run complete");
    return apiSuccess(c, result);
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : String(e) }, "lifecycle run failed");
    return apiError(c, "Lifecycle run failed", 500, ErrorCode.INTERNAL_ERROR);
  }
});

export default app;
