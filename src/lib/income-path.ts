/**
 * The per-earner INCOME path (ADR-0007, gh #185 step 4) — replaces the savings step-up proxy.
 *
 * WHY THIS MODULE EXISTS. Until this change the kernel never grew the user's *income*; it grew the
 * *savings residual* by a flat real step-up (`householdSavingsStepUpPercent`). For a household whose
 * surplus is small relative to income — the whole lower-middle band the persona now covers — that
 * understates future surplus by roughly the ratio income ÷ surplus: 2% of a ₹50k surplus is ₹1k/yr,
 * while 2% of a ₹3L income is ₹6k/yr, and nearly every rupee of income growth is surplus because
 * expenses only track prices. Growing income and letting the residual fall out year by year is the
 * honest model. Full RCA: `docs/goals/2026-09-13-income-path-kernel.md` §1.
 *
 * FRAME. Everything here is REAL (today's rupees, net of general CPI), matching
 * `ContributionSchedule` semantics (ADR-0004) — `derive.ts` re-inflates to the nominal frame at the
 * one existing seam (`toNominalContribution`). A growth rate expressed nominally would double-count
 * inflation and pull the FIRE date optimistically in.
 *
 * TAPER. Real growth stops compounding at `taperAge`; real income then HOLDS FLAT (it never drops)
 * while expenses keep rising, so the surplus falls after the taper. That is intended — see the
 * spec's worked example, year 29.
 *
 * Pure module (no store/DOM/IO) per `.claude/rules/calculation-modules.md`.
 */

/** One earner's income path input. All ages are whole years; `annualAmount` is REAL today's ₹/yr. */
export interface EarnerIncomePath {
  /** REAL annual income at year 0 (today's rupees). */
  annualAmount: number;
  /** The earner's age at year 0 — the taper is measured against THIS age, not the anchor's. */
  ageAtYear0: number;
  /** REAL growth rate, percentage points per year (e.g. `2` = +2%/yr above general CPI). */
  realGrowthPercent: number;
  /** Age at which real growth stops compounding; income holds flat (real) thereafter. */
  taperAge: number;
}

/** Real growth cap, percentage points per year. Above this a headline is not defensible (#46/#185). */
export const INCOME_GROWTH_MAX_PERCENT = 15;

/** Clamp a real growth percentage to [0, INCOME_GROWTH_MAX_PERCENT] and convert to a decimal rate. */
export function clampIncomeGrowthRate(realGrowthPercent: number | undefined): number {
  const pct = Number.isFinite(realGrowthPercent) ? (realGrowthPercent as number) : 0;
  return Math.min(Math.max(pct, 0), INCOME_GROWTH_MAX_PERCENT) / 100;
}

/**
 * One earner's REAL income at `yearIndex` (years from today).
 *
 * `income(t) = amount₀ × (1 + g)^min(t, taperAge − age₀)`, with the exponent floored at 0 so an
 * earner already past the taper age is flat from the start (never shrinking).
 *
 * Defensive (`defensive-coding.md`): a non-finite year, a non-finite/negative amount, or a
 * non-finite result resolves to 0 — a NaN here would silently poison the corpus projection.
 */
