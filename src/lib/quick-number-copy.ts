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
      "Everything except your home-loan EMI — school fees, travel, help, groceries, fun. " +
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
    hint: "How many, and roughly how old? We time their education (at 18) and weddings (at 30) from this.",
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
    hint: "EMI, interest rate and years left. We add the EMI to your monthly spending until the loan ends.",
  },
] as const;

/** The cards that ask for a TOTAL — the ones the ALL/stocks/one-exclusion copy rule governs. */
export const TOTAL_QUESTION_KEYS: readonly QuickCardKey[] = ["corpus", "sip", "spouse"];

/** Card 3's live sanity line — the video's "4.55 L of your 5 L, sound right?" moment (A15). */
export function sanityLine(
  spendMonthly: number,
  sipMonthly: number,
  incomeMonthly: number,
): string {
  if (!incomeMonthly || incomeMonthly <= 0) return "";
  const out = spendMonthly + sipMonthly;
  const share = Math.round((out / incomeMonthly) * 100);
  if (share > 105) {
    return `Spending plus investing = ${formatINRCompact(out)} — more than your ${formatINRCompact(
      incomeMonthly,
    )} take-home. One of the three is off; worth a check before moving on.`;
  }
  return `Spending plus investing = ${formatINRCompact(out)} of your ${formatINRCompact(
    incomeMonthly,
  )} take-home (${share}%). Sounds right?`;
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
    "Healthcare and help cost more with age — and rise faster than everything else (we use 14%, not 6%).",
    "Taxes don't retire. Withdrawals are taxed; we plan post-tax.",
    "Every withdrawal restarts the clock. Pulling money out for a wedding or a house every few years quietly kills the compounding you were counting on.",
    `Every generation under-estimates by 4–6×. In 2006, people spending ₹30,000 a month said "₹1 Cr is enough"; the honest number was about ₹6 Cr.${guessEcho}`,
  ];
}

/** B1–B3 — the four-step "how we got this", carrying the live numbers. */
export function howWeGotThis(input: ExplainerInput): string[] {
  const drawdown = Math.max(0, Math.round(input.planToAge - input.targetAge));
  const baseCorpus = input.swrUsed > 0 ? input.annualExpensesToday / input.swrUsed : 0;
  return [
    `You spend ${formatINRCompact(input.annualExpensesToday)} a year today. To draw that safely for ${drawdown} years — age ${input.targetAge} to ${input.planToAge} — we keep withdrawals at ${pct(
      input.swrUsed,
      2,
    )} of the corpus, which needs ${formatINRCompact(baseCorpus)}.`,
    `Plus your one-off goals in today's money — education, post-grad, weddings, any big purchase — ${formatINRCompact(
      input.plannedGoalsLumpToday,
    )}. Every planned purchase counts, not just the ones we label.`,
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

/** D1/D3–D6 — what the express path deliberately leaves to the full planner. */
export const FULL_PLANNER_ADDS: readonly string[] = [
  "Your actual funds: how many you hold (20 funds is close to owning the whole index; 5–10 is enough) and direct vs regular per fund",
  "Large / mid / small / gold mix against a target like 60/15/10/5, and a nudge when any slice drifts 5 points",
  "Your return vs the index — are you actually getting the 12% we assumed?",
  "Insurance gaps, tax regime, EPF and NPS rules, and the locked-vs-liquid check for retiring early",
];
