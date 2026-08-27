/**
 * T-378 (QN-1 + QN-4) — every word the `/quick` express path says, in ONE testable place.
 *
 * Design SSOT: `docs/design/2026-08-27-quick-number-gap-hero/option-c-merged.html` (copy is
 * transcribed from the mockup verbatim except where the product's real behaviour differs — the
 * spend card's EMI carve-out and the spouse-age assumption, both called out below).
 *
 * WHY A MODULE AND NOT TEMPLATE STRINGS: the 2026-08-27 lesson (COVERAGE-MATRIX A5/A13) is that a
 * "total" question written as a list reads as EXCLUSIVE — Abhay left his own stocks out of the
 * number. `quick-number-copy.spec.ts` asserts that every total question says ALL, names stocks, and
 * states the single exclusion. Copy that can regress silently is a correctness bug, not styling.
 *
 * The QN-4 explainer builders take LIVE `derive()` numbers as input and never re-compute anything
 * (contract section 5: numbers in the copy come from derive()/QN-2 outputs).
 */
import { formatINRCompact } from "@/lib/formatters";

export type QuickCardKey =
  | "guess"
  | "you"
  | "spend"
  | "corpus"
  | "sip"
  | "spouse"
  | "kids"
  | "goals"
  | "house"
  | "loan";

export interface QuickCardCopy {
  key: QuickCardKey;
  question: string;
  hint: string;
}

/** The ten cards of Option C — same order, same copy. */
export const QUICK_CARDS: readonly QuickCardCopy[] = [
  {
    key: "guess",
    question: "Gut feel first: how much do you think you need to retire?",
    hint: "No maths yet — just your instinct. We'll compare it with the real number at the end.",
  },
  {
    key: "you",
    question: "How old are you, and when would you like to stop working?",
    hint: "We plan from today to age 90 — 40 years of spending, not 15. A guess is fine; you'll drag the age later.",
  },
  {
    key: "spend",
    question: "What does your household spend in a month?",
    hint:
      "Everything except your home-loan EMI — groceries, school fees, help, travel, fun, and a monthly share of " +
      "the lumpy ones people forget: insurance premiums, annual fees, festivals. " +
      "If you have a loan we add its EMI from the last card, so leaving it out here keeps it from being counted twice. " +
      "Around ₹2.5–3 L a month? Say 2.8.",
  },
  {
    key: "corpus",
    question: "Total of ALL your investments today?",
    hint:
      "Add everything up: mutual funds, stocks, ETFs, EPF, NPS, PPF, FDs, gold, bonds, crypto, " +
      "plots and any flat you don't live in. Leave out only the home you live in.",
  },
  {
    key: "sip",
    question: "How much of ALL your money goes into investments every month?",
    hint:
      "All of it: SIPs, stock and ETF buys, your PF plus employer PF, NPS, PPF, RDs — whatever you add every month. " +
      "This is the number we plan on, not the gap between your income and your spending.",
  },
  {
    key: "spouse",
    question: "Spouse's investments, if any?",
    hint:
      "ALL of theirs too — mutual funds, stocks, PF, NPS, gold, everything. Untick if not applicable. " +
      "We'll assume they're your age; change it in the full planner.",
  },
  {
    key: "kids",
    question: "Kids?",
    hint:
      "How many, and roughly how old? We date their education (at 18) and weddings (at 30) from this, and " +
      "count every goal in today's money.",
  },
  {
    key: "goals",
    question: "Their big costs, in today's money?",
    hint: "Undergrad for all kids (abroad? ₹75 L+ combined), post-grad if likely, and weddings.",
  },
  {
    key: "house",
    question: "Any big purchase coming — bigger home, car?",
    hint: "Net of what you'd sell. Most tools forget this; it moves your date.",
  },
  {
    key: "loan",
    question: "Home loan?",
    hint:
      "EMI, interest rate and years left. We add the EMI to your monthly spending. Today we keep it there " +
      "for the whole plan rather than dropping it the year the loan ends — deliberately cautious, so your " +
      "number can only be too big, never too small.",
  },
] as const;

