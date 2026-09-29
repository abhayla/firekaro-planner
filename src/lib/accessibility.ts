/**
 * accessibility.ts — Phase A of the #15 accumulation-bridge honesty layer.
 *
 * THE PROBLEM IT EXISTS TO FIX: the FIRE engine treated every rupee of corpus
 * as spendable cash at the FIRE age. But EPF/VPF, PPF, and NPS-lump unlock on
 * their own schedules, and the NPS annuity slice is never cash at all — it's a
 * pension. Counting locked money as spendable produced an OPTIMISTIC FIRE date,
 * the worst error for the salaried accumulator (it makes them quit too early and
 * run dry mid-retirement).
 *
 * `accessibleAtAge` answers, for ONE holding: by what age does its value become
 * spendable, how much GROSS lump unlocks then, and does it throw off a pension
 * income stream? Phase B applies the post-tax haircut; Phase C assembles the
 * year-by-year bridge from these per-asset verdicts.
 *
 * CONSERVATIVE BY CONSTRUCTION: wherever a field is missing (PPF opening year
 * OR the owner's DOB) or a rule offers options (NPS early vs 60), it assumes the
 * LATER unlock / SMALLER cash and surfaces a transparency note (principle 1) so
 * the user can correct it. Pure — no store/DOM access; an explicit `asOf` keeps
 * it testable.
 *
 * ROUNDING CONVENTION: classifiers return raw-rupee `accessibleLumpGross`
 * (no rounding) so Phase C can sum across assets and round ONCE at the
 * aggregation boundary. The NPS lump is the one value that arrives pre-rounded
 * (it comes through `calculateNpsWithdrawal`, which rounds) — harmless, since
 * it is already an integral rupee figure.
 */
import type { Investment } from "@/types/household";
import { accessibilityClass } from "@/lib/investment-traits";
import { calculateNpsWithdrawal } from "@/lib/nps-withdrawal";
import { ageFromDOB } from "@/lib/age";

/** PPF statutory lock from the account opening year. */
export const PPF_LOCK_YEARS = 15;
/** Fallback unlock age for instruments locked to "retirement age" when unknown. */
export const ASSUMED_PENSION_UNLOCK_AGE = 60;

/**
 * #211 — haircut applied to a property's market value when it is SOLD to fund retirement.
 *
 * A flat is not a brokerage account: realising its market value costs brokerage (~1-2%), stamp/
 * registration and legal on the buyer side that shows up as a price concession, and above all TIME
 * — an Indian residential resale that must close on a date typically clears below the asking
 * quote. 10% is a deliberately modest, single, documented constant standing in for all of that; it
 * is NOT a tax (real-estate LTCG is applied separately by `liquidation-tax.ts` on top of this).
 *
 * WHICH WAY IT ERRS: it makes the sale proceeds SMALLER, i.e. the bridge harder to cover — the
 * conservative direction for the honesty layer. It is surfaced as an assumption note so the user
 * can see it rather than discover it.
 */
export const REAL_ESTATE_ILLIQUIDITY_HAIRCUT = 0.1;

/**
 * #211 — years AFTER the retirement age at which an un-planned property sale is assumed to close.
 *
 * WHY IT IS NOT ZERO (this is the load-bearing choice of the fix, and it is what makes the fix
 * CONSERVATIVE rather than optimistic). If an unplanned sale were dated at the retirement age
 * itself, a property with no stated plan would become fully spendable cash on day one of
 * retirement — which is MORE optimistic than the old always-locked treatment, and would move every
 * property household's verdict EARLIER. That is the wrong direction for the layer whose whole job
 * is to refuse to count money the household cannot spend.
 *
 * Two facts date the sale later instead. First, the household has not said it intends to sell: an
 * investment or inherited flat is normally held, and its rental income is the retirement benefit
 * (that income is already credited separately as bridge income). Second, even a household that does
 * intend to sell does not close on demand — an Indian residential resale is measured in quarters,
 * not days, and a seller who must close on a date takes the price the market gives.
 *
 * So the engine dates the assumed sale 3 years into retirement: the property is NOT runway for the
 * first three bridge years, and the user is told so with a one-tap `plannedSaleAge` fix. A
 * household that really will sell at retirement simply sets `plannedSaleAge` to its retirement age
 * and gets exactly that.
 */
