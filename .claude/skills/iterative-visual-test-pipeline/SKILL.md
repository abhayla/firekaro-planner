---
name: iterative-visual-test-pipeline
description: >
  Run the full FIREKaro test pyramid in a single invocation: unit + integration
  pre-gate (headless Vitest), then section-by-section E2E (Playwright) with
  per-test screenshots, API-cross-check multimodal verification, and bounded
  fix-loop iteration (max 3 attempts per section). Each E2E test is dual-gated
  on functional exit code AND visual verification of actual on-screen data
  against live API values. Use when you need a complete green-suite sweep or
  post-refactor verification. NOT for one-off single-test debugging
  (use /fix-loop), E2E-only without the pre-gate (use /e2e-visual-run), or
  unit/integration alone (use `npm run test:unit` directly).
triggers:
  - run all tests
  - iterative test pipeline
  - test everything with screenshots
  - full test sweep
  - run all tests iteratively
  - section-by-section test verification
  - headless test pipeline with screenshots
type: workflow
allowed-tools: "Bash Read Write Edit Grep Glob Skill Agent"
argument-hint: "[section-name] [--skip-pregate] [--sections=s1,s2,...] [--no-learn | --no-load-learnings | --no-extract-learnings] [--max-duration-minutes=N] [--no-auto-prereqs]"
version: "1.3.0"
---

# Iterative Visual Test Pipeline

Full-stack test orchestration with dual-gated E2E verification (functional +
multimodal visual + API cross-check), bounded per-section fix loops, and a
single aggregated verdict. This skill is a **thin orchestrator** — it
delegates E2E execution to `/e2e-visual-run` and fix iteration to `/fix-loop`,
adding only: unit+integration pre-gate, per-section API cross-check
expectation synthesis, and cross-section aggregation.

**Input:** `$ARGUMENTS`

| Argument | Behavior |
|----------|----------|
| *(none)* | Run all sections in default order |
| `<section-name>` | Run one section only (skips pre-gate unless `--pregate` also passed) |
| `--skip-pregate` | Skip unit+integration, jump straight to E2E |
| `--sections=salary,income,fire-goals` | Run only the listed sections |
| `--no-learn` | Skip Stage 0.5 (don't apply prior learnings) and Stage 5 (don't extract new learnings) — use when diagnosing the skill itself |
| `--no-auto-prereqs` | Refuse to auto-start Postgres / auto-install Playwright; expect them to be ready. Use in CI or paranoid environments. |

## Prerequisites (Stage 0)

All operational safety invariants (argument parsing, lockfile, wall-time
ceiling, signal handling, CI-mode branching, secret redaction, safe
db:push, cleanup rules) are specified in
`references/safety-invariants.md` — read that file at stage start and
apply every numbered invariant. Steps below summarize the ordering.

1. **Step 0.1 — Parse `$ARGUMENTS`** into flags dict per safety-invariants.md §1.
   Honour `--no-learn`, `--no-load-learnings`, `--no-extract-learnings`,
   `--max-duration-minutes=N`, `--skip-pregate`, `--sections=`, positional section.
2. **Step 0.2 — Acquire lockfile** `.pipeline/iterative-pipeline.lock`
   per §2. Skip on `flags.ci`. Register cleanup on exit.
3. **Step 0.3 — Install signal handlers** for SIGINT/SIGTERM per §4.
4. **Step 0.4 — Set deadline** = now + `flags.max_duration_minutes * 60`
   per §3. Check against deadline before every stage dispatch.
5. **Step 0.5 — PostgreSQL auto-start** per safety-invariants.md §5.
   Probe via `pg_isready`. If down AND `flags.no_auto_prereqs/ci` is
   false, try the 4-strategy auto-start sequence (docker-compose →
   named docker container → Windows service → local pg_ctl). Wait up
   to 30s after each attempt for `pg_isready` OK. STOP only if all 4
   strategies exhaust, surfacing what was tried and specific error
   messages. In CI / no-auto-prereqs mode, STOP immediately if down.
5a. **Step 0.5a — Playwright install guard** per safety-invariants.md
    §5a. If `node_modules/@playwright/test/package.json` missing → run
    `npm install`. If chromium browser missing → run
    `npx playwright install chromium`. Both gated on
    `flags.no_auto_prereqs/ci` — skip auto-install in those modes.
6. **Step 0.6 — Prisma client safety** — `npm run db:generate` always.
   Then `npx prisma migrate status` — apply `db:push` ONLY if drift is
   absent or purely additive per safety-invariants.md §5. On destructive
   drift, STOP with a message telling the user to run migrations manually.
   On `flags.ci`, SKIP `db:push` entirely (CI seeds DB separately).
