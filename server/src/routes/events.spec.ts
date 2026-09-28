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

describe("POST /api/events — per-IP rate limit (#44)", () => {
  beforeEach(() => vi.useRealTimers());

  async function hammer(times: number) {
    // Import fresh so the limiter's Map starts empty for this scenario.
    vi.resetModules();
    const { rateLimit } = await import("../middleware/rate-limit");
    const mw = rateLimit({ windowMs: 60_000, max: 30, prefix: "events-spec" });
    const statuses: number[] = [];
    for (let i = 0; i < times; i++) {
      const headers = new Map([["x-forwarded-for", "203.0.113.9"]]);
      let nextCalled = false;
      const res = await mw(
        {
          req: { header: (h: string) => headers.get(h) },
          header: () => undefined,
          json: (_body: unknown, status: number) => ({ status }),
        } as never,
        async () => {
          nextCalled = true;
        },
      );
      statuses.push(nextCalled ? 200 : ((res as { status: number } | undefined)?.status ?? 0));
    }
    return statuses;
  }

  it("lets the first 30 requests from one IP through and 429s the 31st", async () => {
    const statuses = await hammer(32);
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
    expect(statuses[31]).toBe(429);
  });

  it("keeps a second IP's budget independent", async () => {
    vi.resetModules();
    const { rateLimit } = await import("../middleware/rate-limit");
    const mw = rateLimit({ windowMs: 60_000, max: 30, prefix: "events-spec2" });
    const call = async (ip: string) => {
      let ok = false;
      const res = await mw(
        {
          req: { header: (h: string) => (h === "x-forwarded-for" ? ip : undefined) },
          header: () => undefined,
          json: (_b: unknown, status: number) => ({ status }),
        } as never,
        async () => {
          ok = true;
        },
      );
      return ok ? 200 : ((res as { status: number } | undefined)?.status ?? 0);
    };
    for (let i = 0; i < 31; i++) await call("198.51.100.1");
    expect(await call("198.51.100.1")).toBe(429);
    expect(await call("198.51.100.2")).toBe(200);
  });
});
