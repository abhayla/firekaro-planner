/**
 * size-estimate.ts — measure the REAL per-user storage of the firekaro_v6 schema
 * and extrapolate to 5,000 / 10,000 users. Answers: "does it stay under Supabase's
 * 500 MB free-tier limit?"
 *
 * It is DB-agnostic Postgres — run it against ANY Postgres (Supabase, the VPS, a
 * local throwaway). It seeds N realistic synthetic households via the REAL write
 * path (applyHouseholdPlan + the diff engine), measures pg_database_size before
 * and after to isolate the per-user delta from fixed catalog overhead, prints a
 * per-table breakdown, extrapolates, then cleans up (unless --keep).
 *
 * PREREQ: the schema must be applied first:
 *   DATABASE_URL="<postgres-url>" npx prisma migrate deploy
 *
 * RUN:
 *   DATABASE_URL="<postgres-url>" npx tsx scripts/size-estimate.ts --users 300 --months 24
 *   flags: --users N (default 300)  --months M snapshots/user (default 24)  --keep (skip cleanup)
 *
 * The synthetic households are deliberately on the RICH side (heavy entity counts)
 * so the estimate is conservative — a "will it fit" upper-ish bound, not a floor.
 */

import { PrismaClient, Prisma } from "@prisma/client";
import { applyHouseholdPlan } from "../src/lib/household-repo";
import { diffHousehold } from "../src/lib/household-diff";
import { DEFAULT_ASSUMPTIONS } from "../../src/types/assumptions";
import type { Household, Member, Investment, Liability, RecurringExpenseLine } from "../../src/types/household";

const prisma = new PrismaClient();

const USER_PREFIX = "sizing-user-";
const EMAIL_DOMAIN = "@sizing.local";

// ---------- args ----------
function arg(name: string, def: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : def;
}
const N_USERS = arg("users", 300);
const MONTHS = arg("months", 24);
const KEEP = process.argv.includes("--keep");

// ---------- random helpers (plain node script — Math.random is fine here) ----------
const rint = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const money = (min: number, max: number) => rint(min, max) * 1000;

