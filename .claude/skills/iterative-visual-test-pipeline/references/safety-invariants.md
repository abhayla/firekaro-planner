# Operational Safety Invariants

Cross-cutting runtime safety concerns for the pipeline. SKILL.md references
this file rather than inlining the details, to stay under the 500-line
cap. Every concern here MUST be honoured at the stage indicated.

## 1. Argument Parsing (Stage 0, first thing)

Before any other work, parse `$ARGUMENTS` into a flags dict:

```
flags = {
  "section": None,          # positional, first non-flag arg
  "sections": [],           # from --sections=s1,s2,s3
  "skip_pregate": False,    # from --skip-pregate
  "no_learn": False,        # from --no-learn
  "no_load_learnings": False,   # from --no-load-learnings (split from --no-learn)
  "no_extract_learnings": False, # from --no-extract-learnings (split from --no-learn)
  "max_duration_minutes": 360,  # from --max-duration-minutes=N, default 6h
  "ci": os.environ.get("CI") == "true" or os.environ.get("CI") == "1",
}
```

`--no-learn` expands to both `no_load_learnings: True` AND
`no_extract_learnings: True` (convenience alias). The split variants
let users disable one side — e.g., `--no-extract-learnings` during
debugging lets you apply prior learnings without polluting the log with
half-run observations.

Fail fast on unknown flags with a usage message.

## 2. Concurrent-Session Lockfile (Stage 0)

After flag parsing, acquire a lockfile:

```
LOCK = ".pipeline/iterative-pipeline.lock"
if exists(LOCK):
  pid = read_file(LOCK).strip()
  if process_alive(pid):
    STOP: "Another iterative-visual-test-pipeline run is active (PID {pid}). Wait or kill it."
  else:
    log_warning("Stale lockfile from PID {pid}; removing")
    rm(LOCK)
write_file(LOCK, str(current_pid))
register_cleanup(lambda: rm(LOCK))
```

Two concurrent runs would race on ports, test-evidence/, and visual-tests.yml —
the lockfile is a cheap hard stop.

## 3. Wall-Time Ceiling (Stages 1–5)

Set `deadline = now() + flags.max_duration_minutes * 60`. Before each
stage dispatch and inside the per-section loop, check `now() < deadline`.
On exceed:

1. Write `test-results/pipeline-verdict.json` with
   `result: "ABORTED", abort_reason: "wall-time exceeded"` and a summary
   of what DID complete.
2. Terminate the current section's in-flight `/e2e-visual-run` via
   its state file so it persists partial progress.
3. Run full cleanup (Section 4 below).
4. Exit with summary.

Default 6 hours is conservative for a first full pass. Re-run with
`--max-duration-minutes=X` if you need more or less.

## 4. Signal Handling (all stages)

Register handlers for SIGINT and SIGTERM on pipeline start:

```
on_signal:
  1. Set global flag ABORTING = true
  2. Kill background dev server process if Stage 0 started it
     (read .pipeline/dev-server.pid, send SIGTERM, wait 5s, send SIGKILL)
  3. Write pipeline-verdict.json with result: "ABORTED",
     abort_reason: "signal-{N}"
  4. Release lockfile
  5. Skip Stage 5 (learning extraction) — partial data is not trustworthy
     enough to promote to patterns
  6. Exit with non-zero code
```

Inside long-running loops, check ABORTING at every iteration boundary
and break out gracefully.

## 5. Prerequisite DB Safety (Stage 0)

The skill OWNS Postgres lifecycle — auto-start if down, auto-stop never.
Users should be able to invoke `/run-all-tests` from a clean shell and
have everything come up. Skip the auto-start if `flags.no_auto_prereqs`
or `flags.ci` is true (CI runners typically seed their own DB).

### Auto-start probe sequence

```
if pg_isready -h localhost -p 5432 returns OK:
  # Already running — proceed
  pass
elif flags.no_auto_prereqs or flags.ci:
  STOP: "PostgreSQL not reachable and --no-auto-prereqs/CI mode is set. Start it manually."
else:
  attempt_start_in_order()
```

