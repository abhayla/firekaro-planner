// gh #67 — THE single source of truth for "is this member an earner?".
//
// Earning-status is DERIVED from the presence of LABOUR income, never a manual role flag. A member
// earns iff they are an adult AND (they draw a salary OR they own an active, profit-making business).
// CAPITAL income (rental / dividend / interest / other-income) deliberately does NOT make an adult an
// earner: the "earner" fields it gates (retire-from-job age, employmentStatus) are about labour, and a
// homemaker who owns a rental is still non-earning in the retire-from-a-job sense. (gh #67 design Q1.)
//
// This is the ONE canonical helper — `derive.ts` (the 3 earner filters), the household store
// (`earners` getter + autoFlow EPF), and the role-aware UI all route through it, so the flag can never
// silently disagree with the income data the way the old manual `role === "EARNER"` could.
import type { Member, Business } from "@/types/household";

/**
 * Does this member draw labour income? Adult + (salary CTC > 0 OR owns an active profit-making
 * business). Dependents never earn. Pure — pass the household's `businesses` array.
 */
export function isEarningMember(member: Member, businesses: readonly Business[]): boolean {
  if (member.role !== "ADULT") return false;
  const hasSalary = (member.salary?.annualCTC ?? 0) > 0;
  if (hasSalary) return true;
  return businesses.some(
    (b) => b.ownerId === member.id && b.isOperated && b.annualProfit > 0,
  );
}