// ---------- synthetic household (rich, realistic Indian household) ----------
function makeHousehold(seed: number): Household {
  const memberCount = rint(1, 4);
  const members: Member[] = [];
  for (let i = 0; i < memberCount; i++) {
    const earner = i < Math.max(1, memberCount - 1);
    members.push({
      id: i === 0 ? "you" : i === 1 ? "spouse" : `dep-${i}`,
      name: i === 0 ? "Primary" : i === 1 ? "Spouse" : `Child ${i}`,
      dateOfBirth: `${1980 + rint(0, 25)}-0${rint(1, 9)}-1${rint(0, 8)}`,
      role: earner ? "EARNER" : "DEPENDENT",
      city: pick(["Metro", "Tier-1", "Tier-2"]),
      health: pick(["Healthy", "Chronic", "Special"]),
      riskAppetite: pick(["Conservative", "Moderate", "Aggressive"]),
      marital: "Married",
      ...(earner
        ? { salary: { annualCTC: money(800, 5000), hikePercent: rint(5, 15) }, employmentStatus: "Employed" as const }
        : { educationStage: pick(["Preschool", "Primary", "Secondary", "College"] as const) }),
      targetRetirementAge: earner ? rint(55, 62) : undefined,
      planToAge: rint(85, 95),
    });
  }
  const memberIds = members.map((m) => m.id);
  const owner = () => pick([...memberIds, "Joint"]);

  const invTypes = ["Stocks", "MutualFunds", "PPF", "NPS", "RealEstate", "Gold", "FD", "EPF_VPF", "International", "REIT"];
  const investments: Investment[] = [];
  for (let i = 0; i < rint(5, 15); i++) {
    const type = pick(invTypes) as Investment["type"];
    investments.push({
      id: `inv-${seed}-${i}`,
      type,
      value: money(100, 8000),
      monthlyContribution: Math.random() < 0.6 ? money(5, 100) : undefined,
      ownerId: owner(),
      // realistic per-subtype tail (-> subtypeData JSONB)
      ...(type === "Stocks" ? { qty: rint(10, 500), pricePerShare: rint(100, 4000) } : {}),
      ...(type === "MutualFunds" ? { units: rint(100, 5000), navPerUnit: rint(20, 400) } : {}),
      ...(type === "FD" ? { principal: money(100, 2000), interestRate: rint(6, 8), bank: pick(["HDFC", "SBI", "ICICI"]) } : {}),
      ...(type === "Gold" ? { subtype: pick(["Physical", "SGB", "ETF"] as const), grams: rint(10, 500) } : {}),
      ...(type === "RealEstate" ? { city: pick(["Metro", "Tier-1"] as const), purchaseYear: rint(2005, 2024), realEstateRole: pick(["PrimaryResidence", "Investment"] as const) } : {}),
      bucket: pick([1, 2, 3, 4] as const),
      isAutomated: Math.random() < 0.5,
    });
  }

  const loanTypes = ["HomeLoan", "PersonalLoan", "CarLoan", "EducationLoan"];
  const liabilities: Liability[] = [];
  const recurring: RecurringExpenseLine[] = [];
  for (let i = 0; i < rint(0, 3); i++) {
    const id = `loan-${seed}-${i}`;
    const isJoint = Math.random() < 0.4;
    liabilities.push({
      id,
      name: `Loan ${i}`,
      type: pick(loanTypes) as Liability["type"],
      outstandingBalance: money(500, 8000),
      monthlyEMI: money(15, 90),
      interestRate: rint(7, 11),
      ownerId: isJoint ? "Joint" : pick(memberIds),
      isSharedWithSpouse: isJoint,
      coBorrowers: isJoint ? memberIds.slice(0, 2) : undefined,
    });
    // auto-flow EMI recurring row (sourceRefId -> the loan)
    recurring.push({ id: `r-emi-${seed}-${i}`, label: `EMI ${i}`, amount: money(15, 90), frequency: "M", source: "auto-loan", sourceRefId: id, inflationBucket: "general", kind: "general" });
  }

  for (let i = 0; i < rint(5, 12); i++) {
    recurring.push({ id: `r-${seed}-${i}`, label: `Expense ${i}`, amount: money(2, 60), frequency: pick(["M", "Q", "A"] as const), source: "manual", inflationBucket: pick(["general", "healthcare", "education", "housing"] as const), kind: "general" });
  }

  return {
    name: `Household ${seed}`,
    setupMode: pick(["Solo", "Couple", "Couple+Children", "Custom"] as const),
    profileComplete: true,
    wizardCompleted: true,
    members,
    businesses: Array.from({ length: rint(0, 1) }, (_, i) => ({
      id: `biz-${seed}-${i}`, name: `Biz ${i}`, legalKind: pick(["SoleProp", "LLP", "PvtLtd", "HUF"] as const), annualProfit: money(200, 3000), frequency: "A" as const, sharePercent: rint(50, 100), ownerId: pick(memberIds), isOperated: true,
    })),
    otherIncome: Array.from({ length: rint(0, 3) }, (_, i) => ({
      id: `oi-${seed}-${i}`, type: pick(["Rental", "Dividend", "Interest", "Other"] as const), source: "Direct", amount: money(5, 80), frequency: pick(["M", "A"] as const), ownerId: owner(), isTaxExempt: Math.random() < 0.3,
    })),
    investments,
    liabilities,
    insurance: Array.from({ length: rint(1, 5) }, (_, i) => ({
      id: `ins-${seed}-${i}`, type: pick(["Vehicle", "Health", "Life"] as const), provider: pick(["LIC", "HDFC Ergo", "Star Health"]), sumAssured: money(500, 20000), annualPremium: money(5, 50), insuredPersonId: pick(memberIds), renewalMonth: rint(1, 12), renewalYear: 2026,
    })),
    expenses: {
      avgMonthly: money(30, 150),
      recurring,
      plannedFuture: Array.from({ length: rint(0, 5) }, (_, i) => ({
        id: `pf-${seed}-${i}`, label: `Goal ${i}`, todayAmount: money(500, 10000), targetYear: 2030 + rint(0, 20), isMultiYear: false, inflationBucket: pick(["general", "education", "housing"] as const), kind: pick(["general", "education", "marriage"] as const),
      })),
    },
    extendedFamilyContingencyPercent: 0.075,
    healthcareCorpusReservationPercent: 0.2,
    glidePath: { enabled: Math.random() < 0.5, startEquityPercent: 75, endEquityPercent: 40, taperWindowYears: 10 },
    estateChecklist: (["will", "nominees", "powerOfAttorney", "jointAccounts", "digitalEstate", "hufKarta", "termLifeBypass"] as const)
      .slice(0, rint(0, 7))
      .map((key) => ({ key, completed: Math.random() < 0.5, notes: "x" })),
  };
}

