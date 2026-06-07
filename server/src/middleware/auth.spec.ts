import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

// Mock the two heavy deps auth.ts imports so the unit test needs NO DB / Better-Auth init.
// getSession → no session, so the REAL-auth path always 401s. The dev-bypass branch (if
// wrongly taken) would call prisma; we mock it too so a regression that takes the branch
// would be caught by an unexpected 200 (dev user) rather than a crash.
vi.mock("../lib/auth", () => ({
  auth: { api: { getSession: vi.fn(async () => null) } },
}));
vi.mock("../lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => ({ id: "dev-id", email: "dev@firekaro-v6.local", name: "Dev v6" })),
      create: vi.fn(async () => ({ id: "dev-id", email: "dev@firekaro-v6.local", name: "Dev v6" })),
    },
  },
}));
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { authMiddleware } from "./auth";

/**
 * #60 / §A2.5d regression lock — the 3-factor dev-bypass gate (rules/dev-bypass-auth.md).
 * The PII-protecting invariant: the `x-dev-bypass` header ALONE must NEVER bypass auth.
 * Only ALL THREE — NODE_ENV ∈ {development,test} AND DEV_BYPASS_AUTH==="true" AND the
 * header — may yield the dev user. Verified live 2026-06-07 (curl + /login bounce); this
 * locks every gate-OFF combination so a regression can't silently re-open the gate.
 */
function appUnderTest() {
  const app = new Hono();
  app.use("*", authMiddleware);
  app.get("/protected", (c) => c.json({ userId: c.get("userId") }));
  return app;
}

const HDR = { "x-dev-bypass": "true" };

describe("authMiddleware — 3-factor dev-bypass gate (gate-OFF must 401 even WITH header)", () => {
  const ENV = process.env;
  beforeEach(() => {
    process.env = { ...ENV };
  });
  afterEach(() => {
    process.env = ENV;
    vi.clearAllMocks();
  });

  it("NODE_ENV=production + DEV_BYPASS_AUTH=true + header → NO bypass → 401", async () => {
    process.env.NODE_ENV = "production";
    process.env.DEV_BYPASS_AUTH = "true";
    const res = await appUnderTest().request("/protected", { headers: HDR });
    expect(res.status).toBe(401);
  });

  it("NODE_ENV unset + DEV_BYPASS_AUTH=true + header → NO bypass → 401 (the VPS-misconfig footgun)", async () => {
    delete process.env.NODE_ENV;
    process.env.DEV_BYPASS_AUTH = "true";
    const res = await appUnderTest().request("/protected", { headers: HDR });
    expect(res.status).toBe(401);
  });

  it("NODE_ENV=development + DEV_BYPASS_AUTH=false + header → NO bypass → 401 (#60 — the exact dev-bypass-OFF case)", async () => {
    process.env.NODE_ENV = "development";
    process.env.DEV_BYPASS_AUTH = "false";
    const res = await appUnderTest().request("/protected", { headers: HDR });
    expect(res.status).toBe(401);
  });

  it("NODE_ENV=development + DEV_BYPASS_AUTH unset + header → NO bypass → 401", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.DEV_BYPASS_AUTH;
    const res = await appUnderTest().request("/protected", { headers: HDR });
    expect(res.status).toBe(401);
  });

  it("NODE_ENV=development + DEV_BYPASS_AUTH=true + NO header → NO bypass → 401 (header is required)", async () => {
    process.env.NODE_ENV = "development";
    process.env.DEV_BYPASS_AUTH = "true";
    const res = await appUnderTest().request("/protected");
    expect(res.status).toBe(401);
  });

  it("all three present (NODE_ENV=test + DEV_BYPASS_AUTH=true + header) → bypass yields the dev user (positive control)", async () => {
    process.env.NODE_ENV = "test";
    process.env.DEV_BYPASS_AUTH = "true";
    const res = await appUnderTest().request("/protected", { headers: HDR });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { userId: string };
    expect(body.userId).toBe("dev-id");
  });
});
