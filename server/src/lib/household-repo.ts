/**
 * Household repository — the DB side of the document-style household endpoint.
 *
 *   readHousehold(userId)      -> reconstruct a `Household` from the normalized
 *                                 child tables (null when the user has no config).
 *   applyHouseholdPlan(...)     -> apply a HouseholdDiffPlan to Postgres inside
 *                                 ONE transaction (insert/update/delete per table;
 *                                 auto-flow recurring rows upsert by sourceRefId).
 *
 * This is the IO layer; the pure classification lives in household-diff.ts. It is
 * type-checked in-session but exercised against a live DB only in Tier-2
 * (VERIFY-AFTER-PROVISION.md) — no DB exists in-session (goal contract §0.3).
 *
 * Investment is FLAT at runtime: shared columns are typed; the per-subtype field
 * tail lives in `subtypeData` JSONB and is spread back on read.
 */

import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  Household,
  Member,
  Business,
  OtherIncomeLine,
  Investment,
  Liability,
  InsurancePolicy,
  RecurringExpenseLine,
  PlannedFutureLine,
  EstateChecklistItem,
  SetupMode,
  GlidePathConfig,
} from "@planner/types/household";
import type { HouseholdDiffPlan, HouseholdConfigScalars } from "./household-diff";

type Tx = Prisma.TransactionClient;

// ---------- Investment <-> row (subtypeData split) ----------

const INVESTMENT_TYPED_KEYS = new Set([
  "id",
  "type",
  "label",
  "value",
  "monthlyContribution",
  "ownerId",
]);

function investmentSubtypeData(inv: Investment): Prisma.InputJsonValue {
  const sub: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(inv)) {
    if (!INVESTMENT_TYPED_KEYS.has(k) && v !== undefined) sub[k] = v;
  }
  return sub as Prisma.InputJsonValue;
}

function rowToInvestment(row: {
  entityId: string;
  type: string;
  label: string | null;
  value: number;
  monthlyContribution: number | null;
  ownerId: string;
  subtypeData: Prisma.JsonValue;
}): Investment {
  const sub = (row.subtypeData ?? {}) as Record<string, unknown>;
  return {
    id: row.entityId,
    type: row.type,
    label: row.label ?? undefined,
    value: row.value,
    monthlyContribution: row.monthlyContribution ?? undefined,
    ownerId: row.ownerId,
    ...sub,
  } as unknown as Investment;
}

// ---------- Member <-> row (salary split) ----------

function rowToMember(row: {
  entityId: string;
  name: string;
  dateOfBirth: string;
  role: string;
  targetRetirementAge: number | null;
  planToAge: number | null;
  relation: string | null;
  salaryAnnualCTC: number | null;
  salaryHikePercent: number | null;
  salaryVpfTopUpPercent: number | null;
  salaryEmployerNpsAnnual: number | null;
  salaryBasicAnnual: number | null;
  salaryEmployerSector: string | null;
  city: string;
  health: string;
  educationStage: string | null;
  riskAppetite: string;
  marital: string;
  employmentStatus: string | null;
}): Member {
  const m: Member = {
    id: row.entityId,
    name: row.name,
    dateOfBirth: row.dateOfBirth,
    role: row.role as Member["role"],
    targetRetirementAge: row.targetRetirementAge ?? undefined,
    planToAge: row.planToAge ?? undefined,
    relation: row.relation ?? undefined,
    city: row.city as Member["city"],
    health: row.health as Member["health"],
    educationStage: (row.educationStage ?? undefined) as Member["educationStage"],
    riskAppetite: row.riskAppetite as Member["riskAppetite"],
    marital: row.marital as Member["marital"],
    employmentStatus: (row.employmentStatus ?? undefined) as Member["employmentStatus"],
  };
  if (row.salaryAnnualCTC != null) {
    m.salary = {
      annualCTC: row.salaryAnnualCTC,
      hikePercent: row.salaryHikePercent ?? 0,
      vpfTopUpPercent: row.salaryVpfTopUpPercent ?? undefined,
      employerNpsAnnual: row.salaryEmployerNpsAnnual ?? undefined,
      basicAnnual: row.salaryBasicAnnual ?? undefined,
      employerSector: (row.salaryEmployerSector ?? undefined) as
        | "private"
        | "government"
        | undefined,
    };
  }
  return m;
}

