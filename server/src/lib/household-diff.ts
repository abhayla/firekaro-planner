/**
 * Household diff engine — the highest-complexity piece of the v6 backend.
 *
 * Pure function over `Household` documents (NO DB). `PUT /api/planner/household`
 * reads the user's current rows, reconstructs a `Household`, diffs it against the
 * incoming document, and applies the resulting plan inside ONE Prisma
 * `$transaction`. Keeping the classification pure makes it fully unit-testable
 * without a database (goal contract §0.3) — see household-diff.spec.ts.
 *
 * Matching rules (the would-be bugs the architect pass caught):
 *   - most arrays match by the document entity id (members, businesses,
 *     otherIncome, investments, liabilities, insurance, plannedFuture).
 *   - recurring expense lines: AUTO-FLOW rows (a sourceRefId is present) match by
 *     sourceRefId, so a regenerated auto-loan/auto-insurance row with a fresh id
 *     but the same sourceRefId is an UPDATE, not insert+delete (the
 *     ON CONFLICT(userId, sourceRefId) case). Manual rows match by id.
 *   - estate checklist items match by `key`.
 *   - a matched row that deep-equals current is `unchanged` (no write); a matched
 *     row that differs is an `update`; incoming-only is `insert`; current-only is
 *     `delete`. This yields true row-count idempotency on an identical PUT.
 *
 * `ownerId` (incl. the literal "Joint") is carried through verbatim — no FK, no
 * special handling; the DB stores it as plain TEXT.
 */

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

// ---------- Plan shape ----------

export interface ArrayDiff<T> {
  inserts: T[];
  updates: T[];
  unchanged: T[];
  deletes: T[];
}

/** The household-root scalars that live on the `household_config` singleton row. */
export interface HouseholdConfigScalars {
  name: string;
  setupMode: SetupMode;
  profileComplete: boolean;
  wizardCompleted: boolean;
  expensesAvgMonthly: number;
  extendedFamilyContingencyPercent?: number;
  healthcareCorpusReservationPercent?: number;
  glidePath?: GlidePathConfig;
}

export interface HouseholdDiffPlan {
  configChanged: boolean;
  config: HouseholdConfigScalars;
  members: ArrayDiff<Member>;
  businesses: ArrayDiff<Business>;
  otherIncome: ArrayDiff<OtherIncomeLine>;
  investments: ArrayDiff<Investment>;
  liabilities: ArrayDiff<Liability>;
  insurance: ArrayDiff<InsurancePolicy>;
  recurring: ArrayDiff<RecurringExpenseLine>;
  plannedFuture: ArrayDiff<PlannedFutureLine>;
  estateChecklist: ArrayDiff<EstateChecklistItem>;
}

// ---------- Pure helpers ----------

/** Structural deep-equal (stable for plain JSON-ish data; key order independent). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return false;
  }
  const aArr = Array.isArray(a);
  const bArr = Array.isArray(b);
  if (aArr !== bArr) return false;
  if (aArr && bArr) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], (b as unknown[])[i])) return false;
    }
    return true;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const aKeys = Object.keys(ao).filter((k) => ao[k] !== undefined);
  const bKeys = Object.keys(bo).filter((k) => bo[k] !== undefined);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!deepEqual(ao[k], bo[k])) return false;
  }
  return true;
}

/**
 * Classify two arrays into insert/update/unchanged/delete by a match key.
 * Duplicate keys on the incoming side: the last one wins (the store never emits
 * dupes, but this keeps the function total).
 */
export function diffArray<T>(
  current: T[],
  incoming: T[],
  keyOf: (t: T) => string,
): ArrayDiff<T> {
  const currentByKey = new Map<string, T>();
  for (const c of current) currentByKey.set(keyOf(c), c);

  const inserts: T[] = [];
  const updates: T[] = [];
  const unchanged: T[] = [];
  const seen = new Set<string>();

  for (const inc of incoming) {
    const key = keyOf(inc);
    seen.add(key);
    const cur = currentByKey.get(key);
    if (cur === undefined) {
      inserts.push(inc);
    } else if (deepEqual(cur, inc)) {
      unchanged.push(inc);
    } else {
      updates.push(inc);
    }
  }

  const deletes: T[] = [];
  for (const c of current) {
    if (!seen.has(keyOf(c))) deletes.push(c);
  }

  return { inserts, updates, unchanged, deletes };
}

