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

  it("ADR-0007: discloses the income path, the 2% basis WITH its continuous-employment caveat, and creep-off", () => {
    // RE-BASELINED (ADR-0007 / gh #185). The old copy explained a SAVINGS step-up of 2% tapering at
    // 50. `derive()` now grows each earner's INCOME instead, so the panel had to be rewritten. What
    // this locks is the DISCLOSURE, which is the Tier-0 part:
    //  1. the model change is explained in the user's own terms (income, not savings);
    //  2. the 2% default carries the FinTech-mandated caveat VERBATIM — without it the default reads
    //     as a measured figure, which it is not;
    //  3. the user's own hike % is named as moving the SECOND number, never the headline;
    //  4. lifestyle creep is named as UNSOURCED and as shipped OFF.
    expect(template, "the model change must be explained in the user's terms").toMatch(
      /Why we grow your income, not your savings/,
    );
    expect(template, "the 2% basis must be disclosed").toMatch(/Why 2%/);
    // The mandated caveat, verbatim. This is the single most important string on the page: it is the
    // condition under which the individual-path reasoning behind 2% holds at all.
    // `src`, not `template`: the three knobs' hint copy moved into the script's
    // `INCOME_PATH_HINTS` constants when the read-only disclosure prefix was added (ADR-0007 /
    // #185 server parity) so the prefix is applied in exactly one place. The copy still reaches the
    // user — bound via `:hint="incomePathHint(...)"`, which the server-mode describe below locks.
    expect(
      src.replace(/\s+/g, " "),
      "the continuous-employment caveat must appear VERBATIM (ADR-0007 (a))",
    ).toContain("assumes continuous employment; real wage growth for this band was ~0% in FY22-24");
    expect(src, "the hike % must be named as the SECOND number, never the headline").toMatch(
      /never the headline/,
    );
    expect(src, "creep must be disclosed as an unsourced assumption").toMatch(
      /unsourced assumption, not a research figure/,
    );
    expect(template, "creep must be disclosed as shipped OFF").toMatch(/we ship it OFF/);
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

/**
 * ADR-0007 / gh #185 — the three income-path knobs cannot be SAVED in server mode until the
 * Prisma columns land (#185 step 6), so PUT /api/planner/assumptions does not accept them
 * (`persistedAssumptionsSchema`). An editable field whose value is discarded is a silent drop with
 * a nicer face: the user types 4%, reloads, reads 2%, and is told nothing. These locks pin that the
 * page disables the three and SAYS why, gated on `isServerMode()` — never an inline
 * `import.meta.env` check (the gh #36 non-negotiable).
 *
 * Step 6 deletes this describe together with the `incomePathKnobsReadOnly` computed.
 */
describe("Preferences — the #185 income-path knobs are read-only in server mode", () => {
  const script = src.slice(0, src.indexOf("<template>"));

  it("gates on isServerMode() from runtime-mode, not on import.meta.env (gh #36)", () => {
    expect(script).toMatch(/import \{ isServerMode \} from "@\/lib\/runtime-mode"/);
    expect(script).toMatch(/incomePathKnobsReadOnly\s*=\s*computed\(\(\)\s*=>\s*isServerMode\(\)\)/);
    const gateLine = script.slice(script.indexOf("incomePathKnobsReadOnly"));
    expect(gateLine.slice(0, 120)).not.toMatch(/import\.meta\.env/);
  });

  it("disables all THREE knobs on that one gate", () => {
    for (const testid of ["pref-salary-growth", "pref-salary-taper-age", "pref-expense-creep"]) {
      const field = template.slice(template.indexOf(`data-testid="${testid}"`) - 700);
      expect(
        field.slice(0, 760),
        `${testid} must carry :disabled="incomePathKnobsReadOnly"`,
      ).toMatch(/:disabled="incomePathKnobsReadOnly"/);
    }
  });

  it("carries the persistence disclosure in every knob's hint AND as a visible section note", () => {
    // The exact copy the owner approved — a user must be told the value is not saved yet AND that
    // the plan is already using the research default (i.e. nothing is broken meanwhile).
    expect(script).toMatch(
      /Saved per account after the next release; the plan already uses the research default/,
    );
    // Applied in ONE place (the hint helper), so a fourth knob cannot be added without it.
    expect(script).toMatch(
      /incomePathKnobsReadOnly\.value\s*\?\s*`\$\{INCOME_PATH_READONLY_NOTE\}\. \$\{base\}`/,
    );
    for (const key of ["salaryGrowth", "taperAge", "creep"]) {
      expect(template).toContain(`:hint="incomePathHint('${key}')"`);
    }
    expect(template).toContain('data-testid="pref-income-path-readonly-note"');
  });

  it("leaves the DEMO deployment editable (the localStorage adapter stores them fine)", () => {
    // The gate is the ONLY thing disabling them — no unconditional `disabled` anywhere near the three.
    for (const testid of ["pref-salary-growth", "pref-salary-taper-age", "pref-expense-creep"]) {
      const field = template.slice(template.indexOf(`data-testid="${testid}"`) - 700, template.indexOf(`data-testid="${testid}"`) + 300);
      expect(field, `${testid} must not be hard-disabled`).not.toMatch(/\n\s+disabled\b/);
    }
  });
});