async function seedUser(i: number): Promise<void> {
  const userId = `${USER_PREFIX}${i}`;
  // Better Auth fidelity: user + account + session (~3-4 rows/user).
  await prisma.user.create({ data: { id: userId, email: `sizing-${i}${EMAIL_DOMAIN}`, emailVerified: true, name: `User ${i}` } });
  await prisma.account.create({ data: { userId, accountId: `acc-${i}`, providerId: "google" } });
  await prisma.session.create({ data: { userId, token: `tok-${i}-${Math.random().toString(36).slice(2)}`, expiresAt: new Date(Date.now() + 7 * 864e5) } });

  // household via the REAL write path (faithful storage footprint).
  const hh = makeHousehold(i);
  await applyHouseholdPlan(prisma, userId, diffHousehold(null, hh));

  // assumptions singleton.
  const { inflationWeights, ...a } = DEFAULT_ASSUMPTIONS;
  await prisma.userAssumptions.create({ data: { userId, ...a, inflationWeights: inflationWeights as unknown as Prisma.InputJsonValue, swrOverride: null } });

  // scenarios (~6 seeded + a couple user).
  for (let k = 0; k < rint(6, 9); k++) {
    await prisma.scenario.create({ data: { userId, entityId: `scn-${i}-${k}`, name: `Scenario ${k}`, leverValues: { expectedReturn: 0.1, swr: 0.035, equityAllocationPct: rint(35, 75) } as Prisma.InputJsonValue, docCreatedAt: BigInt(Date.now()) } });
  }

  // features + ui singletons.
  await prisma.userFeatures.create({ data: { userId, flags: { buckets: true, stressTest: true, estate: false } as Prisma.InputJsonValue, wizardCompleted: true } });
  await prisma.userUiPrefs.create({ data: { userId, prefs: { isFamilyView: false, currentFY: "2026-27" } as Prisma.InputJsonValue } });

  // expense snapshots — MONTHS rows (the main growth vector).
  for (let m = 0; m < MONTHS; m++) {
    const year = 2024 + Math.floor(m / 12);
    const month = `${(m % 12) + 1}`.padStart(2, "0");
    await prisma.expenseSnapshot.create({
      data: {
        userId, period: `${year}-${month}`, fy: `${year}-${(year + 1) % 100}`, capturedAt: new Date().toISOString(),
        totalAnnual: money(400, 1800), byBucket: { general: 500000, healthcare: 100000, education: 80000, housing: 200000 } as Prisma.InputJsonValue,
        fireTargetYear: 2045, fireNumber: money(40000, 120000), netWorth: money(5000, 80000),
      },
    });
  }
}

async function dbSizeBytes(): Promise<number> {
  const r = await prisma.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`;
  return Number(r[0].size);
}

async function perTableSizes(): Promise<{ table: string; bytes: number }[]> {
  const rows = await prisma.$queryRaw<{ table: string; bytes: bigint }[]>`
    SELECT relname AS table, pg_total_relation_size(c.oid) AS bytes
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY pg_total_relation_size(c.oid) DESC`;
  return rows.map((r) => ({ table: r.table, bytes: Number(r.bytes) }));
}

async function cleanup(): Promise<void> {
  const where = { userId: { startsWith: USER_PREFIX } };
  // FK-safe order (co-borrowers also cascade off liabilities, but delete explicitly).
  await prisma.liabilityCoBorrower.deleteMany({ where });
  await prisma.member.deleteMany({ where });
  await prisma.business.deleteMany({ where });
  await prisma.otherIncomeLine.deleteMany({ where });
  await prisma.investment.deleteMany({ where });
  await prisma.liability.deleteMany({ where });
  await prisma.insurancePolicy.deleteMany({ where });
  await prisma.recurringExpenseLine.deleteMany({ where });
  await prisma.plannedFutureLine.deleteMany({ where });
  await prisma.estateChecklistItem.deleteMany({ where });
  await prisma.expenseSnapshot.deleteMany({ where });
  await prisma.householdConfig.deleteMany({ where });
  await prisma.userAssumptions.deleteMany({ where });
  await prisma.scenario.deleteMany({ where });
  await prisma.userFeatures.deleteMany({ where });
  await prisma.userUiPrefs.deleteMany({ where });
  // session/account cascade when the user is deleted.
  await prisma.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
}

const MB = (b: number) => (b / 1024 / 1024).toFixed(1);

async function main() {
  console.log(`\nfirekaro_v6 sizing — seeding ${N_USERS} synthetic users, ${MONTHS} months of snapshots each.\n`);

  const before = await dbSizeBytes();
  console.log(`baseline db size: ${MB(before)} MB`);

  const t0 = Date.now();
  for (let i = 0; i < N_USERS; i++) {
    await seedUser(i);
    if ((i + 1) % 50 === 0) console.log(`  seeded ${i + 1}/${N_USERS}…`);
  }
  console.log(`seeded ${N_USERS} users in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

  const after = await dbSizeBytes();
  const perUser = (after - before) / N_USERS;

  console.log("── per-table footprint (top 12) ──");
  for (const t of (await perTableSizes()).slice(0, 12)) {
    console.log(`  ${t.table.padEnd(26)} ${MB(t.bytes).padStart(8)} MB`);
  }

  console.log("\n── result ──");
  console.log(`total after seeding : ${MB(after)} MB`);
  console.log(`per-user delta      : ${(perUser / 1024).toFixed(1)} KB  (over ${MONTHS} months of snapshots)`);
  console.log("\n── extrapolation (per-user delta × users; excludes ~8 MB fixed catalog) ──");
  for (const u of [5000, 10000]) {
    const projected = (perUser * u) / 1024 / 1024;
    const verdict = projected < 500 ? "✅ under 500 MB" : "❌ OVER 500 MB";
    console.log(`  ${u.toLocaleString().padStart(7)} users : ${projected.toFixed(0).padStart(5)} MB   ${verdict}`);
  }
  console.log(`\n(snapshots dominate growth: ${MONTHS} months counted. Capping retention bounds this.)`);

  if (!KEEP) {
    process.stdout.write("\ncleaning up synthetic users… ");
    await cleanup();
    console.log("done.");
  } else {
    console.log("\n--keep set: synthetic users left in place. Re-run cleanup manually or DROP the DB.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