export function realIncomeAt(path: EarnerIncomePath, yearIndex: number): number {
  if (!Number.isFinite(yearIndex)) return 0;
  const base = Number.isFinite(path.annualAmount) && path.annualAmount > 0 ? path.annualAmount : 0;
  if (base === 0) return 0;
  const rate = clampIncomeGrowthRate(path.realGrowthPercent);
  if (rate === 0) return base;
  const taperAge = Number.isFinite(path.taperAge) ? path.taperAge : 50;
  const age0 = Number.isFinite(path.ageAtYear0) ? path.ageAtYear0 : 0;
  const growthYears = Math.max(0, Math.min(Math.max(0, yearIndex), taperAge - age0));
  const value = base * (1 + rate) ** growthYears;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** The whole household's REAL income at `yearIndex` — the sum of every earner's path. */
export function householdRealIncomeAt(paths: EarnerIncomePath[], yearIndex: number): number {
  return paths.reduce((sum, p) => sum + realIncomeAt(p, yearIndex), 0);
}

/**
 * gh #207 — the REAL income SCALE at `yearIndex`: income(t) / income(0), taper included.
 *
 * THE ONE FORMULA both prescription scopes ride. `derive.ts` (household) and `individual-fire.ts`
 * (member lens) each scale a fixed real contribution by this factor, so the solver's probe honours
 * the same income growth the headline already assumes. Before #207 both treated a contribution as a
 * flat real scalar, so the prescription was solved against a plan in which income never grows -
 * pessimistic (over-prescribing), and it also left the income-side levers inert on that number.
 *
 * Salary-only by construction: the growth path applies to LABOUR income, and non-salary income is
 * flat in real terms in this model, so it is excluded from BOTH ends of the ratio rather than
 * diluting the scale with a leg that never grows.
 *
 * Returns 1 - a neutral, NaN-free identity - whenever there is no salaried income at all (a
 * rental-only or pension-only household), when `yearIndex` is not finite, or when the ratio would
 * not be a positive finite number. A household with no salary must never see its prescription
 * scaled by 0/0.
 */
export function realIncomeScaleAt(paths: EarnerIncomePath[], yearIndex: number): number {
  if (!Number.isFinite(yearIndex)) return 1;
  const income0 = householdRealIncomeAt(paths, 0);
  if (!(income0 > 0)) return 1;
  const scale = householdRealIncomeAt(paths, Math.max(0, yearIndex)) / income0;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

/**
 * The REAL growth rate the EXPECTED band uses for one earner, derived from the user's own typed
 * nominal `salary.hikePercent`.
 *
 * `real = ((1 + hike) / (1 + CPI)) − 1` — a proper Fisher conversion, not the subtraction shortcut —
 * clamped to [0, INCOME_GROWTH_MAX_PERCENT].
 *
 * IT IS NOT FLOORED AT THE CONSERVATIVE DEFAULT. An earlier pass did floor it there, so that the
 * "expected" band could never read worse than the headline beside it. The FinTech review of this
 * change (2026-09-29) rejected that, correctly: it is a PRESENTATION rule enforced inside a MATH
 * function, and it makes the second number `max(user, default)` rather than the user's own — so the
 * copy "42 if your 12% hikes continue" becomes false for every user whose hike is below CPI + the
 * default. The honest arithmetic belongs here; whether to SHOW a worse-than-headline second number
 * (suppress it, or label it "your own hike % implies real income decline — see levers") is the UI's
 * call, and `derive()` exposes `expectedFireAgeBasis` as null precisely so the UI can make it.
 *
 * The floor at 0 stays: a NEGATIVE real growth rate would mean a shrinking income path, which
 * `realIncomeAt` does not model (its exponent is floored so income holds flat, never shrinks).
 */
export function expectedRealGrowthPercent(
  hikePercentNominal: number | undefined,
  generalInflation: number,
): number {
  const hike = Number.isFinite(hikePercentNominal) ? (hikePercentNominal as number) : 0;
  const cpi = Number.isFinite(generalInflation) ? generalInflation : 0;
  const real = ((1 + hike / 100) / (1 + cpi) - 1) * 100;
  return Math.min(Math.max(real, 0), INCOME_GROWTH_MAX_PERCENT);
}

/**
 * The lifestyle-creep-adjusted GENERAL inflation rate (ADR-0007 (c)).
 *
 * Creep is added to the `general` bucket ONLY. The healthcare/education/housing buckets are
 * non-volitional PRICE indices already set above general CPI; a behavioural creep term on top of
 * them would double-count the same escalation. Returns a decimal rate.
 */
export function generalInflationWithCreep(
  generalInflation: number,
  creepPercent: number | undefined,
): number {
  const creep = Number.isFinite(creepPercent) ? Math.min(Math.max(creepPercent as number, 0), 5) : 0;
  return generalInflation + creep / 100;
}
