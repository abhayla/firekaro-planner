/**
 * gratuity.ts — Phase E of the accessible-money layer (#13).
 *
 * Gratuity is a lump the employer pays at job exit (≥5 years' service) — real
 * cash the FIRE plan currently MISSES. This is the OPPOSITE-direction error to
 * the rest of the bridge: modelling it ADDS to the reachable corpus at the FIRE
 * age. So the conservative direction here is to UNDER-state it (never inflate
 * the corpus) — when basic pay is unknown we assume a LOW basic fraction of CTC.
 *
 * Current formula (Payment of Gratuity Act):
 *   gratuity = 15/26 × last-drawn monthly basic (incl. DA) × completed years
 *     - tax-free up to ₹20,00,000 (cumulative, lifetime); excess slab-taxed.
 *     - ≥ 5 years' continuous service required.
 * Leave encashment (also a tax-free-capped exit lump) is NOT modelled — the
 * schema has no field for accrued leave; noted as a future enhancement.
 *
 * Pure — no store/DOM access; an explicit `asOf` keeps the member-deriver testable.
 */
import type { Member } from "@/types/household";
import type { AssumptionNote } from "@/lib/accessibility";
import { ASSUMED_CAREER_START_AGE, EPS_NORMAL_START_AGE } from "@/lib/eps-pension";

export const GRATUITY_NUMERATOR = 15;
export const GRATUITY_DENOMINATOR = 26;
export const GRATUITY_TAX_FREE_CAP = 2_000_000; // ₹20L lifetime exemption
export const GRATUITY_MIN_SERVICE_YEARS = 5;
/** Health & Education cess applied to the slab tax on the taxable excess. */
const CESS_MULTIPLIER = 1.04;
/**
 * Assumed basic+DA as a fraction of CTC when basic is not recorded. 0.35 is a
 * deliberately LOW estimate for the LOCKED persona — urban private-sector CTCs
 * commonly engineer basic down to 30-40% of CTC to minimise PF/gratuity. For a
 * corpus ADDITION the safe direction is to under-state (smaller basic ⇒ smaller
 * gratuity ⇒ no inflated reachable corpus), so we sit at the low end. Disclosed.
 */
export const ASSUMED_BASIC_FRACTION_OF_CTC = 0.35;

export interface GratuityInput {
  /** Last-drawn monthly basic + DA. */
  monthlyBasic: number;
  /** Completed years of continuous service. */
  yearsOfService: number;
  /** Owner's marginal slab rate (decimal) — taxes the excess over ₹20L. */
  marginalSlabRate: number;
}

export interface GratuityResult {
  /** Gross gratuity per the formula. */
  gross: number;
  taxFreePortion: number;
  taxablePortion: number;
  taxOwed: number;
  /** In-hand after tax on the excess over ₹20L. */
  net: number;
  /** Whether the member clears the 5-year eligibility bar. */
  eligible: boolean;
  assumptions: AssumptionNote[];
}

