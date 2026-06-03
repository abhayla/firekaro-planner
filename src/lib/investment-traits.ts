/**
 * Investment traits — the single dispatch seam for per-type investment behavior.
 *
 * Phase 0 Stage A2 per docs/goals/build-firekaro-mvp-v5.md §3
 * (Concern #1 from /improve-codebase-architecture: "Investment polymorphism
 * flat-schema").
 *
 * Before this module, code that needed to ask "is this liquid?" / "what's the
 * expected return?" / "does this trigger LTCG?" reached for inline switch
 * statements on `inv.type` across 11 files. Each switch reproduced the same
 * mapping from scratch, so adding the new International + REIT types in v5
 * would have meant editing all 11 sites. Trait functions in this module are
 * the only place `switch (inv.type)` is allowed.
 *
 * Six traits per audit + improve-codebase-architecture concern #1:
 *   - liquidity(inv): how quickly can the user access the value
 *   - expectedReturn(inv, assumptions): annual expected return (decimal)
 *   - taxBucket(inv): how the instrument is taxed (EEE / EET / ETT / slab)
 *   - inflationRoute(inv): which inflation bucket the cashflow grows with
 *   - accumulationRule(inv): stub interface — bodies in Phase 2 Stage C
 *   - withdrawalRule(inv): stub interface — bodies in Phase 2 Stage C
 */

import type { Investment, InvestmentType } from "@/types/household";

// ---------- Trait return types ----------

export type Liquidity = "liquid" | "moderate" | "illiquid";

/**
 * Indian tax-treatment buckets (audit Entries #14-#20):
 *   - EEE: Exempt-Exempt-Exempt (PPF, EPF/VPF under threshold, Sukanya).
 *   - EET: Exempt-Exempt-Taxed (NPS 40% annuity portion at exit slab).
 *   - ETT: Exempt-Taxed-Taxed (rare — interest accrual taxed plus exit).
 *   - slab: Treated as ordinary income at user's slab (FD interest, savings
 *           interest, Crypto, debt MF post-2023, rental income).
 *
 * Equity instruments (Stocks / Equity MF / ESOP / International equity / REIT)
 * route as `slab` here only to keep the bucket enum stable across surfaces.
 *
 * IMPORTANT (2026-06-02 FinTech sweep): there is currently **no** held-instrument
 * capital-gains-on-sale engine. `lib/tax.ts` does NOT apply LTCG/STCG rates (it has
 * only slab/surcharge/rebate/cess), and the correct ESOP CG functions in `esop-tax.ts`
 * are not wired into any user-facing number. So a held equity/MF/debt/gold sale incurs
 * NO computed capital-gains tax today, and the schema can't even distinguish equity-MF
 * from debt-MF or capture an acquisition date. Whether realized-CG tax should be modelled
 * (vs absorbed into net-return / SWR assumptions, as many FIRE tools do) is a scope
 * decision tracked in gh-issue #8 — do not assume this `slab` routing taxes the gain.
 */
export type TaxBucket = "EEE" | "EET" | "ETT" | "slab";

/**
 * Inflation buckets per audit Entry #3 — different expense classes inflate at
 * different rates (4-bucket model replacing the single-rate 6% v4 assumption).
 * Used by the cashflow projector to route a flow's growth rate.
 */
export type InflationRoute = "general" | "healthcare" | "education" | "housing";

/**
 * Stub interface for Phase 2 Stage C accumulation modeling.
 * The accumulator decides how monthly contributions compound into the holding
 * (e.g., EPF compounds at 8.25% with employer match capped at ₹2.5L; PPF
 * compounds at 7.1% with the ₹1.5L/yr ceiling; SIP compounds at the asset's
 * expectedReturn).
 *
 * Body lands in Phase 2.
 */
export interface AccumulationRule {
  kind: "stub-phase-2";
  description: string;
}

/**
 * Stub interface for Phase 2 Stage C withdrawal modeling.
 * Body lands in Phase 2 with Floor/Ceiling rules per audit Entry #9.
 */
export interface WithdrawalRule {
  kind: "stub-phase-2";
  description: string;
}

// ---------- Minimal assumption shape ----------

/**
 * Per-type expected return parameters. Mirrors the per-type assumptions in
 * useAssumptionsStore (v4) and the audit-grounded research defaults (Entry #4).
 * Passed in so trait functions stay pure — no store coupling.
 */
