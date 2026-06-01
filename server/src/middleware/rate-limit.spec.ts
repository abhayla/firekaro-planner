import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { rateLimit } from "./rate-limit";

/**
 * Rate limiter — security-critical for /api/auth/*. Pins: blocks after `max`
 * within the window, returns the 429 apiError envelope, keys per client so one
 * abuser does not lock out everyone, and resets after the window elapses.
 */

function makeApp(max: number, windowMs = 60_000) {
  const app = new Hono();
  app.use("/hit", rateLimit({ windowMs, max, prefix: "test" }));
  app.get("/hit", (c) => c.json({ success: true, data: "ok" }));
  return app;
}

const ip = (addr: string) => ({ headers: { "x-forwarded-for": addr } });

describe("rateLimit", () => {
  it("allows up to `max` requests then blocks with 429", async () => {
    const app = makeApp(3);
    for (let i = 0; i < 3; i++) {
      const res = await app.request("/hit", ip("1.1.1.1"));
      expect(res.status, `request ${i + 1} should pass`).toBe(200);
    }
    const blocked = await app.request("/hit", ip("1.1.1.1"));
    expect(blocked.status).toBe(429);
  });

  it("returns the apiError envelope with RATE_LIMITED code on block", async () => {
    const app = makeApp(1);
    await app.request("/hit", ip("2.2.2.2"));
    const blocked = await app.request("/hit", ip("2.2.2.2"));
    expect(blocked.status).toBe(429);
    const body = (await blocked.json()) as { success: boolean; code: string };
    expect(body.success).toBe(false);
    expect(body.code).toBe("RATE_LIMITED");
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
  });

  it("keys per client — one abuser does not block another IP", async () => {
    const app = makeApp(1);
    await app.request("/hit", ip("3.3.3.3"));
    const abuserBlocked = await app.request("/hit", ip("3.3.3.3"));
    expect(abuserBlocked.status).toBe(429);
    const otherOk = await app.request("/hit", ip("4.4.4.4"));
    expect(otherOk.status).toBe(200);
  });

  it("sets X-RateLimit-Remaining header", async () => {
    const app = makeApp(5);
    const res = await app.request("/hit", ip("5.5.5.5"));
    expect(res.headers.get("X-RateLimit-Limit")).toBe("5");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("4");
  });

  it("resets the window after it elapses", async () => {
    const app = makeApp(1, 1); // 1ms window
    await app.request("/hit", ip("6.6.6.6"));
    await new Promise((r) => setTimeout(r, 5));
    const afterReset = await app.request("/hit", ip("6.6.6.6"));
    expect(afterReset.status).toBe(200);
  });
});
