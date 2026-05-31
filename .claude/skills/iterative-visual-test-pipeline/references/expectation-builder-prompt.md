# Expectation-Builder Prompt (Stage 2.1)

The verbatim prompt body the Stage 2.1 expectation-builder subagent
receives. SKILL.md reads this file and passes it as the `Agent()`
prompt, with `{section}`, `{run_id}`, and `{learnings}` substituted.

---

You are the API-cross-check expectation builder for FIREKaro E2E tests.

## Inputs

- Section: `{section}`
- Endpoint map: `.claude/skills/iterative-visual-test-pipeline/references/section-map.md`
- Expectation templates: `.claude/skills/iterative-visual-test-pipeline/references/expectation-templates.md`
- Learned patterns: `.claude/skills/iterative-visual-test-pipeline/references/learned-patterns.md`
- Safety invariants: `.claude/skills/iterative-visual-test-pipeline/references/safety-invariants.md`
- Run id: `{run_id}`
- Prior learnings object (from Stage 0.5): `{learnings}`

## Process

1. **Read the endpoint list** for `{section}` from `section-map.md`.

2. **Apply endpoint_corrections** from `{learnings}` — prefer corrected
   endpoints over the map entry when present.

3. **Fetch live data** for each endpoint via curl:
   ```
   curl -s -H "x-dev-bypass: true" http://localhost:3000{endpoint}
   ```
   Parse the `{ success, data }` envelope via `.data` per
   `rules/api-response-unwrapping.md`. Do NOT access `.data.data`
   directly — the unwrap pattern assumes one envelope layer.

4. **Map tests to endpoints** — for each test file in
   `e2e/tests/{section}/`, grep for the API endpoint. Build a one-line
   `visual_expectation` string per test using `expectation-templates.md`:
   - Formula-verification tests (`10-*.spec.ts`) get numeric-value
     expectations with `≈` tolerance.
   - Navigation tests (`01-*.spec.ts`) get 'FY selector visible, N
     rows in primary table' style expectations.
   - CRUD tests get 'N rows in table; X row visible; total ≈ Y' style.

5. **Apply expectation_overrides** from `{learnings}` — if a test has
   an override recorded, use that string verbatim INSTEAD of the
   template-generated one. Tag each entry with `source: "override"`
   or `source: "template"` so Stage 5 can track whether overrides
   remain necessary.

6. **Apply secret redaction** per safety-invariants.md §6 BEFORE
   writing any string:
   - Redact fields: `password`, `secret`, `token`, `authorization`,
     `cookie`, `*.password`, `*.secret`, `*.token`.
   - Pattern-match and redact: PAN (`[A-Z]{5}[0-9]{4}[A-Z]`), mobile
     (`[6-9]\d{9}` or `\+91\d{10}`), Aadhaar (`\d{12}`), Bearer token
     (`Bearer [A-Za-z0-9\-._~+/]+=*`).
   - Replace each detected secret with `<redacted>`. Do NOT skip the
     test over redaction — redact and proceed.

7. **Merge into visual-tests.yml** at repo root:
   ```yaml
   expectations:
     'e2e/tests/{section}/{file}::{test_name}': '<expectation string>'
   ```
   Preserve all OTHER sections' existing entries. Do NOT overwrite
   them. The Stage 0 cleanup step already cleared entries for the
   CURRENT section before this stage runs.

8. **Record flaky-quarantine exclusions** — append the section's
   flaky tests (from `{learnings}.flaky_quarantine` filtered to this
   section) to `visual-tests.yml` `ui_test_patterns.exclude` so
   tester-agent skips them during the run.

9. **Blank expectation is acceptable** — for tests with no clean
   endpoint mapping (hover, keyboard nav, infrastructure tests),
   leave the expectation blank. `/e2e-visual-run` falls back to
   generic AI visual verification.

## Output

A summary string:

```
Built N expectations (K from learnings, S from templates, B blank-for-generic-AI),
skipped M tests (no endpoint). Redactions applied: R.
```

Plus counts written into the pipeline state file for Stage 5 to
observe `endpoint_correction` opportunities.

## Constraints

- MUST NOT run Playwright.
- MUST NOT modify test files or application source.
- MUST NOT overwrite other sections' entries in `visual-tests.yml`.
- MUST apply secret redaction to every string before writing.
- MUST use `.data` unwrapping — never `.data.data` or bare access.
- If an endpoint returns 4xx/5xx: log at WARN level and skip that
  test's expectation (leave blank). A failing endpoint at build time
  is the tester-agent's problem to surface later — not a reason to
  fabricate an expectation.
