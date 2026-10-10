/**
 * member-row-share — how much of ONE household row belongs to ONE adult in the member lens (#232).
 *
 * CONSERVATION LAW: for every row an adult or the couple owns (asset, contribution, income, expense,
 * loan balance, EMI), the shares over the household's adults sum to EXACTLY 1, at any split %.
 * Own rows are 1 for the owner and 0 for everyone else; a shared row ("Joint" asset/income, the
 * "Household" expense pool, a loan shared with the spouse) goes through `jointShareFor` — anchor
 * adult `split`, the other `1 − split`; 3+ adults equal shares; a single adult 100%.
 *
 * Before #232 every adult was given `split` of every shared row (120% at split 60) and a shared loan
 * gave its owner 100% plus the spouse `split` (150% at the default 50). Dependent-owned rows stay
 * outside the member lens (ring 3) and are 0 for every adult.
 */
import type { Household, Liability, RecurringExpenseLine } from "@/types/household";
import { jointShareFor } from "@/lib/tax-deductions";
import { EXPENSE_OWNER_HOUSEHOLD } from "@/lib/expense-attribution";

const JOINT = "Joint";

/** Asset, contribution and income rows: own 1, "Joint" complementary, anyone else's 0. */
export function ownedRowShare(
  household: Household,
  memberId: string,
  householdSplitPercent: number,
  ownerId: string | undefined,
): number {
  if (ownerId === memberId) return 1;
  if (ownerId === JOINT) return jointShareFor(household, memberId, householdSplitPercent);
  return 0;
}

/** A loan shared with the spouse is split complementarily (never the owner's 100% + the spouse's split). */
export function liabilityShare(
  household: Household,
  memberId: string,
  householdSplitPercent: number,
  liability: Pick<Liability, "ownerId" | "isSharedWithSpouse">,
): number {
  if (liability.isSharedWithSpouse) return jointShareFor(household, memberId, householdSplitPercent);
  return ownedRowShare(household, memberId, householdSplitPercent, liability.ownerId);
}

/**
 * Expense rows: the "Household" pool is shared; an auto-flowed EMI follows its loan's share (the store
 * tags a shared loan's EMI with the owner's id, so reading the owner alone would put 100% on them).
 */
export function expenseRowShare(
  household: Household,
  memberId: string,
  householdSplitPercent: number,
  row: Pick<RecurringExpenseLine, "ownerId" | "source" | "sourceRefId">,
): number {
  if (row.source === "auto-loan" && row.sourceRefId) {
    const loan = household.liabilities.find((l) => l.id === row.sourceRefId);
    if (loan) return liabilityShare(household, memberId, householdSplitPercent, loan);
  }
  const owner = row.ownerId ?? EXPENSE_OWNER_HOUSEHOLD;
  if (owner === EXPENSE_OWNER_HOUSEHOLD) return jointShareFor(household, memberId, householdSplitPercent);
  return owner === memberId ? 1 : 0;
}
