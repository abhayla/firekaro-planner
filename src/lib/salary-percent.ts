/**
 * salary-percent — the form-layer percent ⇄ rupee bridge for the salary edit dialog.
 *
 * The persisted model (`MemberSalary`) keeps `basicAnnual` / `employerNpsAnnual` as ₹
 * amounts — that is what `tax.ts` caps the 80CCD(2) deduction against. The FORM, however,
 * asks for percentages (Basic as % of CTC, employer NPS as % of basic) because that is how
 * salaried users think about their structure. This module owns the defaults and the two-way
 * conversion; the dialog converts to ₹ on save and re-derives the % from stored ₹ on open.
 *
 * Defaults (LAW-grounded, applied to BRAND-NEW entries ONLY — verified 2026-06-10):
 *   - Basic+DA = 50% of CTC — the Code on Wages 2019 wage definition (the four labour
 *     codes are in force since 21 Nov 2025) floors wages at 50% of total remuneration.
 *     CTC runs slightly above "remuneration" (it includes employer-side costs), so 50%
 *     of CTC errs a touch high on the cap basis — acceptable for a user-visible prefill
 *     the user confirms on save. Basic is used only to cap the 80CCD(2) deduction and to
 *     refine gratuity/EPS, so this default never adds income.
 *   - Employer NPS: SECTOR-AWARE. Government → 14% of basic (the statutory mandatory
 *     employer contribution since 2019, and the 80CCD(2) ceiling in both regimes).
 *     Private → 0%: corporate NPS is a minority opt-in, and a prefilled non-zero %
 *     would CLAIM an 80CCD(2) deduction (≈₹98K/yr tax at a ₹45L CTC) that most private
 *     employers never contribute — a Tier-0 optimistic error (FinTech review 2026-06-10).
 *     The 14% ceiling (private new-regime since FY 2024-25, Finance (No. 2) Act 2024;
 *     old-regime private caps at 10% — tax.ts enforces both) stays discoverable in the
 *     form hint.
 *
 * Re-opening an EXISTING record derives the percentages from the stored amounts; absent
 * fields show 0% and are NEVER resurrected to a default — a no-edit open→save must not
 * manufacture a deduction the user never claimed (code review 2026-06-10, blocker #1).
 * Derived percentages are intentionally NOT clamped to 100: junk legacy data (e.g. NPS
 * stored larger than basic) surfaces as a visible >100% validation error the user must
 * resolve, rather than being silently rewritten.
 */

export const DEFAULT_BASIC_PERCENT_OF_CTC = 50;

export type EmployerSector = "private" | "government";

export function defaultEmployerNpsPercent(sector: EmployerSector | undefined): number {
  return sector === "government" ? 14 : 0;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

export function basicAnnualFromPercent(annualCTC: number, basicPercent: number): number {
  if (!Number.isFinite(annualCTC) || !Number.isFinite(basicPercent)) return 0;
  if (annualCTC <= 0 || basicPercent <= 0) return 0;
  return Math.round((annualCTC * basicPercent) / 100);
}

export function employerNpsAnnualFromPercents(
  annualCTC: number,
  basicPercent: number,
  employerNpsPercent: number,
): number {
  const basic = basicAnnualFromPercent(annualCTC, basicPercent);
  if (basic <= 0 || !Number.isFinite(employerNpsPercent) || employerNpsPercent <= 0) return 0;
  return Math.round((basic * employerNpsPercent) / 100);
}

/**
 * Dialog-open derivation.
 *
 * Fresh entry (no stored salary / no CTC yet): the law-grounded prefill — basic 50%,
 * employer NPS by sector (government 14 / private 0).
 *
 * Existing record: percentages derived from the stored ₹ amounts; absent → 0% (never a
 * default). One representational exception: stored NPS > 0 with no stored basic (the
 * legacy "uncapped trust" state) needs a basis to be expressible as %-of-basic, so the
 * default basic is prefilled as that basis — the saved NPS ₹ round-trips intact, and the
 * 80CCD(2) cap then applies against it (the conservative, law-correct direction).
 */
export function salaryEditPercents(
  salary:
    | {
        annualCTC?: number;
        basicAnnual?: number;
        employerNpsAnnual?: number;
        employerSector?: EmployerSector;
      }
    | undefined,
): { basicPercent: number; employerNpsPercent: number } {
  const ctc = salary?.annualCTC ?? 0;
  if (!salary || !Number.isFinite(ctc) || ctc <= 0) {
    return {
      basicPercent: DEFAULT_BASIC_PERCENT_OF_CTC,
      employerNpsPercent: defaultEmployerNpsPercent(salary?.employerSector),
    };
  }

  const basicStored = salary.basicAnnual;
  const npsStored = salary.employerNpsAnnual;
  const hasBasic = basicStored != null && Number.isFinite(basicStored) && basicStored > 0;
  const hasNps = npsStored != null && Number.isFinite(npsStored) && npsStored > 0;

  const basicPercent = hasBasic
    ? round1((basicStored / ctc) * 100)
    : hasNps
      ? DEFAULT_BASIC_PERCENT_OF_CTC
      : 0;

  const basisBasic = hasBasic
    ? basicStored
    : basicAnnualFromPercent(ctc, DEFAULT_BASIC_PERCENT_OF_CTC);

  const employerNpsPercent = hasNps && basisBasic > 0 ? round1((npsStored / basisBasic) * 100) : 0;

  return { basicPercent, employerNpsPercent };
}