function memberToRow(m: Member, userId: string) {
  return {
    userId,
    entityId: m.id,
    name: m.name,
    dateOfBirth: m.dateOfBirth,
    role: m.role,
    targetRetirementAge: m.targetRetirementAge ?? null,
    planToAge: m.planToAge ?? null,
    relation: m.relation ?? null,
    salaryAnnualCTC: m.salary?.annualCTC ?? null,
    salaryHikePercent: m.salary?.hikePercent ?? null,
    salaryVpfTopUpPercent: m.salary?.vpfTopUpPercent ?? null,
    salaryEmployerNpsAnnual: m.salary?.employerNpsAnnual ?? null,
    salaryBasicAnnual: m.salary?.basicAnnual ?? null,
    salaryEmployerSector: m.salary?.employerSector ?? null,
    city: m.city,
    health: m.health,
    educationStage: m.educationStage ?? null,
    riskAppetite: m.riskAppetite,
    marital: m.marital,
    employmentStatus: m.employmentStatus ?? null,
  };
}

// ---------- Read ----------

export async function readHousehold(
  prisma: PrismaClient,
  userId: string,
): Promise<Household | null> {
  const config = await prisma.householdConfig.findUnique({ where: { userId } });
  if (!config) return null;

  const [members, businesses, otherIncome, investments, liabilities, insurance, recurring, planned, estate] =
    await Promise.all([
      prisma.member.findMany({ where: { userId } }),
      prisma.business.findMany({ where: { userId } }),
      prisma.otherIncomeLine.findMany({ where: { userId } }),
      prisma.investment.findMany({ where: { userId } }),
      prisma.liability.findMany({ where: { userId }, include: { coBorrowers: true } }),
      prisma.insurancePolicy.findMany({ where: { userId } }),
      prisma.recurringExpenseLine.findMany({ where: { userId } }),
      prisma.plannedFutureLine.findMany({ where: { userId } }),
      prisma.estateChecklistItem.findMany({ where: { userId } }),
    ]);

  return {
    name: config.name,
    setupMode: config.setupMode as SetupMode,
    profileComplete: config.profileComplete,
    wizardCompleted: config.wizardCompleted,
    members: members.map(rowToMember),
    businesses: businesses.map(
      (b): Business => ({
        id: b.entityId,
        name: b.name,
        legalKind: b.legalKind as Business["legalKind"],
        annualProfit: b.annualProfit,
        frequency: b.frequency as Business["frequency"],
        sharePercent: b.sharePercent,
        ownerId: b.ownerId,
        isOperated: b.isOperated,
      }),
    ),
    otherIncome: otherIncome.map(
      (o): OtherIncomeLine => ({
        id: o.entityId,
        type: o.type as OtherIncomeLine["type"],
        source: o.source,
        sourceEntityId: o.sourceEntityId ?? undefined,
        label: o.label ?? undefined,
        amount: o.amount,
        frequency: o.frequency as OtherIncomeLine["frequency"],
        ownerId: o.ownerId,
        isTaxExempt: o.isTaxExempt,
        homeLoanInterest: o.homeLoanInterest ?? undefined,
        municipalTaxes: o.municipalTaxes ?? undefined,
      }),
    ),
    investments: investments.map(rowToInvestment),
    liabilities: liabilities.map(
      (l): Liability => ({
        id: l.entityId,
        name: l.name,
        type: l.type as Liability["type"],
        outstandingBalance: l.outstandingBalance,
        monthlyEMI: l.monthlyEMI,
        interestRate: l.interestRate,
        ownerId: l.ownerId,
        isSharedWithSpouse: l.isSharedWithSpouse,
        derivedEndYear: l.derivedEndYear ?? undefined,
        coBorrowers: l.coBorrowers.length ? l.coBorrowers.map((cb) => cb.memberId) : undefined,
      }),
    ),
    insurance: insurance.map(
      (i): InsurancePolicy => ({
        id: i.entityId,
        type: i.type as InsurancePolicy["type"],
        provider: i.provider,
        sumAssured: i.sumAssured,
        annualPremium: i.annualPremium,
        insuredPersonId: i.insuredPersonId,
        renewalMonth: i.renewalMonth ?? undefined,
        renewalYear: i.renewalYear ?? undefined,
      }),
    ),
    expenses: {
      avgMonthly: config.expensesAvgMonthly,
      recurring: recurring.map(
        (r): RecurringExpenseLine => ({
          id: r.entityId,
          label: r.label,
          amount: r.amount,
          frequency: r.frequency as RecurringExpenseLine["frequency"],
          endYear: r.endYear ?? undefined,
          source: r.source as RecurringExpenseLine["source"],
          sourceRefId: r.sourceRefId ?? undefined,
          inflationBucket: (r.inflationBucket ?? undefined) as RecurringExpenseLine["inflationBucket"],
          kind: (r.kind ?? undefined) as RecurringExpenseLine["kind"],
        }),
      ),
      plannedFuture: planned.map(
        (p): PlannedFutureLine => ({
          id: p.entityId,
          label: p.label,
          todayAmount: p.todayAmount,
          targetYear: p.targetYear,
          isMultiYear: p.isMultiYear,
          durationYears: p.durationYears ?? undefined,
          inflationBucket: (p.inflationBucket ?? undefined) as PlannedFutureLine["inflationBucket"],
          kind: (p.kind ?? undefined) as PlannedFutureLine["kind"],
        }),
      ),
    },
    extendedFamilyContingencyPercent: config.extendedFamilyContingencyPercent ?? undefined,
    healthcareCorpusReservationPercent: config.healthcareCorpusReservationPercent ?? undefined,
    glidePath: (config.glidePath ?? undefined) as GlidePathConfig | undefined,
    estateChecklist: estate.map(
      (e): EstateChecklistItem => ({
        key: e.key as EstateChecklistItem["key"],
        completed: e.completed,
        date: e.date ?? undefined,
        notes: e.notes ?? undefined,
      }),
    ),
  };
}