7. **Step 0.7 — Stale-artifact cleanup** per §10:
   - Remove `.pipeline/dev-server.pid` if stale (process dead).
   - Remove `test-results/*.json` from prior run.
   - Remove `test-evidence/*` directories except the 3 most recent.
   - Clear the `expectations:` block in `visual-tests.yml`, THEN re-seed it
     from the committed template at `e2e/visual-tests.template.yml`
     (Layer 2 contract — persistent structural row-count expectations
     that MUST survive run-to-run; Stage 2.1 appends dynamic data-driven
     entries on top). If the template file does not exist (legacy clone),
     log a one-line warning and proceed with an empty expectations block.
     The merge MUST preserve YAML structure (use a yaml-aware parser, not
     line concatenation).
   - **DO NOT remove** `.pipeline/last-verdict.json` — it is the stability-gate
     input from the prior `/goal` iteration. Stage 4 step 5b reads it.
     Deleting it would force every iteration into `stability_gate: "pending"`
     and `/goal` could never terminate.
8. **Step 0.8 — Dev server health** — delegated to `/e2e-visual-run`
   Step 0 (webServer config). This skill does NOT manage dev servers
   directly.
9. **Step 0.9 — Auth storageState** — verify `e2e/.auth/user.json`
   exists. If missing, run `npx tsx e2e/ci-auth-setup.ts`.
10. **Step 0.10 — Evidence directories** — `mkdir -p test-results test-evidence`.
    Generate `run_id` = `{ISO-8601}_{7-char-git-sha}` (replace `:` with
    `-`). Write state file `.pipeline/iterative-pipeline-run.json`:
    ```json
    { "run_id": "...", "flags": {...}, "deadline": "...",
      "stages": {}, "sections": {}, "started_at": "..." }
    ```

## Stage 0.5 — Load Prior Learnings

Skip entirely if `flags.no_load_learnings` is true (set by `--no-learn`
or `--no-load-learnings`).

Read the four cross-run memory files and hold them in pipeline state for
downstream stages to consume. Missing files are fine — a fresh install
has no learnings. Do NOT create files that don't exist yet; they'll be
written by Stage 5 on the first learnable run.

1. **`.pipeline/test-history.json`** — sliding-window pass/fail per test,
   used for flakiness scoring. Maintained by `/e2e-visual-run` Stage 6;
   this skill consumes it read-only.
2. **`.pipeline/pipeline-learnings.jsonl`** — raw append-only log of
   observations from prior Stage 5 runs. Read all entries; newest first.
3. **`references/learned-patterns.md`** — the curated, promoted patterns
   (entries seen 3+ times with 80%+ consistency). This is the primary
   source-of-truth Stage 2 consumers read.
4. **`.claude/tasks/lessons.md`** — project-wide lessons per
   `.claude/rules/claude-behavior.md` rule 5. Scan for entries tagged
   `[test-pipeline]` and apply.

Build an in-memory `learnings` object with these fields — pass to every
Stage 2 subagent dispatch:

```json
{
  "flaky_quarantine": [<test_ids from learned-patterns.md section 1>],
  "expectation_overrides": {<test_id -> override_string>},
  "preferred_fix_strategies": {<"classification+section" -> strategy>},
  "endpoint_corrections": {<section -> [<correction>]>},
  "baseline_ready": {<test_id -> baseline_path>},
  "noise_filter": [<pattern strings to ignore at extraction>]
}
```

Log a one-line summary at stage start: `"Loaded N flaky-quarantined tests,
M expectation overrides, K preferred fix strategies from prior runs."`

If ALL memory files are missing or empty, log `"Cold start — no prior
learnings available."` and proceed with an empty `learnings` object.

## Stage 1 — Unit + Integration Pre-Gate (parallel, headless)

Skip entirely if `--skip-pregate` or if a specific section was given without
`--pregate`. Otherwise dispatch two subagents in parallel via a single message
with two `Agent()` tool calls:

```
Agent("tester-agent", prompt="Run `npm run test:unit` from repo root.
Write structured result to test-results/vitest-unit.json per the schema in
.claude/rules/testing.md. Do not attempt fixes — report verdict only.
Return: { result, total, passed, failed, skipped, failures[] }.")

Agent("tester-agent", prompt="Run `npx vitest -c vitest.integration.config.ts`
from repo root. Integration tests require a running PostgreSQL and backend;
verify both before running. Write test-results/vitest-integration.json per
the schema in .claude/rules/testing.md. Report verdict only.")
```

Both agents are T3 workers (no further subagent dispatch). Wait for both
returns.

**Gate evaluation:**
- Both `result: PASSED` → proceed to Stage 2
- Either FAILED → dispatch `/fix-loop` (max 3 iterations) against the failing
  suite using the failure output from the tester-agent's return. Re-run the
  pre-gate after each fix attempt. After 3 failed attempts, write
  `.claude/tasks/stuck-pregate.md` and STOP — do not proceed to E2E. Unit
  failures almost always block E2E, so fixing them first is always correct.

**Pre-gate regression guard** (safety-invariants.md §8): track files
modified during any fix-loop iteration. If ANY modified path matches
`^(src|server|prisma)/`, run one final pre-gate pass (both suites) with
a fresh 3-iteration budget before advancing to Stage 2. A unit-test fix
touching shared code can break integration or introduce a build error —
catching it here saves hours of E2E cycles downstream.

Update `.pipeline/iterative-pipeline-run.json` stage status after each gate.

## Stage 2 — Per-Section E2E Loop

Default order (read from `references/section-map.md`):

```
[ salary, income, tax-planning, expenses, investments, liabilities,
  insurance, financial-health, fire-goals, family, integration ]
```

