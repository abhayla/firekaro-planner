import { z } from "zod";

/**
 * T-378 (QN-1) — the ten answers of the `/quick` express path.
 *
 * Design SSOT: `docs/design/2026-08-27-quick-number-gap-hero/option-c-merged.html` (the ten cards,
 * in order). Every field after age / target age / spend is OPTIONAL — "rough is fine" is the whole
 * premise of the express path, and a half-answered card must never block the number.
 *
 * Money is stored in RUPEES here; the cards collect it in lakh and convert on the way in.
 */
export const quickAnswersSchema = z.object({
  /** Card 1 — the user's own gut-feel FIRE number (₹). Compared with the math in the hero. */
  guess: z.number().min(0).optional(),

  /** Card 2 — required. */
  age: z.number().int().min(18).max(80),
  targetAge: z.number().int().min(40).max(75),

  /** Card 3 — required. Monthly household spend EXCLUDING the home-loan EMI (card 10 adds it). */
  spend: z.number().min(0),
  /** Card 3 — monthly household take-home. Sanity check only; the plan is anchored on `sip`. */
  income: z.number().min(0).optional(),

  /** Card 4 — every investment except the home they live in (₹). */
  corpus: z.number().min(0).optional(),
  /** Card 4 — true ONLY when the user says their mutual funds are direct plans (gates the QN-5 TER lever). */
  directPlans: z.boolean().nullable().optional(),

  /** Card 5 — everything invested every month, PF included (₹/month). */
  sip: z.number().min(0).optional(),

  /** Card 6 — the spouse's investments. */
  includeSpouse: z.boolean().optional(),
  spouseCorpus: z.number().min(0).optional(),

  /** Card 7 — kids. One age for all of them keeps the express path to ten cards. */
  kids: z.number().int().min(0).max(6).optional(),
  kidsAge: z.number().int().min(0).max(30).optional(),

  /** Card 8 — the kids' big costs, in TODAY's rupees, combined across all kids. */
  education: z.number().min(0).optional(),
  postgrad: z.number().min(0).optional(),
  wedding: z.number().min(0).optional(),

  /** Card 9 — a big purchase (bigger home / car), net of what they'd sell. */
  includeHouse: z.boolean().optional(),
  house: z.number().min(0).optional(),
  /** Years from today until the purchase. Defaults to 6 (the video's "5–8 years"). */
  houseInYears: z.number().int().min(0).max(40).optional(),

  /** Card 10 — the home loan. `loanRate` is a FRACTION (0.072), not a percent. */
  hasLoan: z.boolean().optional(),
  emi: z.number().min(0).optional(),
  loanRate: z.number().min(0).max(0.5).optional(),
  loanYearsLeft: z.number().int().min(0).max(40).optional(),
});

export type QuickAnswers = z.infer<typeof quickAnswersSchema>;

/**
 * The starting state of the ten cards. Deliberately EMPTY of money — pre-filling amounts would
 * anchor the user on our guess and quietly become "their" answer (the honesty mandate). Only the
 * structural defaults (a target age, "no loan", "no big purchase") are set.
 */
export function emptyQuickAnswers(currentAge = 35): QuickAnswers {
  return {
    age: currentAge,
    targetAge: 50,
    spend: 0,
    income: 0,
    corpus: 0,
    directPlans: null,
    sip: 0,
    includeSpouse: false,
    spouseCorpus: 0,
    kids: 0,
    kidsAge: 0,
    education: 0,
    postgrad: 0,
    wedding: 0,
    includeHouse: false,
    house: 0,
    houseInYears: 6,
    hasLoan: false,
    emi: 0,
    loanRate: 0.085,
    loanYearsLeft: 10,
  };
}