/** Recurring-line match key: auto-flow rows by sourceRefId, manual rows by id. */
function recurringKey(r: RecurringExpenseLine): string {
  return r.sourceRefId != null ? `ref:${r.sourceRefId}` : `id:${r.id}`;
}

function byId<T extends { id: string }>(t: T): string {
  return t.id;
}

function configOf(h: Household): HouseholdConfigScalars {
  return {
    name: h.name,
    setupMode: h.setupMode,
    profileComplete: h.profileComplete,
    wizardCompleted: h.wizardCompleted,
    expensesAvgMonthly: h.expenses.avgMonthly,
    extendedFamilyContingencyPercent: h.extendedFamilyContingencyPercent,
    healthcareCorpusReservationPercent: h.healthcareCorpusReservationPercent,
    glidePath: h.glidePath,
  };
}

// ---------- Public API ----------

const EMPTY: Household = {
  name: "",
  setupMode: "Custom",
  profileComplete: false,
  wizardCompleted: false,
  members: [],
  businesses: [],
  otherIncome: [],
  investments: [],
  liabilities: [],
  insurance: [],
  expenses: { avgMonthly: 0, recurring: [], plannedFuture: [] },
};

/**
 * Diff the current persisted household (null = no rows yet) against an incoming
 * document. Returns a per-table plan. Pure — no IO.
 */
export function diffHousehold(
  current: Household | null,
  incoming: Household,
): HouseholdDiffPlan {
  const cur = current ?? EMPTY;
  const config = configOf(incoming);
  const configChanged = current === null || !deepEqual(configOf(cur), config);

  return {
    configChanged,
    config,
    members: diffArray(cur.members, incoming.members, byId),
    businesses: diffArray(cur.businesses, incoming.businesses, byId),
    otherIncome: diffArray(cur.otherIncome, incoming.otherIncome, byId),
    investments: diffArray(cur.investments, incoming.investments, byId),
    liabilities: diffArray(cur.liabilities, incoming.liabilities, byId),
    insurance: diffArray(cur.insurance, incoming.insurance, byId),
    recurring: diffArray(cur.expenses.recurring, incoming.expenses.recurring, recurringKey),
    plannedFuture: diffArray(cur.expenses.plannedFuture, incoming.expenses.plannedFuture, byId),
    estateChecklist: diffArray(
      cur.estateChecklist ?? [],
      incoming.estateChecklist ?? [],
      (e) => e.key,
    ),
  };
}

/**
 * Simulate applying a plan to the current household IN MEMORY (no DB) and return
 * the resulting household. The route applies the same plan to Postgres inside a
 * transaction; this mirror lets the unit tests prove PUT->reconstruct fidelity
 * (Rule 26) without a database (goal contract §0.3).
 */
export function simulateApply(
  current: Household | null,
  plan: HouseholdDiffPlan,
): Household {
  const cur = current ?? EMPTY;

  function apply<T>(currentArr: T[], diff: ArrayDiff<T>, keyOf: (t: T) => string): T[] {
    const deleteKeys = new Set(diff.deletes.map(keyOf));
    const updateByKey = new Map(diff.updates.map((u) => [keyOf(u), u]));
    const out: T[] = [];
    for (const c of currentArr) {
      const k = keyOf(c);
      if (deleteKeys.has(k)) continue;
      out.push(updateByKey.get(k) ?? c);
    }
    out.push(...diff.inserts);
    return out;
  }

  const c = plan.config;
  return {
    name: c.name,
    setupMode: c.setupMode,
    profileComplete: c.profileComplete,
    wizardCompleted: c.wizardCompleted,
    members: apply(cur.members, plan.members, byId),
    businesses: apply(cur.businesses, plan.businesses, byId),
    otherIncome: apply(cur.otherIncome, plan.otherIncome, byId),
    investments: apply(cur.investments, plan.investments, byId),
    liabilities: apply(cur.liabilities, plan.liabilities, byId),
    insurance: apply(cur.insurance, plan.insurance, byId),
    expenses: {
      avgMonthly: c.expensesAvgMonthly,
      recurring: apply(cur.expenses.recurring, plan.recurring, recurringKey),
      plannedFuture: apply(cur.expenses.plannedFuture, plan.plannedFuture, byId),
    },
    extendedFamilyContingencyPercent: c.extendedFamilyContingencyPercent,
    healthcareCorpusReservationPercent: c.healthcareCorpusReservationPercent,
    glidePath: c.glidePath,
    estateChecklist: apply(cur.estateChecklist ?? [], plan.estateChecklist, (e) => e.key),
  };
}
