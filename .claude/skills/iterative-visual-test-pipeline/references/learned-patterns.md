# Learned Patterns

Curated, high-confidence patterns promoted from raw run logs
(`.pipeline/pipeline-learnings.jsonl`) after they've been observed across
**3+ separate pipeline runs** with consistent outcomes. This file is the
durable, cross-session memory for the iterative-visual-test-pipeline
skill.

**Promotion rule:** An observation stays in the raw JSONL log for 3 runs
before being promoted to this file. A pattern gets demoted (removed from
this file) only if it's contradicted by **3 consecutive subsequent runs**
— the symmetry with the promotion threshold prevents flapping a correct
pattern when a transient code change temporarily contradicts it.
`seeded_by: human` entries are never auto-demoted.

**Editing:** This file is auto-maintained by Stage 5. Humans MAY edit it
to hand-seed patterns they know to be true, but MUST keep the section
structure and schemas below.

## Schema Version

`schema_version: 1`

If a future Stage 5 implementation changes the shape, bump this and
migrate old entries. Consumers (Stage 0.5, Stage 2.1, Stage 2.3) read
this field and skip unknown-schema entries rather than crash.

---

## 1. Flaky Tests (auto-quarantine)

Tests whose flakiness score in `.pipeline/test-history.json` has stayed
above `history.flaky_threshold` (default 0.7) for 3+ runs. These are
skipped at Stage 2.2 invocation via an `--exclude` flag so they don't
burn the per-section attempt budget.

```yaml
flaky_quarantine:
  # schema: { test_id, flakiness_score, runs_observed, last_seen }
  # Example (seed empty — populated by Stage 5):
  #
  # - test_id: "e2e/tests/fire-goals/25-cross-page-consistency.spec.ts::total investments match"
  #   flakiness_score: 0.85
  #   runs_observed: 4
  #   last_seen: "2026-04-20"
  #   notes: "Timing race between investments fetch and fire-metrics fetch"
```

Review this list quarterly — tests that genuinely belong here should
either be fixed (ideal) or marked `test.fixme()` with an issue link.
Auto-quarantine is a PIPELINE PROGRESS mechanism, not a pardon.

---

## 2. Expectation Overrides

Visual-expectation strings that have repeatedly produced false failures
(visual verifier flagged, but functional assertion + manual review both
confirm the test is actually correct). Used in Stage 2.1 to OVERRIDE the
template-generated string for specific tests.

```yaml
expectation_overrides:
  # schema: { test_id, original_template, override_string, reason, runs_observed }
  # Example:
  #
  # - test_id: "e2e/tests/expenses/10-formula-verification.spec.ts::budget adherence"
  #   override_string: "Budget adherence card shows percentage between 0% and 200%"
  #   reason: "Monthly adherence legitimately exceeds 100% when a category is overspent; template was too strict"
  #   runs_observed: 3
```

The `override_string` replaces the template-generated string in
`visual-tests.yml` for that specific test. Overrides are additive — the
rest of the section's expectations are built normally.

---

## 3. Fix Strategies by Classification + Section

When `/fix-loop` iterates, it can try several strategies per failure
classification. Over time, some strategies work reliably for specific
sections (e.g., salary tests often need fresh seed data; fire-goals tests
often need an expectation widening instead of a code fix). Stage 2.3
prefers strategies that worked last time for the same (classification,
section) pair.

```yaml
preferred_fix_strategies:
  # schema: { classification, section, strategy, success_count, last_used }
  # Example:
  #
  # - classification: "TIMING"
  #   section: "fire-goals"
  #   strategy: "wait for /api/fire/metrics response before asserting on card"
  #   success_count: 4
  #   last_used: "2026-04-18"
  #
  # - classification: "DATA"
  #   section: "salary"
  #   strategy: "re-run 00-data-setup.spec.ts before attempting fix"
  #   success_count: 5
  #   last_used: "2026-04-20"
```

These are **hints** for fix-loop, not mandates. If the preferred
strategy fails, fix-loop still tries alternative approaches per
`.claude/rules/testing.md` "each attempt MUST try a different approach".

---

## 4. Endpoint Map Corrections

