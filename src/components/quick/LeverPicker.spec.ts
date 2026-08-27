/**
 * T-379 (QN-5) — LeverPicker rendering + interaction contract.
 *
 * Complements `lever-catalog.plan.spec.ts` (which owns the MATH) by locking what a user actually
 * sees and can do: a row per move with its note and its "less to find" figure, greyed rows that
 * state WHY they are unavailable, the plan summary, the verbatim honesty line, and the fact that
 * toggling writes through the SESSION-ONLY ui state (never a persisted field).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { setActivePinia, createPinia } from "pinia";
import { useUiStore } from "@/stores/ui";
import { PLAN_HONESTY_LINE } from "@/lib/quick-number-copy";
import { PLAN_LEVER_KEYS } from "@/lib/lever-catalog";

const src = readFileSync(fileURLToPath(new URL("./LeverPicker.vue", import.meta.url)), "utf8");

describe("LeverPicker — the Option-C card surface", () => {
  it("renders the card title and the 'nothing is assumed by default' intro", () => {
    expect(src).toContain("How to get there — pick your moves");
    expect(src).toMatch(/Nothing below is assumed by default/);
  });

  it("carries the honesty line VERBATIM from the copy module (never re-typed inline)", () => {
    // Bound from the constant, not hard-coded — so the copy has exactly one home.
    expect(src).toMatch(/\{\{\s*PLAN_HONESTY_LINE\s*\}\}/);
    expect(src).toMatch(/import \{ PLAN_HONESTY_LINE \} from "@\/lib\/quick-number-copy";/);
    // …and the constant itself still says the spec's sentence.
    expect(PLAN_HONESTY_LINE).toContain(
      "This part is arithmetic — it can't go wrong. What can go wrong is whether the monthly amount actually happens",
    );
  });

  it("renders one row per catalog lever, each with a checkbox, note and effect slot", () => {
    expect(src, "rows come from the catalog, not a hard-coded list").toMatch(
      /v-for="row in perLever"/,
    );
    expect(src, "each row shows the lever's one-line note").toMatch(/row\.lever\.note/);
    expect(src, "each row has a per-lever toggle testid").toContain(
      "`lever-toggle-${row.lever.key}`",
    );
    expect(src, "each row shows its 'less to find'").toMatch(/less to find/);
  });

  it("an unavailable lever is greyed AND states its reason (never a silent blank)", () => {
    expect(src).toMatch(/'lever--off': !row\.lever\.available/);
    expect(src).toMatch(/row\.lever\.unavailableNote/);
  });

  it("shows the plan summary and the 'Make this my plan' commit action", () => {
    expect(src).toMatch(/data-testid="lever-plan-summary"/);
    expect(src).toMatch(/data-testid="lever-make-my-plan"/);
    expect(src).toContain("Make this my plan");
  });

  it("makes NO claim when the moves still cannot reach the target (rule 31)", () => {
    // The unreachable branch must exist and must point at the age, not quote a fake number.
    expect(src).toMatch(/beyond any realistic monthly\s*\n?\s*amount/);
  });

  it("commits ONLY the levers that map to a real persistable plan change", () => {
    // trim-expenses / no-prepay are intentions, not data — committing them would fabricate
    // spending or liability records the user never entered.
    expect(src).toMatch(/k === "step-up-10" \|\| k === "delay-3" \|\| k === "direct-plans"/);
    expect(src, "step-up writes through the existing assumptions action").toMatch(
      /a\.set\(\s*\n?\s*"householdSavingsStepUpPercent"/,
    );
    expect(src, "direct-plans maps to the EXISTING equityReturn override").toMatch(
      /a\.set\("equityReturn"/,
    );
    expect(src, "delay writes the target through the existing household action").toMatch(
      /h\.updateMember\(m\.id, \{ targetRetirementAge: age \}\)/,
    );
    expect(src, "preferences hint is shown for the return override").toMatch(
      /data-testid="lever-preferences-link"/,
    );
  });

  it("under a member lens the commit writes ONLY that adult's target (never both spouses')", () => {
    expect(src).toMatch(/ui\.viewingMemberId\s*\n?\s*\?\s*h\.data\.members\.filter/);
  });
});

describe("LeverPicker — toggling is SESSION-ONLY what-if state", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("toggles are stored in ui.whatIfLevers, which is never persisted", () => {
    const ui = useUiStore();
    expect(ui.whatIfLevers).toEqual([]);
    ui.setWhatIfLevers(["step-up-10", "delay-3"]);
    expect(ui.whatIfLevers).toEqual(["step-up-10", "delay-3"]);
    // De-duplicated so a double-toggle cannot double-count.
    ui.setWhatIfLevers(["step-up-10", "step-up-10"]);
    expect(ui.whatIfLevers).toEqual(["step-up-10"]);
  });

  it("the ui store never writes lever state into the persisted blob", () => {
    const storeSrc = readFileSync(
      fileURLToPath(new URL("../../stores/ui.ts", import.meta.url)),
      "utf8",
    );
    const persistBody = storeSrc.slice(
      storeSrc.indexOf("function persist()"),
      storeSrc.indexOf("watch(["),
    );
    expect(persistBody, "whatIfLevers must not reach the persisted shape").not.toContain(
      "whatIfLevers",
    );
    const watchLine = storeSrc.slice(storeSrc.indexOf("watch(["), storeSrc.indexOf("watch([") + 160);
    expect(watchLine, "whatIfLevers must not be watched for persistence").not.toContain(
      "whatIfLevers",
    );
  });

  it("the component reads the catalog's key list (rows can never drift from the math)", () => {
    expect(PLAN_LEVER_KEYS.length).toBe(5);
    expect(src).toMatch(/buildPlanLevers\(/);
    expect(src).toMatch(/lessToFindFor\(/);
  });
});
