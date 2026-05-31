import "dotenv/config";
import { validateEnv } from "./lib/validate-env";
validateEnv();

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { pinoLogger } from "hono-pino";
import { logger } from "./lib/logger";
import { auth } from "./lib/auth";
import { apiSuccess } from "./lib/api-utils";
import { prisma } from "./lib/prisma";
import plannerRoutes from "./routes/planner";

/**
 * v6 backend entry — Hono app for the mvp/ FIRE Planner. Structure copy-adapted
 * from the root app's server/index.ts (read-only salvage reference).
 */

const app = new Hono();
const isProduction = process.env.NODE_ENV === "production";

app.use("*", pinoLogger({ pino: logger }));
app.use("*", secureHeaders());

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:5175"];

app.use("*", cors({ origin: allowedOrigins, credentials: true }));

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
  }
  if (health.status !== "ok") {
    return c.json({ success: false, data: health }, 503);
  }
  return apiSuccess(c, health);
});

// Better Auth — handles /api/auth/*.
app.all("/api/auth/*", (c) => auth.handler(c.req.raw));

// The planner document endpoints.
app.route("/api/planner", plannerRoutes);

export { app };

// Only listen when run directly (not when imported by tests).
const port = Number(process.env.PORT ?? 3100);
if (process.env.NODE_ENV !== "test") {
  serve({ fetch: app.fetch, port }, (info) => {
    logger.info({ port: info.port }, "firekaro_v6 backend listening");
  });
}