export const ASSUMED_PROPERTY_SALE_LAG_YEARS = 3;

/**
 * A surfaced assumption (principle 1). The UI renders these uniformly:
 *  - `assumed` — what the engine assumed,
 *  - `why` — the missing field / rule that forced it,
 *  - `impact` — how it moves the FIRE goal,
 *  - `fixField` — the one-tap field to correct it.
 */
export interface AssumptionNote {
  /** Stable key for dedup + mapping the "fix this" affordance. */
  id: string;
  /** The holding that triggered the note (so the UI can deep-link to it). */
  assetId?: string;
  assumed: string;
  why: string;
  impact: string;
  /** Investment field the user should fill to replace the assumption. */
  fixField?: string;
}

/** A pension-style income stream (e.g. the NPS annuity slice). */
export interface IncomeStream {
  /**
   * Gross annual income before tax. When `taxable`, Phase C MUST apply
   * `postTaxAnnuityIncome(annualGross, marginalRate)` (nps-withdrawal.ts)
   * EXACTLY ONCE before crediting it as bridge income — crediting the gross
   * over-states cover (the optimistic error this layer exists to kill), and
   * double-haircutting under-states it. This field is always the gross.
   */
  annualGross: number;
  /** Age at which the stream begins paying. */
  startAge: number;
  /** Whether the stream is slab-taxable (annuity = true). */
  taxable: boolean;
  /** Short provenance label for the UI ("NPS annuity"). */
  source: string;
}

export interface AccessibilityResult {
  assetId: string;
  /**
   * Age from which this holding's lump is spendable in retirement. Clamped to
   * never be before the FIRE age — nothing is "drawn" while still accumulating.
   */
  unlockAge: number;
  /** GROSS lump that unlocks at `unlockAge` (pre-liquidation-tax). */
  accessibleLumpGross: number;
  /** A pension income stream this holding throws off, if any (NPS annuity). */
  incomeStream?: IncomeStream;
  /**
   * True when the holding is NOT part of the liquid bridge runway at all
   * (investment / inherited property, primary residence). Its market value may
   * still count toward total-corpus ADEQUACY, but it is never spendable cash in
   * the year-by-year bridge.
   */
  illiquid?: boolean;
  /** Transparency note when the engine fell back to an assumption (principle 1). */
  assumption?: AssumptionNote;
}

const NPS_EARLY_RETIREMENT_AGE = 60;

/**
 * Classify a single holding's retirement accessibility.
 *
 * @param asset         the holding
 * @param retirementAge the FIRE age (when drawdown begins)
 * @param memberDob     the owning member's DOB (ISO) — converts calendar
 *                      unlock years (PPF maturity) to ages
 * @param asOf          clock for deterministic year/age math (defaults to now)
 */
export function accessibleAtAge(
  asset: Investment,
  retirementAge: number,
  memberDob: string | null | undefined,
  asOf: Date = new Date(),
): AccessibilityResult {
  const assetId = asset.id;
  // Defensive: these are pure libs — guard a NaN/negative value even though the
  // Zod boundary enforces `min(0)` (defensive-coding rule applies to derived nums).
  const value = Math.max(0, Number.isFinite(asset.value) ? asset.value : 0);
  const cls = accessibilityClass(asset);

  switch (cls) {
    case "liquid": {
      // ESOP: only the VESTED slice is spendable cash on exit. Other liquid
      // types are fully accessible at their stated value.
      const lump =
        asset.type === "ESOP"
          ? Math.max(0, asset.vestedValueINR ?? asset.value)
          : value;
      return { assetId, unlockAge: retirementAge, accessibleLumpGross: lump };
    }

    case "epf":
      // EPF/VPF is withdrawable on job exit (current law: after ~2 months'
      // unemployment) → effectively the FIRE age.
      return { assetId, unlockAge: retirementAge, accessibleLumpGross: value };

    case "ppf":
      return classifyPpf(asset, retirementAge, memberDob, asOf, value);

    case "nps":
      return classifyNps(asset, retirementAge, value);

    case "realEstate":
      return classifyRealEstate(asset, retirementAge, value);
  }
}

