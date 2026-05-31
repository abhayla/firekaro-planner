# E2E Driving Forms That Use VeeValidate + defineField

Vue forms in FIREKaro that wire their fields through `useForm({ validationSchema })` + `defineField('name')` from `vee-validate` CANNOT be driven reliably via Playwright's `page.locator(...).fill()` alone. Playwright's synthetic `input` events do not propagate consistently through `defineField`'s reactive layer — especially for numeric inputs with `v-model.number`, which silently fail to coerce, stalling any downstream watcher, computed, or Zod validation chain.

The symptom is quiet and load-bearing: the form's submit handler `if (!isValid.value) return` short-circuits, no API POST fires, the dialog may or may not close, and the test times out waiting for a response that never came.

## MUST / MUST NOT

- MUST use the `pressSequentially` + `blur` pattern for every `<v-text-field type="number" v-model.number="…">` whose binding comes from `defineField`. A `fill()` alone is insufficient.
- MUST treat auto-calc watchers (like `watch([startDate, tenure], …)` that writes to another `defineField` ref) as non-firing from `fill()`. If the form has such a watcher, drive the inputs that feed it with `pressSequentially` and wait on the observable output (e.g. an "EMI Calculation — Maturity Date" summary value that leaves its initial `-` placeholder) before clicking submit.
- MUST NOT reach inside the form's JS state via `page.evaluate` to set `defineField` values directly — the vee-validate internal form state will be out of sync with the template refs and the submit will still fail validation.
- MUST NOT wait on dialog-not-visible as the submit signal for these forms. Some use `@click="onSubmit"` on the submit button where `handleSubmit(async v => {...})` fires the mutation asynchronously from the template. Use `page.waitForResponse()` inside `Promise.all([...])` with the click — same pattern as plain-ref forms.
- New forms in `src/components/**` SHOULD prefer plain `ref()` + `v-model` (see `GoalForm`, `InsurancePolicyForm`, `ExpenseForm`, `AddEmployerDialog`, the profile page) over `useForm` + `defineField` precisely because the plain pattern drives cleanly via `fill()`. Use vee-validate only when cross-field validation complexity genuinely warrants it.

## Canonical Workaround

```ts
// Reusable helper — drop inside the test or export from a shared utility.
const fillVVNumber = async (label: string, value: string) => {
  const field = page.getByLabel(label);
  await field.click();
  await field.fill("");                         // clear existing value
  await field.pressSequentially(value, { delay: 10 }); // per-char events
  await field.blur();                            // flush change handlers
  await page.waitForTimeout(100);                // let reactivity settle
};

// Use it for numeric inputs; text/date fields still use .fill().
await fillVVNumber("Principal Amount", "500000");
await fillVVNumber("Total Tenure (Months)", "240");
await page.getByLabel("Loan Start Date").fill("2026-04-21");
```

## When There's an Auto-Calc Watcher

`LoanForm.vue` has `watch([loanStartDate, tenure], ([s, t]) => { maturityDate.value = … })`. After filling the inputs that feed the watcher, wait on the observable render of the derived field before clicking submit:

```ts
await expect(
  page.locator(".v-dialog").getByText("Maturity Date").locator("..").locator("div").last(),
  "Auto-calculated Maturity Date must populate before Zod validation runs",
).not.toHaveText("-", { timeout: 5000 });
```

## Confirmed Forms Using This Pattern

As of 2026-04-21:

| Form | File | Notes |
|------|------|-------|
| LoanForm | `src/components/liabilities/LoanForm.vue` | vee-validate + watcher auto-calc for `maturityDate` |
| AssetForm | `src/components/investments/AssetForm.vue` | vee-validate, no watcher; submit button text is "Add" not "Add Investment" |
| CreditCardForm | `src/components/liabilities/CreditCardForm.vue` | vee-validate, plain fields |

Plain-ref forms (NO workaround needed; `fill()` is fine):

| Form | File |
|------|------|
| GoalForm | `src/components/fire/GoalForm.vue` |
| InsurancePolicyForm | `src/components/insurance/InsurancePolicyForm.vue` |
| ExpenseForm | `src/components/expenses/ExpenseForm.vue` |
| AddEmployerDialog | `src/components/salary/AddEmployerDialog.vue` |
| SalaryHistoryForm | `src/components/salary/SalaryHistoryForm.vue` (dead code — no consumers) |
| `/settings/profile.vue` | plain refs |

## Why This Rule Exists

The `/new-user-test-skill` B1 whole-app UI conversion hit this blocker twice (LoanForm, AssetForm) across 8 fix-loop iterations before landing the `pressSequentially` workaround. Without this rule, the next contributor doing UI E2E work would re-discover the same blocker and re-burn the same hours. Codifying the pattern once is cheap; re-discovering it is not.

## Related

- `rules/e2e-vuetify-timing.md` — Vuetify dialog/select/tab timing (applies regardless of form binding)
- `rules/e2e-hydration-signal.md` — post-navigation waits (use networkidle + page-specific waitFor, not the stale hydration signal across SPA navs)
- `.claude/skills/new-user-test-skill/learnings.md` 2026-04-21 entries — full diagnosis trail
