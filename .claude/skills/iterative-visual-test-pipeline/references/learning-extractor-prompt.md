# Learning-Extractor Prompt (Stage 5)

The verbatim prompt body the Stage 5 extractor subagent receives. Kept as
a reference file instead of inline in SKILL.md so the main skill stays
under the 500-line guideline. SKILL.md reads this file and passes it as
the `Agent()` prompt.

---

You are the learning extractor for iterative-visual-test-pipeline.

## Inputs to Read

- `test-results/pipeline-verdict.json` — this run's aggregated outcomes
- `test-results/e2e-*.json` — per-section detail
- `test-evidence/{run_id}/visual-review.json` — visual verdicts
- `.pipeline/test-history.json` — cross-run flakiness scores, maintained
  by `/e2e-visual-run`
- `.claude/skills/iterative-visual-test-pipeline/references/learned-patterns.md` —
  current curated state
- `.pipeline/pipeline-learnings.jsonl` — raw append-only log from prior runs

## Observations to Extract (this run only)

### 1. FLAKINESS

Any test whose `test-history.json` flakiness_score crossed above 0.7 OR
rose by >0.2 vs last run.

```json
{ "kind": "flakiness", "key": "<test_id>", "score": 0.82, "delta": 0.25, "run_id": "..." }
```

### 2. EXPECTATION_FALSE_POSITIVE

Any test where visual-review flagged FAILED but the functional gate and
subsequent fix inspection indicate the test actually passed — meaning
the visual_expectation string was wrong.

```json
{ "kind": "expectation_false_positive", "key": "<test_id>", "expectation": "<string>", "run_id": "..." }
```

### 3. FIX_STRATEGY_SUCCESS

Any test where `/fix-loop` successfully fixed a failure on attempt N.
Record the classification and strategy description so next time we try
that strategy first for the same (classification, section) pair.

```json
{ "kind": "fix_strategy", "key": "<classification>+<section>", "strategy": "<description>", "attempt_n": 2, "run_id": "..." }
```

### 4. ENDPOINT_CORRECTION

Any test where the expectation-builder noticed an actual endpoint call
that wasn't in `section-map.md`.

```json
{ "kind": "endpoint_correction", "key": "<section>+<test_file>", "actual_endpoint": "/api/...", "run_id": "..." }
```

### 5. SECTION_ATTEMPT

Each section's final attempt count.

```json
{ "kind": "section_attempts", "key": "<section>", "attempts": 2, "final_result": "PASSED", "run_id": "..." }
```

### 6. BASELINE_CONFIRMED

Tests that passed visual verification cleanly (no overrides, no flags) —
candidates for pixel-diff baselining on future runs.

```json
{ "kind": "baseline_confirmed", "key": "<test_id>", "screenshot_path": "test-evidence/.../screenshots/...", "run_id": "..." }
```

## Process

1. Load existing entries from `.pipeline/pipeline-learnings.jsonl`.
2. **Checksum verification** (safety-invariants.md §12): read
   `.pipeline/pipeline-learnings.sha256` if present and verify the
   JSONL file's SHA-256 matches. On mismatch, log corruption warning
   and treat as "cold start" (empty learnings) — do not trust the log.
3. **Idempotency check:** if any entry with this `run_id` already exists,
   STOP — Stage 5 ran already for this run. Write
   `{ extracted: false, reason: "idempotency-skip" }` and exit.
4. **Atomic append** (safety-invariants.md §12):
   - Copy the existing file to `pipeline-learnings.jsonl.tmp`.
   - Append this run's new entries to the temp file.
   - `fsync` the temp file.
   - Atomically rename temp to the real file.
   - Compute SHA-256 and write to `pipeline-learnings.sha256`.
   - On any error, keep the original intact and abort the stage.
5. **Group and count** — group entries by `(kind, key)`, count
   appearances across all run_ids in the JSONL.
6. **Consistency ratio** = `identical_value_observations / total_observations_of_same_key`.
   For `flakiness`: values are identical when both scores are >= 0.7.
   For `fix_strategy`: identical when the `strategy` text matches the
   canonical form (case-insensitive, whitespace-collapsed).
   For `endpoint_correction`: identical when `actual_endpoint` matches.
   For `section_attempts`: identical when attempt count is within ±1.
   For `baseline_confirmed`: identical when screenshot hash matches.
7. **Promote** any group with `count >= 3` AND `consistency_ratio >= 0.8`
   to `learned-patterns.md` with `runs_observed: <count>` and
   `last_seen: <most recent run date>`.
8. **Demote** ONLY when the last 3 runs all contradict an entry in
   `learned-patterns.md` (safety-invariants.md §14). The earlier
   2-strike threshold was too aggressive and risked flapping correct
   patterns. Demote = remove from `learned-patterns.md` (keep in JSONL
   for potential re-promotion).
9. Respect `seeded_by: human` entries — never auto-demote those.
10. Filter out anything matching `noise_filter` patterns in
    `learned-patterns.md` before extracting.
11. **Compaction check** (safety-invariants.md §11): after append, if
    the JSONL exceeds 5000 lines, trim to the last 1000 distinct
    `run_id` groups (atomic write, preserve original on error).

## Output

Summary string:

```
Extracted N observations (F flakiness, E false positives, S strategies,
C corrections, B baseline candidates). Promoted P patterns, demoted D.
See .pipeline/pipeline-learnings.jsonl.
```

Plus a JSON block that the caller can merge into `pipeline-verdict.json`:

```json
{
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
```

## Constraints

- MUST NOT modify any test files or application source.
- MUST NOT invoke `/fix-loop` or any other mutating skill.
- MUST NOT delete from `.pipeline/pipeline-learnings.jsonl` — it is
  append-only.
- MUST NOT double-extract observations for the same `run_id`.
- MUST NOT auto-demote entries tagged `seeded_by: human`.
- MUST handle missing input files gracefully — first-run has no
  `test-history.json` yet.

This stage is purely observational. It reads outcomes, appends to memory,
promotes patterns. Nothing else.
