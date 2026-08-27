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

  it("shows BOTH today's rupees and the nominal figure — exactly once each (honesty guardrail)", () => {
    expect(template).toMatch(/formatINRCompact\(req\.needReal\)[\s\S]{0,80}in today's rupees/);
    expect(template).toMatch(/formatINRCompact\(req\.needNominal\)[\s\S]{0,40}in \{\{ needYear \}\}/);
    // Exactly once each — a second render of the same figure is the "shown once" violation.
    expect((template.match(/req\.needReal/g) ?? []).length).toBe(1);
    expect((template.match(/req\.needNominal/g) ?? []).length).toBe(1);
  });

  it("ADR-0006: the today's-rupee figure is qualified — it is the target AT the target age", () => {
    // "today's money" alone read as a target standing still. It does not: the FIRE number rises
    // with the household spending basket even after deflating at general CPI, so needReal at 50 is
    // NOT today's FIRE number. The note must say so, name the basket, and show it LIVE.
    expect(template).toContain('data-testid="fire-hero-frame-note"');
    expect(template).toMatch(/today's rupees, at age \{\{ targetAge \}\}/);
    expect(template, "the basket rate must be read live from the kernel, never hard-coded").toMatch(
      /fire\.householdInflation\.value \* 100/,
    );
    expect(template, "and the general-CPI deflator named as the different rate it is").toMatch(
      /a\.values\.inflation \* 100/,
    );
    expect(template).toMatch(/\/preferences#pref-section-inflation/);
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

  it("ADR-0006: an unreachable plan gets a FIRST-CLASS headline state, not just a tile", () => {
    expect(template, "the headline-level state must exist").toContain(
      'data-testid="fire-hero-unreachable"',
    );
    expect(template).toMatch(/At these assumptions you don't get there by \{\{ targetAge \}\}/);
    // The tile-level version stays — this is an addition, not a replacement (contract: zero data loss).
    expect(template).toMatch(/v-if="!requiredFinite">Move the age/);
  });

  it("the unreachable state is gated on the solver's OWN honest signals, never inferred", () => {
    // Infinity from a `solve: false` run is explicitly NOT a verdict — reading it as one would
    // fabricate the state on the six-point QN-4 chart's sampled runs.
    expect(src).toMatch(/const unreachableAtAssumptions = computed/);
    expect(src).toMatch(/req\.value\.solved/);
    expect(src).toMatch(/req\.value\.paceFireAge == null/);
  });

  it("the unreachable state prints NO number and points at BOTH the moves and the assumptions", () => {
    const block = template.slice(
      template.indexOf('data-testid="fire-hero-unreachable"'),
      template.indexOf('data-testid="fire-hero-guess"'),
    );
    expect(block.length, "the unreachable block must precede the guess line").toBeGreaterThan(0);
    // Rule 31 / the fire-confidence-band rule: a sentinel is never rendered as a figure.
    expect(block, "no money figure may be rendered inside the unreachable state").not.toMatch(
      /formatINRCompact/,
    );
    expect(block, "must name the levers below / the age slider above").toMatch(/drag the age|move below/i);
    expect(block, "must deep-link to the assumptions that drive it").toMatch(
      /\/preferences#pref-section-inflation/,
    );
  });

  it("the retirement-age slider is bounded by the SHARED range and commits to the SHARED ui field", () => {
    expect(template).toMatch(/data-testid="hero-age-slider"/);
    expect(template).toMatch(/:min="HERO_AGE_MIN"/);
    expect(template).toMatch(/:max="HERO_AGE_MAX"/);
    // Bounds come from the store's shared constants — a hard-coded pair here is what let the
    // hero (40-70) and What-If ([anchor+1, 75]) disagree about the same stored value.
    expect(src).toMatch(/SHARED_TARGET_AGE_MIN/);
    expect(src).toMatch(/SHARED_TARGET_AGE_MAX/);
    // Never below the user's own age + 1 — an age already passed cannot carry an honest plan.
    expect(src).toMatch(/Math\.max\(SHARED_TARGET_AGE_MIN, Math\.round\(anchor\) \+ 1\)/);
    // The commit must go through the ui store action (a component-local ref re-opens the drift),
    // and it must happen on RELEASE, not on every integer the thumb crosses (perf).
    expect(src).toMatch(/ui\.setWhatIfTargetAge\(/);
    expect(src).toMatch(/fire\.heroTargetAge\.value/);
    expect(template).toMatch(/@end="commitSliderAge"/);
    // ...but a keyboard user never fires @end, so a non-drag change must commit immediately
    // (gating the commit on @end alone froze the numbers for keyboard users).
    expect(template).toMatch(/@update:model-value="onSliderInput"/);
    expect(src).toMatch(/if \(!dragging\.value\) ui\.setWhatIfTargetAge\(/);
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

  it("ADR-0006: a baseline locked under the OLD model makes NO verdict — it offers a re-lock", () => {
    // Differencing across a frame change reports the model's move as the user's slippage: a
    // fabricated "N months behind" for every user who had ever locked a plan.
    expect(src).toMatch(/isBaselineFrameCurrent/);
    expect(src).toMatch(/const baselineFrameStale = computed/);
    // The staleness must actually gate the verdict path, not merely exist.
    expect(src).toMatch(/baselineUsable = computed\([\s\S]{0,220}!baselineFrameStale\.value/);
    expect(src).toMatch(/your plan was locked under the old model — re-lock to compare/);
    // The re-lock is OFFERED, never taken for the user — the baseline is their chosen starting point.
    expect(template).toContain('data-testid="plan-variance-relock-frame"');
    expect(template).toMatch(/v-if="planSlot\.relock"/);
    expect(src, "no auto-relock may be wired to a watcher or mount hook").not.toMatch(
      /baselineFrameStale[\s\S]{0,80}lockBaseline\(\)/,
    );
  });

  it("'Set as my target' writes only the LENSED member when a lens is on (never both spouses)", () => {
    expect(src).toMatch(/hh\.value\.isMember[\s\S]{0,160}m\.id === ui\.viewingMemberId/);
  });

  it("a prescription above today's savings says where the money must come from", () => {
    expect(src).toMatch(/const feasibilityNote = computed/);
    expect(template).toContain("feasibilityNote");
  });

  it("every money figure comes from the solver — the component computes no money of its own", () => {
    const script = src.slice(0, src.indexOf("<template>"));
    // No ad-hoc corpus/SWR arithmetic may creep into the component (contract §10: no parallel math).
    expect(script).not.toMatch(/annualExpenses[\s\S]{0,20}\/[\s\S]{0,20}swr/i);
    expect(script).toMatch(/const req = computed\(\(\) => fire\.requiredContribution\.value\)/);
  });
});
