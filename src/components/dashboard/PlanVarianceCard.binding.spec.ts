/**
 * Template/logic-binding lock for PlanVarianceCard.vue (#155 re-lock acknowledgement +
 * the H1 fabricated-claim guard, Option-D Stage C).
 *
 * Same dep-free source-scan pattern as AccelerationCard.binding.spec.ts (this repo's node
 * test env has no DOM/@vue/test-utils, and the goal contract bans new deps): the live click
 * behaviour is verified in-browser (rules 24/25/32); these locks pin the bindings a future
 * edit could silently drop while every value-level spec stays green.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = readFileSync(fileURLToPath(new URL("./PlanVarianceCard.vue", import.meta.url)), "utf8");

describe("PlanVarianceCard binding locks (#155 + H1 guard)", () => {
  it("#155: the re-lock button flips to a transient ✓ acknowledgement on click — regardless of variance state", () => {
    // The click handler must set the ack flag THEN schedule its reset (~2s) — the ack fires
    // unconditionally on relock(), not behind any variance/tone condition.
    expect(src, "relock() must set the ack flag").toMatch(/function relock\(\)[\s\S]{0,200}relockAck\.value = true/);
    expect(src, "ack must auto-clear after ~2s").toMatch(/setTimeout\([\s\S]{0,60}relockAck\.value = false[\s\S]{0,20}2000\)/);
    expect(src, "button must expose the ack testid when acknowledged").toMatch(
      /relockAck \? 'plan-variance-relock-ack' : 'plan-variance-relock'/,
    );
    expect(src, "button label must flip to Re-locked").toMatch(/relockAck \? "Re-locked" : "Re-lock"/);
    expect(src, "the button must invoke relock (not the raw lockBaseline)").toMatch(/@click="relock"/);
  });

  it("#155: lockedOn includes the time of day when the baseline was captured today", () => {
    expect(src).toMatch(/toLocaleTimeString/);
    expect(src).toMatch(/isToday/);
  });

  it("H1 guard: a non-finite delta or unusable persisted baseline can never render a fabricated claim", () => {
    // Persisted Infinity yearsToFire JSON-round-trips to null → (null − current)×12 would
    // fabricate a finite "behind". The card must gate variance on a finite stored value...
    expect(src, "baseline usability gate").toMatch(/Number\.isFinite\(baseline\.value\.yearsToFire\)/);
    // ...and a non-finite computed delta must take the no-claim phrase, not a number.
    expect(src, "monthsPhrase guards non-finite input").toMatch(
      /if \(!Number\.isFinite\(m\)\) return \{ text: "not comparable/,
    );
  });

  it("Option-D: the canonical lock CTA lives in the hero — the empty state has NO lock button", () => {
    const template = src.slice(src.indexOf("<template>"));
    expect(template, "no plan-variance-lock control in this card").not.toContain('data-testid="plan-variance-lock"');
    expect(template, "empty state points at the hero").toMatch(/Lock this as my plan/);
  });
});
