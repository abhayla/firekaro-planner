/**
 * Regression lock for #77 — low-contrast / washed-out tooltips.
 *
 * The bare `<v-tooltip>` inherited Vuetify's translucent default surface, so the busy
 * financial page bled through the jargon explanation (e.g. "Required corpus" on
 * /fire-goals/what-if). The fix wires ONE global default
 * (`VTooltip { contentClass: "fk-tooltip" }`) to an opaque slate-900 surface rule in
 * tokens.css, and bumps the InfoTip body from text-caption to text-body-2.
 *
 * These are static-content assertions (no DOM render) — they pin the wiring so the
 * wash-out cannot silently regress. Written red-first: every assertion targets a
 * string that did NOT exist before the fix.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const read = (rel: string) => readFileSync(here + rel, "utf8");

describe("#77 tooltip contrast — global opaque surface is wired", () => {
  it("vuetify.ts registers the global VTooltip contentClass default", () => {
    const src = read("../plugins/vuetify.ts");
    // The single global default that reaches every v-tooltip user.
    expect(src).toMatch(/VTooltip:\s*\{\s*contentClass:\s*["']fk-tooltip["']/);
  });

  it("tokens.css defines an opaque slate-900 .fk-tooltip surface", () => {
    const css = read("../styles/tokens.css");
    // The rule must exist, target the overlay content, and be opaque slate-900.
    expect(css).toMatch(/\.fk-tooltip\s*\{[^}]*\}/s);
    const rule = css.slice(css.indexOf(".v-overlay__content.fk-tooltip"));
    // !important is load-bearing: Vuetify's own .v-tooltip .v-overlay__content rule
    // wins at equal specificity + later source order without it (verified in-browser).
    expect(rule).toMatch(/background:\s*#1e293b\s*!important/i); // slate-900, opaque, must beat Vuetify
    expect(rule).toMatch(/color:\s*#ffffff\s*!important/i); // white text, must beat Vuetify
    expect(rule).toMatch(/opacity:\s*1\s*!important/i); // kills the translucent default
  });

  it("InfoTip.vue uses readable text-body-2 (not the washed-out text-caption)", () => {
    const vue = read("../components/shared/InfoTip.vue");
    // The explanation + formula must be text-body-2 …
    expect(vue).toMatch(/<div class="text-body-2">/);
    expect(vue).toMatch(/class="text-body-2 mt-1 font-italic"/);
    // … and the old text-caption must be gone from the tooltip body.
    expect(vue).not.toMatch(/text-caption/);
  });
});
