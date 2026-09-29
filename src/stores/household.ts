import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
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
} from "@/types/household";
import { genId } from "@/lib/id";
import { dobFromAge } from "@/lib/age";
import { isEarningMember } from "@/lib/member-earning";
import { autoFlowOwnerId, EXPENSE_OWNER_HOUSEHOLD } from "@/lib/expense-attribution";
import { toMonthly, toAnnual, legacyFreqToPeriod } from "@/lib/cashflow";
import { plannedGoalInflationBucket } from "@/lib/derived-records";
import { makeAdapter } from "@/lib/storage-adapter";
import { getAuthProvider } from "@/lib/auth-provider";
import {
  captureSnapshot,
  hasSnapshotForPeriod,
  periodKey,
  financialYearOf,
} from "@/lib/expense-history";

// v2→v3 hydrate migration. Older serialized members (in localStorage) carry `age: number`
// but no `dateOfBirth` / no 6-field Q2.1 onboarding info. This adapter fills both so the
// rest of the app sees only v3-shaped Members.
// gh #67: `role` widens to `string` here because legacy localStorage carries the retired
// "EARNER" / "NON_EARNING_ADULT" values that `migrateRole()` collapses to "ADULT".
export type LegacyMember = Omit<Partial<Member>, "role"> & {
  id: string;
  name: string;
  role: string;
  age?: number;
  dateOfBirth?: string;
};

// gh #67: collapse the retired earner/non-earning-adult role flag → "ADULT" (earning is now derived
// from income, never stored). DEPENDENT is preserved; any unknown legacy value defaults to ADULT
// unless it is explicitly DEPENDENT. The pre-existing adult/dependent distinction is kept.
export function migrateRole(raw: string): Member["role"] {
  return raw === "DEPENDENT" ? "DEPENDENT" : "ADULT";
}

// #81 Phase 1 — resolve the owner a persisted recurring line should backfill to when it
// predates the member-attribution tag. Auto-flow lines inherit their source record's owner
// (loan/policy, Joint→Household); everything else defaults to "Household". Pure (arrays passed
// in) so it is unit-testable + reused by the hydrate backfill.
export function backfillRecurringOwnerId(
  r: RecurringExpenseLine,
  liabilities: readonly Liability[],
  insurance: readonly InsurancePolicy[],
): string {
  if (r.source === "auto-loan" && r.sourceRefId) {
    const l = liabilities.find((x) => x.id === r.sourceRefId);
    return l ? autoFlowOwnerId(l.ownerId) : EXPENSE_OWNER_HOUSEHOLD;
  }
  if (r.source === "auto-insurance" && r.sourceRefId) {
    const p = insurance.find((x) => x.id === r.sourceRefId);
    return p ? autoFlowOwnerId(p.insuredPersonId) : EXPENSE_OWNER_HOUSEHOLD;
  }
  return EXPENSE_OWNER_HOUSEHOLD;
}

export function migrateMember(raw: LegacyMember): Member {
  const dateOfBirth =
    raw.dateOfBirth && /^\d{4}-\d{2}-\d{2}$/.test(raw.dateOfBirth)
      ? raw.dateOfBirth
      : dobFromAge(typeof raw.age === "number" ? raw.age : 30);
  const role = migrateRole(raw.role);
  const isDependent = role === "DEPENDENT";
  // gh #67: a migrated adult that actually carries salary keeps "Employed"; a non-earning adult
  // (homemaker) carries no employmentStatus — earning is derived, so don't fabricate a job.
  const hasSalary = (raw.salary?.annualCTC ?? 0) > 0;

  return {
    id: raw.id,
    // Phase 1 Stage B — multi-tenant userId backfill (ADR-0001). v4 data has
    // no userId; default to the current AuthProvider id.
    userId: raw.userId ?? getAuthProvider().getCurrentUserId(),
    name: raw.name,
    dateOfBirth,
    role,
    targetRetirementAge: raw.targetRetirementAge,
    // Phase 1 Stage B — planToAge backfill (audit Entry #1 A1.2 default 90).
    planToAge: raw.planToAge ?? 90,
    relation: raw.relation,
    salary: raw.salary,
    city: raw.city ?? "Metro",
    health: raw.health ?? "Healthy",
    educationStage: raw.educationStage ?? (isDependent ? "Preschool" : undefined),
    riskAppetite: raw.riskAppetite ?? (isDependent ? "Conservative" : "Moderate"),
    // gh #34: adults default Married; only child dependents Single.
    marital: raw.marital ?? (isDependent ? "Single" : "Married"),
    employmentStatus: raw.employmentStatus ?? (hasSalary ? "Employed" : undefined),
  };
}

