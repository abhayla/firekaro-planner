import type { Context, Next } from "hono";
import { randomUUID } from "node:crypto";

/**
 * Attaches a per-request correlation id (`traceId`) to the Hono context and
 * echoes it back as `x-trace-id` (rules/structured-logging.md). The global
 * onError handler logs it so a client-reported failure can be traced to its
 * server log line. Honours an inbound `x-trace-id` if a proxy already set one.
 */

declare module "hono" {
  interface ContextVariableMap {
    traceId: string;
  }
}

export async function requestId(c: Context, next: Next) {
  const incoming = c.req.header("x-trace-id");
  const traceId = incoming && incoming.length <= 100 ? incoming : randomUUID();
  c.set("traceId", traceId);
  c.header("x-trace-id", traceId);
  await next();
}