`--sections=` overrides this order and list.

For each section **sequentially** (sections depend on shared state — see
`rules/e2e-test-organization.md`):

**Data-dependency precheck** (safety-invariants.md §9): before invoking
Stage 2.1 for any section, check if any of its upstream sections (per
the dependency graph in §9) are in state `stuck` or `failed`. If so:
record `{ result: "SKIPPED", reason: "upstream_dependency_failed: {upstream}" }`
for this section in the pipeline state file and move to the next
section. Running a downstream section against missing data pollutes
the learnings log with false classifications.

### Stage 2.1 — Build API-Cross-Check Expectations

Dispatch a subagent to build `visual-tests.yml` entries for this section's
E2E tests using live API values. This is the NEW logic the skill adds over
`/e2e-visual-run`. The verbatim prompt body lives in
`references/expectation-builder-prompt.md` — read it first, then pass it
to the agent with `{section}`, `{run_id}`, and `{learnings}` substituted:

```
prompt_body = read_file(".claude/skills/iterative-visual-test-pipeline/references/expectation-builder-prompt.md")
prompt = prompt_body.replace("{section}", section).replace("{run_id}", run_id)
       + "\n\nLearnings object:\n" + json.dumps(learnings)
Agent("general-purpose", prompt=prompt) → T3 expectation-builder
```

The prompt file specifies the 9-step process (endpoint fetch,
test-to-endpoint mapping, override application, secret redaction, yaml
merge, flaky exclusion) and explicit constraints (no Playwright, no
source edits, no overwriting other sections, mandatory redaction).

### Stage 2.2 — Run /e2e-visual-run for the Section

Apply flaky-quarantine from prior learnings BEFORE delegating.
`/e2e-visual-run` does not accept a custom `--exclude-pattern` flag;
instead, it respects `visual-tests.yml`'s `ui_test_patterns.exclude`
list (tester-agent reads this per its UI Test Detection contract).
Write the section's quarantined test files into that list:

```
# Merge — preserve other sections' existing exclude entries.
visual_tests_yml.ui_test_patterns.exclude += [
  entry.test_id for entry in learnings.flaky_quarantine
  if entry.test_id.startswith("e2e/tests/{section}/")
]
```

The exclude list uses glob/pattern matches against test file paths, not
test titles. For title-level exclusion of a specific test within a file,
set the env var `PLAYWRIGHT_GREP_INVERT` (read by `playwright.config.ts`)
to a `|`-joined title pattern:

```
export PLAYWRIGHT_GREP_INVERT="<title1>|<title2>"
```

Then delegate the actual E2E execution:

```
Skill("e2e-visual-run", args="{section}")
```

This handles: framework detection, dev-server startup, per-test screenshot
capture, a11y tree capture, dual-signal verification (a11y + screenshot AI),
confidence-gated healing, and `test-results/e2e-pipeline.json` output. The
per-test attempt cap (3) and global retry budget (15) are read from
`.claude/config/e2e-pipeline.yml`.

`/e2e-visual-run` reads `visual-tests.yml` entries written in Stage 2.1 and
passes them to `/verify-screenshots` via the text-hint strategy. If
`{learnings}.baseline_ready` lists a baseline for a test, pass the
baseline path too — `/verify-screenshots` priority is baseline > text
hint > generic AI, so baselined tests skip the multimodal call entirely
(cheaper and more deterministic).

### Stage 2.3 — Section-Scoped Iteration Budget

`/e2e-visual-run` uses a GLOBAL retry budget of 15. For a section-scoped cap,
wrap the invocation in an attempt counter at this skill level:

```
section_attempts = 0
while section_attempts < 3:
  result = Skill("e2e-visual-run", args="{section}")
  if result.result == "PASSED":
    commit_checkpoint("test({section}): all tests green with screenshot verification")
    break
  if result.result == "NEEDS_REVIEW":
    # intentional visual changes — surface to user, do not auto-heal
    write_handover(section, "visual-changes-need-baseline-update")
    break
  section_attempts += 1
  if section_attempts == 3:
    write_handover(section, "exhausted-attempts")
```

**Learning-informed fix prioritization:** When `/e2e-visual-run` internally
invokes `/fix-loop`, we want fix-loop to prefer strategies known to work
for this (classification, section) pair. Write the relevant entries from
`{learnings}.preferred_fix_strategies` to `.pipeline/fix-hints.json`
BEFORE each attempt — fix-loop reads this file (if present) to bias
its classification-to-strategy routing. Example contents:

```json
{
  "section": "fire-goals",
  "hints": [
    {"classification": "TIMING", "try_first": "wait for /api/fire/metrics response before asserting on card"},
    {"classification": "DATA", "try_first": "re-run 00-data-setup.spec.ts before fixing test code"}
  ]
}
```

Each attempt in the section loop MUST still try a DIFFERENT approach per
`.claude/rules/testing.md`, so if the preferred strategy fails on attempt
1, attempt 2 picks the next-best strategy, and so on. The hints are a
starting preference, not a straitjacket.

The in-skill counter is ADDITIVE to the global budget — whichever is hit first
triggers escalation. Write section state back to
`.pipeline/iterative-pipeline-run.json` after each attempt.