/** The cards that ask for a TOTAL — the ones the ALL/stocks/one-exclusion copy rule governs. */
export const TOTAL_QUESTION_KEYS: readonly QuickCardKey[] = ["corpus", "sip", "spouse"];

/**
 * Card 3's live sanity line — the video's "Rs4.55 L of your Rs5 L, sound right?" moment (A15).
 *
 * The EMI is an ARGUMENT, not an afterthought: card 3 deliberately asks for spending WITHOUT the
 * home-loan EMI, so a check that adds only spend + investing is blind to a household's single
 * largest outflow and would happily bless Rs5.55 L of outgoings against a Rs5 L take-home.
 */
export function sanityLine(
  spendMonthly: number,
  sipMonthly: number,
  incomeMonthly: number,
  emiMonthly = 0,
): string {
  if (!incomeMonthly || incomeMonthly <= 0) return "";
  const out = spendMonthly + sipMonthly + emiMonthly;
  const share = Math.round((out / incomeMonthly) * 100);
  if (share > 105) {
    return `Spending${emiMonthly > 0 ? " plus the EMI" : ""} plus investing = ${formatINRCompact(
      out,
    )} — more than your ${formatINRCompact(
      incomeMonthly,
    )} take-home. One of these is off; worth a check before moving on.`;
  }
  const leak = incomeMonthly - out;
  const leakNote =
    leak > 0
      ? ` The other ${formatINRCompact(
          leak,
        )} is going somewhere too — we count it as spending, so your number isn't flattered.`
      : "";
  return `Spending${emiMonthly > 0 ? " plus the EMI" : ""} plus investing = ${formatINRCompact(
    out,
  )} of your ${formatINRCompact(incomeMonthly)} take-home (${share}%).${leakNote}`;
}

/** The "So far…" strip that appears once there is enough to say something honest. */
export const SO_FAR_PLACEHOLDER = "Answer a few more and your number appears here.";

/** Everything QN-4's explainers need. Every field is a LIVE derive()/solver output. */
export interface ExplainerInput {
  annualExpensesToday: number;
  swrUsed: number;
  targetAge: number;
  planToAge: number;
  plannedGoalsLumpToday: number;
  /** What the goals layer actually ADDS to the number (goals + the extended-family contingency). */
  plannedGoalsCorpus: number;
  /**
   * The base corpus, taken from the kernel rather than re-divided here. `annualExpensesToday /
   * swrUsed` looked equivalent but is not: the kernel capitalises expenses NET of post-tax NPS
   * annuity income, so re-dividing over-sums the steps for anyone holding NPS.
   */
  baseCorpus: number;
  /** The 20% medical-shock reservation the kernel adds on top of the base corpus. */
  healthcareReservation: number;
  currentCorpus: number;
  monthlyContributionReal: number;
  expectedReturn: number;
  inflation: number;
  yearsToTarget: number;
  haveAtTargetReal: number;
  needReal: number;
  needNominal: number;
  targetYear: number;
  guess?: number;
}

const pct = (v: number, dp = 1) => `${(v * 100).toFixed(dp)}%`;

/** B5 + A17 — the six "why is the number so big?" bullets, from Option C. */
export function whySoBigBullets(input: ExplainerInput): string[] {
  const drawdown = Math.max(0, Math.round(input.planToAge - input.targetAge));
  const guessEcho =
    input.guess && Number.isFinite(input.guess) && input.guess > 0
      ? ` Your gut said ${formatINRCompact(input.guess)}.`
      : "";
  return [
    `You'll live off it for about ${drawdown} years, not 15. Retire at ${input.targetAge}, plan to ${input.planToAge}.`,
    "Lifestyle creep. You came to the city by train; you won't go back by train. The Seltos doesn't become an Alto at 50.",
    "Healthcare and help cost more with age — and rise faster than everything else, so we set aside an extra " +
      "20% of the corpus purely for medical shocks.",
    "Taxes don't retire. Withdrawals get taxed, so we hold the safe withdrawal rate well below the American 4% " +
      "to leave room for it.",
    "Every withdrawal restarts the clock. Pulling money out for a wedding or a house every few years quietly kills the compounding you were counting on.",
    `Every generation under-estimates by 4–6×. In 2006, people spending ₹30,000 a month said "₹1 Cr is enough"; the honest number was ₹4–6 Cr.${guessEcho}`,
  ];
}