`attempt_start_in_order()` tries these in sequence, stopping at the
first that succeeds or reports "already running":

1. **docker-compose (most common for modern repos):**
   - Check for `docker-compose.yml`, `docker-compose.yaml`, `compose.yml`, or `compose.yaml` in repo root.
   - If present AND contains a service that exposes port 5432 (grep for `5432:5432` or `POSTGRES_DB`):
     `docker compose up -d <service-name>` (use the matched service).
   - Wait up to 30s for `pg_isready` to return OK.

2. **Named Docker container:**
   - Run `docker ps -a --filter "ancestor=postgres*" --format '{{.Names}}\t{{.Status}}'`.
   - If a stopped container matches: `docker start <name>`. Wait up to 30s.
   - If multiple exist, prefer one whose name contains the repo folder name (e.g., `firekaro-postgres`).

3. **Windows service (when `uname -s` contains CYGWIN/MINGW/MSYS):**
   - `sc query type=service state=all | grep -i postgresql` to find the service name.
   - `net start <service-name>` (requires user to have permission; may prompt).
   - If `Access is denied`, surface the message and STOP — do not auto-elevate.

4. **Local pg_ctl install:**
   - Look for `PGDATA` env var or `~/.postgres/data`, `/var/lib/postgresql/data`.
   - If found: `pg_ctl -D <data-dir> start -l /tmp/postgres.log`.

After each attempt, wait up to 30s for `pg_isready` OK. If all 4 strategies
exhaust without success, STOP with a diagnostic block listing what was
tried and the specific error messages, not a generic "DB down".

### db:push safety (runs AFTER Postgres is confirmed up)

`npm run db:push` is destructive under schema drift. Before running it:

```
migrate_status = bash("npx prisma migrate status --schema=prisma/schema.prisma")
if "Drift detected" in migrate_status AND NOT "Only additive changes" in migrate_status:
  STOP: "Destructive schema drift detected. Review `prisma migrate status`
         output and run `prisma migrate dev` manually before invoking this
         skill. Refusing to auto-apply db:push."
```

For additive-only drift (new columns, new tables, new indexes), db:push
is safe — apply it. For destructive drift (renames, type changes, column
drops, constraint tightening), require manual intervention.

### Cleanup semantics

MUST NOT auto-stop Postgres at Stage 4 — even if the skill started it.
Other tooling (manual dev server, active browser sessions) may be
depending on it. The skill's invariant is "bring prereqs up"; the
user owns "take them down".

Exception: if the skill started Postgres via a Docker container AND the
container has no other consumers (detected by inspecting no other
processes mapped to port 5432), log a note — do NOT stop. Leave the
cleanup decision to the user.

## 5a. Playwright Install Guard (Stage 0)

Before invoking `/e2e-visual-run`, verify Playwright is installed and
browsers are downloaded. Missing install produces confusing mid-run
errors that are easy to misdiagnose as test failures.

```
if ! [[ -f node_modules/@playwright/test/package.json ]]:
  if flags.no_auto_prereqs or flags.ci:
    STOP: "Playwright not installed. Run `npm install` first."
  else:
    run: npm install

if ! npx playwright --version succeeds OR browsers missing:
  if flags.no_auto_prereqs or flags.ci:
    STOP: "Playwright browsers missing. Run `npx playwright install chromium` first."
  else:
    run: npx playwright install chromium
```

