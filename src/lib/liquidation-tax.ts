/**
 * liquidation-tax.ts — Phase B of the #15 accessible-money honesty layer.
 *
 * PRINCIPLE 2 ("post-tax spendable"): "reachable money" is net of the tax owed
 * on liquidating it, never the gross market value. `postTaxLiquidation` takes a
 * holding and the gross lump being cashed out, and returns the in-hand net after
 * the liquidation tax owed under current post-Budget-2024 law. Phase C sums the
 * net across the bridge.
 *
 * COST BASIS IS UNKNOWN: the household schema stores a holding's current `value`
 * but no purchase price, so the embedded capital gain cannot be computed exactly.
 * We apply a conservative documented approximation — assume a fixed fraction of
 * the proceeds is taxable gain (the asset is assumed to have roughly doubled) —
 * and surface an AssumptionNote (principle 1) inviting the user to record the
 * purchase price for an exact figure. CII indexation is NOT modelled
 * (gh-issue #6) — flat post-Budget-2024 rates, disclosed.
 *
 * Pure — no store/DOM/IO access.
 */
import type { Investment } from "@/types/household";
import { liquidationTaxTreatment, typeLabel } from "@/lib/investment-traits";
import type { LiquidationTaxTreatment } from "@/lib/investment-traits";
import { LTCG_LISTED_RATE, LTCG_LISTED_EXEMPTION } from "@/lib/esop-tax";
import type { AssumptionNote } from "@/lib/accessibility";

/**
 * Assumed fraction of the gross proceeds that is taxable capital gain when the
 * cost basis is unknown. 0.7 ⇒ cost = 30% of today's value (the asset is assumed
 * to have roughly TRIPLED). Calibrated to the LOCKED persona — a multi-decade
 * salaried accumulator whose equity SIPs compounded ~12%/yr carry a 60-90%
 * embedded gain at the FIRE age (rule 30: the conservative direction is the
 * HIGHER fraction → more tax → smaller net, so an unknown basis never inflates
 * spendable cash). Disclosed via an AssumptionNote so the user can correct it.
 */
export const ASSUMED_GAIN_FRACTION = 0.7;

/** Non-equity LTCG rate (gold/property/international) — 12.5%, no indexation. */
export const LTCG_NONEQUITY_RATE = 0.125;
/** Virtual Digital Asset (crypto) flat rate — 30% on the gain, no set-off. */
export const VDA_FLAT_RATE = 0.3;
/**
 * Health & Education cess — 4%, mandatory on every income-tax figure incl.
 * LTCG/VDA. Omitting it under-states tax (an optimistic error). Surcharge on a
 * large single-year liquidation is NOT modelled (needs total-year-income
 * context) — disclosed in the assumption notes.
 */
export const CESS_RATE = 0.04;

/** Apply the mandatory 4% cess and round to integer rupees. */
function withCess(baseTax: number): number {
  return Math.round(baseTax * (1 + CESS_RATE));
}

export interface LiquidationContext {
  /** Owner's marginal slab rate (decimal). Reserved for slab-taxed paths. */
  marginalSlabRate: number;
  /**
   * Remaining ₹1.25L equity-LTCG exemption for the year, SHARED across all
   * equity holdings liquidated that year (Sec 112A is per-person-per-year, not
   * per-holding). Phase C threads the decrement: it passes the remaining budget
   * and subtracts `equityExemptionUsed` after each call. Omitted ⇒ full ₹1.25L.
   */
  equityLtcgExemptionRemaining?: number;
  /** Override the unknown-basis gain fraction (default ASSUMED_GAIN_FRACTION). */
  assumedGainFraction?: number;
}

export interface LiquidationResult {
  grossProceeds: number;
  taxOwed: number;
  /** In-hand after the liquidation tax. */
  net: number;
  taxTreatment: LiquidationTaxTreatment;
  /**
   * Equity LTCG exemption (₹) this asset consumed — the caller MUST subtract
   * this from `equityLtcgExemptionRemaining` before the next equity holding so
   * the shared ₹1.25L is not granted multiple times (an optimistic error).
   */
  equityExemptionUsed: number;
  /** Transparency note when an assumption was applied (unknown basis / CII). */
  assumption?: AssumptionNote;
}

/**
 * Net in-hand after the tax owed on liquidating `grossProceeds` of `asset`.
 *
 * @param asset         the holding being cashed out (type drives the treatment)
 * @param grossProceeds the gross lump being liquidated (Phase A's accessibleLumpGross)
 * @param context       marginal rate + shared equity-exemption budget
 */
