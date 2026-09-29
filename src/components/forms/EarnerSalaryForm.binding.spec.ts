/**
 * #223 round 3 — binding lock for the "My salary has EPF" control added to
 * `EarnerSalaryForm.vue`'s edit dialog. Same dep-free source-scan pattern as the dashboard
 * binding specs (no DOM/@vue/test-utils in this node test env): pins that the control is
 * actually bound to `editing.hasEpf` (not a local-only checkbox nobody saves), so an edit can
 * never silently drop the binding while other specs stay green.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = readFileSync(fileURLToPath(new URL("./EarnerSalaryForm.vue", import.meta.url)), "utf8");
const template = src.slice(src.indexOf("<template>"));

describe("EarnerSalaryForm binding locks — #223 hasEpf", () => {
  it("renders a yes/no control bound to editing.hasEpf", () => {
    expect(template).toMatch(/v-btn-toggle[\s\S]{0,40}v-model="editing\.hasEpf"/);
    expect(template).toMatch(/data-testid="salary-has-epf-yes"[\s\S]{0,20}:value="true"|:value="true"[\s\S]{0,20}data-testid="salary-has-epf-yes"/);
    expect(template).toMatch(/data-testid="salary-has-epf-no"[\s\S]{0,20}:value="false"|:value="false"[\s\S]{0,20}data-testid="salary-has-epf-no"/);
  });

  it("saveEdit() persists hasEpf via updateMember — it is not display-only", () => {
    expect(src).toMatch(/hasEpf:\s*editing\.value\.hasEpf/);
  });

  it("the read-only take-home strip's derivation is passed the current hasEpf", () => {
    expect(src).toMatch(/deriveTakeHomeFor\([^)]*hasEpf\.value\)/);
  });
});
