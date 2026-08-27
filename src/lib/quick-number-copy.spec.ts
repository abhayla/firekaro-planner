import { describe, it, expect } from "vitest";
import {
  QUICK_CARDS,
  TOTAL_QUESTION_KEYS,
  whySoBigBullets,
  howWeGotThis,
  assumptionsLine,
  FULL_PLANNER_ADDS,
  PLAN_HONESTY_LINE,
  QUICK_PORTFOLIO_CAVEAT,
  sanityLine,
  type ExplainerInput,
} from "./quick-number-copy";
import { formatINRCompact } from "@/lib/formatters";

// The fixture is INTERNALLY CONSISTENT on purpose: base + goals layer + reservation == needReal,
// and base == annualExpensesToday / swrUsed. An earlier fixture was off by 19% and the reconcile
// test still passed, because that test compared a sum to itself (blind verification finding 1).
const BASE_CORPUS = 5_83_78_378; // 21.6 L / 3.7%
const GOALS_CORPUS = 3_78_00_000;
const HEALTHCARE = 1_16_00_000;

const explainer: ExplainerInput = {
  annualExpensesToday: 21_60_000,
  swrUsed: 0.037,
  targetAge: 50,
  planToAge: 90,
  plannedGoalsLumpToday: 3_25_00_000,
  plannedGoalsCorpus: GOALS_CORPUS,
  healthcareReservation: HEALTHCARE,
  baseCorpus: BASE_CORPUS,
  currentCorpus: 1_50_00_000,
  monthlyContributionReal: 1_75_000,
  expectedReturn: 0.12,
  inflation: 0.06,
  yearsToTarget: 12,
  haveAtTargetReal: 6_10_00_000,
  needReal: BASE_CORPUS + GOALS_CORPUS + HEALTHCARE,
  needNominal: 18_29_00_000,
  targetYear: 2038,
  guess: 10_00_00_000,
};

describe("quick-number copy — the ten cards", () => {
  it("has exactly the ten Option-C cards in order", () => {
    expect(QUICK_CARDS).toHaveLength(10);
    expect(QUICK_CARDS.map((c) => c.key)).toEqual([
      "guess",
      "you",
      "spend",
      "corpus",
      "sip",
      "spouse",
      "kids",
      "goals",
      "house",
      "loan",
    ]);
  });

  it("every card carries a question and a hint", () => {
    for (const c of QUICK_CARDS) {
      expect(c.question.length, c.key).toBeGreaterThan(3);
      expect(c.hint.length, c.key).toBeGreaterThan(10);
    }
  });

  // The 2026-08-27 lesson: Abhay left his stocks out because the copy read as an exclusive list.
  // Every "total" question must say ALL first, name stocks, and state the ONE exclusion.
  it("every total question says ALL, names stocks and states the single exclusion", () => {
    for (const key of TOTAL_QUESTION_KEYS) {
      const card = QUICK_CARDS.find((c) => c.key === key);
      expect(card, key).toBeTruthy();
      const text = `${card!.question} ${card!.hint}`;
      expect(text, `${key}: must say ALL`).toMatch(/\bALL\b/);
      expect(text.toLowerCase(), `${key}: must name stocks`).toContain("stock");
    }
    const corpus = QUICK_CARDS.find((c) => c.key === "corpus")!;
    expect(`${corpus.question} ${corpus.hint}`.toLowerCase()).toContain(
      "leave out only the home you live in",
    );
  });

  it("the spend card states the EMI carve-out so the EMI is never double-counted", () => {
    const spend = QUICK_CARDS.find((c) => c.key === "spend")!;
    expect(`${spend.question} ${spend.hint}`.toLowerCase()).toContain("emi");
  });

  // T-378C finding F1: the worked example used to say "Say 2.8" for an all-in figure that already
  // includes the EMI — directly contradicting the EMI-exclusion clause one sentence earlier and
  // inflating a real user's number by the EMI's SWR-multiplied share (~₹3.69 Cr for a ₹1L EMI).
  // The example MUST quote the EMI-EXCLUDED figure, never the all-in one, as its "say N" answer.
  it("the spend card's worked example names the EMI-excluded figure, not the all-in one", () => {
    const spend = QUICK_CARDS.find((c) => c.key === "spend")!;
    const hint = spend.hint;
    const sayMatch = hint.match(/say ([\d.]+)/i);
    expect(sayMatch, "hint must contain a worked 'say N' example").toBeTruthy();
    const said = Number(sayMatch![1]);
    const allInMatch = hint.match(/₹([\d.]+)\s*L a month/i);
    expect(allInMatch, "hint must name the all-in figure it is excluding the EMI from").toBeTruthy();
    const allIn = Number(allInMatch![1]);
    const emiMatch = hint.match(/EMI is ₹([\d.]+)\s*L/i);
    expect(emiMatch, "hint must name the EMI it is excluding").toBeTruthy();
    const emi = Number(emiMatch![1]);
    // The "say" figure must equal all-in minus EMI, never the all-in figure itself.
    expect(said).toBeCloseTo(allIn - emi, 5);
    expect(said).not.toBeCloseTo(allIn, 5);
  });
});

