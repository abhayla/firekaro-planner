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
      return classifyRealEstate(asset, value);
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

function classifyRealEstate(asset: Investment, value: number): AccessibilityResult {
  const assetId = asset.id;
  const role = asset.realEstateRole;

  // Primary residence is already excluded from the FIRE corpus upstream — treat
  // it as a pure no-op here (zero bridge lump, illiquid) for defensiveness.
  if (role === "PrimaryResidence") {
    return { assetId, unlockAge: Infinity, accessibleLumpGross: 0, illiquid: true };
  }

  // Investment / inherited (or unspecified) property: illiquid — NOT in the
  // liquid bridge runway. Its rental income (if any) is counted separately as
  // bridge income in Phase C; the asset itself is never assumed sold.
  return {
    assetId,
    unlockAge: Infinity,
    accessibleLumpGross: 0,
    illiquid: true,
    assumption: {
      id: `realestate-illiquid:${assetId}`,
      assetId,
      assumed: `${asset.label ?? "Investment property"} is treated as illiquid — not sold to fund retirement`,
      why: "investment / inherited property is not assumed liquidated for the bridge (only its rental income counts)",
      impact:
        "it does not add to your spendable runway; if you DO plan to sell it at retirement, that flag is a later enhancement",
      fixField: "realEstateRole",
    },
  };
}
