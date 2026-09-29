/**
 * Template/logic-binding lock for tax-planning/Index.vue's zero-tax collapse — gh #185 step 7
 * (income-path kernel spec §7: "tax section collapses to 'you pay zero tax' below ₹12L").
 *
 * Same dep-free source-scan pattern as FireHero.binding.spec.ts (this repo's node test env has no
 * DOM/@vue/test-utils and the contract bans new deps): live behaviour (Ravi vs Sharmas rendering,
 * the toggle) is verified in-browser via Playwright (rules 24/32); this spec pins the BINDINGS —
 * above all the honesty guard that the collapse can never fire on a real, non-zero figure, and
 * that the rebate threshold is read from the FY config, never hardcoded.
 *
 * Honesty surfaces locked here:
 *   - the gate is `activeResult.totalTax === 0` — the CURRENTLY DISPLAYED regime's own computed
 *     tax (which already respects an explicit OLD/NEW pick via `mode`), never a bare income/
 *     threshold check. A household that has actively chosen a regime with real tax due always
 *     sees the full section; a genuine ₹0-₹0 tie collapses regardless of which side
 *     `pageRecommended`'s `<=` tie-break lands on, because the number shown is honestly zero
 *     either way (Playwright-proven: Ravi at ₹3L ties at ₹0/₹0 and `pageRecommended` resolves to
 *     OLD, yet the collapse still fires and the card names the Old regime's exemption/rebate);
 *   - the rebate limit shown in the New-regime copy comes from `getTaxConfigForFY(...).newRegime
 *     .rebateLimit` (the SAME constant the engine uses), never a literal `1200000`;
 *   - the collapsed card and the "show full section anyway" escape hatch both carry stable
 *     testids so Playwright/e2e can assert on them without coupling to copy;
 *   - the optimisation machinery (income/deduction meters, tax breakdown, tax cliff, per-earner
 *     table, filing disclaimer) is gated behind the SAME `zeroTaxSectionVisible` computed as the
 *     card's inverse — one gate, not two independently-driftable ones.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = readFileSync(fileURLToPath(new URL("./Index.vue", import.meta.url)), "utf8");
const script = src.slice(0, src.indexOf("<template>"));
const template = src.slice(src.indexOf("<template>"));

describe("tax-planning Index.vue — zero-tax collapse (gh #185 step 7)", () => {
  it("the gate never fires on a real non-zero figure (honesty guard)", () => {
    // Gated on the CURRENTLY DISPLAYED regime's own computed tax (activeResult, which already
    // respects an explicit OLD/NEW pick via `mode`) being exactly zero — never a bare income/
    // threshold comparison, and never restricted to only the NEW-regime path (a genuine OLD-regime
    // ₹0 tie, e.g. Ravi's ₹3L household, must collapse too).
    expect(script).toMatch(
      /const isZeroTaxRecommended = computed\(\(\) => activeResult\.value\.totalTax === 0\);/,
    );
  });

  it("the rebate threshold shown to the user comes from the FY config, never a hardcoded 1200000", () => {
    expect(script).toMatch(/getTaxConfigForFY\(selectedFY\.value\)\.newRegime\.rebateLimit/);
    // The literal 1,200,000 must not appear as a magic number driving the gate or the copy in this
    // file — the engine's own FY config is the single source (contract: never hardcode 1200000).
    expect(script).not.toMatch(/1_?200_?000|1200000/);
  });

  it("renders the collapsed card with a stable testid and the exact-condition reason text", () => {
    expect(template).toContain('data-testid="tax-zero-collapse"');
    expect(template).toContain("You pay ₹0 income tax");
    // NEW-regime branch: states the mechanism (New regime + ₹12L rebate u/s 87A) and the FY.
    expect(template).toMatch(/New\s+regime's ₹\{\{ Math\.round\(newRegimeRebateLimit \/ 100000\) \}\}L rebate/);
    expect(template).toMatch(/Section 87A/);
    expect(template).toMatch(/FY\s+\{\{ selectedFY \}\}/);
    // OLD-regime branch: a genuine tie (both regimes ₹0) must still name the mechanism honestly —
    // never silently reuse the New-regime copy for an Old-regime zero.
    expect(template).toMatch(/Old\s+regime's basic exemption and Section 87A rebate/);
  });

  it("the card is gated by isZeroTaxRecommended AND is not the power-user override state", () => {
    expect(template).toMatch(
      /<PanelCard\s+v-if="isZeroTaxRecommended && !showFullSectionAnyway"/,
    );
  });

  it("a power-user escape hatch exists so the collapse never locks anyone out (toggle both ways)", () => {
    const toggles = template.match(/data-testid="tax-zero-collapse-toggle"/g) ?? [];
    expect(toggles.length).toBe(2); // collapse -> expand, and expand -> collapse back
    expect(template).toMatch(/@click="showFullSectionAnyway = true"/);
    expect(template).toMatch(/@click="showFullSectionAnyway = false"/);
  });

  it("the escape-hatch state resets whenever the zero-tax condition re-triggers (no stale expand)", () => {
    expect(script).toMatch(
      /watch\(isZeroTaxRecommended, \(isZero\) => \{\s*if \(!isZero\) showFullSectionAnyway\.value = false;\s*\}\);/,
    );
  });

  it("the optimisation machinery is gated behind the single zeroTaxSectionVisible computed", () => {
    expect(script).toMatch(
      /const zeroTaxSectionVisible = computed\(\s*\(\)\s*=>\s*!isZeroTaxRecommended\.value \|\| showFullSectionAnyway\.value,?\s*\);/,
    );
    // The optimisation block (income/deductions through the filing disclaimer) is wrapped in ONE
    // template gate driven by that computed — not per-panel ad-hoc gates that could drift apart.
    expect(template).toMatch(/<template v-if="zeroTaxSectionVisible">[\s\S]*Income &amp; deductions/);
    expect(template).toMatch(/for filing, use your CA \/ Cleartax[\s\S]{0,400}<\/v-alert>\s*<\/template>/);
  });

  it("the hero (StatDashboard) stays visible only when the section is visible — never orphaned", () => {
    expect(template).toMatch(/<StatDashboard\s+v-if="zeroTaxSectionVisible"/);
  });
});
