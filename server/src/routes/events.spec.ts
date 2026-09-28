import { describe, it, expect, vi, beforeEach } from "vitest";
import { activationEventSchema, isAnonymousEvent } from "./events";

/**
 * #44 — the unauthenticated write surface's two guards: the Zod body and the per-IP bucket.
 *
 * No DB here. The body schema and the rate limiter are the whole attack surface of POST /api/events,
 * so both are tested directly against real inputs; the DB write itself is one prisma.create call
 * covered by the funnel-report script's live run.
 */
describe("POST /api/events — body validation (#44)", () => {
  const anonId = "9f2c1b4e-0a7d-4c1a-9e33-2b6d5f1c8a90";

  it("accepts each of the five events with a valid anonId", () => {
    for (const event of [
      "quick_opened",
      "quick_completed",
      "signed_up",
      "returned_7d",
      "data_refreshed",
    ]) {
      expect(activationEventSchema.safeParse({ event, anonId }).success, event).toBe(true);
    }
  });

  it("rejects an unknown event name", () => {
    expect(activationEventSchema.safeParse({ event: "bought_premium", anonId }).success).toBe(false);
  });

  it("rejects a missing, short, oversized, or non-url-safe anonId", () => {
    expect(activationEventSchema.safeParse({ event: "quick_opened" }).success).toBe(false);
    expect(activationEventSchema.safeParse({ event: "quick_opened", anonId: "abc" }).success).toBe(false);
    expect(
      activationEventSchema.safeParse({ event: "quick_opened", anonId: "a".repeat(65) }).success,
    ).toBe(false);
    // No free-text: a would-be PII smuggler cannot store an email in the anonId column.
    expect(
      activationEventSchema.safeParse({ event: "quick_opened", anonId: "abhay@example.com" }).success,
    ).toBe(false);
  });

  it("strips any extra field a caller tries to smuggle in (no userId from the body)", () => {
    const parsed = activationEventSchema.safeParse({
      event: "quick_opened",
      anonId,
      userId: "someone-elses-user-id",
      note: "<script>",
    });
    expect(parsed.success).toBe(true);
    expect(Object.keys(parsed.success ? parsed.data : {}).sort()).toEqual(["anonId", "event"]);
  });

  it("splits the events into the anonymous two and the session-required three", () => {
    expect(isAnonymousEvent("quick_opened")).toBe(true);
    expect(isAnonymousEvent("quick_completed")).toBe(true);
    for (const e of ["signed_up", "returned_7d", "data_refreshed"] as const) {
      expect(isAnonymousEvent(e), e).toBe(false);
    }
  });
});

