/**
 * Template-binding regression lock for AccelerationCard.vue (gh-48 HIGH honesty fix, 2026-06-06).
 *
 * The original optimistic-skew defect (rule 31 / bug-#22 class) lived in a TEMPLATE BINDING: the
 * "FIRE in ~X" chip rendered the SCALAR `baselineYears` instead of the honest, bridge-adjusted
 * `headlineYears`, so on a liquidity-limited household the action surface showed a date 1–2yr SOONER
 * than the truth. The composable-level locks (useAcceleration.spec.ts) + the plausibility sweep
 * (headline-plausibility.spec.ts) pin the *values*, but a future edit that re-binds the chip back to
 * `baselineYears` would pass all of those — the bug was a binding, not a value. This source-scan lock
 * pins the exact template surface (same dep-free pattern as storage-invariant.spec.ts). It is
 * intentionally narrow: it asserts the two honesty-critical bindings exist, not the whole template.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = readFileSync(fileURLToPath(new URL("./AccelerationCard.vue", import.meta.url)), "utf8");

describe("AccelerationCard template-binding honesty lock (gh-48, rule 31)", () => {
  it("the FIRE-in chip renders the honest headlineYears, NEVER the scalar baselineYears", () => {
    // The chip must show the bridge-adjusted headline. A regression that re-binds it to the scalar
    // corpus model would reintroduce the 1–2yr optimistic skew on bridge-limited households.
    expect(src, "chip must bind headlineYears").toMatch(/FIRE in ~\{\{\s*yearsLabel\(headlineYears\)\s*\}\}/);
    expect(src, "chip must NOT bind the scalar baselineYears").not.toMatch(
      /FIRE in ~\{\{\s*yearsLabel\(baselineYears\)\s*\}\}/,
    );
  });

  it("the scalar per-lever impact bars (incl. the band range) are gated OFF when the bridge binds", () => {
    // Under bridgeBinding the scalar deltas overstate the liquidity-gated date, so the Option-D
    // impact bars (which encode the deltas + the risk-notch range) must be hidden — only the
    // plain ranked list (labels, no figures) renders alongside the caveat.
    expect(src, "WinsImpactBars must be gated on !bridgeBinding").toMatch(
      /<WinsImpactBars\s+v-if="!bridgeBinding"/,
    );
    // The band must reach the template ONLY through the winBars mapping (rendered inside the
    // gated WinsImpactBars) — no separate, ungated band line may exist in the template.
    const template = src.slice(src.indexOf("<template>"));
    expect(template, "no direct lever.band rendering outside the gated bars").not.toContain("lever.band");
  });

  it("renders the honest bridge-limited caveat when the bridge is the binding constraint", () => {
    expect(src, "bridge caveat alert must exist, gated on bridgeBinding").toMatch(
      /v-if="bridgeBinding"[\s\S]*?data-testid="accel-bridge-caveat"/,
    );
  });
});

/**
 * T-379 (QN-5) — the card's BODY is now <LeverPicker>, but the retention contract above it is
 * explicit in the goal contract: the years-saved KPI, the bridge guard and the baseline guard are
 * kept, and ONLY the fixed-extra-amount "save more" presentation is replaced. These cases lock
 * that split so a future edit cannot quietly delete the honesty surfaces while "modernising" the
 * card, nor re-introduce the fixed-amount slider the picker replaced.
 */
describe("AccelerationCard × LeverPicker (T-379 QN-5 retention contract)", () => {
  it("embeds the QN-5 lever picker as the card body", () => {
    expect(src, "LeverPicker must be imported").toMatch(
      /import LeverPicker from "@\/components\/quick\/LeverPicker\.vue";/,
    );
    expect(src, "LeverPicker must render inside the card").toMatch(/<LeverPicker\b/);
  });

  it("RETAINS the years-saved 'biggest win' KPI and both guards (not replaced by the picker)", () => {
    // The ranked years-saved surface — the "when can I stop?" question the ₹ view cannot answer.
    expect(src, "ranked levers must still drive the impact bars").toMatch(/reachableLevers/);
    expect(src, "WinsImpactBars must still render").toMatch(/<WinsImpactBars\b/);
    // bridgeBinding guard (#22 / rule 31) and the baseline-reachable guard (gh #39 empty state).
    expect(src, "bridgeBinding guard retained").toMatch(/const bridgeBinding = computed/);
    expect(src, "baselineReachable guard retained").toMatch(/const baselineReachable = computed/);
    expect(src, "self-hide gate retained").toMatch(/const show = computed/);
  });

  it("the fixed-extra-amount save-more SLIDER is gone (only that presentation was replaced)", () => {
    expect(src, "the ₹-stepper slider must not survive alongside the picker").not.toMatch(
      /data-testid="accel-savemore-slider"/,
    );
    expect(src, "its result line must not survive either").not.toMatch(
      /data-testid="accel-savemore-result"/,
    );
  });
});