### Stage 2.4 — Stuck Section Handover

When a section exhausts 3 attempts, the section enters the **TRULY_STUCK
escalation chain** (Layer 5 of the autonomous /goal loop). Do NOT immediately
write a stuck handover and continue. Instead:

**Step 2.4a — One /systematic-debugging dive before declaring TRULY_STUCK**:

After 3 /fix-loop dispatches exhaust without resolving the section's failures,
dispatch `/systematic-debugging` ONCE with the section's accumulated failure
context (failing tests, last fix-loop diagnoses, files touched, screenshot
paths). The deeper-diagnosis skill performs root-cause analysis that /fix-loop's
attempt-based retry doesn't reach:

```
Skill("systematic-debugging", args="<section> + full failure context + prior
3-fix-loop diagnoses + .claude/tasks/lessons.md tagged [test-pipeline]")
```

Outcomes:
- **/systematic-debugging produces a fix and the section now passes** → mark
  the section `result: PASSED`, set `attempts` to (3 + N + 1) where N is the
  systematic-debugging iteration count. Section advances normally.
- **/systematic-debugging cannot resolve** → mark the section
  `result: TRULY_STUCK`, write `.claude/tasks/stuck-{section}.md`, continue
  to the next section.

The `TRULY_STUCK` state is distinct from any transient `STUCK`/`FAILED` state
during the loop. Only `TRULY_STUCK` survives across /goal turns as "this
section was tried and the autonomous loop genuinely cannot fix it."

**Step 2.4b — Stuck handover content** (only written when TRULY_STUCK):

`.claude/tasks/stuck-{section}.md` uses `references/stuck-section-template.md`
with these sections populated:

- Last failing tests with error output
- Last screenshot paths (`test-evidence/{run_id}/screenshots/...`)
- /fix-loop diagnoses across all 3 dispatches
- /systematic-debugging diagnosis (the deeper one)
- Files touched during fix attempts (`attempts: N` total)
- Recommended next human action

**Continuation invariant**: MUST advance to the next pending section after
writing the TRULY_STUCK handover. The autonomous /goal loop reads the verdict's
section status NOT-equal to `PASSED` AND NOT-equal to `TRULY_STUCK` to pick
the next section. TRULY_STUCK sections do NOT re-enter the queue on subsequent
/goal turns — they're terminal until human intervention.

### Stage 2.5 — Per-Section Commit Checkpoint

After a section goes green:

1. **Stuck-file cleanup** (safety-invariants.md §10): if
   `.claude/tasks/stuck-{section}.md` exists from a prior run, delete
   it — the section just proved green, the old handover is misleading.

2. **fix-hints cleanup**: delete `.pipeline/fix-hints.json` so the next
   section doesn't read stale hints.

3. **Commit checkpoint** (local, only when `flags.ci == False`):

   ```bash
   git add -A
   git commit -m "test({section}): all tests green with screenshot verification

   run_id: {run_id}
   tests: N passed (M screenshot-verified, K exit-code-verified)
   visual-tests.yml expectations: {expectation_count}

   Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
   ```

   Skip the commit on CI (safety-invariants.md §7) — CI runs on detached
   HEAD and auto-commits would not persist.

Do NOT push. Do NOT amend. One commit per green section (local only).

## Stage 3 — Regression Re-Run (safety net)

After the section loop finishes, shared-code fixes (`src/utils/**`,
`server/lib/**`, `src/types/**`) may have silently broken earlier-green
sections. Run a sequential, functional-only regression sweep.

**Workers MUST be 1** per `rules/e2e-vuetify-timing.md` and
`playwright.config.ts` — tests share data seeded by
`00-data-setup.spec.ts` and will race with higher concurrency. Do NOT
override `workers` in this stage.

```
Agent("tester-agent", prompt="Run `npx playwright test e2e/tests/
--workers=1 --reporter=json` (all green sections, no screenshot capture,
functional gate only). Read the list of green sections from
.pipeline/iterative-pipeline-run.json — do not re-run stuck or skipped
sections. Write test-results/e2e-regression.json. Return a diff of
sections that were green but now fail.")
```

For each regressed section (if multiple), route back to Stage 2 with
ONE bonus iteration each — so a single section can reach at most 4
total attempts (3 in Stage 2 + 1 in Stage 3 rescue). If the bonus
iteration still fails, promote the section's status from `green` to
`stuck` and write/overwrite its handover file.

## Stage 4 — Final Report

Aggregate using the script from `.claude/rules/testing.md` "Stage Gate Usage":

