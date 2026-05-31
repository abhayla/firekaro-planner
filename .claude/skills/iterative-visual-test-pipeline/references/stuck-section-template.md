# Stuck Section Handover Template

When a section exhausts its 3-attempt fix-loop budget (Stage 2.3) or the
regression sweep (Stage 3) finds an un-recoverable failure, write
`.claude/tasks/stuck-{section}.md` using this template and continue to the
next section. Do NOT block the whole pipeline on one stuck section.

## File Naming

```
.claude/tasks/stuck-{section}.md
```

Examples: `stuck-tax-planning.md`, `stuck-fire-goals.md`.

Overwrite any existing file — the most recent run is the relevant one. The
pipeline's `test-results/pipeline-verdict.json` surfaces the link so users
can find every stuck section from one place.

## Template

```markdown
# Stuck Section: {section}

**Run ID:** {run_id}
**Timestamp:** {ISO-8601}
**Attempts used:** 3 of 3 (+ {N} bonus from regression sweep, if any)
**Pipeline status:** failing — moved on to next section

## Summary

{One-line summary of the apparent blocker — e.g., "3 tests fail at the same
assertion on `/api/fire/metrics` returning an empty `fireNumber` field.
Backend may be missing seed data."}

## Failing Tests

| Test | Last Error | Category (from test-failure-analyzer) |
|------|------------|----------------------------------------|
| `e2e/tests/{section}/10-formula-verification.spec.ts::verify FIRE number` | Expected FIRE number > 0, got 0 | ASSERTION_FAILURE |
| `e2e/tests/{section}/25-cross-page-consistency.spec.ts::FIRE matches invest` | Timeout waiting for `.fire-card` | TIMING |
| ... | ... | ... |

## Fix Attempts

### Attempt 1 — {timestamp}
**Approach:** {what fix-loop tried — e.g., "Increased `waitForTimeout` in BasePage"}
**Files touched:** `e2e/pages/base.page.ts`
**Result:** Same 3 tests still fail with same errors
**Confidence:** MEDIUM (0.6)

### Attempt 2 — {timestamp}
**Approach:** {e.g., "Changed selector from `.v-card` to `[data-testid=fire-card]`"}
**Files touched:** `e2e/tests/fire-goals/10-formula-verification.spec.ts`
**Result:** New error — selector still not found
**Confidence:** LOW (0.4)

### Attempt 3 — {timestamp}
**Approach:** {e.g., "Added `data-testid` attribute to FireCard.vue"}
**Files touched:** `src/components/fire/FireCard.vue`
**Result:** Selector found but value is still 0
**Confidence:** LOW (0.3)

## Last Screenshots

- Functional pass / visual fail: `test-evidence/{run_id}/screenshots/10-formula-verification_verify_FIRE_number.pass.png`
- Functional fail: `test-evidence/{run_id}/screenshots/10-formula-verification_verify_FIRE_number.fail.png`

Open these locally to see what the AI verifier saw.

## Root Cause Hypothesis

{What the AI currently thinks is the real problem — distinct from the fix
attempts, which all failed. Common patterns:

- **Data-missing:** test expects data that seed scripts don't generate
- **Schema drift:** Prisma model changed but test still uses old shape
- **Async race:** hydration completes but API response hasn't landed
- **Endpoint contract change:** API now returns paginated envelope but test
  expects raw array
- **Feature half-implemented:** backend returns 404 because endpoint doesn't
  exist yet (mark test.fixme instead of fighting it)}

## Recommended Human Action

Ordered by likely-fastest-unblock:

1. {e.g., "Run `npx tsx prisma/seed.ts` to seed FIRE baseline data — the
   test assumes a populated investments table."}
2. {e.g., "Check if `GET /api/fire/metrics` returns the new `fireNumber`
   field — it may have been renamed to `targetCorpus` in the latest migration."}
3. {e.g., "If this is a known-incomplete feature, mark the 3 tests with
   `test.fixme()` and note in the issue tracker."}

## Files Modified During Fix Attempts

These changes were applied during the 3 attempts and may need to be
reverted or kept depending on the actual fix:

- `e2e/pages/base.page.ts` — wait increased (probably revert)
- `e2e/tests/fire-goals/10-formula-verification.spec.ts` — selector changed (probably revert)
- `src/components/fire/FireCard.vue` — `data-testid` added (probably keep — good practice)

Use `git diff` or `git log` to review exact changes.

## Next Step for the Pipeline

This section is marked FAILED in `test-results/pipeline-verdict.json`. The
pipeline moved on to the next section and the final verdict will reflect
this failure. Once you've manually diagnosed and fixed the underlying issue,
re-run:

```
/iterative-visual-test-pipeline {section}
```

to verify the section goes green on its own.
```

## Writing Rules

- MUST include `run_id` so the screenshots can be matched back to the
  correct evidence archive (old run_ids may have been cleaned).
- MUST list every file touched during fix attempts — future-you needs to
  know what the pipeline changed that may need reverting.
- MUST state a root-cause hypothesis distinct from the fix attempts.
  "Tried X, Y, Z, all failed" is not enough — the user needs a pointer to
  where to look next.
- MUST NOT mark a test `test.fixme()` from within the pipeline. That's a
  human decision requiring intent — the pipeline only writes the handover.
- MUST NOT delete the stuck file at the end of the run. It's the audit
  trail for the next invocation.
- SHOULD link the exact failing screenshot paths so the user can open them
  directly without searching.
- SHOULD name specific files or functions the user should check, not vague
  advice. "Check the endpoint" is weak. "Check `server/routes/fire-metrics.ts`
  line 42 where the `fireNumber` field is computed" is strong.
