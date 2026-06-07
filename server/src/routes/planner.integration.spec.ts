import { describe, it, expect, beforeAll } from "vitest";
import { app } from "../index";
import { readHousehold } from "../lib/household-repo";
import { prisma } from "../lib/prisma";

/**
 * Endpoint integration tests for /api/planner.
 *
 * GATED on a real DATABASE_URL. These hit the live DB (now Supabase
 * `firekaro-planner`) and exercise the full endpoint -> diff engine -> repo ->
 * Prisma path. The gate (RUN_LIVE below) runs them when mvp/server/.env points at
 * a real Postgres, and AUTO-SKIPS in CI / no-DB runs so the suite never breaks
 * without credentials. Verified green against Supabase 2026-05-31.
 *
 * To run: set mvp/server/.env DATABASE_URL (Supabase session pooler) +
 * DEV_BYPASS_AUTH=true, then `npm run test:unit`. The pure household-diff.spec.ts
 * is the no-DB correctness proof and always runs.
 */

const H = { "x-dev-bypass": "true", "content-type": "application/json" };

const sampleHousehold = {
  name: "Integration",
  setupMode: "Couple",
  profileComplete: true,
  wizardCompleted: true,
  members: [
    { id: "you", name: "You", dateOfBirth: "1985-01-01", role: "EARNER", city: "Metro", health: "Healthy", riskAppetite: "Moderate", marital: "Married" },
    { id: "spouse", name: "Spouse", dateOfBirth: "1987-01-01", role: "EARNER", city: "Metro", health: "Healthy", riskAppetite: "Moderate", marital: "Married" },
  ],
  businesses: [],
  otherIncome: [],
  investments: [{ id: "inv1", type: "MutualFunds", value: 1000000, ownerId: "you", subtypeData: undefined }],
  liabilities: [{ id: "loan-j", name: "Home", type: "HomeLoan", outstandingBalance: 5000000, monthlyEMI: 45000, interestRate: 8.5, ownerId: "Joint", isSharedWithSpouse: true }],
  insurance: [],
  expenses: {
    avgMonthly: 60000,
    recurring: [{ id: "r1", label: "EMI", amount: 45000, frequency: "M", source: "auto-loan", sourceRefId: "loan-j" }],
    plannedFuture: [],
  },
};

// Run only when a real DB is configured; auto-skip in CI / no-DB runs.
const RUN_LIVE =
  !!process.env.DATABASE_URL && !/placeholder|PASTE_/.test(process.env.DATABASE_URL);
const dlive = RUN_LIVE ? describe : describe.skip;

