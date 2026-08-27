/**
 * ADR-0006 / glossary A1.4 — the assumptions disclosure on /preferences.
 *
 * `healthcareInflation`, `inflationWeights` and `householdSavingsStepUpPercent` became
 * headline-moving knobs with this ADR: the first two set the rate the FIRE target grows at, the
 * third sets how fast the money chasing it grows. A user who cannot see WHY those defaults are what
 * they are cannot meaningfully disagree with them — and "we changed your number, here is a field"
 * is not disclosure. These locks pin that the reasoning is on the page, not only in the ADR.
 *
 * Source-scan (this repo's node test env has no DOM and the contract bans new deps); the rendered
 * result is verified in-browser per rules 24/32.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = readFileSync(fileURLToPath(new URL("./Preferences.vue", import.meta.url)), "utf8");
const template = src.slice(src.indexOf("<template>"));

describe("Preferences — ADR-0006 inflation disclosure", () => {
  it("shows the four buckets at their re-grounded defaults", () => {
    expect(template).toMatch(/general CPI <strong>6%<\/strong>/);
    expect(template).toMatch(/healthcare <strong>9%<\/strong>/);
    expect(template).toMatch(/education <strong>9%<\/strong>/);
    expect(template).toMatch(/housing <strong>6%<\/strong>/);
  });

  it("explains 9% healthcare — and why the 13-14% figure is NOT this rate", () => {
    expect(template).toMatch(/Why 9% healthcare/);
    expect(template, "CPI-Health is the ground truth").toMatch(/CPI-Health/);
    expect(template, "the private-tariff / retiree-mix excess must be named").toMatch(
      /private-hospital tariffs/,
    );
    // The specific correction: 13-14% is an insurer claims trend and lands on the PREMIUM line,
    // which already flows into expenses — quoting it as a price rate is what produced the old 14%.
    expect(template).toMatch(/13–14%/);
    expect(template).toMatch(/claims-cost trend/);
    expect(template).toMatch(/premium/);
  });

  it("states that education inflates your GOALS, not your retirement basket", () => {
    expect(template).toMatch(/Why education carries 0% weight/);
    expect(template, "the 9% rate must be said to survive on the dated goals").toMatch(
      /dated goals in the family layer/,
    );
  });

  it("shows the resulting basket and distinguishes it from general CPI", () => {
    expect(template).toContain('data-testid="pref-inflation-blend"');
    expect(template, "the blend must be labelled as the basket, not as 'inflation'").toMatch(
      /spending basket/,
    );
    expect(template, "general CPI must be shown as the separate deflator it is").toMatch(
      /generalInflationPct/,
    );
    expect(template).toMatch(/deflate\s+by to show you figures in today's rupees/);
  });

  it("explains the disjoint 74/8/0/18 weights instead of asserting them", () => {
    expect(template).toMatch(/74 \/ 8 \/ 0 \/ 18/);
    expect(template, "the double-count that produced the old 7.9% must be named").toMatch(
      /all-items/,
    );
    expect(template).toMatch(/7\.9%/);
  });
});

describe("Preferences — ADR-0006 savings step-up", () => {
  it("the step-up is settable, so a deliberate 0 can be chosen", () => {
    // The hydrate migration treats a STORED 0 as unset. That is only defensible if the user has
    // somewhere to re-assert 0 on purpose (ADR-0006 decision 3).
    expect(template).toContain('data-testid="pref-savings-stepup"');
    expect(src).toMatch(/assumptions\.set\('householdSavingsStepUpPercent'/);
  });

  it("is clamped to the schema's 0-15 range at the input seam", () => {
    expect(src).toMatch(/Math\.min\(15, Math\.max\(0, Number\(val\) \|\| 0\)\)/);
  });

  it("says what the default is AND why it tapers at 50", () => {
    expect(template).toMatch(/2% a year above inflation, tapering to 0 by age 50/);
    expect(template).toMatch(/Why 2%, and why it stops at 50/);
    expect(template, "the pessimism it corrects must be named").toMatch(/zero real growth/);
    expect(template).toMatch(/3–4% above inflation/);
  });
});

describe("Preferences — ADR-0006 real return is shown in the frame the plan uses (gh #180)", () => {
  it("the headline real return is the kernel's ONE real return, not a re-derivation", () => {
    expect(src).toMatch(/fire\.realBlendedReturn\.value/);
    expect(template).toContain('data-testid="pref-return-real"');
    expect(template).toMatch(/this is the real return your\s+plan is solved with/);
  });

  it("the warning fires on the PLAN's real return, never on the basket-relative one", () => {
    // The old readout flagged red on `nominal − basket`, a number the product does not plan with:
    // it could shout "your real return is negative" while the plan was perfectly healthy.
    expect(src).toMatch(/const realReturnNegative = computed\(\(\) => realVsCpi\.value < 0\)/);
    expect(src, "the basket-relative figure stays as INFORMATION with its own softer note").toMatch(
      /const realBelowBasket = computed/,
    );
    expect(template).toContain('data-testid="pref-return-real-basket"');
    expect(template).toMatch(/For information/);
  });
});
