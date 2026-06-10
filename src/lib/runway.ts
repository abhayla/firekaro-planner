/**
 * #140 — Job-loss / layoff runway: "how many months could the household survive with ZERO
 * income, starting today?" An honesty/optionality feature for the urban-salaried accumulator
 * (the post-2023 tech-layoff cohort) — distinct from the #15 accessible-money BRIDGE (early-FIRE
 * liquidity for a planned retirement) in two ways: this is TODAY's liquidity (not the corpus at a
 * future FIRE age), and the cash gap is the FULL living + obligation burn (not just expenses minus
 * pensions).
 *
 * Pure (no store/DOM). Two honest design choices that keep the number conservative:
 *   1. Numerator = POST-TAX net of liquidating each liquid holding (`postTaxLiquidation`), NOT gross
 *      market value — selling equity/crypto/gold to live on owes real tax (12.5% LTCG / 30% VDA).
 *      The shared ₹1.25L equity-LTCG exemption is threaded across equity holdings so it is granted
 *      once, not per-holding (an optimistic error).
 *   2. Burn = the caller's FULL-obligation monthly burn (living expenses + EMIs + insurance
 *      premiums) — those obligations do NOT stop at a layoff. EPF/VPF + salary-funded SIP
 *      contributions are NOT burn (they stop with the salary).
 *
 * Liquid set = `accessibilityClass(inv) === "liquid"` (Stocks, MutualFunds, FD, Gold, Crypto,
 * International, REIT, vested-ESOP). EPF is its OWN class — excluded from the day-1 runway and
 * surfaced as a separate "+ EPF available ~2 months after exit" line. PPF/NPS/RealEstate are
 * neither day-1 liquid nor counted.
 */
import type { Investment } from "@/types/household";
import { accessibilityClass } from "@/lib/investment-traits";
import { postTaxLiquidation } from "@/lib/liquidation-tax";
import { LTCG_LISTED_EXEMPTION } from "@/lib/esop-tax";

export interface RunwayInput {
  /** The household's investments (full household scope — runway is whole-household safety). */
  investments: Investment[];
  /** Full-obligation monthly burn: living expenses + EMIs + insurance premiums (₹/mo). */
  monthlyBurn: number;
  /** Household marginal slab rate (decimal) for the liquidation-tax context. */
  marginalRate: number;
}

export interface RunwayResult {
  /** Σ post-tax net of liquidating the full liquid set (the headline number). */
  liquidNet: number;
  /** Σ post-tax net of the STABLE floor (FD only) — the "in stable assets" line. */
  liquidNetConservative: number;
  monthlyBurn: number;
  /** Headline runway: liquidNet ÷ burn (months). */
  runwayMonths: number;
  /** Conservative runway: FD-only net ÷ burn (months). */
  runwayMonthsConservative: number;
  /** Σ EPF value (exit-tax-free) — NOT day-1, available ~2 months after exit. */
  epfValue: number;
  /** (liquidNet + epfValue) ÷ burn (months) — the with-EPF secondary line. */
  runwayMonthsWithEpf: number;
  /** Market-linked (Stocks + MutualFunds + International + REIT + Crypto + ESOP) share of liquidNet, fraction 0..1. */
  volatilePortion: number;
}

// MARKET-LINKED liquid instruments — a layoff often coincides with a market drawdown, so this
// share of the runway can be worth materially less when actually liquidated. MUST cover EVERY
// market-linked type, not just direct equity: the typical salaried accumulator holds equity via
// MUTUAL FUNDS / International / REIT (SIPs), so omitting those would report a ~0% "volatile" badge
// for an almost-fully-market-exposed household — an optimistic honesty understatement in a safety
// feature (FinTech HIGH, 2026-06-10). Gold is liquid but a partial hedge → "other", not volatile.
const MARKET_LINKED_TYPES: ReadonlySet<Investment["type"]> = new Set([
  "Stocks",
  "MutualFunds",
  "International",
  "REIT",
  "Crypto",
  "ESOP",
]);
// The capital-stable floor — FD principal is tax-free and not market-linked.
const STABLE_TYPES: ReadonlySet<Investment["type"]> = new Set(["FD"]);

// ESOP gross MUST be the VESTED slice only (mirrors the #15 bridge contract in accessibility.ts):
// a layoff forfeits unvested grant, so counting the full grant would overstate liquidity. Falls
// back to `value` when `vestedValueINR` is absent (the seeds/form persist `value` as already-vested).
function liquidGross(asset: Investment): number {
  return asset.type === "ESOP" ? Math.max(0, asset.vestedValueINR ?? asset.value) : asset.value;
}

export function computeRunway(input: RunwayInput): RunwayResult {
  const burn = Number.isFinite(input.monthlyBurn) && input.monthlyBurn > 0 ? input.monthlyBurn : 0;
  const marginalRate = Number.isFinite(input.marginalRate) ? input.marginalRate : 0;

  // Shared Sec-112A ₹1.25L equity-LTCG exemption — threaded so it is granted ONCE across all
  // equity holdings, not per-holding (granting it per-holding would understate tax → overstate net).
  let equityExemptionRemaining = LTCG_LISTED_EXEMPTION;
  let liquidNet = 0;
  let liquidNetConservative = 0;
  let volatileNet = 0;
  let epfValue = 0;

  for (const asset of input.investments) {
    const cls = accessibilityClass(asset);
    if (cls === "liquid") {
      const r = postTaxLiquidation(asset, liquidGross(asset), {
        marginalSlabRate: marginalRate,
        equityLtcgExemptionRemaining: equityExemptionRemaining,
      });
      equityExemptionRemaining = Math.max(0, equityExemptionRemaining - r.equityExemptionUsed);
      liquidNet += r.net;
      if (STABLE_TYPES.has(asset.type)) liquidNetConservative += r.net;
      if (MARKET_LINKED_TYPES.has(asset.type)) volatileNet += r.net;
    } else if (cls === "epf") {
      // EPF exit is tax-free (≥5yr service) → net == value; excluded from day-1 liquidity.
      const r = postTaxLiquidation(asset, asset.value, { marginalSlabRate: marginalRate });
      epfValue += r.net;
    }
  }

  liquidNet = Math.round(liquidNet);
  liquidNetConservative = Math.round(liquidNetConservative);
  epfValue = Math.round(epfValue);

  const monthsFrom = (amount: number): number => (burn > 0 ? amount / burn : 0);

  return {
    liquidNet,
    liquidNetConservative,
    monthlyBurn: Math.round(burn),
    runwayMonths: monthsFrom(liquidNet),
    runwayMonthsConservative: monthsFrom(liquidNetConservative),
    epfValue,
    runwayMonthsWithEpf: monthsFrom(liquidNet + epfValue),
    volatilePortion: liquidNet > 0 ? volatileNet / liquidNet : 0,
  };
}