describe("POST /api/events — per-IP rate limit (#44 review MAJOR 2)", () => {
  beforeEach(() => vi.useRealTimers());

  /** Build the X-Forwarded-For chain node actually receives for a real
   *  client -> Cloudflare -> nginx -> node request:
   *    `<whatever the client claimed>, <IP Cloudflare saw>, <IP nginx saw>`
   *  Cloudflare and nginx each APPEND the peer they saw (never trust what's
   *  already in the header) — so with TRUSTED_PROXY_HOPS=2, the real visitor
   *  IP is the 2nd-from-last hop ("IP Cloudflare saw"); the last hop is just
   *  Cloudflare's own edge IP (same for ~every request, useless as a key);
   *  anything before that is fully client-controlled. `cloudflareEdgeIp` is
   *  fixed because it plays no role in keying — only realVisitorIp does. */
  const cloudflareEdgeIp = "172.70.1.1";
  function xffChain(claimedFirstHop: string, realVisitorIp: string): string {
    return `${claimedFirstHop}, ${realVisitorIp}, ${cloudflareEdgeIp}`;
  }

  async function call(mw: ReturnType<typeof import("../middleware/rate-limit").rateLimit>, xff: string) {
    let nextCalled = false;
    const res = await mw(
      {
        req: { header: (h: string) => (h === "x-forwarded-for" ? xff : undefined) },
        header: () => undefined,
        json: (_b: unknown, status: number) => ({ status }),
      } as never,
      async () => {
        nextCalled = true;
      },
    );
    return nextCalled ? 200 : ((res as { status: number } | undefined)?.status ?? 0);
  }

  it("lets the first 30 requests from one real visitor through and 429s the 31st", async () => {
    vi.resetModules();
    const { rateLimit } = await import("../middleware/rate-limit");
    const mw = rateLimit({ windowMs: 60_000, max: 30, prefix: "events-spec" });
    const statuses: number[] = [];
    for (let i = 0; i < 32; i++) {
      statuses.push(await call(mw, xffChain("203.0.113.9", "198.51.100.50")));
    }
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
    expect(statuses[31]).toBe(429);
  });

  it("keeps a second real visitor's budget independent", async () => {
    vi.resetModules();
    const { rateLimit } = await import("../middleware/rate-limit");
    const mw = rateLimit({ windowMs: 60_000, max: 30, prefix: "events-spec2" });
    for (let i = 0; i < 31; i++) await call(mw, xffChain("198.51.100.1", "198.51.100.1"));
    expect(await call(mw, xffChain("198.51.100.1", "198.51.100.1"))).toBe(429);
    expect(await call(mw, xffChain("198.51.100.1", "198.51.100.2"))).toBe(200);
  });

  // review MAJOR 2, RCA: the middleware keyed on the FIRST X-Forwarded-For hop,
  // which the CLIENT writes and nginx only APPENDS to — so a single attacker
  // sending a different spoofed first hop on every request got a fresh bucket
  // every time and the 30/min ceiling never engaged. Proof: 31 requests from
  // ONE real socket (fixed trusted hop), each with a distinct spoofed first
  // hop, must land in ONE bucket and the 31st must be 429.
  it("closes the spoofed-first-hop bypass: one real visitor cannot get infinite buckets by varying the claimed IP", async () => {
    vi.resetModules();
    const { rateLimit } = await import("../middleware/rate-limit");
    const mw = rateLimit({ windowMs: 60_000, max: 30, prefix: "events-spec-bypass" });
    const realVisitorIp = "198.51.100.77"; // the hop nginx itself appends — not client-controlled
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      // A different spoofed first hop on every single request.
      statuses.push(await call(mw, xffChain(`10.${i}.${i}.${i}`, realVisitorIp)));
    }
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
  });

  it("keys on the trusted hop even when the client sends only ONE hop (no proxy chain at all)", async () => {
    vi.resetModules();
    const { rateLimit } = await import("../middleware/rate-limit");
    const mw = rateLimit({ windowMs: 60_000, max: 2, prefix: "events-spec-shortchain" });
    // A malformed/short chain (no comma) must not throw or silently bypass the cap.
    expect(await call(mw, "203.0.113.5")).toBe(200);
    expect(await call(mw, "203.0.113.5")).toBe(200);
    expect(await call(mw, "203.0.113.5")).toBe(429);
  });

  it("bounds the store size under a flood of distinct spoofed hops (never grows unbounded)", async () => {
    vi.resetModules();
    const { rateLimit } = await import("../middleware/rate-limit");
    const mw = rateLimit({ windowMs: 60_000, max: 30, prefix: "events-spec-cap" });
    // 10,000 distinct REAL-hop values (the trusted, non-spoofable position) — an attacker
    // flooding with unique trusted-hop values (e.g. a botnet, or IPv6 rotation) must not
    // grow the store past its cap.
    for (let i = 0; i < 10_000; i++) {
      await call(mw, xffChain("198.51.100.1", `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`));
    }
    const internals = mw as unknown as { __storeSizeForTest: () => number };
    expect(internals.__storeSizeForTest()).toBeLessThanOrEqual(10_000);
    // Behavioural proof too: one more distinct key must still be served, not crash.
    expect(await call(mw, xffChain("198.51.100.1", "203.0.113.200"))).toBe(200);
  });
});
