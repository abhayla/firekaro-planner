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

/** Hard ceiling on the store so an attacker rotating spoofed keys cannot grow
 *  it without bound. Cheap sweep-on-write keeps memory near the live working
 *  set (§ evictExpired) — this cap is the backstop for whatever survives a
 *  sweep because its window hasn't lapsed yet. */
const MAX_STORE_SIZE = 10_000;

/**
 * Number of proxy hops between the client and this process that we TRUST to
 * have appended (not merely forwarded) the real IP — i.e. hops WE control.
 * Deploy topology (docs/DEPLOY.md, CLAUDE.md): Cloudflare edge TLS -> nginx ->
 * node = 2 trusted hops. nginx sets X-Forwarded-For via $proxy_add_x_forwarded_for,
 * which APPENDS the peer it saw (Cloudflare's connecting IP) to whatever the
 * client sent — so the header is `<attacker-controlled...>, <cloudflare-ip>`
 * after nginx, and Cloudflare in turn appends the real visitor IP before that.
 * The client fully controls every hop EXCEPT the last two, so we must key on
 * one of the trusted hops from the right end, never the first.
 * Override via env for local/staging topologies with a different proxy count.
 */
const TRUSTED_PROXY_HOPS = Number(process.env.TRUSTED_PROXY_HOPS ?? 2);

/** Client key derived from a TRUSTED hop of X-Forwarded-For (counted from the
 *  right, since only the hops appended by our own proxies are trustworthy —
 *  the client fully controls everything before them). Falls back to other
 *  proxy-set headers, then a fixed bucket, when the header is absent (e.g. a
 *  direct connection in dev, or a differently-shaped proxy chain). */
function clientKey(c: Context): string {
  const xff = c.req.header("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((h) => h.trim()).filter(Boolean);
    if (hops.length > 0) {
      // Hop N-from-the-end, clamped so a short/malformed chain can't underflow.
      const index = Math.max(0, hops.length - TRUSTED_PROXY_HOPS);
      return hops[index]!;
    }
  }
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-real-ip") ?? "unknown";
}

export function rateLimit(opts: RateLimitOptions) {
  const { windowMs, max, prefix } = opts;
  const store = new Map<string, Bucket>();

  /** Drop expired buckets before growing the store — keeps memory bounded by
   *  the live working set rather than by every key ever seen. */
  function evictExpired(now: number) {
    for (const [k, b] of store) {
      if (now >= b.resetAt) store.delete(k);
    }
  }

  const rateLimitMiddleware = async function rateLimitMiddleware(c: Context, next: Next) {
    const now = Date.now();
    const key = `${prefix}:${clientKey(c)}`;

    let bucket = store.get(key);
    if (!bucket || now >= bucket.resetAt) {
      if (!store.has(key) && store.size >= MAX_STORE_SIZE) {
        evictExpired(now);
      }
      bucket = { count: 0, resetAt: now + windowMs };
      // Still full after evicting expired entries: a hostile burst of distinct
      // spoofed/never-expiring keys. Refuse to grow further rather than let
      // memory climb unbounded — the oldest live bucket is dropped to make room
      // (approximate LRU: cheap, bounded, and never blocks a legitimate client
      // from getting a bucket at all).
      if (!store.has(key) && store.size >= MAX_STORE_SIZE) {
        const oldestKey = store.keys().next().value;
        if (oldestKey !== undefined) store.delete(oldestKey);
      }
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

  // Test-only introspection hook (no production caller references it) so the
  // store-cap invariant can be asserted directly instead of only inferred
  // behaviourally. Harmless in prod: an unused property on the closure.
  (rateLimitMiddleware as unknown as { __storeSizeForTest: () => number }).__storeSizeForTest = () =>
    store.size;

  return rateLimitMiddleware;
}
