/**
 * #69 — source-scan lock for the shared "clear stale validation after a successful inline add"
 * mechanism (`useInlineAddForm` in `src/composables/useInlineAddForm.ts`).
 *
 * RCA: an inline add block whose fields carry Vuetify `:rules` re-validates a touched field
 * whenever the bound draft ref changes value — including the programmatic reset every
 * `addX()` performs right after a successful add. That showed "Name is required" / "Must be
 * > 0" on a form the user just used correctly. Class: every inline-add form under
 * `src/components/forms/*.vue` that binds `:rules` (8 files). Fix: wrap the add fields in
 * `<v-form ref="addForm">` and call `resetAfterAdd()` (which calls `addForm.value
 * ?.resetValidation()`) immediately after the draft reset in every add function.
 *
 * `EarnerSalaryForm.vue` is the one `:rules`-bearing file NOT in this lock — its `:rules` live
 * only in the pencil-edit `<v-dialog>`, which unmounts the fields entirely on close
 * (`editing.value = null`), so there is no persisted touched field to re-validate against a
 * stale value; it has no inline "add" flow.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const INLINE_ADD_FORMS = [
  "BusinessForm.vue",
  "InsurancePolicyForm.vue",
  "InvestmentForm.vue",
  "LoanForm.vue",
  "OtherIncomeForm.vue",
  "PlannedFutureForm.vue",
  "RecurringExpenseForm.vue",
];

function read(file: string): string {
  return readFileSync(fileURLToPath(new URL(`./${file}`, import.meta.url)), "utf8");
}

describe("inline add forms reset validation after a successful add (#69)", () => {
  it.each(INLINE_ADD_FORMS)("%s binds :rules on its add fields", (file) => {
    const src = read(file);
    expect(src).toMatch(/:rules="/);
  });

  it.each(INLINE_ADD_FORMS)(
    "%s wraps its add fields in <v-form ref=\"addForm\"> and calls the shared resetAfterAdd()",
    (file) => {
      const src = read(file);
      expect(src).toMatch(/import\s*\{\s*useInlineAddForm\s*\}\s*from\s*"@\/composables\/useInlineAddForm"/);
      expect(src).toMatch(/const\s*\{\s*addForm,\s*resetAfterAdd\s*\}\s*=\s*useInlineAddForm\(\)/);
      expect(src).toMatch(/<v-form\s+ref="addForm">/);
      expect(src).toMatch(/resetAfterAdd\(\);/);
    },
  );

  it("EarnerSalaryForm.vue has no inline-add flow, so it is deliberately excluded", () => {
    const src = read("EarnerSalaryForm.vue");
    // Its :rules are all inside the edit dialog, never an "add" block.
    expect(src).not.toMatch(/function addEarner|function addSalary/);
  });
});
