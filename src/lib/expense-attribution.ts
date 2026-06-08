/**
 * expense-attribution — the ONE canonical helper for member-attributing itemised
 * expenses (#81 Phase 1). Both the kernel (derive.ts) and the UI read these; there is
 * no second copy of the ring/lens logic (contract §9 "one canonical helper each").
 *
 * Expenses use their OWN owner sentinels — "Household" (shared) and "Dependents"
 * (kids-shared) — deliberately DISTINCT from the investments/liabilities "Joint"
 * sentinel, because an expense is shared across the WHOLE household (incl. children),
 * whereas a "Joint" asset is co-owned by the two adults. Keeping the sentinels
 * separate prevents the expense lens from accidentally reusing the asset lens's
 * "Joint always visible" semantics.
 */
import { isAdultRole, type Member } from "@/types/household";

/** Shared-across-the-household owner tag (ring 2). The default for every itemised expense. */
export const EXPENSE_OWNER_HOUSEHOLD = "Household";
/** "Kids (shared)" owner tag (ring 3) — a cost attributable to the children collectively. */
export const EXPENSE_OWNER_DEPENDENTS = "Dependents";

/** ring 1 = personal (an adult's own) · ring 2 = shared (Household) · ring 3 = dependents (kids). */
export type ExpenseRing = "personal" | "shared" | "dependents";

/**
 * Canonical ring derivation (contract §2 decision 2). One source of truth for "which
 * ring does this expense fall in", driven by the owner tag + the member's role (#67):
 *   - "Household" sentinel        → "shared"     (ring 2)
 *   - "Dependents" sentinel       → "dependents" (ring 3)
 *   - an ADULT member's id        → "personal"   (ring 1)
 *   - a DEPENDENT member's id     → "dependents" (ring 3)
 *   - an unknown/stale owner id   → "shared"     (safe fallback = Household; never throws)
 */
export function expenseRing(ownerId: string, members: readonly Member[]): ExpenseRing {
  if (ownerId === EXPENSE_OWNER_HOUSEHOLD) return "shared";
  if (ownerId === EXPENSE_OWNER_DEPENDENTS) return "dependents";
  const m = members.find((x) => x.id === ownerId);
  if (!m) return "shared";
  return isAdultRole(m.role) ? "personal" : "dependents";
}

/**
 * Expense member-lens matcher (contract §2 decision 3). A lensed adult sees their OWN
 * itemised expenses PLUS the always-shared "Household" lines; another adult's personal
 * lines, a child's personal lines, and "Dependents"-tagged lines are hidden. With no
 * lens applied, everything is visible (the consolidated view). This is the expense
 * analogue of derive.ts's `ownerMatches` — but keyed on the "Household" sentinel, not
 * "Joint".
 */
export function expenseOwnerMatches(
  ownerId: string,
  applyLens: boolean,
  lensedMemberIds: ReadonlySet<string>,
): boolean {
  if (!applyLens) return true;
  if (ownerId === EXPENSE_OWNER_HOUSEHOLD) return true;
  return lensedMemberIds.has(ownerId);
}

export interface ExpenseOwnerOption {
  value: string;
  label: string;
}

/**
 * Build the grouped owner-picker options (contract §2 decision 6): Household (shared,
 * the default) → each adult by name → each child by name → "Kids (shared)" (only when
 * the household actually has children). Ordered so the v-select reads Household → Adults
 * → Children. The ONE source of these options — reused by every expense form so the
 * picker never drifts.
 */
export function buildExpenseOwnerOptions(members: readonly Member[]): ExpenseOwnerOption[] {
  const adults = members.filter((m) => isAdultRole(m.role));
  const dependents = members.filter((m) => !isAdultRole(m.role));
  const options: ExpenseOwnerOption[] = [
    { value: EXPENSE_OWNER_HOUSEHOLD, label: "Household (shared)" },
    ...adults.map((m) => ({ value: m.id, label: m.name || "Adult" })),
    ...dependents.map((m) => ({ value: m.id, label: m.name || "Child" })),
  ];
  if (dependents.length > 0) {
    options.push({ value: EXPENSE_OWNER_DEPENDENTS, label: "Kids (shared)" });
  }
  return options;
}

/** Human label for an owner tag — for the expense row's attribution chip. */
export function expenseOwnerLabel(ownerId: string | undefined, members: readonly Member[]): string {
  const id = ownerId ?? EXPENSE_OWNER_HOUSEHOLD;
  if (id === EXPENSE_OWNER_HOUSEHOLD) return "Household";
  if (id === EXPENSE_OWNER_DEPENDENTS) return "Kids";
  return members.find((m) => m.id === id)?.name || "Household";
}

/**
 * Resolve the owner tag an auto-flow expense (auto-loan EMI / auto-insurance premium)
 * inherits from its source record (contract §2 decision 5). A source owned "Joint" (the
 * asset/liability sentinel) maps to the expense "Household" sentinel; a member-owned
 * source keeps that member's id (so a child's health premium lands in ring 3).
 */
export function autoFlowOwnerId(sourceOwnerId: string): string {
  return sourceOwnerId === "Joint" ? EXPENSE_OWNER_HOUSEHOLD : sourceOwnerId;
}
