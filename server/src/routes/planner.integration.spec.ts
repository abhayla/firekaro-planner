import { describe, it, expect, beforeAll } from "vitest";
import { app } from "../index";

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
});
