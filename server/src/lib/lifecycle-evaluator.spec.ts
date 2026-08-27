import { describe, it, expect } from "vitest";
import {
  evaluateLifecycle,
  financialYearOf,
  ADR_0006_FRAME_CHANGE_AT,
  ADR_0006_FRAME_CHANGE_FY,
  type LifecycleSignals,
} from "./lifecycle-evaluator";

/**
 * Pure lifecycle evaluator — maps a user's derived FIRE signals to the UTILITY
 * nudges (milestone / off-track / annual_review) with their per-period/threshold
 * dedupe keys. No DB, no clock read (now is passed in) → deterministic.
 */

const NOW = new Date("2026-06-02T00:00:00.000Z"); // FY 2026-27 — the ADR-0006 frame-change FY
/**
 * A clock in the FY AFTER the ADR-0006 frame change, for the off-track cases. The off-track nudge
 * is deliberately suppressed for the frame-change FY (see the evaluator's ADR-0006 block), so the
 * "does it fire?" cases have to be asserted from a normal year — otherwise they would be testing
 * the suppression instead of the rule. Nothing about the rule itself changed.
 */
const NEXT_FY_NOW = new Date("2027-06-02T00:00:00.000Z"); // FY 2027-28

function signals(over: Partial<LifecycleSignals> = {}): LifecycleSignals {
  return {
    progressPercent: 10,
    fireWithdrawableCorpus: 1_500_000,
    anchorAge: 35,
    targetRetirementAge: 50,
    yearsToRegular: 14, // on track (35 + 14 = 49 < 50)
    savingsRate: 30,
    ...over,
  };
}

describe("financialYearOf", () => {
  it("maps Apr–Mar to the Indian FY string", () => {
    expect(financialYearOf(new Date("2026-06-02"))).toBe("2026-27");
    expect(financialYearOf(new Date("2026-03-31"))).toBe("2025-26");
    expect(financialYearOf(new Date("2026-04-01"))).toBe("2026-27");
  });
});

describe("evaluateLifecycle", () => {
  it("always emits annual_review deduped by FY", () => {
    const out = evaluateLifecycle({ signals: signals(), now: NOW });
    const ann = out.find((n) => n.key === "annual_review");
    expect(ann).toBeDefined();
    expect(ann!.dedupeKey).toBe("annual_review:2026-27");
    expect(ann!.values).toEqual([]); // firstName prepended by the runner
  });

  it("does NOT emit milestone below the first band (25%)", () => {
    const out = evaluateLifecycle({ signals: signals({ progressPercent: 10 }), now: NOW });
    expect(out.find((n) => n.key === "milestone")).toBeUndefined();
  });

  it("emits the HIGHEST crossed milestone band with corpus + percent", () => {
    const out = evaluateLifecycle({
      signals: signals({ progressPercent: 62, fireWithdrawableCorpus: 12_500_000 }),
      now: NOW,
    });
    const m = out.find((n) => n.key === "milestone");
    expect(m).toBeDefined();
    expect(m!.dedupeKey).toBe("milestone:50"); // 62 → highest crossed band is 50
    expect(m!.values).toEqual(["₹1.25Cr", "62%"]);
  });

  it("treats 100% as the top milestone band", () => {
    const out = evaluateLifecycle({ signals: signals({ progressPercent: 100 }), now: NOW });
    expect(out.find((n) => n.key === "milestone")!.dedupeKey).toBe("milestone:100");
  });

  it("emits offtrack when projected FIRE age exceeds the target, deduped per FY", () => {
    const out = evaluateLifecycle({
      signals: signals({ anchorAge: 40, targetRetirementAge: 50, yearsToRegular: 18, savingsRate: 12 }),
      now: NEXT_FY_NOW,
    });
    const o = out.find((n) => n.key === "offtrack");
    expect(o).toBeDefined();
    // Deduped per FY (at most one off-track/year), not per drifting projected year.
    expect(o!.dedupeKey).toBe("offtrack:2027-28");
    // The projected FIRE year (2027 + ceil(18) = 2045) is still shown in the copy.
    expect(o!.values[0]).toBe("2045");
    expect(o!.values[1]).toMatch(/savings/i); // low savings rate → savings-driver copy
  });

  it("does NOT emit offtrack when on track or yearsToRegular is non-finite", () => {
    expect(
      evaluateLifecycle({ signals: signals({ yearsToRegular: 5 }), now: NEXT_FY_NOW }).find(
        (n) => n.key === "offtrack",
      ),
    ).toBeUndefined();
    expect(
      evaluateLifecycle({ signals: signals({ yearsToRegular: Infinity }), now: NEXT_FY_NOW }).find(
        (n) => n.key === "offtrack",
      ),
    ).toBeUndefined();
  });
});

/**
 * ADR-0006 — the frame change moves every user's projected FIRE age later by construction. The
 * off-track template blames "a low savings rate" or "rising expenses"; in the FY the change landed
 * in, both attributions are false for the users it would newly fire on. A false explanation sent to
 * every consenting user is worse than silence, so off-track sits out that FY. Nothing is lost: the
 * dedupe key was already per-FY, so a genuinely off-track user hears it next FY with a true reason.
 */
describe("ADR-0006 frame-change suppression", () => {
  const offtrackSignals = signals({
    anchorAge: 40,
    targetRetirementAge: 50,
    yearsToRegular: 18,
    savingsRate: 12,
  });

  it("suppresses off-track for the whole FY the frame change landed in", () => {
    // Both ends of the FY, not just the change date itself — a daily runner hits every day of it.
    for (const now of [
      new Date("2026-04-01T00:00:00.000Z"),
      ADR_0006_FRAME_CHANGE_AT,
      new Date("2027-03-31T23:59:59.000Z"),
    ]) {
      expect(financialYearOf(now)).toBe(ADR_0006_FRAME_CHANGE_FY);
      const out = evaluateLifecycle({ signals: offtrackSignals, now });
      expect(
        out.find((n) => n.key === "offtrack"),
        `off-track must not fire on ${now.toISOString()} (frame-change FY)`,
      ).toBeUndefined();
    }
  });

  it("resumes the FY after — the suppression is scoped, not a silent removal", () => {
    const out = evaluateLifecycle({ signals: offtrackSignals, now: NEXT_FY_NOW });
    expect(out.find((n) => n.key === "offtrack")).toBeDefined();
  });

  it("suppresses ONLY off-track — milestone and annual_review are unaffected", () => {
    // milestone keys on progressPercent = corpus / fireNumber, and fireNumber is a today's-rupee
    // figure ADR-0006 left byte-identical, so no band is newly crossed and there is no wave to
    // suppress. annual_review is a calendar prompt with no FIRE signal in it at all.
    const out = evaluateLifecycle({
      signals: { ...offtrackSignals, progressPercent: 55 },
      now: ADR_0006_FRAME_CHANGE_AT,
    });
    expect(out.find((n) => n.key === "milestone")!.dedupeKey).toBe("milestone:50");
    expect(out.find((n) => n.key === "annual_review")).toBeDefined();
    expect(out.find((n) => n.key === "offtrack")).toBeUndefined();
  });
});
