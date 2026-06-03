/**
 * eps-pension.ts — Phase D of the accessible-money layer (#14).
 *
 * The Employees' Pension Scheme (EPS) is funded by the 8.33% employer slice of
 * the EPF contribution and pays a LIFELONG monthly pension from 58. The app
 * currently models none of it — the EpfVpf holding `value` is the user-entered
 * EPF balance and EXCLUDES the EPS pot (see investment-traits A3/#7). For the
 * salaried accumulator that is real money the FIRE plan was missing: a pension
 * that helps cover the 58→later bridge span AND ongoing post-FIRE income.
 *
 * Current EPS formula (EPS 1995, post wage-ceiling rules):
 *   monthly pension = pensionable salary × pensionable service / 70
 *     - pensionable salary: avg of last 60 months, CAPPED at ₹15,000/mo unless
 *       the member opted for higher pension on actual salary (2022 SC ruling).
 *     - pensionable service: contributory years, +2 bonus if service ≥ 20yr.
 *     - ≥ 10 years' service required to draw a monthly pension at all (else a
 *       one-time withdrawal benefit, not modelled here).
 *     - ₹1,000/month statutory minimum.
 *   Normal start age 58 (early from 50 reduced 4%/yr; deferred to 60 increased
 *   4%/yr — MVP models the standard 58 start, noted).
 *
 * Pure — no store/DOM access. (Service derives from the retirement age, not the
 * current date, so `asOf` is accepted only for deriver-signature symmetry.)
 */
import type { Member } from "@/types/household";
import type { AssumptionNote } from "@/lib/accessibility";

export const EPS_WAGE_CEILING = 15_000; // ₹/month pensionable-salary cap
export const EPS_FORMULA_DIVISOR = 70;
export const EPS_SERVICE_BONUS_THRESHOLD = 20; // years
export const EPS_SERVICE_BONUS = 2; // years
export const EPS_MIN_SERVICE_FOR_PENSION = 10; // years to be pension-eligible
export const EPS_MIN_MONTHLY_PENSION = 1_000; // ₹/month statutory floor
export const EPS_NORMAL_START_AGE = 58;
/** Assumed age a salaried career (and EPS contribution) begins, when unknown. */
export const ASSUMED_CAREER_START_AGE = 23;

export interface EpsPensionInput {
  /**
   * Monthly pensionable salary (basic + DA). Capped at ₹15,000 unless
   * `higherPensionOpted`. Omitted ⇒ use the ceiling (+ a disclosure note).
   */
  monthlyPensionableSalary?: number;
  /** Contributory service in years (before the +2 bonus). */
  serviceYears: number;
  /** Pension start age (default 58). */
  pensionStartAge?: number;
  /** Member opted for higher pension on actual salary (2022 SC ruling). */
  higherPensionOpted?: boolean;
}

export interface EpsPensionResult {
  monthlyPension: number;
  annualPension: number;
  pensionStartAge: number;
  pensionableSalaryUsed: number;
  /** Service used in the formula (incl. the +2 bonus). */
  serviceYearsUsed: number;
  /** Whether the member clears the 10-year monthly-pension eligibility bar. */
  eligible: boolean;
  assumptions: AssumptionNote[];
}