export interface ReturnAssumptions {
  equityReturn: number;
  debtReturn: number;
  realEstateReturn: number;
  goldReturn: number;
  npsReturn: number;
  ppfReturn: number;
  epfReturn: number;
  /** International equity — typically lower than India equity (per Ch 04). */
  internationalReturn?: number;
  /** REIT yield — typically debt-like (per Ch 05). */
  reitReturn?: number;
  /** Crypto — research-grounded high-volatility default. */
  cryptoReturn?: number;
  /** FD nominal — typically prevailing 1-yr deposit rate. */
  fdReturn?: number;
}

// ---------- Trait functions (single dispatch on inv.type) ----------

/**
 * How quickly can the user access the value at market price?
 *  - liquid: T+1 or T+2 settlement; spot price visible (Stocks, MF, REIT,
 *            international FoF, Crypto, FD if breakable, Gold ETF/SGB).
 *  - moderate: lock-in or partial withdrawal mechanics (PPF post 7 years,
 *              NPS partial, EPF on certain triggers).
 *  - illiquid: long horizon to convert without significant penalty
 *              (RealEstate, ESOP unvested, PPF first 7 years, NPS pre-60).
 */
export function liquidity(inv: Investment): Liquidity {
  switch (inv.type) {
    case "Stocks":
    case "MutualFunds":
    case "REIT":
    case "International":
    case "Crypto":
      return "liquid";
    case "Gold":
      // ETF/SGB are liquid; Physical is moderate (assay + buyer needed).
      return inv.subtype === "Physical" ? "moderate" : "liquid";
    case "FD":
      // FDs are breakable but with a yield penalty — treat as moderate.
      return "moderate";
    case "PPF":
    case "NPS":
    case "EPF_VPF":
      return "moderate";
    case "RealEstate":
    case "ESOP":
      return "illiquid";
  }
}

/**
 * Annual expected return (decimal). Resolves the matching per-type return
 * from the assumptions object, with conservative fallbacks for the new v5
 * types (International / REIT / Crypto / FD) when assumptions omit them.
 */
export function expectedReturn(inv: Investment, a: ReturnAssumptions): number {
  switch (inv.type) {
    case "Stocks":
    case "MutualFunds":
    case "ESOP":
      return a.equityReturn;
    case "PPF":
      return a.ppfReturn;
    case "NPS":
      return a.npsReturn;
    case "EPF_VPF":
      return a.epfReturn;
    case "RealEstate":
      return a.realEstateReturn;
    case "Gold":
      return a.goldReturn;
    case "FD":
      // Fallback to debt return when FD-specific rate not set.
      return a.fdReturn ?? a.debtReturn;
    case "Crypto":
      // High-volatility nominal expected return. Conservative default for the
      // long-run mean (geometric); user can override on /preferences.
      return a.cryptoReturn ?? 0.08;
    case "International":
      // Slightly lower than India equity per research Ch 04 §4.9.
      return a.internationalReturn ?? a.equityReturn - 0.02;
    case "REIT":
      // Debt-like yield + capital appreciation per Ch 05 §5.8.
      return a.reitReturn ?? 0.08;
  }
}

/**
 * Indian tax-treatment bucket. See TaxBucket comment for semantics.
 * Note: equity-class instruments resolve to `slab` here; lib/tax.ts handles
 * the LTCG/STCG special-rate dispatch downstream.
 */
export function taxBucket(inv: Investment): TaxBucket {
  switch (inv.type) {
    case "PPF":
      return "EEE";
    case "EPF_VPF":
      // EEE up to ₹2.5L threshold; excess interest taxed. Engine handles
      // threshold; bucket is the dominant treatment.
      return "EEE";
    case "NPS":
      // 60% lump-sum tax-free + 40% annuity at slab => EET dominant.
      return "EET";
    case "Stocks":
    case "MutualFunds":
    case "ESOP":
    case "REIT":
    case "International":
    case "RealEstate":
    case "Gold":
    case "FD":
    case "Crypto":
      return "slab";
  }
}

/**
 * Which inflation bucket the instrument's underlying cashflow tracks.
 * Used by lib/derive.ts (Phase 2 Stage C) when projecting expense streams.
 *
 * The dominant routing: most instruments track 'general' inflation. The
 * exceptions are RealEstate (housing inflation) and education-marked
 * Goal-funding instruments (handled in the goal layer, not here).
 */