export function postTaxLiquidation(
  asset: Investment,
  grossProceeds: number,
  context: LiquidationContext,
): LiquidationResult {
  const gp = Math.max(0, Number.isFinite(grossProceeds) ? grossProceeds : 0);
  const treatment = liquidationTaxTreatment(asset);
  const gainFraction = clampFraction(context.assumedGainFraction ?? ASSUMED_GAIN_FRACTION);
  const assetId = asset.id;
  const label = asset.label ?? typeLabel(asset.type);

  const passThrough = (t: LiquidationTaxTreatment): LiquidationResult => ({
    grossProceeds: gp,
    taxOwed: 0,
    net: gp,
    taxTreatment: t,
    equityExemptionUsed: 0,
  });

  switch (treatment) {
    case "tax-free":
      // EPF (≥5yr service — near-universal for the accumulator), PPF maturity,
      // NPS lump are exit-exempt. No haircut.
      return passThrough("tax-free");

    case "pass-through":
      // FD interest is taxed yearly as it accrues; the principal is already
      // post-tax, so cashing out carries no additional capital-gains tax.
      return passThrough("pass-through");

    case "equity-ltcg": {
      if (gp === 0) return passThrough("equity-ltcg");
      const gain = gp * gainFraction;
      const exemptionBudget = clampNonNeg(
        context.equityLtcgExemptionRemaining ?? LTCG_LISTED_EXEMPTION,
      );
      const exemptionUsed = Math.min(gain, exemptionBudget);
      const taxable = Math.max(0, gain - exemptionUsed);
      const taxOwed = withCess(taxable * LTCG_LISTED_RATE);
      return {
        grossProceeds: gp,
        taxOwed,
        net: gp - taxOwed,
        taxTreatment: "equity-ltcg",
        equityExemptionUsed: exemptionUsed,
        assumption: unknownBasisNote(assetId, label, gainFraction, false, asset.type === "MutualFunds"),
      };
    }

    case "ltcg-no-exemption": {
      if (gp === 0) return passThrough("ltcg-no-exemption");
      const gain = gp * gainFraction;
      const taxOwed = withCess(gain * LTCG_NONEQUITY_RATE);
      return {
        grossProceeds: gp,
        taxOwed,
        net: gp - taxOwed,
        taxTreatment: "ltcg-no-exemption",
        equityExemptionUsed: 0,
        assumption: unknownBasisNote(assetId, label, gainFraction, true, false),
      };
    }

    case "vda-flat": {
      if (gp === 0) return passThrough("vda-flat");
      const gain = gp * gainFraction;
      const taxOwed = withCess(gain * VDA_FLAT_RATE);
      return {
        grossProceeds: gp,
        taxOwed,
        net: gp - taxOwed,
        taxTreatment: "vda-flat",
        equityExemptionUsed: 0,
        assumption: {
          id: `vda-flat-basis:${assetId}`,
          assetId,
          assumed: `${label}: ${Math.round(gainFraction * 100)}% of its value assumed to be taxable gain, taxed at the flat 30% VDA rate (+4% cess)`,
          why: "crypto gains are taxed at a flat 30% with no exemption or loss set-off, and your cost basis is not recorded",
          impact: "record your purchase price for an exact figure — the 30% VDA rate is a heavy haircut",
          fixField: "value",
        },
      };
    }
  }
  // Exhaustiveness guard — a new LiquidationTaxTreatment member becomes a
  // compile error here rather than a silent undefined return.
  return assertNever(treatment);
}

function assertNever(x: never): never {
  throw new Error(`Unhandled liquidation treatment: ${String(x)}`);
}

function unknownBasisNote(
  assetId: string,
  label: string,
  gainFraction: number,
  noExemption: boolean,
  isMutualFund: boolean,
): AssumptionNote {
  const pct = Math.round(gainFraction * 100);
  const fundCaveat = isMutualFund
    ? " (assumed an EQUITY fund — a debt fund is taxed higher, at your slab rate)"
    : "";
  return {
    id: `liquidation-basis:${assetId}`,
    assetId,
    assumed: noExemption
      ? `${label}: ${pct}% of its value assumed to be a long-term taxable gain (12.5% LTCG + 4% cess, no indexation, no ₹1.25L exemption)`
      : `${label}: ${pct}% of its value assumed to be a long-term taxable gain (12.5% LTCG + 4% cess over the shared ₹1.25L exemption)${fundCaveat}`,
    why: "your purchase price is not recorded, so the embedded capital gain is estimated; long-term holding is assumed; CII indexation and surcharge on a large single-year sale are not modelled (flat post-Budget-2024 rates)",
    impact:
      "record your purchase price for an exact liquidation-tax figure — this estimate errs toward a larger gain (smaller net) on purpose",
    fixField: "value",
  };
}

function clampFraction(x: number): number {
  if (!Number.isFinite(x)) return ASSUMED_GAIN_FRACTION;
  return Math.min(Math.max(x, 0), 1);
}

function clampNonNeg(x: number): number {
  return Number.isFinite(x) ? Math.max(0, x) : 0;
}
