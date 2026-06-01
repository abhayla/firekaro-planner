import type { Context, Next } from "hono";
import { apiError, ErrorCode } from "../lib/api-utils";

/**
 * In-memory tiered rate limiter (rules/rate-limiting-middleware.md). Suitable
 * for the single-node Hostinger deployment. If FireKaro ever runs behind more
 * than one backend process, swap the Map for Redis or an equivalent shared
 * store — otherwise an attacker can round-robin across nodes to bypass limits.
 *
 * Each `rateLimit({...})` call closes over its OWN store, so distinct tiers
 * (auth vs general) keep separate buckets and tests stay isolated.
 */

interface RateLimitOptions {
  /** Sliding window length in milliseconds. */
  windowMs: number;
  /** Max requests per client per window. This is the FINAL cap — callers do the
   *  dev-vs-prod relaxation when constructing (rules: gate relaxation on env). */
  max: number;
  /** Bucket prefix so multiple limiters never collide in the same store. */
  prefix: string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/** Best-effort client key. Trusts the first X-Forwarded-For hop (nginx sets it
 *  on the VPS); falls back to other proxy headers, then a fixed bucket. */
function clientKey(c: Context): string {
  const xff = c.req.header("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-real-ip") ?? "unknown";
}

export function rateLimit(opts: RateLimitOptions) {
  const { windowMs, max, prefix } = opts;
  const store = new Map<string, Bucket>();

  return async function rateLimitMiddleware(c: Context, next: Next) {
    const now = Date.now();
    const key = `${prefix}:${clientKey(c)}`;

    let bucket = store.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      store.set(key, bucket);
    }
    bucket.count += 1;

    const remaining = Math.max(0, max - bucket.count);
    c.header("X-RateLimit-Limit", String(max));
    c.header("X-RateLimit-Remaining", String(remaining));

    if (bucket.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      c.header("Retry-After", String(retryAfterSec));
      return apiError(c, "Too many requests — slow down and try again later.", 429, ErrorCode.RATE_LIMITED);
    }

    await next();
  };
}