describe("quick-number copy — QN-4 explainers", () => {
  it("why-so-big has the six Option-C bullets incl. broken compounding and the survey line", () => {
    const bullets = whySoBigBullets(explainer);
    expect(bullets).toHaveLength(6);
    const all = bullets.join(" ").toLowerCase();
    expect(all).toContain("40 years");
    expect(all).toContain("lifestyle");
    expect(all).toContain("healthcare");
    expect(all).toContain("tax");
    expect(all).toContain("restarts the clock");
    expect(all).toContain("4–6×");
  });

  it("echoes the user's own guess in the survey bullet when one was given", () => {
    expect(whySoBigBullets(explainer)[5]).toContain("₹10.00 Cr");
    // No guess → no fabricated echo (rule 31: never invent the user's answer).
    const noGuess = whySoBigBullets({ ...explainer, guess: undefined })[5];
    expect(noGuess).not.toContain("Your gut said");
  });

  it("how-we-got-this is five steps carrying the LIVE derive() numbers", () => {
    const steps = howWeGotThis(explainer);
    expect(steps).toHaveLength(5);
    // Step 1: annual spend, the horizon SWR and the resulting base corpus.
    expect(steps[0]).toContain("₹21.60 L");
    expect(steps[0]).toContain("3.70%");
    expect(steps[0]).toContain("40 years");
    // Step 2: the planned-goals lump (T-376: every planned goal counts) AND what it adds.
    expect(steps[1]).toContain("₹3.25 Cr");
    expect(steps[1]).toContain("₹3.78 Cr");
    // Step 3: the medical reservation — without it the steps do not add up to the headline.
    expect(steps[2]).toContain("₹1.16 Cr");
    // Step 4: corpus + monthly, growth, and inflation removed.
    expect(steps[3]).toContain("12.0%");
    expect(steps[3]).toContain("6%");
    expect(steps[3]).toContain("₹6.10 Cr");
    // Step 5: the same number in future rupees, shown once.
    expect(steps[4]).toContain("₹18.29 Cr");
    expect(steps[4]).toContain("2038");
  });

  it("the assumptions line names the horizon the SWR was chosen for", () => {
    const line = assumptionsLine(explainer);
    expect(line).toContain("6.0% inflation");
    expect(line).toContain("12.0% return");
    expect(line).toContain("3.70% safe withdrawal");
    expect(line).toContain("40-yr drawdown");
    expect(line).toContain("live to 90");
  });

  it("the five steps reconcile to the headline they explain", () => {
    // The real assertion: the three components the steps name must ADD UP to `needReal` — the very
    // figure the hero prints beside them. Anything else is shape, not substance.
    const sum =
      explainer.baseCorpus + explainer.plannedGoalsCorpus + explainer.healthcareReservation;
    expect(sum).toBeCloseTo(explainer.needReal, 0);

    // And the rendered strings must quote those same components, not re-derive them.
    const steps = howWeGotThis(explainer);
    expect(steps[0]).toContain(formatINRCompact(explainer.baseCorpus));
    expect(steps[1]).toContain(formatINRCompact(explainer.plannedGoalsCorpus));
    expect(steps[2]).toContain(formatINRCompact(explainer.healthcareReservation));
  });

  it("quotes the kernel's base corpus rather than re-dividing the expenses", () => {
    // An NPS-holding household capitalises expenses NET of the annuity income, so the base is
    // SMALLER than annualExpenses / SWR. Re-deriving it here would over-sum the steps.
    const withNps: ExplainerInput = { ...explainer, baseCorpus: BASE_CORPUS - 50_00_000 };
    expect(howWeGotThis(withNps)[0]).toContain(formatINRCompact(BASE_CORPUS - 50_00_000));
    expect(howWeGotThis(withNps)[0]).not.toContain(formatINRCompact(BASE_CORPUS));
  });

  it("names the single-equity-line simplification rather than hiding it", () => {
    expect(QUICK_PORTFOLIO_CAVEAT).toContain("EPF");
    expect(QUICK_PORTFOLIO_CAVEAT.toLowerCase()).toContain("optimistic");
  });

  it("the sanity line counts the EMI and names the unaccounted rupee", () => {
    const impossible = sanityLine(2_80_000, 1_75_000, 5_00_000, 1_00_000);
    expect(impossible).toContain("more than your");
    const ok = sanityLine(1_80_000, 1_75_000, 5_00_000, 1_00_000);
    expect(ok).toContain("₹45.0K");
    expect(ok).toContain("count it as spending");
    expect(sanityLine(1_80_000, 1_75_000, 0, 1_00_000)).toBe("");
  });

  it("keeps the honesty framing and the full-planner list", () => {
    expect(PLAN_HONESTY_LINE.toLowerCase()).toContain("arithmetic");
    expect(FULL_PLANNER_ADDS.length).toBeGreaterThanOrEqual(4);
  });
});