// ---------- Apply ----------

function configData(config: HouseholdConfigScalars) {
  return {
    name: config.name,
    setupMode: config.setupMode,
    profileComplete: config.profileComplete,
    wizardCompleted: config.wizardCompleted,
    expensesAvgMonthly: config.expensesAvgMonthly,
    extendedFamilyContingencyPercent: config.extendedFamilyContingencyPercent ?? null,
    healthcareCorpusReservationPercent: config.healthcareCorpusReservationPercent ?? null,
    glidePath: config.glidePath
      ? (config.glidePath as unknown as Prisma.InputJsonValue)
      : Prisma.JsonNull,
  };
}

/**
 * Apply a plan to Postgres in one transaction. Returns the household_config
 * updatedAt so the client can store an ETag (P2). LAST-WRITE-WINS for Phase 1.
 */
export async function applyHouseholdPlan(
  prisma: PrismaClient,
  userId: string,
  plan: HouseholdDiffPlan,
): Promise<Date> {
  return prisma.$transaction(async (tx: Tx) => {
    // --- config singleton ---
    const cfg = configData(plan.config);
    const saved = await tx.householdConfig.upsert({
      where: { userId },
      create: { userId, ...cfg },
      update: cfg,
    });

    // --- members ---
    for (const m of plan.members.inserts) {
      await tx.member.create({ data: memberToRow(m, userId) });
    }
    for (const m of plan.members.updates) {
      await tx.member.update({
        where: { userId_entityId: { userId, entityId: m.id } },
        data: memberToRow(m, userId),
      });
    }
    for (const m of plan.members.deletes) {
      await tx.member.deleteMany({ where: { userId, entityId: m.id } });
    }

    // --- businesses ---
    for (const b of plan.businesses.inserts) {
      await tx.business.create({
        data: {
          userId,
          entityId: b.id,
          name: b.name,
          legalKind: b.legalKind,
          annualProfit: b.annualProfit,
          frequency: b.frequency,
          sharePercent: b.sharePercent,
          ownerId: b.ownerId,
          isOperated: b.isOperated,
        },
      });
    }
    for (const b of plan.businesses.updates) {
      await tx.business.update({
        where: { userId_entityId: { userId, entityId: b.id } },
        data: {
          name: b.name,
          legalKind: b.legalKind,
          annualProfit: b.annualProfit,
          frequency: b.frequency,
          sharePercent: b.sharePercent,
          ownerId: b.ownerId,
          isOperated: b.isOperated,
        },
      });
    }
    for (const b of plan.businesses.deletes) {
      await tx.business.deleteMany({ where: { userId, entityId: b.id } });
    }

    // --- other income ---
    for (const o of plan.otherIncome.inserts) {
      await tx.otherIncomeLine.create({
        data: {
          userId,
          entityId: o.id,
          type: o.type,
          source: o.source,
          sourceEntityId: o.sourceEntityId ?? null,
          label: o.label ?? null,
          amount: o.amount,
          frequency: o.frequency,
          ownerId: o.ownerId,
          isTaxExempt: o.isTaxExempt,
          homeLoanInterest: o.homeLoanInterest ?? 0,
          municipalTaxes: o.municipalTaxes ?? 0,
        },
      });
    }
    for (const o of plan.otherIncome.updates) {
      await tx.otherIncomeLine.update({
        where: { userId_entityId: { userId, entityId: o.id } },
        data: {
          type: o.type,
          source: o.source,
          sourceEntityId: o.sourceEntityId ?? null,
          label: o.label ?? null,
          amount: o.amount,
          frequency: o.frequency,
          ownerId: o.ownerId,
          isTaxExempt: o.isTaxExempt,
          homeLoanInterest: o.homeLoanInterest ?? 0,
          municipalTaxes: o.municipalTaxes ?? 0,
        },
      });
    }
    for (const o of plan.otherIncome.deletes) {
      await tx.otherIncomeLine.deleteMany({ where: { userId, entityId: o.id } });
    }

    // --- investments (subtypeData JSONB) ---
    for (const inv of plan.investments.inserts) {
      await tx.investment.create({
        data: {
          userId,
          entityId: inv.id,
          type: inv.type,
          label: inv.label ?? null,
          value: inv.value,
          monthlyContribution: inv.monthlyContribution ?? null,
          ownerId: inv.ownerId,
          subtypeData: investmentSubtypeData(inv),
        },
      });
    }
    for (const inv of plan.investments.updates) {
      await tx.investment.update({
        where: { userId_entityId: { userId, entityId: inv.id } },
        data: {
          type: inv.type,
          label: inv.label ?? null,
          value: inv.value,
          monthlyContribution: inv.monthlyContribution ?? null,
          ownerId: inv.ownerId,
          subtypeData: investmentSubtypeData(inv),
        },
      });
    }
    for (const inv of plan.investments.deletes) {
      await tx.investment.deleteMany({ where: { userId, entityId: inv.id } });
    }

    // --- liabilities (+ co-borrowers replace) ---
    for (const l of plan.liabilities.inserts) {
      const row = await tx.liability.create({
        data: {
          userId,
          entityId: l.id,
          name: l.name,
          type: l.type,
          outstandingBalance: l.outstandingBalance,
          monthlyEMI: l.monthlyEMI,
          interestRate: l.interestRate,
          ownerId: l.ownerId,
          isSharedWithSpouse: l.isSharedWithSpouse,
          derivedEndYear: l.derivedEndYear ?? null,
        },
      });
      await replaceCoBorrowers(tx, userId, row.id, l.coBorrowers ?? []);
    }
    for (const l of plan.liabilities.updates) {
      const row = await tx.liability.update({
        where: { userId_entityId: { userId, entityId: l.id } },
        data: {
          name: l.name,
          type: l.type,
          outstandingBalance: l.outstandingBalance,
          monthlyEMI: l.monthlyEMI,
          interestRate: l.interestRate,
          ownerId: l.ownerId,
          isSharedWithSpouse: l.isSharedWithSpouse,
          derivedEndYear: l.derivedEndYear ?? null,
        },
      });
      await replaceCoBorrowers(tx, userId, row.id, l.coBorrowers ?? []);
    }
    for (const l of plan.liabilities.deletes) {
      // co-borrowers cascade-delete via the FK.
      await tx.liability.deleteMany({ where: { userId, entityId: l.id } });
    }

    // --- insurance ---
    for (const i of plan.insurance.inserts) {
      await tx.insurancePolicy.create({
        data: {
          userId,
          entityId: i.id,
          type: i.type,
          provider: i.provider,
          sumAssured: i.sumAssured,
          annualPremium: i.annualPremium,
          insuredPersonId: i.insuredPersonId,
          renewalMonth: i.renewalMonth ?? null,
          renewalYear: i.renewalYear ?? null,
        },
      });
    }
    for (const i of plan.insurance.updates) {
      await tx.insurancePolicy.update({
        where: { userId_entityId: { userId, entityId: i.id } },
        data: {
          type: i.type,
          provider: i.provider,
          sumAssured: i.sumAssured,
          annualPremium: i.annualPremium,
          insuredPersonId: i.insuredPersonId,
          renewalMonth: i.renewalMonth ?? null,
          renewalYear: i.renewalYear ?? null,
        },
      });
    }
    for (const i of plan.insurance.deletes) {
      await tx.insurancePolicy.deleteMany({ where: { userId, entityId: i.id } });
    }

    // --- recurring expense lines (auto-flow upsert by sourceRefId) ---
    for (const r of [...plan.recurring.inserts, ...plan.recurring.updates]) {
      const data = {
        userId,
        entityId: r.id,
        label: r.label,
        amount: r.amount,
        frequency: r.frequency,
        endYear: r.endYear ?? null,
        source: r.source,
        sourceRefId: r.sourceRefId ?? null,
        inflationBucket: r.inflationBucket ?? null,
        kind: r.kind ?? null,
      };
      if (r.sourceRefId != null) {
        await tx.recurringExpenseLine.upsert({
          where: { userId_sourceRefId: { userId, sourceRefId: r.sourceRefId } },
          create: data,
          update: data,
        });
      } else {
        await tx.recurringExpenseLine.upsert({
          where: { userId_entityId: { userId, entityId: r.id } },
          create: data,
          update: data,
        });
      }
    }
    for (const r of plan.recurring.deletes) {
      if (r.sourceRefId != null) {
        await tx.recurringExpenseLine.deleteMany({ where: { userId, sourceRefId: r.sourceRefId } });
      } else {
        await tx.recurringExpenseLine.deleteMany({ where: { userId, entityId: r.id } });
      }
    }

    // --- planned future lines ---
    for (const p of [...plan.plannedFuture.inserts, ...plan.plannedFuture.updates]) {
      const data = {
        userId,
        entityId: p.id,
        label: p.label,
        todayAmount: p.todayAmount,
        targetYear: p.targetYear,
        isMultiYear: p.isMultiYear,
        durationYears: p.durationYears ?? null,
        inflationBucket: p.inflationBucket ?? null,
        kind: p.kind ?? null,
      };
      await tx.plannedFutureLine.upsert({
        where: { userId_entityId: { userId, entityId: p.id } },
        create: data,
        update: data,
      });
    }
    for (const p of plan.plannedFuture.deletes) {
      await tx.plannedFutureLine.deleteMany({ where: { userId, entityId: p.id } });
    }

    // --- estate checklist (by key) ---
    for (const e of [...plan.estateChecklist.inserts, ...plan.estateChecklist.updates]) {
      const data = {
        userId,
        key: e.key,
        completed: e.completed,
        date: e.date ?? null,
        notes: e.notes ?? null,
      };
      await tx.estateChecklistItem.upsert({
        where: { userId_key: { userId, key: e.key } },
        create: data,
        update: data,
      });
    }
    for (const e of plan.estateChecklist.deletes) {
      await tx.estateChecklistItem.deleteMany({ where: { userId, key: e.key } });
    }

    return saved.updatedAt;
  });
}

async function replaceCoBorrowers(
  tx: Tx,
  userId: string,
  liabilityId: string,
  memberIds: string[],
): Promise<void> {
  await tx.liabilityCoBorrower.deleteMany({ where: { liabilityId } });
  if (memberIds.length) {
    await tx.liabilityCoBorrower.createMany({
      data: memberIds.map((memberId) => ({ userId, liabilityId, memberId })),
    });
  }
}
