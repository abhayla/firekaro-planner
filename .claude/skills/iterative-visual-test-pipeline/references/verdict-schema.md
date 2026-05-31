# Pipeline Verdict Schema (Stage 4)

The exact JSON shape written to `test-results/pipeline-verdict.json` at
Stage 4, plus the human-readable summary template surfaced to the user.
Downstream consumers (dashboards, CI gates, subsequent pipeline runs)
read this file — treat the schema as a contract.

## JSON Schema

```json
{
  "pipeline": "iterative-visual-test-pipeline",
  "run_id": "2026-04-18T14-30-12Z_abc1234",
  "result": "PASSED|FAILED|ABORTED",
  "abort_reason": null,
  "pregate": {
    "unit": "PASSED|FAILED|SKIPPED",
    "integration": "PASSED|FAILED|SKIPPED",
    "smoke_rerun_needed": false
  },
  "sections": {
    "salary": {
      "result": "PASSED|FAILED|STUCK|TRULY_STUCK|SKIPPED",
      "attempts": 1,
      "tests_passed": 48,
      "tests_failed": 0,
      "reason": null,
      "stuck_file": null
    },
    "income": { "result": "PASSED", "attempts": 2, "tests_passed": 52, "tests_failed": 0 },
    "tax-planning": {
      "result": "TRULY_STUCK",
      "attempts": 16,
      "stuck_file": ".claude/tasks/stuck-tax-planning.md",
      "escalation": "systematic-debugging dispatched after 3 fix-loop exhausted; no resolution found"
    },
    "financial-health": {
      "result": "SKIPPED",
      "reason": "upstream_dependency_failed: tax-planning"
    }
  },
  "regression_sweep": "PASSED|FAILED|SKIPPED",
  "regression_bonus_iterations_used": 1,
  "safe_to_terminate": false,
  "escalation_present": false,
  "stability_gate": "pending|pending_smart_rerun|passed|failed",
  "started_at": "2026-05-16T11-17-47Z",
  "elapsed_hours": 12.5,
  "wall_clock_exceeded": false,
  "fixed_sections": ["expenses", "fire-goals"],
  "duration_ms": 14023456,
  "deadline_exceeded": false,
  "ci_mode": false,
  "learnings_applied": {
    "flaky_quarantined": 3,
    "expectation_overrides_used": 5,
    "preferred_strategies_used": 2,
    "baselines_reused": 8
  },
  "learnings_extracted": "full|partial|false",
  "learnings_summary": {
    "new_observations": 12,
    "promoted_patterns": 2,
    "demoted_patterns": 0,
    "by_kind": {
      "flakiness": 1,
      "expectation_false_positive": 0,
      "fix_strategy": 4,
      "endpoint_correction": 1,
      "section_attempts": 10,
      "baseline_confirmed": 8
    }
  }
}
```

## Field Semantics

| Field | Meaning |
|-------|---------|
| `result` | `PASSED` only when every section is PASSED, regression_sweep PASSED, and no deadline miss. `ABORTED` when wall-time exceeded or signal-triggered exit. `FAILED` otherwise. |
| `abort_reason` | Populated only when `result: "ABORTED"` — one of `"wall-time exceeded"`, `"signal-2"` (SIGINT), `"signal-15"` (SIGTERM), `"lockfile-conflict"`. |
| `pregate.smoke_rerun_needed` | `true` if Stage 1 fix-loop modified any file under `src/`, `server/`, or `prisma/` and the smoke rerun was triggered per safety-invariants.md §8. |
| `sections.{s}.result` | `PASSED`, `FAILED`, `STUCK` (exhausted 3 fix-loop dispatches but escalation chain not yet run), `TRULY_STUCK` (escalation chain exhausted including /systematic-debugging — terminal until human intervention), or `SKIPPED` (upstream dependency failure). |
| `sections.{s}.attempts` | Total fix attempts: up to 3 from /fix-loop × 5 internal iterations = 15, + 1 from /systematic-debugging escalation, + regression bonus = max ~16. |
| `sections.{s}.stuck_file` | Path to the handover doc, populated only when `result: "STUCK"` or `result: "TRULY_STUCK"`. |
| `sections.{s}.escalation` | Optional human-readable note describing /systematic-debugging outcome; present when `result: "TRULY_STUCK"`. |
| `regression_bonus_iterations_used` | Count of sections that were routed back to Stage 2 via the Stage 3 bonus mechanism. |
| `safe_to_terminate` | Six-condition AND: all sections PASSED + regression PASSED + zero visual overrides + no escalation + smart stability gate passed + elapsed_hours < 48. `/goal`'s condition string reads this single boolean to decide termination. `TRULY_STUCK` sections prevent termination via the first condition. |
| `escalation_present` | Layer-4 signal. `true` iff any `.claude/tasks/stuck-*.md` was written or modified during this run. Fast negative signal so `/goal` doesn't have to glob every iteration. |
| `stability_gate` | Layer-5 four-state field. `"pending"` on first run (no `.pipeline/last-verdict.json`) OR before all 16 sections are PASSED. `"pending_smart_rerun"` when all 16 sections PASSED on first pass AND `fixed_sections` is non-empty (cross-turn signal — next /goal turn re-tests one fixed section per turn). `"passed"` when all 16 PASSED AND `fixed_sections` is empty (either no fixes were needed, or smart rerun drained the list). `"failed"` when a section regressed during smart rerun. |
| `started_at` | Layer-5 field. ISO-8601 timestamp of the FIRST /goal iteration; preserved across all subsequent cross-turn merges. Identifies the autonomous loop's birth time for the 48h cap. |
| `elapsed_hours` | Layer-5 field. `(NOW - started_at) / 3600`, recomputed every turn. Drives the 48h wall-clock cap check. |
| `wall_clock_exceeded` | Layer-5 field. `true` iff `elapsed_hours >= 48`. When `true`, /goal interprets this as a hard terminate signal regardless of other conditions. |
| `fixed_sections` | Layer-5 cross-turn-persistent array. Section names where `attempts > 1` AND `result == "PASSED"`. Drained one-section-per-turn by the smart stability gate (step 5b). Empty when all fixed sections have re-passed in the stability rerun. |
| `ci_mode` | Mirrors `flags.ci` for downstream filtering (e.g., a dashboard may hide local-mode runs). |
| `learnings_applied.*` | How many patterns from prior learnings were consumed this run. Zero on cold start. |
| `learnings_extracted` | `"full"` = extractor ran + `/learn-n-improve` ran; `"partial"` = extractor ran but `/learn-n-improve` failed; `"false"` = Stage 5 skipped (via `--no-learn`) or pipeline aborted. |