dlive("/api/planner integration (live DB — Supabase firekaro-planner)", () => {
  beforeAll(async () => {
    // Clean slate for the dev-bypass user.
    await app.request("/api/planner/all", { method: "DELETE", headers: H });
  });

  it("GET /me returns the dev-bypass user", async () => {
    const res = await app.request("/api/planner/me", { headers: H });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.email).toBe("dev@firekaro-v6.local");
  });

  it("PUT then GET /household round-trips through the diff engine", async () => {
    const put = await app.request("/api/planner/household", {
      method: "PUT",
      headers: H,
      body: JSON.stringify(sampleHousehold),
    });
    expect(put.status).toBe(200);

    const get = await app.request("/api/planner/household", { headers: H });
    const body: any = await get.json();
    expect(body.data.members).toHaveLength(2);
    expect(body.data.liabilities[0].ownerId).toBe("Joint");
    expect(body.data.expenses.recurring[0].sourceRefId).toBe("loan-j");
  });

  it("PUT /household is idempotent (no duplicate rows)", async () => {
    await app.request("/api/planner/household", { method: "PUT", headers: H, body: JSON.stringify(sampleHousehold) });
    await app.request("/api/planner/household", { method: "PUT", headers: H, body: JSON.stringify(sampleHousehold) });
    const get = await app.request("/api/planner/household", { headers: H });
    const body: any = await get.json();
    expect(body.data.members).toHaveLength(2);
    expect(body.data.expenses.recurring).toHaveLength(1); // auto-flow not duplicated
  });

  it("removing a member deletes the orphan row", async () => {
    const oneMember = { ...sampleHousehold, members: [sampleHousehold.members[0]] };
    await app.request("/api/planner/household", { method: "PUT", headers: H, body: JSON.stringify(oneMember) });
    const get = await app.request("/api/planner/household", { headers: H });
    const body: any = await get.json();
    expect(body.data.members).toHaveLength(1);
  });

  it("PUT+GET /assumptions round-trips", async () => {
    const assumptions = {
      inflation: 0.06, equityReturn: 0.12, debtReturn: 0.07, realEstateReturn: 0.06, goldReturn: 0.07,
      npsReturn: 0.1, ppfReturn: 0.071, epfReturn: 0.0825, internationalReturn: 0.1, reitReturn: 0.08,
      cryptoReturn: 0, healthcareInflation: 0.14, educationInflation: 0.09, housingInflation: 0.06,
      inflationWeights: { general: 60, healthcare: 20, education: 10, housing: 10 },
      leanMultiplier: 0.6, fatMultiplier: 1.5, withdrawalRule: "Constant",
    };
    await app.request("/api/planner/assumptions", { method: "PUT", headers: H, body: JSON.stringify(assumptions) });
    const get = await app.request("/api/planner/assumptions", { headers: H });
    const body: any = await get.json();
    expect(body.data.equityReturn).toBe(0.12);
    expect(body.data.inflationWeights.general).toBe(60);
  });

  it("rejects an unauthenticated request", async () => {
    const res = await app.request("/api/planner/household"); // no dev-bypass header
    expect(res.status).toBe(401);
  });

  // ===================== A7.3 multi-tenant isolation / IDOR =====================
  // The #1 security property for a multi-tenant finance app holding PAN/salary/family data:
  // userId comes from the session ONLY (hono-route-conventions.md). A tenant leak is catastrophic.

  it("IDOR: a spoofed body userId is IGNORED — the write is scoped to the session user only", async () => {
    // Attacker-style payload: a userId pointing at another tenant, smuggled in the body.
    const spoofed = { ...sampleHousehold, userId: "attacker-other-tenant-id" };
    const put = await app.request("/api/planner/household", {
      method: "PUT",
      headers: H,
      body: JSON.stringify(spoofed),
    });
    expect(put.status).toBe(200);
    // The SESSION (dev-bypass) user has the data...
    const mine: any = await (await app.request("/api/planner/household", { headers: H })).json();
    expect(mine.data.members.length).toBeGreaterThan(0);
    // ...and the spoofed tenant id received ZERO rows — the body userId had no effect.
    const leaked = await readHousehold(prisma, "attacker-other-tenant-id");
    expect(leaked, "a spoofed body userId must not write a household for another tenant").toBeNull();
  });

  it("isolation: readHousehold for a different userId never returns this user's data", async () => {
    // Guarantee the session user has a household, then confirm a DIFFERENT tenant reads back null.
    await app.request("/api/planner/household", { method: "PUT", headers: H, body: JSON.stringify(sampleHousehold) });
    const other = await readHousehold(prisma, "some-unrelated-tenant-id");
    expect(other, "cross-tenant read must never leak another user's household").toBeNull();
  });

  it("validation: a malformed household payload is rejected 422 (not 500, not silently accepted)", async () => {
    const res = await app.request("/api/planner/household", {
      method: "PUT",
      headers: H,
      body: JSON.stringify({ members: "not-an-array", setupMode: 123 }),
    });
    expect(res.status).toBe(422);
    const body: any = await res.json();
    expect(body.success).toBe(false);
  });

  it("validation: invalid JSON is rejected 400 (trust-boundary guard)", async () => {
    const res = await app.request("/api/planner/household", {
      method: "PUT",
      headers: H,
      body: "{ not valid json",
    });
    expect(res.status).toBe(400);
  });

  // ===================== A7.4 persistence round-trip integrity =====================
  // The diff engine + repo are the product plan's own "highest-complexity / silent-data-loss" risk.
  // The base round-trip test leaves subtypeData undefined — so the per-type natural-granularity
  // fields (qty/price, principal/rate/bank, gold subtype/grams, RE ownership/role, ESOP grant) are
  // UNTESTED. A dropped field here is a silent data loss the user never sees until it matters.

  it("subtype round-trip: per-type investment fields survive PUT->GET (no silent field drop)", async () => {
    const richInvestments = [
      { id: "stk1", type: "Stocks", value: 50000, ownerId: "you", qty: 100, pricePerShare: 500, bucket: 4, holdingsCount: 3 },
      { id: "fd1", type: "FD", value: 200000, ownerId: "you", principal: 200000, interestRate: 7.1, maturityYear: 2030, bank: "HDFC" },
      { id: "gold1", type: "Gold", value: 100000, ownerId: "Joint", subtype: "SGB", grams: 20, pricePerGram: 5000 },
      { id: "re1", type: "RealEstate", value: 8000000, ownerId: "you", city: "Metro", ownership: "Self", purchaseYear: 2018, realEstateRole: "PrimaryResidence" },
      { id: "esop1", type: "ESOP", value: 300000, ownerId: "you", totalGrantValue: 500000, vestedPercent: 60 },
    ];
    const household = { ...sampleHousehold, investments: richInvestments };
    const put = await app.request("/api/planner/household", { method: "PUT", headers: H, body: JSON.stringify(household) });
    expect(put.status).toBe(200);

    const body: any = await (await app.request("/api/planner/household", { headers: H })).json();
    const byId: Record<string, any> = Object.fromEntries(body.data.investments.map((i: any) => [i.id, i]));

    expect(byId.stk1, "Stocks qty/price/bucket/holdingsCount round-trip").toMatchObject({
      type: "Stocks", ownerId: "you", qty: 100, pricePerShare: 500, bucket: 4, holdingsCount: 3,
    });
    expect(byId.fd1, "FD principal/rate/maturity/bank round-trip").toMatchObject({
      type: "FD", principal: 200000, interestRate: 7.1, maturityYear: 2030, bank: "HDFC",
    });
    expect(byId.gold1, "Gold subtype/grams/pricePerGram + Joint owner round-trip").toMatchObject({
      type: "Gold", ownerId: "Joint", subtype: "SGB", grams: 20, pricePerGram: 5000,
    });
    expect(byId.re1, "RealEstate ownership/role/city/purchaseYear round-trip").toMatchObject({
      type: "RealEstate", ownership: "Self", realEstateRole: "PrimaryResidence", city: "Metro", purchaseYear: 2018,
    });
    expect(byId.esop1, "ESOP grant/vested round-trip").toMatchObject({
      type: "ESOP", totalGrantValue: 500000, vestedPercent: 60,
    });
  });

  it("expense-history round-trip: the separate snapshot key persists deep-equal", async () => {
    const snapshots = [
      { period: "2025-04", fy: "2025-26", capturedAt: "2025-04-30T00:00:00.000Z", totalAnnual: 720000, byBucket: { Housing: 360000, Food: 180000, Other: 180000 }, fireNumber: 80000000, netWorth: 11000000 },
      { period: "2025-05", fy: "2025-26", capturedAt: "2025-05-31T00:00:00.000Z", totalAnnual: 744000, byBucket: { Housing: 360000, Food: 200000, Other: 184000 }, fireTargetYear: 2050 },
    ];
    const put = await app.request("/api/planner/expense-history", { method: "PUT", headers: H, body: JSON.stringify(snapshots) });
    expect(put.status).toBe(200);
    const body: any = await (await app.request("/api/planner/expense-history", { headers: H })).json();
    expect(body.data, "expense-history snapshots round-trip deep-equal").toEqual(snapshots);
  });
});
