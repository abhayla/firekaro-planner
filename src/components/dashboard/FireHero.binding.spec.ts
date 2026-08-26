/**
 * Template/logic-binding lock for FireHero.vue — T-377 (QN-2) gap hero.
 *
 * Same dep-free source-scan pattern as AccelerationCard/PlanVarianceCard binding specs (this
 * repo's node test env has no DOM/@vue/test-utils and the contract bans new deps): live
 * behaviour is verified in-browser (rules 24/32); these locks pin the bindings — and above all
 * the NON-REMOVABLE honesty surfaces — that a future edit could silently drop while every
 * value-level spec stays green.
 *
 * Honesty surfaces locked here (contract §3 "non-removable"):
 *   confidence band · household-primary headline · bridge verdict · both today's AND nominal
 *   shown once · `unknown` gap tone makes NO claim.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = readFileSync(fileURLToPath(new URL("./FireHero.vue", import.meta.url)), "utf8");
const template = src.slice(src.indexOf("<template>"));

describe("FireHero binding locks — T-377 QN-2 gap hero", () => {
  it("the headline is the TARGET age (one number), not the current-pace age", () => {
    expect(template, "eyebrow must read 'To retire at'").toMatch(/To retire at/);
    expect(template, "the big number must be the slider target age").toMatch(
      /class="fire-hero__age" data-testid="fire-hero-age">\{\{ targetAge \}\}/,
    );
  });

  it("shows BOTH today's money and the nominal figure — exactly once each (honesty guardrail)", () => {
    expect(template).toMatch(/formatINRCompact\(req\.needReal\)[\s\S]{0,80}in today's money/);
    expect(template).toMatch(/formatINRCompact\(req\.needNominal\)[\s\S]{0,40}in \{\{ needYear \}\}/);
    // Exactly once each — a second render of the same figure is the "shown once" violation.
    expect((template.match(/req\.needReal/g) ?? []).length).toBe(1);
    expect((template.match(/req\.needNominal/g) ?? []).length).toBe(1);
  });

  it("renders all four solver numbers: need · have-by-target · gap · do-this", () => {
    for (const id of ["fire-hero-need", "hero-have", "hero-gap", "hero-required-monthly"]) {
      expect(template, `missing testid ${id}`).toContain(`data-testid="${id}"`);
    }
  });

  it("the gap tile makes NO claim when the tone is `unknown` (rule 31)", () => {
    expect(template).toMatch(/gapTone === 'unknown'">—/);
    expect(src, "tone must come from the shared resolver, never an inline sign test").toMatch(
      /resolveGapTone\(req\.value\.gapReal\)/,
    );
  });

  it("an unreachable target renders 'Move the age', never a fabricated amount", () => {
    expect(template).toMatch(/v-if="!requiredFinite">Move the age/);
    expect(src).toMatch(/Number\.isFinite\(req\.value\.requiredMonthlyReal\)/);
  });

  it("the retirement-age slider is live, bounded 40-70, and writes the SHARED ui field (#64 class)", () => {
    expect(template).toMatch(/v-model="targetAge"[\s\S]{0,400}data-testid="hero-age-slider"/);
    expect(template).toMatch(/:min="HERO_AGE_MIN"/);
    expect(template).toMatch(/:max="HERO_AGE_MAX"/);
    expect(src).toMatch(/const HERO_AGE_MIN = 40/);
    expect(src).toMatch(/const HERO_AGE_MAX = 70/);
    // The setter must go through the ui store — a component-local ref would re-open the drift.
    expect(src).toMatch(/set: \(v: number\) => ui\.setWhatIfTargetAge\(v\)/);
    expect(src).toMatch(/get: \(\) => fire\.heroTargetAge\.value/);
  });

  it("dragging is a WHAT-IF: nothing persists until 'Set as my target' is clicked", () => {
    expect(template).toMatch(/nothing is saved until you set it as your target/);
    expect(template).toMatch(/data-testid="hero-set-target"[\s\S]{0,120}@click="setAsMyTarget"/);
    expect(src, "the persist path writes the household member, not the ui blob").toMatch(
      /h\.updateMember\(m\.id, \{ targetRetirementAge: age \}\)/,
    );
  });

  it("the '+3 years' hint comes from a SECOND solver run, never an extrapolation", () => {
    expect(src).toMatch(/fire\.requiredContributionAtTargetPlus3\.value/);
    expect(template).toContain('data-testid="hero-slider-hint"');
  });

  it("NON-REMOVABLE: the #18 confidence band survives the redesign", () => {
    expect(template).toContain('data-testid="fire-hero-confidence-subline"');
    expect(template).toMatch(/most likely <b>\{\{ band\.text \}\}<\/b> allowing for markets/);
    expect(src).toMatch(/describeFireConfidenceBand/);
  });

  it("NON-REMOVABLE: the #15 bridge verdict subline survives the redesign", () => {
    expect(template).toContain('data-testid="fire-hero-bridge-subline"');
    expect(src).toMatch(/const bridgeSubline = computed/);
  });

  it("NON-REMOVABLE: the current-pace age is DEMOTED, not deleted", () => {
    expect(template).toContain('data-testid="fire-hero-pace"');
    expect(src, "pace must read the solver's paceFireAge").toMatch(/req\.value\.paceFireAge/);
    expect(src, "a never-reached pace makes no age claim").toMatch(/would <b>not<\/b> reach this number/);
  });

  it("NON-REMOVABLE: household stays primary — the member lens keeps its caveat + household figure", () => {
    expect(template).toContain('data-testid="fire-hero-member-caveat"');
    expect(template).toMatch(/Switch to <b>Whole household<\/b> above for your full plan/);
  });

  it("NON-REMOVABLE: the plan-variance KPI + since-away delta + corpus progress survive", () => {
    for (const id of ["hero-kpi-plan", "hero-kpi-corpus", "hero-digest-delta"]) {
      expect(template, `missing testid ${id}`).toContain(`data-testid="${id}"`);
    }
    // The plan-variance tone resolver is untouched by QN-2 — two signals, two types.
    expect(src).toMatch(/resolveHeroTone\(\{/);
  });

  it("every money figure comes from the solver — the component computes no money of its own", () => {
    const script = src.slice(0, src.indexOf("<template>"));
    // No ad-hoc corpus/SWR arithmetic may creep into the component (contract §10: no parallel math).
    expect(script).not.toMatch(/annualExpenses[\s\S]{0,20}\/[\s\S]{0,20}swr/i);
    expect(script).toMatch(/const req = computed\(\(\) => fire\.requiredContribution\.value\)/);
  });
});