/** Pure gratuity formula. */
export function calculateGratuity(input: GratuityInput): GratuityResult {
  const assumptions: AssumptionNote[] = [];
  const monthlyBasic = Number.isFinite(input.monthlyBasic) ? Math.max(0, input.monthlyBasic) : 0;
  const yearsOfService = Number.isFinite(input.yearsOfService)
    ? Math.max(0, input.yearsOfService)
    : 0;
  const slabRate = Math.min(Math.max(input.marginalSlabRate, 0), 1);

  if (yearsOfService < GRATUITY_MIN_SERVICE_YEARS) {
    assumptions.push({
      id: "gratuity-not-eligible",
      assumed: "No gratuity modelled",
      why: `gratuity needs ≥ ${GRATUITY_MIN_SERVICE_YEARS} years of continuous service`,
      impact: "completing 5 years of service unlocks a tax-free exit lump",
    });
    return {
      gross: 0,
      taxFreePortion: 0,
      taxablePortion: 0,
      taxOwed: 0,
      net: 0,
      eligible: false,
      assumptions,
    };
  }

  const gross = Math.round((GRATUITY_NUMERATOR / GRATUITY_DENOMINATOR) * monthlyBasic * yearsOfService);
  const taxFreePortion = Math.min(gross, GRATUITY_TAX_FREE_CAP);
  const taxablePortion = Math.max(0, gross - GRATUITY_TAX_FREE_CAP);
  const taxOwed = Math.round(taxablePortion * slabRate * CESS_MULTIPLIER);

  // The ₹20L exemption is a LIFETIME cumulative ceiling across employers — we
  // assume it is fully available (no prior gratuity claimed). If the user has,
  // their taxable portion is higher. Disclose rather than silently over-credit.
  if (gross > 0) {
    assumptions.push({
      id: "gratuity-lifetime-cap-assumed",
      assumed: `The full ₹${(GRATUITY_TAX_FREE_CAP / 100_000).toFixed(0)}L gratuity exemption is assumed available`,
      why: "the ₹20L tax-free cap is a lifetime ceiling across all employers; prior gratuity claims are not recorded",
      impact: "if you already claimed a tax-free gratuity at a previous job, your taxable portion (and tax) is higher",
    });
  }

  return {
    gross,
    taxFreePortion,
    taxablePortion,
    taxOwed,
    net: gross - taxOwed,
    eligible: true,
    assumptions,
  };
}

/**
 * Derive gratuity for a household member, estimating service from age and basic
 * from CTC when unrecorded (disclosed). Returns null for members with no
 * salaried employment (no salary / not an earner).
 */
export function deriveGratuityForMember(
  member: Member,
  marginalSlabRate: number,
  _asOf: Date = new Date(),
): GratuityResult | null {
  // gh #67: gratuity is a salaried-employment benefit — gate on adult + actual salary, not a flag.
  if (member.role !== "ADULT" || !member.salary) return null;

  const retirementAge = member.targetRetirementAge ?? EPS_NORMAL_START_AGE;
  const yearsOfService = Math.max(0, retirementAge - ASSUMED_CAREER_START_AGE);

  const basicAnnual = member.salary.basicAnnual;
  const basicKnown = basicAnnual != null && Number.isFinite(basicAnnual);
  const monthlyBasic = basicKnown
    ? (basicAnnual as number) / 12
    : (member.salary.annualCTC * ASSUMED_BASIC_FRACTION_OF_CTC) / 12;

  const result = calculateGratuity({ monthlyBasic, yearsOfService, marginalSlabRate });

  // Disclose the service-derivation assumption (principle 1).
  result.assumptions.unshift({
    id: `gratuity-service-derived:${member.id}`,
    assetId: member.id,
    assumed: `Gratuity service assumed at ${yearsOfService} years (career start age ${ASSUMED_CAREER_START_AGE} → retire ${retirementAge})`,
    why: "your exact gratuity-eligible service is not recorded, so it is estimated from your retirement age",
    impact: "a longer or shorter actual service changes your gratuity proportionally",
    fixField: "targetRetirementAge",
  });
  if (!basicKnown) {
    result.assumptions.unshift({
      id: `gratuity-basic-estimated:${member.id}`,
      assetId: member.id,
      assumed: `Basic pay assumed at ${Math.round(ASSUMED_BASIC_FRACTION_OF_CTC * 100)}% of CTC (a deliberately low estimate)`,
      why: "your basic salary is not recorded; gratuity is computed on basic + DA, not total CTC",
      impact: "recording your basic pay gives an exact gratuity — this estimate errs low so it never inflates your corpus",
      fixField: "basicAnnual",
    });
  }
  // Conservative: we use TODAY's basic, not the (higher) last-drawn basic at
  // exit after future hikes — so the modelled gratuity is a floor. Disclosed for
  // parity with principle 1 (the real figure is likely higher).
  if (result.gross > 0) {
    result.assumptions.push({
      id: `gratuity-basic-not-projected:${member.id}`,
      assetId: member.id,
      assumed: "Gratuity computed on your current basic, not the higher last-drawn basic at retirement",
      why: "we do not project salary hikes forward into the gratuity formula — it keeps the estimate a safe floor",
      impact: "your actual gratuity at exit will likely be larger after years of hikes",
      fixField: "basicAnnual",
    });
  }

  return result;
}
