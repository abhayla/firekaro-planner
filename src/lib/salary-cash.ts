/**
 * salary-cash — the ONE source of truth for "what actually reaches the bank account".
 *
 * WHY THIS MODULE EXISTS (gh #218). Six surfaces computed take-home as
 * `annualCTC − incomeTax` and called it take-home: `derive.ts`'s `monthlyTakeHome`
 * (the dashboard stat block + the required-contribution solver ceiling),
 * `tax-deductions.ts`'s per-earner tax card, `useFireDerive.ts`'s member-lens
 * Financial-Health figure, the salary-form preview, and the tax-planning screen. For the
 * persona this product serves — a salaried accumulator with a statutory EPF deduction —
 * that number is roughly 6–12% too HIGH, because CTC includes both PF legs and
 * professional tax, none of which ever lands in the bank. An optimistic cash figure is a
 * Tier-0 honesty defect, and six copies of the formula meant fixing it once fixed nothing.
 *
 * WHAT TAKE-HOME IS HERE (and what it is NOT):
 *
 *   takeHome = CTC − PF (every leg) − incomeTax − professionalTax
 *
 * It is a REPORTING figure — the cash a user can recognise on a payslip. It is NOT the
 * savings base. `derive.ts`'s `annualSavings` stays `income − tax − expenses` (gh #11
 * LOCK): PF is funded OUT of that residual and is already counted as corpus inflow via
 * the EPF investment row, so subtracting it from savings too would double-count it and
 * push every EPF household's FIRE date years out. See the identity locks in `derive.spec.ts`.
 *
 * WHERE THE PF NUMBER COMES FROM — THE ONE DESIGN DECISION IN THIS FILE.
 *
 * PF is read from the household's EXISTING `EPF_VPF` investment rows, not recomputed from
 * a percentage of basic. That is deliberate and it is what makes this change provably
 * zero-movement:
 *
 *   - Those rows are the EXACT rupees the corpus already receives (the store's
 *     `autoFlowSalaryToEPF` writes them, and `derive()` grows the corpus from them). So
 *     the identity `monthlyTakeHome × 12 === income − tax − PF − professionalTax` holds
 *     BY CONSTRUCTION — the money leaving the payslip and the money entering the corpus
 *     are the same number read from the same place.
 *   - Recomputing PF from a basic percentage would introduce a SECOND basic base. The app
 *     currently has two (`0.4 × CTC` in the store's auto-flow and in `quick-number.ts`,
 *     versus the salary form's 50% default). Unifying them is correct but it MOVES two
 *     personas' headline FIRE age, so it is split out to PR B
 *     (`chore/218b-basic-50pct-unification`) for an owner call. `resolveBasicAnnual` below
 *     is exported and specced for that PR; PR A does not wire the auto-flow to it.
 *   - No EPF row ⇒ PF is zero for that earner. Nothing is being auto-flowed, so nothing is
 *     leaving their payslip, and the figure honestly collapses to `gross − tax`.
 *
 * PROFESSIONAL TAX: a flat ₹2,500 per earner per year. It is a STATE levy, so the exact
 * slab varies (Maharashtra ₹2,500/yr, Karnataka ₹2,400/yr, and a few states levy none),
 * but Article 276(2) of the Constitution CAPS it at ₹2,500 per person per year in every
 * state — so the constitutional ceiling is used as the one national constant rather than
 * modelling 20-odd state schedules for a ₹208/month line. It errs by at most ₹208/month,
 * in the conservative (lower take-home) direction. This is the ONLY term in this change
 * that is not already inside an existing row, and therefore the only one that can move a
 * downstream figure at all (the solver ceiling, by ≤ ₹208/earner/month).
 */
import type { Household } from "@/types/household";
import { DEFAULT_BASIC_PERCENT_OF_CTC, basicAnnualFromPercent } from "./salary-percent";

/** Statutory EPF rate on Basic+DA, both the employee and the employer leg (EPF Act, Sch. IV). */
export const EPF_STATUTORY_RATE = 0.12;

/**
 * Professional tax — the Article 276(2) constitutional ceiling, ₹2,500 per person per year.
 * Used as a single national constant in place of 20-odd state schedules (see file header).
 */
export const PROFESSIONAL_TAX_ANNUAL_PER_EARNER = 2_500;

export interface SalaryLike {
  annualCTC?: number;
  basicAnnual?: number;
  vpfTopUpPercent?: number;
}

const num = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);

/**
 * The intended ONE answer to "what is this earner's annual Basic+DA?" — the user's stored
 * figure when present, else the law-grounded 50%-of-CTC default (Code on Wages 2019; see
 * `salary-percent.ts`).
 *
 * NOT YET WIRED TO THE EPF AUTO-FLOW. The store's `autoFlowSalaryToEPF` and
 * `quick-number.ts` still use a local `0.4 × CTC`. Pointing them here is the right fix and
 * is PR B (`chore/218b-basic-50pct-unification`): it raises every EPF row by 25% and moves
 * two personas' headline FIRE age by one month, which is an owner-gated change. Exported
 * and specced here so PR B is a one-line rewire rather than a new module.
 */
export function resolveBasicAnnual(salary: SalaryLike | undefined | null): number {
  const stored = num(salary?.basicAnnual);
  if (stored > 0) return stored;
  const ctc = num(salary?.annualCTC);
  if (ctc <= 0) return 0;
  return basicAnnualFromPercent(ctc, DEFAULT_BASIC_PERCENT_OF_CTC);
}

/**
 * The annual PF outflow for one earner, read from the EPF_VPF investment rows they own.
 *
 * This is the SAME money the corpus receives — `derive()` grows the portfolio from these
 * very rows — so deducting it from take-home cannot disagree with what is credited. The
 * row's `monthlyContribution` is the whole contribution (the store's auto-flow writes
 * employee + VPF + employer as one figure; the row carries no leg breakdown), and the
 * whole of it is money the employee never sees in their bank account.
 *
 * EPF is always member-owned — there is no "Joint" EPF — so a member lens scopes cleanly
 * by `ownerId`. Pass `memberId: null` for the whole household.
 */
export function pfFromInvestmentRows(
  household: Pick<Household, "investments"> | undefined | null,
  memberId: string | null,
): number {
  const rows = household?.investments;
  if (!rows) return 0;
  return rows
    .filter((i) => i.type === "EPF_VPF" && (memberId == null || i.ownerId === memberId))
    .reduce((sum, i) => sum + num(i.monthlyContribution) * 12, 0);
}

export interface NetCashSalaryInput {
  /** Total gross for the scope being reported (one earner, or the household). */
  annualCTC: number;
  /** Annual PF outflow for that same scope — from `pfFromInvestmentRows`. */
  annualPf: number;
  /** Income tax for that scope (already computed by `tax.ts`). */
  annualTax: number;
  /** Professional tax for that scope — `PROFESSIONAL_TAX_ANNUAL_PER_EARNER × earners`. */
  professionalTax: number;
}

/**
 * Gross − PF − income tax − professional tax, floored at zero.
 *
 * `annualCTC` here is whatever gross the caller is reporting on: for `derive.ts` that is
 * `annualIncome.total` (salary + business + other income), because the tax figure covers
 * all of it; PF only ever arises from salary, so a household with no EPF row simply has
 * zero PF and the figure collapses to the old `gross − tax`.
 */
export function netCashSalary(input: NetCashSalaryInput): { annual: number; monthly: number } {
  const annual = Math.max(
    0,
    num(input.annualCTC) - num(input.annualPf) - num(input.annualTax) - num(input.professionalTax),
  );
  return { annual, monthly: Math.round(annual / 12) };
}