// Storage now routes through @/lib/storage-adapter — namespaced by userId per ADR-0001.
const ENTITY_KEY = "household";

// Audit-grounded household-level planning defaults (audit Entries #6 / #10).
// The Household entity is the canonical home for these (not the flat assumption
// store) — /preferences resets and the hydrate backfill both read them from
// here so there is a single source (DRY). See ADR-0002.
export const DEFAULT_EXTENDED_FAMILY_CONTINGENCY_PERCENT = 0.075;
export const DEFAULT_HEALTHCARE_CORPUS_RESERVATION_PERCENT = 0.2;

function emptyHousehold(): Household {
  return {
    name: "",
    setupMode: "Solo",
    profileComplete: false,
    wizardCompleted: false,
    members: [],
    businesses: [],
    otherIncome: [],
    investments: [],
    liabilities: [],
    insurance: [],
    expenses: {
      avgMonthly: 0,
      recurring: [],
      plannedFuture: [],
    },
    // Phase 1 Stage B — audit-grounded defaults. User-editable via /preferences.
    extendedFamilyContingencyPercent: DEFAULT_EXTENDED_FAMILY_CONTINGENCY_PERCENT,
    healthcareCorpusReservationPercent: DEFAULT_HEALTHCARE_CORPUS_RESERVATION_PERCENT,
    glidePath: {
      enabled: false,
      startEquityPercent: 75,
      endEquityPercent: 40,
      taperWindowYears: 10,
    },
    estateChecklist: [],
  };
}

// Q3 (v3): v2 had a separate ownerEntities array for HUF/LLP/Partnership/PvtLtd labels.
// v3 collapses these into businesses[] with isOperated: false. This adapter converts each
// legacy entity to a passive business (zero profit, 100% share, first earner as owner).
type LegacyOwnerEntity = { id: string; name: string; kind: string };
function migrateOwnerEntityToBusiness(
  entity: LegacyOwnerEntity,
  firstEarnerId: string,
): Business {
  // Map legacy entityKind (HUF/LLP/Partnership/PvtLtd/Other) onto BusinessLegalKind.
  const kindMap: Record<string, Business["legalKind"]> = {
    HUF: "HUF",
    LLP: "LLP",
    Partnership: "Partnership",
    PvtLtd: "PvtLtd",
    Other: "Other",
  };
  return {
    id: entity.id,
    name: entity.name,
    legalKind: kindMap[entity.kind] ?? "Other",
    annualProfit: 0,
    frequency: "A",
    sharePercent: 100,
    ownerId: firstEarnerId,
    isOperated: false,
  };
}