export function inflationRoute(inv: Investment): InflationRoute {
  switch (inv.type) {
    case "RealEstate":
      return "housing";
    case "Stocks":
    case "MutualFunds":
    case "ESOP":
    case "REIT":
    case "International":
    case "PPF":
    case "NPS":
    case "EPF_VPF":
    case "Gold":
    case "FD":
    case "Crypto":
      return "general";
  }
}

/**
 * Stub — body lands in Phase 2 Stage C (lib/derive.ts accumulation).
 * Returns a sentinel object describing the rule that WILL apply, so the
 * Phase 0 seam is in place and Phase 2 only swaps the stub bodies.
 */
export function accumulationRule(inv: Investment): AccumulationRule {
  // A3 (#7) EPF boundary: the engine does NOT derive contributions or split the
  // 12% employer share into EPF (3.67%) and EPS (8.33%). For EPF_VPF the holding's
  // `value` is the USER-SUPPLIED EPF balance and is treated as the EPF corpus
  // as-is — it EXCLUDES the EPS pension portion. Do not assume a derived
  // accumulation here; corpus is entered, not computed (see EpfVpfThresholdCard).
  return {
    kind: "stub-phase-2",
    description: `accumulationRule for ${inv.type}: Phase 2 Stage C implements compounding rule (e.g., ` +
      `EPF 8.25%/employer-match, PPF 7.1%/1.5L ceiling, SIP at expectedReturn). NOTE (A3/#7): ` +
      `EPF corpus is user-supplied and EXCLUDES the EPS pension share — no 3.67/8.33 split is derived.`,
  };
}

/**
 * Stub — body lands in Phase 2 Stage C (lib/derive.ts withdrawal).
 * Returns a sentinel object describing the rule that WILL apply.
 */
export function withdrawalRule(inv: Investment): WithdrawalRule {
  return {
    kind: "stub-phase-2",
    description: `withdrawalRule for ${inv.type}: Phase 2 Stage C implements Floor/Ceiling rules ` +
      `(Constant + adjust band) per audit Entry #9. Income-bucket method deferred to MVP-2 (Q5).`,
  };
}

// ---------- Helpers consumed by aggregator surfaces ----------

/**
 * The "asset class" rollup used by /investments overview + AssetAllocationDonut.
 * Coarser than InvestmentType — collapses 12 types into 5 risk classes.
 * Routes through the same single-dispatch seam (rule of A2 DoD: NO other site
 * may switch on inv.type for asset-class binning).
 */
export type AssetClass =
  | "equity"
  | "debt"
  | "gold"
  | "realEstate"
  | "alternative";

export function assetClass(inv: Investment): AssetClass {
  switch (inv.type) {
    case "Stocks":
    case "MutualFunds":
    case "ESOP":
    case "International":
      return "equity";
    case "PPF":
    case "NPS":
    case "EPF_VPF":
    case "FD":
      return "debt";
    case "Gold":
      return "gold";
    case "RealEstate":
      return "realEstate";
    case "REIT":
    case "Crypto":
      return "alternative";
  }
}

/**
 * Predicate — true when the type contributes to "emergency fund liquidity"
 * for the financial-health emergency-fund score. The old inline checks in
 * EmergencyFund.vue + Banking.vue did `type === 'FD' || type === 'Crypto'`
 * — incorrect because Crypto isn't a stable emergency-fund vehicle and other
 * liquid types (savings via FD with sweep-out, Liquid MF) were missed. The
 * audit-grounded rule: liquid + non-volatile counts as emergency-fund stack.
 */
export function isEmergencyFundEligible(inv: Investment): boolean {
  // v5 contract Decision 7 ("Inherit v4 UI/UX fully — only audit-mandated
  // changes apply") — preserve the v4 rule (FD || Crypto) until Phase 4 Stage M
  // /financial-health rework, where the audit-grounded refinement applies
  // (FD || Liquid MF; Crypto removed as it's a volatile non-emergency vehicle).
  if (inv.type === "FD") return true;
  if (inv.type === "Crypto") return true;
  return false;
}

/**
 * Maps an investment to the bucket key used by useAssumptionsStore.blendedReturn(weights).
 * Called by useFireDerive's blendedReturn computed — keeps the 8-bucket bin (separate
 * PPF/EPF/NPS rates) out of consumer code while preserving the store's API.
 *
 * Note: International + REIT + ESOP route as 'other' (they're new in v5; their
 * dedicated return rates land in /preferences §Returns per Phase 3 Stage G).
 */