1. Read every file under `test-results/*.json` (unit, integration, each
   section's `e2e-pipeline.json`, regression sweep).
2. Read `test-evidence/{run_id}/visual-review.json` for visual verdicts.
3. Compute the UNION of failures across all skills — if ANY `result: FAILED`,
   pipeline verdict is FAILED.
4. Check for contradictions per `testing.md` (functional PASSED but screenshot
   FAILED → NOT a contradiction, visual is authoritative for UI tests).
5. Write `test-results/pipeline-verdict.json` per the exact schema in
   `references/verdict-schema.md` (fields: pipeline, run_id, result,
   abort_reason, pregate, sections, regression_sweep,
   regression_bonus_iterations_used, duration_ms, deadline_exceeded,
   ci_mode, learnings_applied, learnings_extracted, learnings_summary,
   plus the Layer-3 `/goal`-termination signals: `safe_to_terminate`,
   `escalation_present`, `stability_gate`).
   Never omit fields — use zero/empty defaults. Secrets already
   redacted at source; Stage 4 also scrubs any error_snippet fields
   through the redactor per safety-invariants.md §6.

5a. **Compute `escalation_present`** — glob `.claude/tasks/stuck-*.md`
    that were written or modified during THIS run (compare mtime to the
    pipeline start_time recorded in `.pipeline/iterative-pipeline-run.json`).
    Set `escalation_present: true` if any match; `false` otherwise.
    This signal lets `/goal` short-circuit without re-globbing every turn.

5b. **Compute `stability_gate`** — required for `/goal`-driven autonomous
    loops per `docs/Test-Pipeline-Termination-Criteria.md`. NOW Layer-5
    smart stability semantics (after Q4 decision 2026-05-16):

    Compute the set of "fixed sections" — sections whose `attempts > 1`
    (i.e., /fix-loop or /systematic-debugging was dispatched):

    ```
    fixed_sections = { name for name, s in sections.items()
                       if s.get("attempts", 0) > 1 and s["result"] == "PASSED" }
    ```

    Then determine `stability_gate`:

    - **First run** (no `.pipeline/last-verdict.json`) → `stability_gate: "pending"`
    - **All 16 sections PASSED on this turn AND `fixed_sections` is non-empty
      AND no prior smart rerun completed yet** → `stability_gate: "pending_smart_rerun"`,
      surface `fixed_sections` list in the verdict so the next /goal turn
      knows which sections to re-test
    - **`stability_gate` was `"pending_smart_rerun"` on the prior turn AND
      the just-rerun section still PASSED** → remove this section from
      the persisted `fixed_sections` list. If the list is now empty,
      promote `stability_gate: "passed"`. If non-empty, keep
      `stability_gate: "pending_smart_rerun"` for the next turn.
    - **`stability_gate` was `"pending_smart_rerun"` AND the just-rerun
      section regressed (now FAILED)** → mark section result FAILED,
      reset `stability_gate: "pending"`, the section re-enters the fix
      queue on the next turn.
    - **All 16 sections PASSED AND `fixed_sections` is empty (everything
      passed first-try)** → `stability_gate: "passed"` (no rerun needed).
    - **Anything else** → `stability_gate: "failed"`.

    The `fixed_sections` field is persisted in `pipeline-verdict.json` AND
    `.pipeline/last-verdict.json` so cross-turn state survives.

    Pure section-result comparison (ignoring `attempts` and counts) is the
    diff basis for `pending` vs `failed`. The smart rerun mechanic
    REPLACES the old "two-consecutive-identical-PASSED-runs" gate from
    Layer 3, which was N-fold redundant for sections that passed clean.

5c. **Compute `safe_to_terminate`** — AND of these conditions:

    1. Every `sections.{s}.result == "PASSED"` (no STUCK / SKIPPED / FAILED).
       `TRULY_STUCK` sections do NOT count as PASSED — they prevent
       termination via condition #1, and `safe_to_terminate` remains
       false. /goal reports the escalation report and may continue
       iterating other sections or terminate-with-escalation per its
       outer condition.
    2. `regression_sweep == "PASSED"` (or `"SKIPPED"` only when Stage 3
       was bypassed by explicit config — log a warning if so).
    3. `visual_review.overrides.length == 0` (advisory `flags` don't count).
    4. `escalation_present == false`.
    5. `stability_gate == "passed"`.
    6. **Layer-5 addition**: `elapsed_hours < 48` (wall-clock cap).

    Set `safe_to_terminate: true` only when ALL six are true. Otherwise
    `false`. This single boolean is what `/goal`'s condition string reads
    to decide whether to terminate or run another iteration.

    **48-hour wall-clock cap exception**: if `elapsed_hours >= 48` AND
    `safe_to_terminate` would otherwise be `false`, ALSO set
    `wall_clock_exceeded: true` in the verdict. The /goal canonical
    condition string interprets `wall_clock_exceeded: true` as a hard
    terminate signal (write escalation-report.md with the in-progress
    state, terminate with safe_to_terminate=false and abort_reason set).

5d. **Cross-turn atomic persistence** (Layer 5 change for section-batched
    /goal mode). The verdict is no longer run-local; sections accumulate
    across turns.

    **Read-merge-write algorithm** when the current run produced a result
    for a specific section (i.e., /run-all-tests was invoked with a
    `<section>` argument):

    1. Read existing `.pipeline/last-verdict.json` if it exists. Parse
       to `prior`.
    2. Preserve `prior.started_at` if present; otherwise set
       `started_at = NOW` (first iteration of the /goal loop).
    3. Compute `elapsed_hours = (NOW - started_at) / 3600`.
    4. Merge: for each section in the current run's verdict, OVERWRITE
       only that section in `prior.sections{}`. Preserve all other
       sections from `prior` (they were established on earlier turns).
    5. Preserve `prior.fixed_sections` list across the merge — only
       Stage 4 step 5b updates it.
    6. Recompute `escalation_present`, `stability_gate`,
       `safe_to_terminate` against the MERGED section state.
    7. Write the merged verdict to `test-results/pipeline-verdict.json`
       via temp-file rename. Then COPY (atomic) to
       `.pipeline/last-verdict.json` so the NEXT /goal turn reads
       cross-turn-accumulated state.

    **Full-suite mode** (no section argument): the prior algorithm still
    applies but `prior.sections{}` is completely replaced by the current
    run's results. Use this mode only when invoked outside of /goal
    autonomous loop (e.g., for CI batch runs).

    If the atomic copy fails: fall back to `safe_to_terminate: false`
    and record the I/O error in `abort_reason`. /goal reading a stale
    `last-verdict.json` from a crashed prior run is acceptable (will
    produce conservative outcomes).

    **New verdict fields** added by Layer 5 step 5d (must appear in
    every pipeline-verdict.json):

    | Field | Type | Semantics |
    |---|---|---|
    | `started_at` | ISO-8601 string | Wall-clock time of the FIRST /goal iteration; preserved across all subsequent merges. Identifies the autonomous loop's birth time. |
    | `elapsed_hours` | float | `(NOW - started_at) / 3600`; recomputed every turn. Used by 48h cap check. |
    | `wall_clock_exceeded` | bool | `true` iff `elapsed_hours >= 48`. Hard terminate signal for /goal. |
    | `fixed_sections` | string[] | Names of sections in `sections{}` where `attempts > 1` AND `result == "PASSED"`. Cross-turn persistent. The smart stability gate (step 5b) drains this list. |

5e. **Aggregate stuck handovers into escalation report** (Layer 4).

    The pipeline already writes per-section `.claude/tasks/stuck-<section>.md`
    when a section exhausts 3 attempts (Stage 2.4). This step UNIONS them
    into a single human-readable file the operator (or `/goal`) can read
    without grep'ing the tasks directory:

    - **If `escalation_present == true`** (any stuck-*.md modified during
      this run per the mtime comparison in step 5a):
      1. Glob `.claude/tasks/stuck-*.md` matching the current run.
      2. Read each file. Extract section name from the filename; extract
         `Summary`, `Failing Tests` count, `Root Cause Hypothesis`,
         `Recommended Human Action` sections from the body.
      3. Write `test-results/escalation-report.md` with this shape:

         ```markdown
         # Test Pipeline Escalation — run_id: {run_id}

         **Generated:** {ISO-8601}
         **Stuck sections:** {N}
         **Pipeline result:** {pipeline-verdict.json result}
         **Safe to terminate:** false (escalation present)

         ## Quick Scan

         | Section | Failing tests | Root cause (1-liner) |
         |---|---|---|
         | tax-planning | 3 | Missing seed data for fire-metrics endpoint |
         | ...

         ## Full Handovers

         <embed each stuck-{section}.md verbatim under H2 per section,
          preserving its internal structure>

         ## Next Step

         To retry one section: `/iterative-visual-test-pipeline {section}`
         To retry the whole pipeline: `/goal "..."` (will re-trigger automatically
         on next iteration since the stuck files still exist)
         ```

      4. Write atomically (temp-file rename) per safety-invariants.md §12.

    - **If `escalation_present == false`**:
      - If a stale `test-results/escalation-report.md` exists from a prior
        run, DELETE it. A leftover stale report would confuse `/goal` and
        any human reader.
      - Do NOT create an empty escalation report. The absence of the file
        IS the signal that no escalation exists.

    - MUST NOT invoke the `/escalation-report` skill — that skill is
      hard-wired to `/test-pipeline`'s GitHub-Issues state shape (per spec
      v2.2 §3.4) and does NOT accept this pipeline's stuck-*.md inputs.
      Inline the aggregation here. The two pipelines have intentionally
      separate escalation paths.

6. Present the user-facing summary block per the template in
   `references/verdict-schema.md` (duration + deadline, mode, per-section
   breakdown, screenshot stats, visual overrides/flags, regression
   sweep, evidence path, stuck links, learnings summary). The summary
   MUST surface `safe_to_terminate` and `escalation_present` on dedicated
   lines so the operator (or `/goal`) can read the loop's intent at a
   glance without parsing JSON.

Do NOT auto-push. Do NOT open a PR. Commits are local checkpoints.

## Stage 5 — Extract Learnings (Self-Improvement)

Skip entirely if `flags.no_extract_learnings` is true (set by
`--no-learn` or `--no-extract-learnings`).

This stage is what makes the pipeline get better each invocation. It
diffs THIS run's outcomes against the prior learnings loaded in Stage 0.5
and appends new observations to the durable memory files.

Dispatch a single T3 learning-extractor subagent — cheap, one-shot,
read-only-plus-append. The verbatim prompt body lives in
`references/learning-extractor-prompt.md` — read it first, then pass it
to the agent:

```
prompt_body = read_file(".claude/skills/iterative-visual-test-pipeline/references/learning-extractor-prompt.md")
Agent("general-purpose", prompt=prompt_body + "\n\nrun_id: {run_id}") → T3 learning-extractor
```

The prompt file defines 6 observation classes (flakiness,
expectation_false_positive, fix_strategy, endpoint_correction,
section_attempts, baseline_confirmed), the promotion/demotion rules, the
idempotency check, and the expected output JSON shape.

After the extractor returns, invoke the project's session-learnings
capture per `.claude/rules/claude-behavior.md` rule 5 — but wrap it so
failures don't fail the pipeline (safety-invariants.md §13):

```
try:
  Skill("learn-n-improve", args="session")
  learnings_extracted_status = "full"
except (SkillFailure, Timeout):
  log_warning("/learn-n-improve failed; pipeline memory updated but project lessons not")
  learnings_extracted_status = "partial"
```

Write `learnings_extracted_status` into the final
`pipeline-verdict.json`. A learning-capture failure MUST NOT fail the
pipeline — the run itself still produced valid test results.

`/learn-n-improve` handles insights that belong in the broader lessons
file (`.claude/tasks/lessons.md`) — e.g., "this kind of bug surfaced
repeatedly; consider adding a lint rule". The learning-extractor above
handles pipeline-internal patterns.

**Cadence safety:** Stage 5 MUST be idempotent — running it twice on the
same run_id MUST NOT double-count observations. The JSONL log is keyed
by `run_id`; the extractor skips appending if any entry for this run_id
already exists. Append MUST be atomic (temp-file rename) per
safety-invariants.md §12, and after append, compaction runs if the log
exceeds 5000 lines per §11.

## Output

Write `test-results/pipeline-verdict.json` (schema above) and surface the
summary block to the user.

## MUST / MUST NOT

- MUST delegate actual E2E execution to `/e2e-visual-run` — do not re-implement
  dev-server startup, screenshot capture, or healing inline.
- MUST enforce a per-section attempt cap of 3 at this skill's level, additive
  to the global budget in `.claude/config/e2e-pipeline.yml`.
- MUST write `.claude/tasks/stuck-{section}.md` when a section exhausts
  attempts and continue to the next section.
- MUST auto-start PostgreSQL and install Playwright when unavailable and
  not in CI/`--no-auto-prereqs` mode — per safety-invariants.md §§5, 5a.
  MUST NOT auto-STOP Postgres at Stage 4 (other tooling may depend on it).
  In CI or `--no-auto-prereqs` mode, MUST refuse to start rather than
  attempt auto-provisioning.
- MUST NOT auto-push commits, auto-open PRs, or amend existing commits.
- MUST NOT skip Stage 3 regression — shared-code fixes silently regress
  earlier sections.
- MUST NOT exceed 4 top-level responsibilities. Current responsibilities:
  (1) pre-gate, (2) per-section loop with learning application,
  (3) regression, (4) aggregation + learning extraction. Stage 0.5 and
  Stage 5 collapse into responsibility 4 (they share the "durable memory
  of the pipeline" concern). If a fifth is added, split the skill.
- MUST use `unwrapResponse` semantics when parsing API envelopes in the
  expectation-builder — per `.claude/rules/api-response-unwrapping.md`,
  response bodies are `{ success, data }`, not bare payloads.
- MUST NOT mutate or delete entries in `.pipeline/pipeline-learnings.jsonl`
  — it is append-only. Demotions only remove entries from the curated
  `learned-patterns.md` file, never from the raw log.
- MUST NOT re-extract learnings for a `run_id` already present in the
  JSONL log — Stage 5 is idempotent per run.
- MUST NOT skip Stage 5 silently on error. If the extractor fails, log
  loudly and mark `learnings_extracted: false` in pipeline-verdict.json
  so the user knows the memory wasn't updated this run.
- MUST honour `seeded_by: human` entries in `learned-patterns.md` — never
  auto-demote a human-seeded pattern based on run outcomes.
- MUST acquire the lockfile at Stage 0 and release it on exit (including
  signal-triggered exit). Stale lockfiles from dead PIDs are safe to
  remove per safety-invariants.md §2.
- MUST respect `flags.ci` branching in every stage — no per-section
  commits on CI, no db:push on CI, shorter wall-time default.
- MUST NOT override `workers: 1` in any Playwright invocation. Use the
  repo's `playwright.config.ts` settings; the test suite is serialized
  for data-dependency reasons per `rules/e2e-vuetify-timing.md`.
- MUST compute and write `safe_to_terminate`, `escalation_present`, and
  `stability_gate` to `pipeline-verdict.json` per Stage 4 steps 5a-5d.
  These three signals are the load-bearing contract with `/goal` —
  omitting them means autonomous-loop callers cannot detect termination
  and the loop runs forever.
- MUST copy the verdict to `.pipeline/last-verdict.json` atomically at
  end of Stage 4 so the NEXT iteration's stability gate has input.
  MUST NOT clean up `.pipeline/last-verdict.json` at Stage 0.7 — it is
  cross-run state, not run-local.
- MUST follow the five-condition termination contract in
  `docs/Test-Pipeline-Termination-Criteria.md` verbatim. Do not add or
  remove conditions in the skill body; if the contract needs to evolve,
  edit the doc and version-bump the SKILL.md.
- MUST aggregate stuck-*.md handovers into `test-results/escalation-report.md`
  per Stage 4 step 5e when `escalation_present == true`. MUST delete a
  stale escalation report when no stuck files exist from this run — a
  leftover stale report from a prior run is worse than no report.
- MUST NOT invoke `/escalation-report` — that skill is bound to
  `/test-pipeline`'s GitHub-Issues state shape. The iterative pipeline's
  escalation aggregation lives inline in Stage 4 step 5e and operates on
  `.claude/tasks/stuck-*.md` markdown handovers.
- MUST NOT invent `/e2e-visual-run` flags that aren't in that skill's
  argument-hint. If exclusion is needed, route it through
  `visual-tests.yml` `ui_test_patterns.exclude` or the
  `PLAYWRIGHT_GREP_INVERT` env var.
- MUST NOT run `npm run db:push` without first running
  `prisma migrate status` and verifying drift is absent or additive-only.

## Decision Criteria

| Situation | Action |
|-----------|--------|
| Single section passed as argument | Skip pre-gate unless `--pregate` also passed |
| Pre-gate fails | `/fix-loop` up to 3× on failing suite, then STOP (do not E2E) |
| `/e2e-visual-run` returns NEEDS_REVIEW | Write handover, do NOT auto-heal (intentional visual change) |
| Section exhausts 3 attempts | Write handover, continue to next section |
| Stage 3 finds regression in previously-green section | Route back to Stage 2, single bonus iteration (4 total cap) |
| DB unreachable at Stage 0 | STOP — user must start Postgres |
| Any MUST NOT violation detected in user input | Refuse the invocation with a clear message |

See:
- `references/safety-invariants.md` — **operational safety: arguments, lockfile, wall-time, signals, DB safety, secret redaction, CI mode, cleanup, JSONL compaction, atomic append, demotion symmetry** (read this first)
- `references/section-map.md` — section → API endpoint list (canonical)
- `references/expectation-templates.md` — how to build `visual_expectation` strings from API data
- `references/stuck-section-template.md` — handover format
- `references/learned-patterns.md` — curated cross-run memory (flaky quarantine, expectation overrides, preferred fix strategies, endpoint corrections, baselines, noise filter)
- `references/expectation-builder-prompt.md` — full Stage 2.1 expectation-builder prompt body
- `references/learning-extractor-prompt.md` — full Stage 5 extractor prompt body
- `references/verdict-schema.md` — full Stage 4 pipeline-verdict.json schema + user-facing summary template (includes Layer-3 termination signals)
- `docs/Test-Pipeline-Termination-Criteria.md` — five-condition contract for `/goal`-driven autonomous loops; defines `safe_to_terminate`, `escalation_present`, `stability_gate`
- `test-results/escalation-report.md` — Layer-4 aggregated stuck-handover report written by Stage 4 step 5e when `escalation_present == true`; deleted when no stuck files exist this run
- `e2e/visual-tests.template.yml` — Layer-2 persistent structural row-count expectations; committed and merged into `visual-tests.yml` at Stage 0.7 cleanup so Stage 0.7's clear-block doesn't wipe the structural contracts
- `.pipeline/pipeline-learnings.jsonl` — append-only raw observation log (read by Stage 0.5, written by Stage 5)
- `.pipeline/pipeline-learnings.sha256` — integrity checksum of the JSONL log
- `.pipeline/test-history.json` — per-test flakiness scores maintained by `/e2e-visual-run`, read by Stage 0.5
- `.pipeline/last-verdict.json` — copy of prior run's verdict; stability-gate input for Stage 4 step 5b; preserved across runs (NOT cleaned at Stage 0.7)
- `.pipeline/iterative-pipeline.lock` — session lockfile (Stage 0)

## Related Skills / Agents

| Skill / Agent | Used For |
|---|---|
| `/e2e-visual-run` | Per-section E2E execution (delegate, do not duplicate) |
| `/fix-loop` | Pre-gate fix iteration + failing-test repair |
| `/verify-screenshots` | Invoked by `/e2e-visual-run` for multimodal visual review |
| `/goal` (Claude Code built-in, v2.1.139+) | Autonomous outer loop — reads `safe_to_terminate` from this skill's verdict to decide when "ALL CLEAN" is reached. Invoked by the operator with the canonical condition string from `docs/Test-Pipeline-Termination-Criteria.md`. Never wrap or duplicate `/goal`. |
| `tester-agent` | Pre-gate execution + regression sweep |
| `test-pipeline-agent` | Not invoked — this skill is the T2 orchestrator for its own pipeline |
| `/learn-n-improve session` | Invoked at Stage 5 to promote pipeline insights to `.claude/tasks/lessons.md` |
| `.claude/config/e2e-pipeline.yml` | Config source for retry budgets, visual thresholds |
| `.claude/rules/testing.md` | Aggregation script + verdict rules (Stage 4) |
| `.claude/rules/claude-behavior.md` rule 5 | Self-improving rules / lessons convention — Stage 5 writes here |
| `.claude/rules/agent-orchestration.md` | Tier model — this skill is T2, dispatches T3 workers only |
