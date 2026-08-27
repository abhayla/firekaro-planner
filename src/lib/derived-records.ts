/**
 * Derived family-layer records — read-time derivation for the NEW v5
 * family-layer kinds (parents / education / marriage / extended-contingency).
 *
 * Phase 2 Stage E per docs/goals/build-firekaro-mvp-v5.md §5.
 * Audit Entry #6 + #10. Resolves Concern #5 (autoFlow* in store) per
 * Q3 split-by-vintage: NEW family-layer flows are derived at read time
 * here; EXISTING v4 autoFlow paths stay as store mutators in
 * stores/household.ts (no behavior change for v4 surfaces).
 *
 * Why derive at read time instead of mutating the store: the family
 * layer composites multiple sources (Member.relation=Parent + healthcare
 * inflation; PlannedFutureLine kind=education with target year; etc.)
 * and changing any source should immediately reflect downstream without
 * a "re-flow" step. Pure read-time derivation makes the dataflow
 * single-direction and testable.
 */

import type {
  Household,
  InflationBucket,
  PlannedFutureKind,
  RecurringExpenseLine,
  PlannedFutureLine,
} from "@/types/household";

/**
 * ADR-0006 Phase 1d — the ONE kind -> price-index map for a dated goal.
 *
 * `PlannedFutureLine.inflationBucket` is optional, and a line that reaches the kernel without one
 * used to fall straight through to all-items CPI: a ₹50 L college fund priced at 6% instead of 9%,
 * i.e. a FIRE target that is too SMALL, which is the optimistic direction. `kind` is the field the
 * user actually picks in the goal form, so it is what the bucket falls back to.
 *
 * "marriage" maps to general on purpose: it is a general-consumption event with no price index of
 * its own, and inventing one would be a number nobody can defend. Exported so the kernel, the
 * store's legacy backfill and the goal form share one answer instead of three copies.
 */
export function plannedGoalInflationBucket(kind: PlannedFutureKind | undefined): InflationBucket {
  switch (kind) {
    case "education":
      return "education";
    case "medical":
      return "healthcare";
    default:
      return "general";
  }
}

export interface DerivedFamilyLayer {
  /** Parents bucket lines (recurring expenses kind='parents'). */
  parentsRecurring: RecurringExpenseLine[];
  /** Children's education goals (planned-future kind='education'). */
  educationGoals: PlannedFutureLine[];
  /** Marriage events (planned-future kind='marriage'). */
  marriageEvents: PlannedFutureLine[];
  /**
   * EVERY planned-future line, regardless of `kind` (general/education/marriage/
   * medical/undefined) — T-376/gh-#165. This is the FIRE-NUMBER lump source
   * (derive.ts's family-layer corpus): a `general` goal like a house upgrade
   * MUST move the FIRE number just like an education/marriage goal does, or
   * the app makes an optimistic honesty error. Kept SEPARATE from
   * `educationGoals`/`marriageEvents` above, which remain the narrower
   * DISPLAY-only family-layer set (FamilyLayerCard / NudgeStack / lifecycle
   * digest) — their scope is unchanged by this fix.
   */
  allPlannedGoals: PlannedFutureLine[];
  /** Extended-family contingency line (synthesized from household %). */
  extendedContingency: RecurringExpenseLine | null;
  /**
   * Aggregate annual cost of the entire family layer in today's rupees.
   * Used by Dashboard FamilyLayerCard (Stage I).
   */
  totalAnnualCost: number;
  /**
   * Whether the household has ANY family-layer commitments. Drives the
   * "show this card / nudge" gate.
   */
  hasFamilyLayer: boolean;
}

/**
 * Derive the family-layer records from the current household snapshot.
 * Pure function — no mutation, no side effects.
 *
 * The extendedContingency line is synthesized (not stored) — it's a
 * percentage of total annual expenses computed at read time. Storing it
 * would invite drift; deriving it keeps the source of truth in the
 * household.extendedFamilyContingencyPercent field.
 */
export function derivedFamilyLayer(household: Household): DerivedFamilyLayer {
  const recurring = household.expenses.recurring;
  const planned = household.expenses.plannedFuture;

  const parentsRecurring = recurring.filter((r) => r.kind === "parents");
  const educationGoals = planned.filter((p) => p.kind === "education");
  const marriageEvents = planned.filter((p) => p.kind === "marriage");

  // Synthesized extended-contingency line — applied as a flat monthly
  // line equal to (household.extendedFamilyContingencyPercent * total
  // annual non-contingency expenses) / 12.
  const contingencyPct = household.extendedFamilyContingencyPercent ?? 0.075;
  const baseAnnual = annualNonContingencyExpenses(household);
  const contingencyAnnual = baseAnnual * contingencyPct;
  const extendedContingency: RecurringExpenseLine | null = contingencyAnnual > 0
    ? {
        id: "synth-extended-contingency",
        label: "Extended-family contingency",
        amount: Math.round(contingencyAnnual / 12),
        frequency: "M",
        source: "manual",
        kind: "extended-contingency",
        inflationBucket: "general",
      }
    : null;

  // Aggregate annual cost.
  const parentsAnnual = parentsRecurring.reduce(
    (s, r) => s + monthlyEquivalent(r) * 12,
    0,
  );
  // Planned-future goals: amortize todayAmount over yearsToTarget.
  const today = new Date().getFullYear();
  const educationAnnual = educationGoals.reduce((s, g) => {
    const yrs = Math.max(1, g.targetYear - today);
    return s + g.todayAmount / yrs;
  }, 0);
  const marriageAnnual = marriageEvents.reduce((s, g) => {
    const yrs = Math.max(1, g.targetYear - today);
    return s + g.todayAmount / yrs;
  }, 0);
  const totalAnnualCost = Math.round(
    parentsAnnual + educationAnnual + marriageAnnual + contingencyAnnual,
  );

  const hasFamilyLayer =
    parentsRecurring.length > 0 ||
    educationGoals.length > 0 ||
    marriageEvents.length > 0 ||
    (contingencyAnnual > 0 && contingencyPct > 0);

  return {
    parentsRecurring,
    educationGoals,
    marriageEvents,
    allPlannedGoals: planned,
    extendedContingency,
    totalAnnualCost,
    hasFamilyLayer,
  };
}

function monthlyEquivalent(r: RecurringExpenseLine): number {
  if (r.frequency === "M") return r.amount;
  if (r.frequency === "Q") return r.amount / 3;
  return r.amount / 12;
}

function annualNonContingencyExpenses(h: Household): number {
  const recurringAnnual = h.expenses.recurring
    .filter((r) => r.kind !== "extended-contingency")
    .reduce((s, r) => s + monthlyEquivalent(r) * 12, 0);
  return h.expenses.avgMonthly * 12 + recurringAnnual;
}