function classifyPpf(
  asset: Investment,
  retirementAge: number,
  memberDob: string | null | undefined,
  asOf: Date,
  value: number,
): AccessibilityResult {
  const assetId = asset.id;

  // We need BOTH the opening year AND the owner's DOB to convert the 15-year
  // maturity (a calendar year) to an unlock AGE. If either is missing, fall back
  // conservatively to "locked until 60" + a note — NEVER compute off a bogus
  // age-0 DOB, which would silently collapse the PPF to "liquid at the FIRE age"
  // (the optimistic error this layer exists to kill).
  const dobMissing = memberDob == null;
  if (asset.openingYear == null || dobMissing) {
    const unlockAge = Math.max(retirementAge, ASSUMED_PENSION_UNLOCK_AGE);
    const missing = asset.openingYear == null ? "the account opening year" : "the owner's date of birth";
    return {
      assetId,
      unlockAge,
      accessibleLumpGross: value,
      assumption: {
        id: `ppf-unknown-maturity:${assetId}`,
        assetId,
        assumed: `PPF assumed locked until age ${ASSUMED_PENSION_UNLOCK_AGE}`,
        why: `${missing} is not set, so the 15-year maturity date cannot be dated`,
        impact:
          retirementAge < ASSUMED_PENSION_UNLOCK_AGE
            ? "this money is held out of your early-retirement bridge until 60 — supplying the missing field usually unlocks it sooner and improves your FIRE date"
            : "no effect on your bridge (you retire at/after 60) — supplying the missing field confirms it",
        fixField: asset.openingYear == null ? "openingYear" : "dateOfBirth",
      },
    };
  }

  // Maturity year → age: ageNow + (maturityYear − yearNow). Clamp to the FIRE
  // age (nothing is drawn before retirement; if it matures earlier it is simply
  // liquid by then).
  const ageNow = ageFromDOB(memberDob, asOf);
  const yearNow = asOf.getFullYear();
  const maturityYear = asset.openingYear + PPF_LOCK_YEARS;
  const maturityAge = ageNow + (maturityYear - yearNow);
  const unlockAge = Math.max(retirementAge, maturityAge);
  return { assetId, unlockAge, accessibleLumpGross: value };
}

function classifyNps(
  asset: Investment,
  retirementAge: number,
  value: number,
): AccessibilityResult {
  const assetId = asset.id;
  const isEarly = retirementAge < NPS_EARLY_RETIREMENT_AGE;
  const split = calculateNpsWithdrawal({
    totalCorpus: value,
    exitType: isEarly ? "early" : "normal",
  });

  const result: AccessibilityResult = {
    assetId,
    unlockAge: retirementAge,
    accessibleLumpGross: split.lumpSum,
  };

  if (split.annuityIncomeAnnual > 0) {
    result.incomeStream = {
      annualGross: split.annuityIncomeAnnual,
      startAge: retirementAge,
      taxable: true,
      source: "NPS annuity",
    };
  }

  // Both-options disclosure (principle 1): the early-exit penalty is large, so
  // always surface what waiting until 60 would free up.
  result.assumption = isEarly
    ? {
        id: `nps-early-exit:${assetId}`,
        assetId,
        assumed:
          "NPS taken at early exit → only 20% as cash, 80% into an immediate annuity",
        why: `you retire before ${NPS_EARLY_RETIREMENT_AGE}, so the premature-exit rule applies`,
        impact:
          "waiting until 60 would free 60% as cash (vs 20%); the 80% annuity is assumed to begin paying immediately at your FIRE age",
        fixField: "targetRetirementAge",
      }
    : {
        id: `nps-normal-exit:${assetId}`,
        assetId,
        assumed: "NPS taken at normal exit → 60% cash, 40% annuity",
        why: `you retire at/after ${NPS_EARLY_RETIREMENT_AGE}`,
        impact: "the 40% annuity slice is a pension, not a spendable lump",
        fixField: "targetRetirementAge",
      };

  return result;
}

