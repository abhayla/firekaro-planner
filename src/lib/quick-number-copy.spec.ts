import { describe, it, expect } from "vitest";
import {
  QUICK_CARDS,
  TOTAL_QUESTION_KEYS,
  whySoBigBullets,
  howWeGotThis,
  assumptionsLine,
  FULL_PLANNER_ADDS,
  PLAN_HONESTY_LINE,
  type ExplainerInput,
} from "./quick-number-copy";

const explainer: ExplainerInput = {
  annualExpensesToday: 21_60_000,
  swrUsed: 0.037,
  targetAge: 50,
  planToAge: 90,
  plannedGoalsLumpToday: 3_25_00_000,
  currentCorpus: 1_50_00_000,
  monthlyContributionReal: 1_75_000,
  expectedReturn: 0.12,
  inflation: 0.06,
  yearsToTarget: 12,
  haveAtTargetReal: 6_10_00_000,
  needReal: 9_09_00_000,
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

  it("how-we-got-this is four steps carrying the LIVE derive() numbers", () => {
    const steps = howWeGotThis(explainer);
    expect(steps).toHaveLength(4);
    // Step 1: annual spend, the horizon SWR and the resulting base corpus.
    expect(steps[0]).toContain("₹21.60 L");
    expect(steps[0]).toContain("3.70%");
    expect(steps[0]).toContain("40 years");
    // Step 2: the planned-goals lump (T-376: every planned goal counts).
    expect(steps[1]).toContain("₹3.25 Cr");
    // Step 3: corpus + monthly, growth, and inflation removed.
    expect(steps[2]).toContain("12.0%");
    expect(steps[2]).toContain("6%");
    expect(steps[2]).toContain("₹6.10 Cr");
    // Step 4: the same number in future rupees, shown once.
    expect(steps[3]).toContain("₹18.29 Cr");
    expect(steps[3]).toContain("2038");
  });

  it("the assumptions line names the horizon the SWR was chosen for", () => {
    const line = assumptionsLine(explainer);
    expect(line).toContain("6.0% inflation");
    expect(line).toContain("12.0% return");
    expect(line).toContain("3.70% safe withdrawal");
    expect(line).toContain("40-yr drawdown");
    expect(line).toContain("live to 90");
  });

  it("keeps the honesty framing and the full-planner list", () => {
    expect(PLAN_HONESTY_LINE.toLowerCase()).toContain("arithmetic");
    expect(FULL_PLANNER_ADDS.length).toBeGreaterThanOrEqual(4);
  });
});