/**
 * B1–B3 — "how we got this", carrying the live numbers.
 *
 * The steps MUST add up to the headline. An earlier draft showed only base + goals and left the
 * medical reservation and the extended-family contingency out — 17% of the number unexplained,
 * which is worse than not explaining at all: a user who adds up the steps gets a different figure
 * from the hero sitting beside them.
 */
export function howWeGotThis(input: ExplainerInput): string[] {
  const drawdown = Math.max(0, Math.round(input.planToAge - input.targetAge));
  return [
    `You spend ${formatINRCompact(input.annualExpensesToday)} a year today. To draw that safely for ${drawdown} years — age ${input.targetAge} to ${input.planToAge} — we keep withdrawals at ${pct(
      input.swrUsed,
      2,
    )} of the corpus, which needs ${formatINRCompact(input.baseCorpus)}.`,
    `Plus your one-off goals in today's money — education, post-grad, weddings, any big purchase — ${formatINRCompact(
      input.plannedGoalsLumpToday,
    )}. With the buffer we keep for extended family, that layer adds ${formatINRCompact(
      input.plannedGoalsCorpus,
    )}. Every planned purchase counts, not just the ones we label.`,
    `Plus ${formatINRCompact(
      input.healthcareReservation,
    )} reserved purely for medical shocks — 20% of the base, because health is the one cost that reliably outruns everything else.`,
    `Your ${formatINRCompact(input.currentCorpus)} plus ${formatINRCompact(
      input.monthlyContributionReal,
    )} a month grow at ${pct(input.expectedReturn)} for ${input.yearsToTarget} years; then we remove ${pct(
      input.inflation,
      0,
    )} inflation so you compare like with like — ${formatINRCompact(input.haveAtTargetReal)}.`,
    `The scary number others quote (${formatINRCompact(
      input.needNominal,
    )}) is the same thing in ${input.targetYear} rupees. We show both and plan in today's.`,
  ];
}

/** The assumptions strip — names the horizon the SWR was chosen for (B2). */
export function assumptionsLine(input: ExplainerInput): string {
  const drawdown = Math.max(0, Math.round(input.planToAge - input.targetAge));
  return `${pct(input.inflation)} inflation · ${pct(input.expectedReturn)} return · ${pct(
    input.swrUsed,
    2,
  )} safe withdrawal (for a ${drawdown}-yr drawdown) · live to ${input.planToAge}. Honest defaults, not sales defaults — every one is editable in the full planner.`;
}

/** C7 — the honesty framing under the plan summary. */
export const PLAN_HONESTY_LINE =
  "This part is arithmetic — it can't go wrong. What can go wrong is whether the monthly amount actually happens. " +
  "Returns may be 10% one decade and 14% the next; the moves you pick are what you control.";

/**
 * The one simplification the express path cannot hide: card 4 asks for EVERY holding, and we book
 * the total as a single equity line. A real salaried portfolio has EPF/PPF/FD money compounding at
 * 7–8%, not 12% — so a corpus that is part debt grows slower than this screen shows.
 */
export const QUICK_PORTFOLIO_CAVEAT =
  "One simplification you should know about: we booked your whole corpus as one equity holding at " +
  "12%. If a chunk of it sits in EPF, PPF, NPS or FDs — which grow at 7–8% — your real blend is " +
  "lower and this projection is optimistic. Split it in the full planner and the number gets honest.";

/** D1/D3–D6 — what the express path deliberately leaves to the full planner. */
export const FULL_PLANNER_ADDS: readonly string[] = [
  "Your actual funds: how many you hold (20 funds is close to owning the whole index; 5–10 is enough) and direct vs regular per fund",
  "Large / mid / small / gold mix against a target like 60/15/10/5, and a nudge when any slice drifts 5 points",
  "Your return vs the index — are you actually getting the 12% we assumed?",
  "Insurance gaps, tax regime, EPF and NPS rules, and the locked-vs-liquid check for retiring early",
];
