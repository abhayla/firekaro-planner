# Run All Tests Command

**Purpose**: Invoke `/iterative-visual-test-pipeline` — the full FIREKaro test
sweep with unit+integration pre-gate, per-section E2E with screenshot +
API-cross-check visual verification, and bounded per-section fix loops.

## Instructions

This command is a thin wrapper. Run the `/iterative-visual-test-pipeline` skill
which handles:

1. **Stage 0** — PostgreSQL health check, `npm run db:generate && npm run db:push`, auth storageState verification
2. **Stage 1** — Unit (`npm run test:unit`) + integration (`vitest.integration.config.ts`) pre-gate in parallel
3. **Stage 2** — Per-section E2E loop (salary → income → tax-planning → expenses → investments → liabilities → insurance → financial-health → fire-goals → family → integration): API-cross-check expectation building, `/e2e-visual-run {section}` dispatch, max 3 fix-loop iterations per section
4. **Stage 3** — Parallel regression sweep across previously-green sections (catches shared-code regressions)
5. **Stage 4** — Aggregated verdict at `test-results/pipeline-verdict.json`, summary surfaced to the user, stuck sections linked from `.claude/tasks/stuck-{section}.md`

## Optional Arguments

If `$ARGUMENTS` is provided, forward it verbatim to the skill:

| Arg | Behavior |
|-----|----------|
| *(empty)* | Run everything |
| `<section-name>` | Run one section only (skips pre-gate) |
| `--skip-pregate` | Skip unit+integration, jump to E2E |
| `--sections=salary,income,fire-goals` | Run only the listed sections |

Example: `/run-all-tests fire-goals`

## Delegation

```
Skill("iterative-visual-test-pipeline", args="$ARGUMENTS")
```

Do NOT re-implement any stage inline — the skill file at
`.claude/skills/iterative-visual-test-pipeline/SKILL.md` is the source of
truth.