export const useHouseholdStore = defineStore("household", () => {
  const data = ref<Household>(emptyHousehold());
  const hydrated = ref(false);
  const lastSavedAt = ref<number | null>(null);
  // Bumped on every snapshot write so chart computeds (which read the
  // non-reactive localStorage via loadAllSnapshots) re-evaluate. P3.
  const snapshotVersion = ref(0);
  const adapter = makeAdapter(getAuthProvider());

  function hydrate() {
    if (hydrated.value) return;
    try {
      const parsed = adapter.get<Household & { ownerEntities?: unknown[] }>(ENTITY_KEY);
      if (parsed) {
        // Merge to tolerate older serialized shapes
        data.value = { ...emptyHousehold(), ...parsed };
        // Q3 (v3): remove stale ownerEntities field that older localStorage carries; the
        // migration below converts it into businesses[]. Leaving it on the runtime object
        // causes JSON.stringify to round-trip the dead field forever.
        if ("ownerEntities" in data.value) {
          delete (data.value as unknown as { ownerEntities?: unknown }).ownerEntities;
        }
        // Ensure nested defaults
        data.value.expenses = {
          ...emptyHousehold().expenses,
          ...(parsed.expenses ?? {}),
        };
        // v2→v3 (Q2 + Q2.1): backfill DOB + 6 fields for legacy members that lack them.
        if (Array.isArray(parsed.members)) {
          data.value.members = parsed.members.map((m: LegacyMember) => migrateMember(m));
        }
        // v2→v3 (Q3): collapse ownerEntities[] into businesses[] as passive entities,
        // preserving the entity id so any OtherIncomeLine.sourceEntityId references still resolve.
        if (Array.isArray(parsed.ownerEntities) && parsed.ownerEntities.length > 0) {
          const firstEarnerId = data.value.members.find((m) => m.role === "ADULT")?.id
            ?? data.value.members[0]?.id
            ?? "you";
          const migratedBiz = (parsed.ownerEntities as LegacyOwnerEntity[]).map((e) =>
            migrateOwnerEntityToBusiness(e, firstEarnerId),
          );
          // Merge into existing businesses[] (id-collision tolerant: legacy entities win the slot)
          const existingIds = new Set(data.value.businesses.map((b) => b.id));
          for (const b of migratedBiz) {
            if (!existingIds.has(b.id)) data.value.businesses.push(b);
          }
        }
        // Ensure every business has isOperated (default true) for older serialized businesses.
        // Also: Phase 0 Stage A1 migration — translate legacy 'monthly'/'annual'
        // frequency tags (the v4 OtherIncomeLine + Business shape) to the unified
        // 'M' | 'Q' | 'A' Period codes consumed by lib/cashflow.
        data.value.businesses = data.value.businesses.map((b) => ({
          ...b,
          isOperated: typeof b.isOperated === "boolean" ? b.isOperated : true,
          frequency: legacyFreqToPeriod(b.frequency),
        }));
        data.value.otherIncome = data.value.otherIncome.map((o) => ({
          ...o,
          frequency: legacyFreqToPeriod(o.frequency),
        }));
        // Phase 1 Stage B — backfill inflationBucket + kind on recurring lines
        // (audit Entry #3 A3.6 + #6 A6.1 + #10 A10.2).
        data.value.expenses.recurring = data.value.expenses.recurring.map((r) => ({
          ...r,
          frequency: legacyFreqToPeriod(r.frequency),
          inflationBucket: r.inflationBucket ?? "general",
          kind: r.kind ?? "general",
          // #81 Phase 1 — backfill member-attribution owner. Auto-flow lines inherit their
          // source record's owner (loan/policy → Joint→Household); manual lines default to
          // Household. Keeps existing households' totals byte-identical (display-only tag).
          ownerId:
            r.ownerId ??
            backfillRecurringOwnerId(r, data.value.liabilities, data.value.insurance),
        }));
        // Phase 1 Stage B — backfill inflationBucket + kind on planned-future lines
        // (audit Entry #3 A3.6 + #6 A6.2 + #10 A10.3).
        // ADR-0006 Phase 1d: a bucket-less line takes the bucket its KIND implies, not a blanket
        // "general". Stamping "general" on a legacy education goal permanently priced it at
        // all-items CPI instead of education inflation — a FIRE target too small, which is the
        // optimistic direction — and it did so INVISIBLY, because the value then looked like a
        // deliberate user choice. The goal form already routes kind -> bucket; this makes the
        // legacy path agree with it, through the same shared map the kernel reads.
        data.value.expenses.plannedFuture = data.value.expenses.plannedFuture.map((p) => ({
          ...p,
          inflationBucket: p.inflationBucket ?? plannedGoalInflationBucket(p.kind),
          kind: p.kind ?? "general",
          // #81 Phase 1 — planned-future lines default to Household (no auto-flow source).
          ownerId: p.ownerId ?? EXPENSE_OWNER_HOUSEHOLD,
        }));
        // Phase 1 Stage B — backfill liability coBorrowers (audit Entry #23 A23.1).
        data.value.liabilities = data.value.liabilities.map((l) => ({
          ...l,
          coBorrowers: l.coBorrowers ?? [],
        }));
        // Phase 1 Stage B — backfill household-level defaults if missing.
        if (data.value.extendedFamilyContingencyPercent === undefined) {
          data.value.extendedFamilyContingencyPercent = DEFAULT_EXTENDED_FAMILY_CONTINGENCY_PERCENT;
        }
        if (data.value.healthcareCorpusReservationPercent === undefined) {
          data.value.healthcareCorpusReservationPercent = DEFAULT_HEALTHCARE_CORPUS_RESERVATION_PERCENT;
        }
        if (!data.value.glidePath) {
          data.value.glidePath = {
            enabled: false,
            startEquityPercent: 75,
            endEquityPercent: 40,
            taperWindowYears: 10,
          };
        }
        if (!Array.isArray(data.value.estateChecklist)) {
          data.value.estateChecklist = [];
        }
      }
    } catch {
      // ignore — start fresh
    }
    // Accrue a monthly expense snapshot for returning users (A29.1/A30.1, P3).
    maybeCaptureSnapshot(new Date());
    hydrated.value = true;
  }

  /**
   * Monthly snapshot capture (audit A29.1/A30.1, P3). Accrues one real expense
   * snapshot per calendar month so the YoY-expense + FIRE-trajectory charts
   * build honestly over time. Idempotent per `YYYY-MM`; skips empty households
   * (nothing to chart yet). `now` is injected for test determinism. The FIRE
   * number can't be derived here (it needs the assumptions+ui stores + engine),
   * so the Dashboard enriches the current period via {@link recordFireSnapshot}.
   */
  function maybeCaptureSnapshot(now: Date = new Date()) {
    if (data.value.members.length === 0) return;
    const period = periodKey(now);
    if (hasSnapshotForPeriod(period)) return;
    captureSnapshot(data.value, { period, fy: financialYearOf(now) });
    snapshotVersion.value++;
  }

  /**
   * Enrich (or create) the current period's snapshot with the derived FIRE
   * number + target year (A30.3 trajectory chart). Called from the Dashboard,
   * where useFireDerive() is live. Idempotent per period (replaces, never
   * duplicates). No-op for an empty household.
   */
  function recordFireSnapshot(
    fireNumber: number,
    fireTargetYear: number | undefined,
    netWorth: number | undefined = undefined,
    now: Date = new Date(),
  ) {
    if (data.value.members.length === 0) return;
    captureSnapshot(data.value, {
      period: periodKey(now),
      fy: financialYearOf(now),
      fireNumber,
      fireTargetYear,
      netWorth,
    });
    snapshotVersion.value++;
  }

  function persist() {
    adapter.set(ENTITY_KEY, data.value);
    lastSavedAt.value = Date.now();
  }

  watch(data, persist, { deep: true });

  function resetAll() {
    data.value = emptyHousehold();
    // adapter.clearForCurrentUser() wipes every namespaced key belonging
    // to this userId — household + ui + assumptions + scenarios +
    // features + active-seed + tour-dismissed in one shot.
    adapter.clearForCurrentUser();
  }

  function replaceAll(next: Household) {
    data.value = { ...emptyHousehold(), ...next };
    data.value.expenses = {
      ...emptyHousehold().expenses,
      ...(next.expenses ?? {}),
    };
    // Defensive: ensure every business has isOperated (Q3 backfill).
    data.value.businesses = data.value.businesses.map((b) => ({
      ...b,
      isOperated: typeof b.isOperated === "boolean" ? b.isOperated : true,
    }));
  }

  // ---------- Members ----------
  function addMember(member: Omit<Member, "id"> & { id?: string }): Member {
    const m: Member = { ...member, id: member.id ?? genId("mem") };
    data.value.members.push(m);
    return m;
  }
  function updateMember(id: string, patch: Partial<Member>) {
    const m = data.value.members.find((x) => x.id === id);
    if (m) Object.assign(m, patch);
    autoFlowSalaryToEPF();
  }
  function removeMember(id: string) {
    data.value.members = data.value.members.filter((m) => m.id !== id);
    // Owner cleanup — re-assign to first remaining member or remove orphaned
    const first = data.value.members[0];
    if (!first) return;
    const reassign = (mid: string) => (mid === id ? first.id : mid);
    data.value.investments.forEach((i) => (i.ownerId = reassign(i.ownerId)));
    data.value.liabilities.forEach((l) => (l.ownerId = reassign(l.ownerId)));
    data.value.insurance.forEach((p) => (p.insuredPersonId = reassign(p.insuredPersonId)));
    data.value.businesses.forEach((b) => (b.ownerId = reassign(b.ownerId)));
    data.value.otherIncome.forEach((o) => (o.ownerId = reassign(o.ownerId)));
    // #81 Phase 1 — an itemised expense owned by the removed member becomes a shared
    // "Household" cost (not reassigned to another specific member — a removed person's
    // gym fee is not someone else's personal expense). Keeps the per-member view honest;
    // the household total is unaffected either way (display-only tag).
    const reassignExpenseOwner = (mid: string | undefined) =>
      mid === id ? EXPENSE_OWNER_HOUSEHOLD : (mid ?? EXPENSE_OWNER_HOUSEHOLD);
    data.value.expenses.recurring.forEach((r) => (r.ownerId = reassignExpenseOwner(r.ownerId)));
    data.value.expenses.plannedFuture.forEach((p) => (p.ownerId = reassignExpenseOwner(p.ownerId)));
  }

  // ---------- Other income ----------
  function addOtherIncome(line: Omit<OtherIncomeLine, "id">): OtherIncomeLine {
    const l: OtherIncomeLine = { ...line, id: genId("inc") };
    data.value.otherIncome.push(l);
    return l;
  }
  function updateOtherIncome(id: string, patch: Partial<OtherIncomeLine>) {
    const l = data.value.otherIncome.find((x) => x.id === id);
    if (l) Object.assign(l, patch);
  }
  function removeOtherIncome(id: string) {
    data.value.otherIncome = data.value.otherIncome.filter((l) => l.id !== id);
  }

  // ---------- Businesses ----------
  function addBusiness(biz: Omit<Business, "id">): Business {
    const b: Business = { ...biz, id: genId("biz") };
    data.value.businesses.push(b);
    return b;
  }
  function updateBusiness(id: string, patch: Partial<Business>) {
    const b = data.value.businesses.find((x) => x.id === id);
    if (b) Object.assign(b, patch);
  }
  function removeBusiness(id: string) {
    data.value.businesses = data.value.businesses.filter((b) => b.id !== id);
  }

  // ---------- Investments ----------
  function addInvestment(inv: Omit<Investment, "id">): Investment {
    const i: Investment = { ...inv, id: genId("inv") };
    data.value.investments.push(i);
    return i;
  }
  function updateInvestment(id: string, patch: Partial<Investment>) {
    const i = data.value.investments.find((x) => x.id === id);
    if (i) Object.assign(i, patch);
  }
  function removeInvestment(id: string) {
    data.value.investments = data.value.investments.filter((i) => i.id !== id);
  }

  // ---------- Liabilities ----------
  function addLiability(loan: Omit<Liability, "id">): Liability {
    const l: Liability = { ...loan, id: genId("liab") };
    data.value.liabilities.push(l);
    autoFlowEMIToRecurring();
    return l;
  }
  function updateLiability(id: string, patch: Partial<Liability>) {
    const l = data.value.liabilities.find((x) => x.id === id);
    if (l) Object.assign(l, patch);
    autoFlowEMIToRecurring();
  }
  function removeLiability(id: string) {
    data.value.liabilities = data.value.liabilities.filter((l) => l.id !== id);
    autoFlowEMIToRecurring();
  }

  // ---------- Insurance ----------
  function addInsurance(policy: Omit<InsurancePolicy, "id">): InsurancePolicy {
    const p: InsurancePolicy = { ...policy, id: genId("pol") };
    data.value.insurance.push(p);
    autoFlowInsuranceToRecurring();
    return p;
  }
  function updateInsurance(id: string, patch: Partial<InsurancePolicy>) {
    const p = data.value.insurance.find((x) => x.id === id);
    if (p) Object.assign(p, patch);
    autoFlowInsuranceToRecurring();
  }
  function removeInsurance(id: string) {
    data.value.insurance = data.value.insurance.filter((p) => p.id !== id);
    autoFlowInsuranceToRecurring();
  }

  // ---------- Recurring + planned-future expenses ----------
  function setAvgMonthly(amount: number) {
    data.value.expenses.avgMonthly = amount;
  }
  function addRecurring(line: Omit<RecurringExpenseLine, "id">): RecurringExpenseLine {
    const r: RecurringExpenseLine = { ...line, id: genId("rec") };
    data.value.expenses.recurring.push(r);
    return r;
  }
  function updateRecurring(id: string, patch: Partial<RecurringExpenseLine>) {
    const r = data.value.expenses.recurring.find((x) => x.id === id);
    if (r) Object.assign(r, patch);
  }
  function removeRecurring(id: string) {
    data.value.expenses.recurring = data.value.expenses.recurring.filter((r) => r.id !== id);
  }
  function addPlannedFuture(line: Omit<PlannedFutureLine, "id">): PlannedFutureLine {
    const p: PlannedFutureLine = { ...line, id: genId("plan") };
    data.value.expenses.plannedFuture.push(p);
    return p;
  }
  function updatePlannedFuture(id: string, patch: Partial<PlannedFutureLine>) {
    const p = data.value.expenses.plannedFuture.find((x) => x.id === id);
    if (p) Object.assign(p, patch);
  }
  function removePlannedFuture(id: string) {
    data.value.expenses.plannedFuture = data.value.expenses.plannedFuture.filter((p) => p.id !== id);
  }

  // ---------- Auto-flow effects (D11b/c, D14 Mode B) ----------
  function autoFlowInsuranceToRecurring() {
    // Strip prior auto-insurance lines
    data.value.expenses.recurring = data.value.expenses.recurring.filter(
      (r) => r.source !== "auto-insurance",
    );
    // Re-add a recurring line per policy (monthly equivalent of annual premium)
    for (const p of data.value.insurance) {
      data.value.expenses.recurring.push({
        id: `auto-ins-${p.id}`,
        label: `${p.type} insurance — ${p.provider}`,
        amount: Math.round(p.annualPremium / 12),
        frequency: "M",
        source: "auto-insurance",
        sourceRefId: p.id,
        // #81 Phase 1 — inherit the insured person as the expense owner (Joint → Household).
        ownerId: autoFlowOwnerId(p.insuredPersonId),
      });
    }
  }
  function autoFlowEMIToRecurring() {
    data.value.expenses.recurring = data.value.expenses.recurring.filter(
      (r) => r.source !== "auto-loan",
    );
    for (const l of data.value.liabilities) {
      data.value.expenses.recurring.push({
        id: `auto-loan-${l.id}`,
        label: `EMI — ${l.name}`,
        amount: l.monthlyEMI,
        frequency: "M",
        source: "auto-loan",
        sourceRefId: l.id,
        endYear: l.derivedEndYear ?? undefined,
        // #81 Phase 1 — inherit the loan owner as the expense owner (Joint → Household).
        ownerId: autoFlowOwnerId(l.ownerId),
      });
    }
  }
  function autoFlowSalaryToEPF() {
    // For each earner with salary, ensure an EPF·VPF investment exists with derived monthly contribution.
    // 12% statutory of basic (estimated as 40% of CTC) + 12% employer match; monthly = (annual × (1 + topUp%)) / 12
    for (const m of data.value.members) {
      // gh #67: EPF auto-flow is salary-driven — an adult with actual CTC. Earning is derived.
      if (m.role !== "ADULT" || !m.salary?.annualCTC) continue;
      const basic = m.salary.annualCTC * 0.4;
      const topUp = (m.salary.vpfTopUpPercent ?? 0) / 100;
      const annualEmpEmployee = basic * 0.12 * (1 + topUp);
      const annualEmployer = basic * 0.12;
      const monthly = Math.round((annualEmpEmployee + annualEmployer) / 12);

      const existing = data.value.investments.find(
        (i) => i.type === "EPF_VPF" && i.ownerId === m.id,
      );
      if (existing) {
        existing.monthlyContribution = monthly;
      } else {
        data.value.investments.push({
          id: genId("inv"),
          type: "EPF_VPF",
          label: "EPF",
          value: 0,
          monthlyContribution: monthly,
          ownerId: m.id,
        });
      }
    }
  }

  function markProfileComplete() {
    data.value.profileComplete = true;
  }
  function markWizardComplete() {
    data.value.wizardCompleted = true;
  }
  function setSetupMode(mode: Household["setupMode"]) {
    data.value.setupMode = mode;
  }
  function setHouseholdName(name: string) {
    data.value.name = name;
  }

  // ---------- Derived getters ----------
  const members = computed(() => data.value.members);
  // gh #67: `adults` = the role-driven roster (who CAN earn / own assets / enter salary). This is the
  // editing axis used by the Salary/Income screens + owner dropdowns, so a non-earning adult is still
  // selectable and can be given income (the no-earner→no-salary-input deadlock the derived earner set
  // would otherwise create). `earners` is DERIVED from that income (the math/display axis).
  const adults = computed(() => data.value.members.filter((m) => m.role === "ADULT"));
  const earners = computed(() =>
    data.value.members.filter((m) => isEarningMember(m, data.value.businesses)),
  );
  const dependents = computed(() => data.value.members.filter((m) => m.role === "DEPENDENT"));
  const isSolo = computed(() => data.value.members.length <= 1);
  const profileComplete = computed(() => data.value.profileComplete);
  const wizardCompleted = computed(() => data.value.wizardCompleted);
  const totalAnnualIncome = computed(() => {
    const salaryIncome = data.value.members.reduce(
      (sum, m) => sum + (m.salary?.annualCTC ?? 0),
      0,
    );
    const otherTaxable = data.value.otherIncome
      .filter((o) => !o.isTaxExempt)
      .reduce((sum, o) => sum + toAnnual({ amount: o.amount, period: o.frequency }), 0);
    const otherExempt = data.value.otherIncome
      .filter((o) => o.isTaxExempt)
      .reduce((sum, o) => sum + toAnnual({ amount: o.amount, period: o.frequency }), 0);
    const businessShare = data.value.businesses.reduce(
      (sum, b) =>
        sum + toAnnual({ amount: b.annualProfit, period: b.frequency }) * (b.sharePercent / 100),
      0,
    );
    return { salaryIncome, otherTaxable, otherExempt, businessShare, total: salaryIncome + otherTaxable + otherExempt + businessShare };
  });
  const totalMonthlyExpenses = computed(() => {
    const avg = data.value.expenses.avgMonthly;
    const recurring = data.value.expenses.recurring.reduce(
      (sum, r) => sum + toMonthly({ amount: r.amount, period: r.frequency }),
      0,
    );
    return avg + recurring;
  });
  const totalCorpus = computed(() =>
    data.value.investments.reduce((sum, i) => sum + i.value, 0),
  );
  const totalLiabilities = computed(() =>
    data.value.liabilities.reduce((sum, l) => sum + l.outstandingBalance, 0),
  );
  const monthlyInvestmentContribution = computed(() =>
    data.value.investments.reduce((sum, i) => sum + (i.monthlyContribution ?? 0), 0),
  );

  return {
    // state
    data,
    lastSavedAt,
    members,
    adults,
    earners,
    dependents,
    isSolo,
    profileComplete,
    wizardCompleted,
    totalAnnualIncome,
    totalMonthlyExpenses,
    totalCorpus,
    totalLiabilities,
    monthlyInvestmentContribution,
    // lifecycle
    hydrate,
    maybeCaptureSnapshot,
    recordFireSnapshot,
    snapshotVersion,
    persist,
    resetAll,
    replaceAll,
    markProfileComplete,
    markWizardComplete,
    setSetupMode,
    setHouseholdName,
    // members
    addMember,
    updateMember,
    removeMember,
    // other income
    addOtherIncome,
    updateOtherIncome,
    removeOtherIncome,
    // business
    addBusiness,
    updateBusiness,
    removeBusiness,
    // investments
    addInvestment,
    updateInvestment,
    removeInvestment,
    // liabilities
    addLiability,
    updateLiability,
    removeLiability,
    // insurance
    addInsurance,
    updateInsurance,
    removeInsurance,
    // expenses
    setAvgMonthly,
    addRecurring,
    updateRecurring,
    removeRecurring,
    addPlannedFuture,
    updatePlannedFuture,
    removePlannedFuture,
    // auto-flow runners (exposed for tests + persona load)
    autoFlowSalaryToEPF,
    autoFlowInsuranceToRecurring,
    autoFlowEMIToRecurring,
  };
});

// Inline helpers removed in Phase 0 Stage A1 — all callers now route
// through @/lib/cashflow (toMonthly / toAnnual). See cashflow.ts.