When the expectation-builder observes that a test actually hits a
different endpoint than `section-map.md` lists, record the correction
here. The map itself is only updated manually (it's the canonical source),
but Stage 2.1 reads both and prefers the correction.

```yaml
endpoint_corrections:
  # schema: { section, test_pattern, actual_endpoint, runs_observed }
  # Example:
  #
  # - section: "financial-health"
  #   test_pattern: "08-banking-crud.spec.ts"
  #   actual_endpoint: "/api/banking/accounts"
  #   notes: "Banking endpoints not listed as primary for financial-health in section-map.md — should be added"
  #   runs_observed: 3
```

When `runs_observed >= 5` for a correction, Stage 5 surfaces a
recommendation in the final report to update `section-map.md` manually.

---

## 5. Section Attempt-Count Trends

Rolling observation of how many attempts each section typically needs to
go green. Sections that reliably succeed on attempt 1 could be marked for
parallel execution in a future optimization. Sections that reliably hit 3
attempts should be investigated — they likely have structural issues.

```yaml
section_attempt_stats:
  # schema: { section, avg_attempts, runs_observed, last_trend }
  # Example:
  #
  # - section: "tax-planning"
  #   avg_attempts: 2.6
  #   runs_observed: 5
  #   last_trend: "flat"   # one of: improving | flat | regressing
  #
  # - section: "salary"
  #   avg_attempts: 1.2
  #   runs_observed: 5
  #   last_trend: "improving"
```

If `avg_attempts >= 2.5` for 5+ runs, Stage 5 emits a warning
recommending the section be reviewed for structural fixes (not just
per-run patching).

---

## 6. Known-Good Screenshot Baselines

When `/verify-screenshots` has confirmed a screenshot visually matches
the expectation 3+ runs in a row, Stage 5 can record the baseline here so
future runs skip multimodal review for that test (baseline pixel-diff is
cheaper than multimodal verification).

```yaml
baseline_ready:
  # schema: { test_id, baseline_path, confirmed_runs, last_confirmed }
  # Example:
  #
  # - test_id: "e2e/tests/salary/01-navigation.spec.ts::display overview tab"
  #   baseline_path: "baselines/salary_01-navigation_display_overview_tab.png"
  #   confirmed_runs: 4
  #   last_confirmed: "2026-04-20"
```

Stage 2.2 passes this list to `/e2e-visual-run` which forwards to
`/verify-screenshots` — baseline mode takes priority over text-hint mode
per the skill's strategy order.

---

## 7. Cross-Run Noise (things NOT to learn)

Patterns that look like learnings but are noise. Recording them here
prevents Stage 5 from re-extracting them next run.

```yaml
noise_filter:
  # schema: { pattern, reason_not_learning, seeded_by? }
  # Example:
  #
  # - pattern: "Test duration varies by ±20% run-to-run"
  #   reason_not_learning: "Expected for headless CI environments; not a flakiness signal under the 0.7 threshold"
  #
  # - pattern: "Screenshot pixel-diff > 0% for tests with timestamps in the UI"
  #   reason_not_learning: "Covered by visual.mask_selectors config — not a visual regression"

  # ----- Human-seeded context (April 2026) -----
  # The project has ~114 pre-existing E2E failures clustered in specific
  # areas per project memory. These are not necessarily flaky — many
  # represent incomplete features marked test.fixme(). The pipeline
  # should NOT classify failures in these areas as FLAKINESS during the
  # first few runs until structure stabilizes.

  - pattern: "Failures in e2e/tests/family/ tests mentioning 'family-view'"
    reason_not_learning: "Family schema rewrite (April 2026) created ~19 transitional failures. These are structural, not flaky. Do NOT auto-promote as flaky_quarantine."
    seeded_by: human
    seeded_at: "2026-04-18"
    affected_count_estimate: 19

  - pattern: "Failures in e2e/tests/salary/ tests with 'edit' in the title"
    reason_not_learning: "~15 known structural failures in salary edit flows. Monitor but don't auto-quarantine."
    seeded_by: human
    seeded_at: "2026-04-18"
    affected_count_estimate: 15

  - pattern: "Failures mentioning 'financial-year' or FY selection in any section"
    reason_not_learning: "~14 known cross-section FY-transition failures. These are structural gaps, not flakiness."
    seeded_by: human
    seeded_at: "2026-04-18"
    affected_count_estimate: 14

  - pattern: "Failures in e2e/tests/income/ tests with 'esop' in the title"
    reason_not_learning: "~10 known ESOP-specific failures from partial vesting-schedule implementation."
    seeded_by: human
    seeded_at: "2026-04-18"
    affected_count_estimate: 10

  - pattern: "Failures matching 'new-features' suite"
    reason_not_learning: "~18 in-progress feature tests that predate the pipeline. These may be test.fixme() already."
    seeded_by: human
    seeded_at: "2026-04-18"
    affected_count_estimate: 18
```

After the pipeline runs 2-3 times with real data, specific test_ids
from these areas can be promoted into `flaky_quarantine` with
evidence. The noise_filter above gives Stage 5 enough context to
avoid misclassifying these as genuine flakiness on the first run.

---

## Read/Write Contract

| Stage | Read | Write |
|-------|------|-------|
| 0.5 | All sections | — |
| 2.1 | `expectation_overrides`, `endpoint_corrections` | — |
| 2.2 | `flaky_quarantine`, `baseline_ready` | — |
| 2.3 | `preferred_fix_strategies` | — |
| 5 | All sections (for diff) | All sections (append + promote) |

Consumers MUST handle missing or empty sections gracefully — a fresh
install has no learnings yet.

---

## How Stage 5 Promotes from JSONL to This File

1. Read `.pipeline/pipeline-learnings.jsonl` (all entries, newest first).
2. Group entries by `(kind, key)` where `kind` is one of the 7 sections
   above and `key` is the unique identifier (test_id, section+classification
   pair, etc.).
3. For each group with `count >= 3` and `consistency_ratio >= 0.8`:
   - Promote to this file under the appropriate section.
   - Add a `runs_observed` field equal to the group count.
4. For each existing entry in this file with `runs_observed > 0`:
   - If the last 2 runs contradict the pattern, demote (remove from this
     file but KEEP in JSONL log for potential re-promotion later).
5. Never delete from the JSONL log — it's the append-only audit trail.

## How to Seed Manually

If you already know a pattern is true (e.g., "test X is flaky, I've seen
it fail intermittently for weeks"), you can seed it directly:

1. Edit the relevant section above.
2. Set `runs_observed: 999` (signals "human-seeded, treat as confirmed").
3. Add a `seeded_by: human` field so Stage 5 doesn't try to demote it
   based on a single contradicting run.

Human-seeded entries are never auto-demoted — they can only be removed
by a human edit.
