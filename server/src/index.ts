import "dotenv/config";
import { validateEnv } from "./lib/validate-env";
validateEnv();

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { pinoLogger } from "hono-pino";
import { logger } from "./lib/logger";
import { auth } from "./lib/auth";
import { apiSuccess, apiError, ErrorCode } from "./lib/api-utils";
import { prisma } from "./lib/prisma";
import { requestId } from "./middleware/request-id";
import { rateLimit } from "./middleware/rate-limit";
import { notifyOwner } from "./lib/owner-notify";
import plannerRoutes from "./routes/planner";
import whatsappWebhookRoutes from "./routes/whatsapp-webhook";
import commsConsentRoutes from "./routes/comms-consent-route";
import lifecycleInternalRoutes from "./routes/lifecycle-internal";
import smokeInternalRoutes from "./routes/smoke-internal";

/**
 * v6 backend entry — Hono app for the mvp/ FIRE Planner. Structure copy-adapted
 * from the root app's server/index.ts (read-only salvage reference).
 */

const app = new Hono();
const isProduction = process.env.NODE_ENV === "production";

app.use("*", requestId);
app.use("*", pinoLogger({ pino: logger }));
app.use("*", secureHeaders());
// Cap request bodies (the largest legitimate payload is a full Household doc).
app.use("*", bodyLimit({ maxSize: 1024 * 1024 })); // 1 MB

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:5175"];

app.use("*", cors({ origin: allowedOrigins, credentials: true }));

// Convert any uncaught error to the standard envelope, tagged with the traceId
// so a client-reported failure maps to a server log line. Routes still own
// their own try/catch; this is the backstop for throws outside them
// (middleware, the Better Auth handler, body-limit overflow).
app.onError((err, c) => {
  const traceId = c.get("traceId");
  logger.error({ err, traceId, path: c.req.path }, "Unhandled error");
  // Owner alert (fire-and-forget; deduped per path so a hot loop pages once / 30 min).
  notifyOwner("P1", "Unhandled 5xx error", {
    type: "error",
    body: `${c.req.method} ${c.req.path} — ${String(err instanceof Error ? err.message : err).slice(0, 300)}`,
    dedupeKey: `5xx:${c.req.path}`,
  });
  return apiError(c, "Internal server error", 500, ErrorCode.INTERNAL_ERROR);
});

// Rate-limit auth endpoints (brute-force / OAuth abuse). Tightened in prod;
// relaxed in dev/test so the E2E suite isn't throttled. Single-node store —
// see rate-limit.ts for the multi-node caveat.
const authMax = isProduction ? 20 : 2000;
app.use("/api/auth/*", rateLimit({ windowMs: 60_000, max: authMax, prefix: "auth" }));

// Health check with DB connectivity probe.
app.get("/api/health", async (c) => {
  const health: Record<string, unknown> = {
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: isProduction ? "production" : "development",
  };
  try {
    await prisma.$queryRaw`SELECT 1`;
    health.database = "connected";
  } catch {
    health.status = "degraded";
    health.database = "disconnected";
    // P0: the DB is unreachable — every write is failing. Deduped so the
    // monitor polling /api/health pages once, not on every probe.
    notifyOwner("P0", "Database unreachable", {
      type: "error",
      body: "GET /api/health — prisma SELECT 1 failed (pool exhausted or DB down)",
      dedupeKey: "db-unreachable",
    });
  }
  if (health.status !== "ok") {
    // eslint-disable-next-line no-restricted-syntax -- 503 is outside apiError's status union and the health payload must ride in `data` (not the error envelope) so probes get the detail.
    return c.json({ success: false, data: health }, 503);
  }
  return apiSuccess(c, health);
});

// Better Auth — handles /api/auth/*.
app.all("/api/auth/*", (c) => auth.handler(c.req.raw));

// The planner document endpoints.
app.route("/api/planner", plannerRoutes);

// Wati delivery webhooks (no auth — external caller; optional shared-secret).
app.route("/api/webhooks", whatsappWebhookRoutes);

// DPDP consent surface (session-authed).
app.route("/api/comms", commsConsentRoutes);

// Internal scheduler endpoint for the lifecycle evaluator (token-guarded, no
// session — a daily VPS cron POSTs here). Mounted outside authMiddleware.
// Rate-limited (gh-issue #10): a leaked LIFECYCLE_RUN_TOKEN must not allow an
// unthrottled loop to exhaust the Supabase session pooler (DoS) — the token guard
// is entry control, this is the abuse ceiling. max:5/min leaves room for a manual
// re-trigger + retries alongside the daily cron.
app.use("/api/internal/*", rateLimit({ windowMs: 60_000, max: 5, prefix: "lifecycle" }));
app.route("/api/internal", lifecycleInternalRoutes);
// Post-deploy production smoke (testing-strategy.md, Tier 1) — GET /api/internal/smoke,
// token-guarded by SMOKE_TOKEN. Same outside-auth + rate-limited mount as the scheduler.
app.route("/api/internal", smokeInternalRoutes);

export { app };

// Only listen when run directly (not when imported by tests).
const port = Number(process.env.PORT ?? 3100);
if (process.env.NODE_ENV !== "test") {
  serve({ fetch: app.fetch, port }, (info) => {
    logger.info({ port: info.port }, "firekaro_v6 backend listening");
  });
}
