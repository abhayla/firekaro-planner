/**
 * T-377 (QN-2) — ONE retirement age, two sliders (#64 class lock).
 *
 * The dashboard gap hero and /fire-goals/what-if both let the user drag a retirement age. If
 * each kept its own local ref they would silently disagree — the exact drift class #64 was
 * filed for. Both MUST read/write `ui.whatIfTargetAge`, which is session-only (never persisted).
 *
 * Dep-free source scan (this repo's node test env has no DOM/@vue/test-utils); the live drag is
 * verified in-browser under rules 24/32.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const whatIf = readFileSync(fileURLToPath(new URL("./WhatIf.vue", import.meta.url)), "utf8");
const hero = readFileSync(
  fileURLToPath(new URL("../../components/dashboard/FireHero.vue", import.meta.url)),
  "utf8",
);
const uiStore = readFileSync(fileURLToPath(new URL("../../stores/ui.ts", import.meta.url)), "utf8");

describe("shared retirement-age field — hero slider ⇄ What-If slider", () => {
  it("What-If's targetAge is backed by the shared ui field, not a page-local ref", () => {
    expect(whatIf, "must read the shared field").toMatch(/const shared = ui\.whatIfTargetAge/);
    expect(whatIf, "must write the shared field").toMatch(/set: \(next: number\) => ui\.setWhatIfTargetAge\(next\)/);
    expect(whatIf, "the old page-local ref must be gone").not.toMatch(/const targetAge = ref\(/);
  });

  it("the hero slider writes the SAME field", () => {
    expect(hero).toMatch(/ui\.setWhatIfTargetAge\(v\)/);
  });

  it("What-If clamps a hero value to its own floor/ceiling (never renders an impossible age)", () => {
    expect(whatIf).toMatch(/Math\.min\(ageCeiling, Math\.max\(ageFloor\.value, Math\.round\(shared\)\)\)/);
  });

  it("reset clears the shared field so BOTH sliders follow the saved plan again", () => {
    expect(whatIf).toMatch(/function resetTargetAge\(\)[\s\S]{0,200}ui\.setWhatIfTargetAge\(null\)/);
    expect(hero).toMatch(/function resetTargetAge\(\)[\s\S]{0,200}ui\.setWhatIfTargetAge\(null\)/);
  });

  it("the shared field is SESSION-ONLY — absent from the persisted blob and its watch list", () => {
    const pStart = uiStore.indexOf("function persist()");
    const persistFn = uiStore.slice(pStart, uiStore.indexOf("});", pStart));
    expect(persistFn, "persist() must not write whatIfTargetAge").not.toContain("whatIfTargetAge");
    const watchLine = uiStore.slice(uiStore.indexOf("watch(["), uiStore.indexOf("watch([") + 200);
    expect(watchLine, "the watch list must not include whatIfTargetAge").not.toContain("whatIfTargetAge");
    const shape = uiStore.slice(uiStore.indexOf("interface UiPersistedShape"), uiStore.indexOf("export interface QuickPrefs"));
    expect(shape, "UiPersistedShape must not declare whatIfTargetAge").not.toContain("whatIfTargetAge");
  });
});