export type ReturnBucketKey =
  | "equity"
  | "debt"
  | "realEstate"
  | "gold"
  | "nps"
  | "ppf"
  | "epf"
  | "international"
  | "reit"
  | "crypto"
  | "other";

export function returnBucketKey(inv: Investment): ReturnBucketKey {
  switch (inv.type) {
    case "Stocks":
    case "MutualFunds":
      return "equity";
    case "FD":
      return "debt";
    case "PPF":
      return "ppf";
    case "EPF_VPF":
      return "epf";
    case "NPS":
      return "nps";
    case "RealEstate":
      return "realEstate";
    case "Gold":
      return "gold";
    // B-3 — first-class buckets so the corrected per-type rates reach the blend.
    case "International":
      return "international";
    case "REIT":
      return "reit";
    case "Crypto":
      return "crypto";
    case "ESOP":
      return "other";
  }
}

/**
 * Accessibility class — the partition the #15 accumulation-bridge layer routes
 * on (lib/accessibility.ts). Distinct from `liquidity()` (a 3-way friction
 * grade) and `assetClass()` (a risk rollup): this answers "by WHAT RULE does
 * this instrument's value become spendable cash in retirement?".
 *
 *  - liquid      → sellable at the FIRE age (Stocks, MF, FD, Gold, REIT, Crypto,
 *                  International, ESOP-vested). FD's breakage penalty and gold's
 *                  sale friction are not multi-year locks, so they count liquid.
 *  - epf         → EPF/VPF — accessible on job exit (≈ the FIRE age).
 *  - ppf         → 15-year lock from the opening year (else assumed locked to 60).
 *  - nps         → 60/40 normal exit (≥60) or 20/80 premature exit (<60).
 *  - realEstate  → primary residence already excluded from corpus; investment /
 *                  inherited property is illiquid (rental income still counts).
 *
 * This is the ONLY place the accessibility partition switches on inv.type
 * (A2 single-dispatch rule). accessibility.ts switches on the returned union.
 */
export type AccessibilityClass = "liquid" | "epf" | "ppf" | "nps" | "realEstate";

export function accessibilityClass(inv: Investment): AccessibilityClass {
  switch (inv.type) {
    case "Stocks":
    case "MutualFunds":
    case "FD":
    case "Gold":
    case "Crypto":
    case "International":
    case "REIT":
    case "ESOP":
      return "liquid";
    case "EPF_VPF":
      return "epf";
    case "PPF":
      return "ppf";
    case "NPS":
      return "nps";
    case "RealEstate":
      return "realEstate";
  }
}

/**
 * UI helper — short single-word label for a type used in chips, cards, and
 * legends. Centralizes the rendered string so a microcopy change touches one
 * place. The `type` parameter is the discriminator alone (not the full inv)
 * because some surfaces (forms, type-picker dropdowns) have only the type.
 */
export function typeLabel(type: InvestmentType): string {
  switch (type) {
    case "Stocks":
      return "Stocks";
    case "MutualFunds":
      return "Mutual Funds";
    case "PPF":
      return "PPF";
    case "NPS":
      return "NPS";
    case "RealEstate":
      return "Real Estate";
    case "Gold":
      return "Gold";
    case "FD":
      return "Fixed Deposit";
    case "Crypto":
      return "Crypto";
    case "EPF_VPF":
      return "EPF / VPF";
    case "ESOP":
      return "ESOP";
    case "International":
      return "International Equity";
    case "REIT":
      return "REIT";
  }
}

/**
 * UI helper — accent colour for a type, used for the EntityRow accent stripe,
 * leading chip/icon, and allocation legends. Theme name or raw CSS colour.
 * Single source so Holdings, the Buckets page, and the add-form agree.
 */
export function typeColor(type: InvestmentType): string {
  switch (type) {
    case "RealEstate":
    case "REIT":
      return "warning";
    case "Gold":
      return "#d97706";
    case "Crypto":
      return "secondary";
    case "PPF":
    case "NPS":
    case "FD":
    case "EPF_VPF":
      return "info";
    default:
      return "primary"; // Stocks, MutualFunds, ESOP, International (equity)
  }
}