/** Pure EPS pension formula. */
export function calculateEpsPension(input: EpsPensionInput): EpsPensionResult {
  const assumptions: AssumptionNote[] = [];
  const pensionStartAge = input.pensionStartAge ?? EPS_NORMAL_START_AGE;
  const serviceYears = Number.isFinite(input.serviceYears) ? Math.max(0, input.serviceYears) : 0;

  // The early-from-50 (−4%/yr) / deferred-to-60 (+4%/yr) adjustments are NOT
  // modelled (MVP scopes the standard 58 start). Disclose if a caller overrides
  // the start age so the unadjusted figure is never presented as exact.
  if (pensionStartAge !== EPS_NORMAL_START_AGE) {
    assumptions.push({
      id: "eps-start-age-unadjusted",
      assumed: `EPS pension shown at the standard amount for a start age of ${pensionStartAge}`,
      why: `the ±4%/yr early (from 50) / deferred (to 60) adjustment off the normal ${EPS_NORMAL_START_AGE} start is not modelled`,
      impact: "starting earlier reduces, and deferring increases, the actual monthly pension",
    });
  }

  // Pensionable salary: ceiling-capped unless higher pension was opted.
  const rawSalary = Number.isFinite(input.monthlyPensionableSalary ?? NaN)
    ? Math.max(0, input.monthlyPensionableSalary as number)
    : null;
  if (rawSalary == null) {
    assumptions.push({
      id: "eps-salary-ceiling",
      assumed: `EPS pensionable salary assumed at the ₹${EPS_WAGE_CEILING.toLocaleString("en-IN")}/mo statutory ceiling`,
      why: "your basic salary is not recorded, so the default pensionable-salary cap is used",
      impact:
        "if you opted for higher pension on actual salary, your EPS pension is larger — record basic pay to refine it",
      fixField: "basicAnnual",
    });
  }
  const pensionableSalaryUsed = input.higherPensionOpted
    ? (rawSalary ?? EPS_WAGE_CEILING)
    : Math.min(rawSalary ?? EPS_WAGE_CEILING, EPS_WAGE_CEILING);

  const eligible = serviceYears >= EPS_MIN_SERVICE_FOR_PENSION;
  if (!eligible) {
    assumptions.push({
      id: "eps-not-eligible",
      assumed: "No EPS monthly pension modelled",
      why: `EPS needs ≥ ${EPS_MIN_SERVICE_FOR_PENSION} years of service for a pension; less than that pays a one-time withdrawal benefit (not modelled)`,
      impact: "extending your contributory service past 10 years unlocks a lifelong pension",
    });
    return {
      monthlyPension: 0,
      annualPension: 0,
      pensionStartAge,
      pensionableSalaryUsed,
      serviceYearsUsed: serviceYears,
      eligible: false,
      assumptions,
    };
  }

  const serviceYearsUsed =
    serviceYears >= EPS_SERVICE_BONUS_THRESHOLD ? serviceYears + EPS_SERVICE_BONUS : serviceYears;
  const formula = (pensionableSalaryUsed * serviceYearsUsed) / EPS_FORMULA_DIVISOR;
  const monthlyPension = Math.max(EPS_MIN_MONTHLY_PENSION, Math.round(formula));

  return {
    monthlyPension,
    annualPension: monthlyPension * 12,
    pensionStartAge,
    pensionableSalaryUsed,
    serviceYearsUsed,
    eligible: true,
    assumptions,
  };
}

/**
 * Derive an EPS pension for a household member, estimating contributory service
 * from age and disclosing the career-start assumption. Returns null for members
 * with no salaried EPS participation (no salary / not an earner). Whether the
 * member is salaried (vs self-employed) is the caller's gate.
 */
export function deriveEpsPensionForMember(
  member: Member,
  _asOf: Date = new Date(),
): EpsPensionResult | null {
  if (member.role !== "EARNER" || !member.salary) return null;

  const retirementAge = member.targetRetirementAge ?? EPS_NORMAL_START_AGE;
  const serviceYears = Math.max(0, retirementAge - ASSUMED_CAREER_START_AGE);

  const basicAnnual = member.salary.basicAnnual;
  const monthlyPensionableSalary =
    basicAnnual != null && Number.isFinite(basicAnnual) ? basicAnnual / 12 : undefined;

  const result = calculateEpsPension({ serviceYears, monthlyPensionableSalary });

  // Disclose the service-derivation assumption (principle 1). The eligibility
  // caveat matters: a member who started their career LATER than 23 may have
  // fewer than the 10 years needed for ANY pension — the derived service can
  // wrongly clear that bar, crediting a pension that would not exist.
  result.assumptions.unshift({
    id: `eps-service-derived:${member.id}`,
    assetId: member.id,
    assumed: `EPS service assumed at ${serviceYears} years (career start age ${ASSUMED_CAREER_START_AGE} → retire ${retirementAge})`,
    why: "your exact EPS contributory service is not recorded, so it is estimated assuming a full career from age 23",
    impact:
      "a later actual career start means fewer service years — and below 10 years there is no monthly pension at all",
    fixField: "targetRetirementAge",
  });

  // The single most bridge-relevant EPS fact for an early retiree: the pension
  // does not pay until 58, so it cannot cover the years between an early FIRE age
  // and 58. (Phase C correctly credits EPS as bridge income only from 58.)
  if (result.eligible && retirementAge < EPS_NORMAL_START_AGE) {
    result.assumptions.push({
      id: `eps-starts-at-58:${member.id}`,
      assetId: member.id,
      assumed: `EPS pension begins at age ${EPS_NORMAL_START_AGE}, not at your retirement age`,
      why: `you retire before ${EPS_NORMAL_START_AGE}, so EPS income cannot fund the years between your FIRE age and ${EPS_NORMAL_START_AGE}`,
      impact: "those early-retirement years rely on your liquid corpus, not the EPS pension",
    });
  }

  return result;
}