## User-Facing Summary Template

```
Iterative Visual Test Pipeline: PASSED | FAILED | ABORTED
  Duration: 3h 53m (deadline: 6h)
  Run ID:   2026-04-18T14-30-12Z_abc1234
  Mode:     local | ci

  Pre-gate:   unit=PASSED (N/N), integration=PASSED (N/N)
              [smoke rerun: not needed]

  E2E Sections:
    salary            PASSED  (1 attempt, 48 tests)
    income            PASSED  (2 attempts, 52 tests)
    tax-planning      STUCK   (3 attempts — .claude/tasks/stuck-tax-planning.md)
    expenses          PASSED  (1 attempt, 61 tests)
    investments       PASSED  (1 attempt, 73 tests)
    liabilities       PASSED  (2 attempts, 45 tests)
    insurance         PASSED  (1 attempt, 28 tests)
    financial-health  SKIPPED (upstream: tax-planning)
    fire-goals        PASSED  (3 attempts, 89 tests)
    family            PASSED  (1 attempt, 34 tests)
    integration       PASSED  (1 attempt, 22 tests)

  Screenshots: 1,234 captured, 1,230 verified, 4 failed
  Visual overrides: 2  (functional-pass but visually-fail → real bugs)
  Visual flags:     1  (functional-fail but visually-correct → likely flaky)
  Regression sweep: PASSED (bonus iterations: 1/4)

  /goal termination signals (Layer 3 + Layer 5):
    safe_to_terminate:    true | false
    escalation_present:   false
    stability_gate:       pending | pending_smart_rerun | passed | failed
    started_at:           <ISO-8601>
    elapsed_hours:        12.5 / 48.0
    wall_clock_exceeded:  false
    fixed_sections:       ["expenses", "fire-goals"]   (drained by smart rerun)

  Evidence:    test-evidence/{run_id}/
  Stuck:       .claude/tasks/stuck-tax-planning.md       (transient STUCK)
  Truly-stuck: .claude/tasks/stuck-tax-planning.md       (TRULY_STUCK after escalation)
  Escalation:  test-results/escalation-report.md (when escalation_present=true)

  Learnings (self-improvement):
    Applied:   3 flaky-quarantined, 5 expectation overrides,
               2 fix strategies, 8 baselines
    Extracted: 12 new observations (full | partial | skipped)
    Promoted:  2 patterns to learned-patterns.md
    Demoted:   0
```

## MUST-NOTs for This Schema

- MUST NOT omit fields even when zero — consumers expect the shape to be
  stable. Empty integer fields default to `0`, empty objects to `{}`.
- MUST NOT auto-push the file or commit it — it's gitignored per
  `rules/testing.md`.
- MUST NOT include raw secret values — expectation-builder redaction
  already strips these at source, but Stage 4 also scrubs any
  `sections.{s}.error_snippet` fields through the same redactor.
- MUST NOT rename or reorder fields without bumping the schema version
  embedded in the file.
- MUST NOT omit `safe_to_terminate`, `escalation_present`,
  `stability_gate`, `started_at`, `elapsed_hours`, `wall_clock_exceeded`,
  or `fixed_sections`. These seven are the contract with `/goal` —
  the autonomous outer loop reads them every iteration and cannot
  detect termination without them. `started_at` is set on the FIRST
  iteration and MUST be preserved across all subsequent cross-turn
  merges.
- MUST write to `.pipeline/last-verdict.json` atomically (temp-file
  rename) at end of Stage 4. The next iteration's `stability_gate`
  computation depends on this file being consistent — a partial write
  could falsely flip the gate. Cross-turn merge semantics (Stage 4
  step 5d) require this to be the cumulative section state, not
  run-local.
- MUST preserve `prior.started_at` when merging if it exists. MUST
  preserve `prior.fixed_sections` across merges — only Stage 4 step 5b
  modifies it (drain on rerun pass, mark FAILED on rerun fail).
- MUST NOT mark a section `TRULY_STUCK` until the full escalation chain
  (3 /fix-loop dispatches + 1 /systematic-debugging dive) has been
  exhausted on that section. `STUCK` is transient (in /fix-loop);
  `TRULY_STUCK` is terminal until human intervention.

When the shape changes, add `schema_version: 2` at the top level and
treat it the same way `learned-patterns.md` treats its version field.
