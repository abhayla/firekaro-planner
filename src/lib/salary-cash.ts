/**
 * salary-cash — the ONE source of truth for "what actually reaches the bank account".
 *
 * WHY THIS MODULE EXISTS (gh #218). Five surfaces computed take-home as
 * `annualCTC − incomeTax` and called it take-home: `derive.ts`'s `monthlyTakeHome`
 * (the dashboard stat block + `savingsRate` + the required-contribution solver ceiling),
 * `tax-deductions.ts`'s per-earner tax card, the salary-form preview, and the
 * tax-planning screen. For the persona this product serves — a salaried accumulator with
 * a statutory EPF deduction — that number is ROUGHLY 6-12% too HIGH, because CTC includes
 * both PF legs and professional tax, none of which ever lands in the bank. An optimistic
 * cash figure is a Tier-0 honesty defect, and five copies of the formula meant fixing it
 * once fixed nothing.
 *
 * WHAT TAKE-HOME IS HERE (and what it is NOT):
 *
 *   takeHome = CTC − employerPF − employeePF − VPF − incomeTax − professionalTax
 *
 * It is a REPORTING figure — the cash a user can recognise on a payslip. It is NOT the
 * savings base. `derive.ts`'s `annualSavings` stays `income − tax − expenses` (gh #11
 * LOCK): PF is funded OUT of that residual and is already counted as corpus inflow via
 * the auto-flowed EPF investment row, so subtracting it from savings too would
 * double-count it and push every EPF household's FIRE date years out. See the identity
 * locks in `derive.spec.ts`.
 *
 * WHY employerPF IS SUBTRACTED. CTC is the employer's total cost, so the 12% employer PF
 * leg sits INSIDE it — but it is paid to the EPFO, never to the employee. Leaving it in
 * take-home is the single largest term in the old overstatement.
 *
 * PROFESSIONAL TAX: a flat ₹2,500 per earner per year. It is a STATE levy, so the exact
 * slab varies (Maharashtra ₹2,500/yr, Karnataka ₹2,400/yr, and a few states levy none),
 * but Article 276(2) of the Constitution CAPS it at ₹2,500 per person per year in every
 * state — so the constitutional ceiling is used as the one national constant rather than
 * modelling 20-odd state schedules for a ₹208/month line. It errs by at most ₹208/month,
 * in the conservative (lower take-home) direction.
 *
 * ONE BASIC BASE. PF is 12% of Basic+DA. `resolveBasicAnnual` is the ONLY place that
 * answers "what is basic?" — the user's own `salary.basicAnnual` when set, else
 * `DEFAULT_BASIC_PERCENT_OF_CTC` (50%, the Code on Wages 2019 wage floor — see
 * `salary-percent.ts`). The household store's EPF auto-flow reads this same resolver, so
 * the PF subtracted from take-home and the PF flowing into the corpus can never disagree.
 */
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

export interface StatutoryPf {
  /** 12% of basic — the employee's own mandatory leg. */
  employeePF: number;
  /** The voluntary top-up ON TOP of the employee leg (`vpfTopUpPercent` of it). */
  vpf: number;
  /** 12% of basic — the employer's matching leg, funded from inside CTC. */
  employerPF: number;
}

const num = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);

/**
 * The ONE answer to "what is this earner's annual Basic+DA?".
 *
 * The user's stored figure wins when present; otherwise the law-grounded 50%-of-CTC
 * default. Every PF computation in the app — take-home, the EPF auto-flow, the solver —
 * routes through here, so two bases can never drift apart (gh #218: the auto-flow used
 * 0.4 × CTC while the salary form defaulted basic to 50%).
 */
export function resolveBasicAnnual(salary: SalaryLike | undefined | null): number {
  const stored = num(salary?.basicAnnual);
  if (stored > 0) return stored;
  const ctc = num(salary?.annualCTC);
  if (ctc <= 0) return 0;
  return basicAnnualFromPercent(ctc, DEFAULT_BASIC_PERCENT_OF_CTC);
}

/** The three PF legs for one earner, all annual ₹, all off the ONE resolved basic. */
export function statutoryPfFor(salary: SalaryLike | undefined | null): StatutoryPf {
  const basic = resolveBasicAnnual(salary);
  if (basic <= 0) return { employeePF: 0, vpf: 0, employerPF: 0 };
  const employeePF = basic * EPF_STATUTORY_RATE;
  const topUp = Math.max(0, num(salary?.vpfTopUpPercent)) / 100;
  return { employeePF, vpf: employeePF * topUp, employerPF: basic * EPF_STATUTORY_RATE };
}

export interface NetCashSalaryInput {
  /** Total cost-to-company across the scope being reported (one earner or the household). */
  annualCTC: number;
  /** The PF legs for that same scope — summed across earners for a household figure. */
  pf: StatutoryPf;
  /** Income tax for that scope (already computed by `tax.ts`). */
  annualTax: number;
  /** Professional tax for that scope — `PROFESSIONAL_TAX_ANNUAL_PER_EARNER × earners`. */
  professionalTax: number;
}

/**
 * CTC − all three PF legs − income tax − professional tax, floored at zero.
 *
 * `annualCTC` here is whatever gross the caller is reporting on: for `derive.ts` that is
 * `annualIncome.total` (salary + business + other income), because the tax figure covers
 * all of it; PF is only ever deducted off salary, so a non-salary household simply has
 * zero PF and the figure collapses to the old `gross − tax`.
 */
export function netCashSalary(input: NetCashSalaryInput): { annual: number; monthly: number } {
  const gross = num(input.annualCTC);
  const { employeePF, vpf, employerPF } = input.pf;
  const annual = Math.max(
    0,
    gross - num(employeePF) - num(vpf) - num(employerPF) - num(input.annualTax) - num(input.professionalTax),
  );
  return { annual, monthly: Math.round(annual / 12) };
}

/** Sum the PF legs of several earners into one household figure. */
export function sumPf(legs: StatutoryPf[]): StatutoryPf {
  return legs.reduce<StatutoryPf>(
    (acc, l) => ({
      employeePF: acc.employeePF + num(l.employeePF),
      vpf: acc.vpf + num(l.vpf),
      employerPF: acc.employerPF + num(l.employerPF),
    }),
    { employeePF: 0, vpf: 0, employerPF: 0 },
  );
}

/** Total PF outflow across all three legs — the amount take-home is reduced by. */
export function totalPf(pf: StatutoryPf): number {
  return num(pf.employeePF) + num(pf.vpf) + num(pf.employerPF);
}