/**
 * #211 — a non-primary property enters the retirement timeline ONLY through an explicit SALE
 * EVENT, never as a silent always-locked lump.
 *
 * THE BUG THIS FIXES (Tier-0, optimistic). Before this, an investment/inherited property returned
 * `unlockAge: Infinity, accessibleLumpGross: 0, illiquid: true`. Phase C then added its FULL
 * projected value to `lockedCorpus` but created NO tranche — so the money counted toward the
 * corpus-adequacy total the bridge is layered on, while never appearing as something that becomes
 * spendable. The household therefore passed the gate on rupees it could never spend: for the
 * mehtas seed a ₹3.5 Cr Bandra flat was 40% of the retirement corpus and contributed exactly ₹0
 * of runway, yet the bridge read `covered: true`.
 *
 * THE MODEL NOW. The property unlocks at `plannedSaleAge` (falling back to the retirement age, with
 * a disclosed assumption), and the gross realised at that age is
 * `value × (1 − REAL_ESTATE_ILLIQUIDITY_HAIRCUT)`; Phase B then applies real-estate LTCG on top.
 * Primary residence stays a hard no-op — it is the roof over their head, not a retirement asset,
 * and it is already excluded from the FIRE corpus upstream.
 *
 * WHAT DELIBERATELY DID NOT CHANGE: the adequacy target. The property still funds retirement — the
 * fix is only about WHEN and HOW MUCH of it becomes spendable, and that its rupees do not sit in
 * the pre-sale liquid residual. `illiquid` therefore stays TRUE until the sale age, which is what
 * keeps the #212 reconciliation identity intact: the holding's projected value is still counted in
 * the portfolio total (as a locked projection), it is now merely dated.
 */
function classifyRealEstate(
  asset: Investment,
  retirementAge: number,
  value: number,
): AccessibilityResult {
  const assetId = asset.id;
  const role = asset.realEstateRole;

  // Primary residence is already excluded from the FIRE corpus upstream — treat
  // it as a pure no-op here (zero bridge lump, illiquid) for defensiveness. It is never
  // assumed sold: selling the home you live in does not fund retirement, it relocates it.
  if (role === "PrimaryResidence") {
    return { assetId, unlockAge: Infinity, accessibleLumpGross: 0, illiquid: true };
  }

  // Investment / inherited (or unspecified) property: spendable ONLY at its sale age.
  const planned = asset.plannedSaleAge;
  const saleAgeGiven = typeof planned === "number" && Number.isFinite(planned) && planned > 0;
  // Nothing is drawn before retirement begins, so a sale planned earlier is credited at the
  // retirement age (the same clamp every other family uses). With no plan at all the sale is dated
  // `ASSUMED_PROPERTY_SALE_LAG_YEARS` into retirement — see that constant for why it is not 0.
  const unlockAge = saleAgeGiven
    ? Math.max(retirementAge, planned!)
    : retirementAge + ASSUMED_PROPERTY_SALE_LAG_YEARS;
  const grossAtSale = Math.max(0, value * (1 - REAL_ESTATE_ILLIQUIDITY_HAIRCUT));
  const label = asset.label ?? "Investment property";

  return {
    assetId,
    unlockAge,
    accessibleLumpGross: grossAtSale,
    // Still illiquid: it is NOT part of the pre-sale liquid pool. It becomes a dated tranche in
    // Phase C, not cash at the retirement age (unless the sale age IS the retirement age).
    illiquid: unlockAge > retirementAge,
    assumption: {
      id: saleAgeGiven ? `realestate-sale-planned:${assetId}` : `realestate-sale-assumed:${assetId}`,
      assetId,
      assumed: `${label} assumed sold at age ${unlockAge}, realising ${Math.round((1 - REAL_ESTATE_ILLIQUIDITY_HAIRCUT) * 100)}% of its value before tax`,
      why: saleAgeGiven
        ? `a property is only spendable once sold; a ${Math.round(REAL_ESTATE_ILLIQUIDITY_HAIRCUT * 100)}% illiquidity haircut covers brokerage, closing costs and a time-pressured sale (real-estate LTCG is applied on top)`
        : `no planned sale age is set, so the sale is dated ${ASSUMED_PROPERTY_SALE_LAG_YEARS} years into retirement — a property is only spendable once sold, and an unplanned resale takes time; a ${Math.round(REAL_ESTATE_ILLIQUIDITY_HAIRCUT * 100)}% illiquidity haircut covers brokerage, closing costs and a time-pressured sale (real-estate LTCG is applied on top)`,
      impact:
        "until that age the property is NOT part of your spendable runway — only its rental income counts; if you do not intend to sell it, it should not be counted as retirement corpus at all",
      fixField: "plannedSaleAge",
    },
  };
}