Check browser presence by attempting `npx playwright test --list` against
a single test file — a missing browser produces a specific error. Only
install `chromium` (the project's default) — not `firefox`/`webkit` — to
minimize download time.

## 6. Secret Redaction in Expectation Strings (Stage 2.1)

Before the expectation-builder embeds any API-response value into a
`visual_expectation` string:

1. Apply the same redaction paths as `server/lib/logger.ts` (see
   `.claude/rules/structured-logging.md`):
   `password`, `secret`, `token`, `authorization`, `cookie`,
   `*.password`, `*.secret`, `*.token`, `pan`, `mobile`, `aadhaar`, `email`
2. Reject any string that still contains patterns matching:
   - PAN format: `[A-Z]{5}[0-9]{4}[A-Z]`
   - Mobile: `[6-9]\d{9}` or `\+91\d{10}`
   - Aadhaar: `\d{12}` (12-digit numeric)
   - Bearer token: `Bearer [A-Za-z0-9\-._~+/]+=*`
3. If redaction trips, REPLACE the specific value in the expectation
   string with `<redacted>`, do NOT skip the test. Log at WARN level.

This matters because `visual_expectation` strings are sent to a
multimodal LLM — any leaked secret goes to the vendor and is
effectively compromised.

## 7. CI vs Local Mode Differentiation

When `flags.ci == True`:

| Concern | Local | CI |
|---------|-------|----|
| Per-section commit checkpoints (Stage 2.5) | YES | NO (CI runs on detached HEAD) |
| Wall-time default | 360 min | 90 min (fail fast on CI) |
| Dev server startup | auto (via /e2e-visual-run) | expect already running |
| Postgres auto-start (§5) | YES | NO (CI seeds its own DB) |
| Playwright auto-install (§5a) | YES | NO (CI has a prepared image) |
| Retry budget multiplier | 1× | 0.5× (fail fast) |
| `--capture-proof` | on | on |
| Lockfile | required | skip (CI runners are isolated) |
| `db:push` | runs after safety check | MUST NOT run (CI seeds DB separately) |

Read `flags.ci` in every stage and branch behavior accordingly. Do NOT
assume `process.env.CI` is the only signal — honour `flags.ci` which
may have been explicitly set.

## 8. Stage 1 Pre-Gate Regression Guard

If Stage 1 fix-loop modifies any file under `src/`, `server/`, or
`prisma/` (not just test files), rerun the ENTIRE pre-gate after the
fix, not just the suite that was failing. A unit-test fix that edits
`server/lib/api-utils.ts` can break integration tests or introduce a
build error — catching this before Stage 2 saves hours of wasted E2E
cycles.

Track file paths modified during Stage 1 fix-loop. If any match
`^(src|server|prisma)/`, set `pregate_smoke_needed = True`. Run a
single final pre-gate pass with a fresh budget if the flag is set.

## 9. Section Data-Dependency Handling (Stage 2)

Sections depend on data seeded by earlier sections — especially
`salary/00-data-setup.spec.ts` which seeds income that tax-planning,
financial-health, and fire-goals read.

If a section exhausts attempts and its `00-data-setup.spec.ts` failed
among the final failures, mark ALL downstream sections (per the
dependency graph below) with `skipped: upstream_dependency_failed` and
skip their Stage 2 entirely — they would fail for non-code reasons
and pollute the learnings log.

**Data dependency graph** (downstream → upstream):

| Section | Depends on |
|---------|------------|
| income | salary |
| tax-planning | salary, income |
| expenses | — (independent) |
| investments | — (independent) |
| liabilities | — (independent) |
| insurance | — (independent) |
| financial-health | salary, income, expenses, investments, liabilities |
| fire-goals | salary, income, expenses, investments |
| family | — (independent; has own setup) |
| integration | ALL of the above |

When skipping, still write a section entry to pipeline-verdict.json:

```json
"tax-planning": { "result": "SKIPPED", "reason": "upstream_dependency_failed: salary" }
```

## 10. Stale Artifact Cleanup (Stages 0, 2.5, 4)

| Artifact | Cleanup Trigger | Reason |
|----------|----------------|--------|
| `.claude/tasks/stuck-{section}.md` | Section goes green in Stage 2.5 | Stale handovers mislead future reviews |
| `visual-tests.yml` `expectations:` block | Stage 0 (before Stage 2.1 builds) | Dead keys accumulate for renamed/deleted tests |
| `test-evidence/` (all but latest 3 run_ids) | Stage 0 | Disk bloat; retention policy from rules/testing.md |
| `.pipeline/fix-hints.json` | End of each section's Stage 2.3 | Cross-section leakage of hints |
| `.pipeline/dev-server.pid` | Stage 0 startup (if stale) + Stage 4 shutdown | Orphaned PIDs confuse future runs |
| `test-results/*.json` | Stage 0 | Stale pass/fail confuses the aggregator |

## 11. JSONL Rolling Compaction (Stage 5)

After appending new entries, if `.pipeline/pipeline-learnings.jsonl`
exceeds 5000 lines, compact:

1. Read all entries, group by `run_id`.
2. Keep the most recent 1000 `run_id` groups (all entries per group).
3. Write the trimmed set atomically via `pipeline-learnings.jsonl.tmp`
   rename-on-finish.
4. Preserve original on error.

5000 line threshold = ~1000 runs × 5 observations each average. Trim
keeps the last 200 runs intact after compaction.

## 12. Atomic JSONL Append + Checksum (Stage 5)

Append MUST be atomic:

```
tmp = open(".pipeline/pipeline-learnings.jsonl.tmp", "w")
copy_existing_to(tmp)
for obs in new_observations:
  tmp.write(json.dumps(obs) + "\n")
tmp.close()
fsync(tmp)
rename(".pipeline/pipeline-learnings.jsonl.tmp", ".pipeline/pipeline-learnings.jsonl")
```

After write, compute SHA-256 of the file and store in
`.pipeline/pipeline-learnings.sha256`. On next Stage 0.5 load, verify
the checksum before reading; if mismatched, log corruption warning
and treat as "cold start" (empty learnings) for safety.

## 13. /learn-n-improve Failure Tolerance (Stage 5)

```
try:
  Skill("learn-n-improve", args="session")
  learnings_extracted_full = True
except (SkillFailure, Timeout):
  log_warning("/learn-n-improve failed; pipeline memory updated but project lessons not")
  learnings_extracted_full = False
```

Set `pipeline-verdict.json.learnings_extracted` to `"full"`, `"partial"`,
or `false` accordingly. A learning-capture failure MUST NOT fail the
pipeline — the run itself still produced valid test results.

## 14. Demotion Threshold Symmetry

Promotion requires 3+ consistent observations. Demotion MUST require 3+
contradicting observations as well — not 2. The 2-strike threshold I
originally specified was too aggressive and risked flapping a correct
pattern when a bug got fixed (2 "better now" runs would demote a
flakiness entry that's actually still real under the right conditions).

New rule: demote ONLY when the last 3 runs all contradict the pattern.
`seeded_by: human` entries remain undemotable regardless.

## 15. Where Each Invariant is Checked

| Invariant | Checked At | Owner |
|-----------|-----------|-------|
| 1. Flag parsing | Stage 0, Step 0.1 | SKILL.md |
| 2. Lockfile | Stage 0 | SKILL.md |
| 3. Wall-time ceiling | Every stage dispatch | SKILL.md |
| 4. Signal handling | Pipeline start | SKILL.md |
| 5. DB safety | Stage 0 | SKILL.md |
| 6. Secret redaction | Stage 2.1 | expectation-builder prompt |
| 7. CI mode | All stages | SKILL.md |
| 8. Pre-gate regression | End of Stage 1 | SKILL.md |
| 9. Data dependencies | Stage 2 loop | SKILL.md |
| 10. Artifact cleanup | Stages 0, 2.5, 4 | SKILL.md |
| 11. JSONL compaction | End of Stage 5 | learning-extractor-prompt.md |
| 12. Atomic append | Stage 5 | learning-extractor-prompt.md |
| 13. /learn-n-improve tolerance | Stage 5 | SKILL.md |
| 14. Demotion symmetry | Stage 5 | learning-extractor-prompt.md, learned-patterns.md |
