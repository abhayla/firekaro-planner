# T-354 — STATUS: BLOCKED-awaiting-billing

## What's done
- `.github/workflows/ci.yml` gains a `changes` job matching the DoD clause verbatim:
  > "a first job `changes` (ubuntu-latest, `actions/checkout@v5` with `fetch-depth: 0`) that lists
  > the changed files ... and sets output `docs_only=true` ONLY when every changed file matches one
  > of `*.md` (any depth), `docs/**`, `.claude/**`, `LICENSE*` ... an empty change list sets
  > `docs_only=false` (fail-safe: run everything)."
  `frontend` and `backend` gain `needs: changes` + `if: needs.changes.outputs.docs_only != 'true'`,
  steps unchanged. A comment above `changes` explains job-level `if:` vs `paths-ignore` and names the
  hub reference (hub file did not exist at run time — T-353 in flight in parallel; followed the
  contract's own snippet spec instead, per the contract's fallback instruction).
- PR #164 opened: https://github.com/abhayla/firekaro-planner/pull/164
- Commit 1 (`323eb33`, no skip-ci marker) — the workflow-file change itself, intended as verification
  run (1).
- Commit 2 (`5d286bf`, no skip-ci marker) — the mandatory `docs/PROJECT-LOG.md` decision-log entry
  (D-2026-08-26-04), intended as verification run (2), the docs-only diff.
- Branch pushed, up to date with origin.

## What's blocked and why
Contract DoD requires two REAL, observed CI runs with URLs, `docs_only` values, pass/skip results,
and run (2)'s wall time. `gh pr checks 164` reports **"no checks reported"** after both pushes (waited
~2 min total across polls) — no workflow run was created for this branch/PR at all. Cross-checked
`GET /repos/.../actions/runs`: zero entries for `ci/T-354-docs-only-short-circuit`. The three most
recent runs on `main` (2026-08-26, unrelated to this task) all show jobs **queued then cancelled with
zero steps** — the exact signature already diagnosed in `docs/PROJECT-LOG.md` D-2026-08-26-02 / needs-
Abhay register item **B8** (`docs/comms-go-live-handoff.md`): an **account-level GitHub Actions
billing/spending-limit block** on `abhayla` ("recent account payments have failed or your spending
limit needs to be increased"), not a repo-config issue.

This is the same pre-existing external blocker as T-350 — not a new one. No code fix in this repo can
make GitHub Actions run while the account is billing-blocked. Fabricating run URLs or "estimating"
results would violate the contract's explicit "Record REAL counts you actually ran; never estimate"
instruction and the honesty-first mandate.

## What unblocks it
Abhay resolves the billing/spending-limit block at https://github.com/settings/billing (per B8's
exact steps in `docs/comms-go-live-handoff.md`). Once Actions can run again, **no further code
change is needed** — pushing PR #164 again (or re-running the existing commits) will produce the two
required verification runs; the `changes` job is already on the branch.

## Landing
PR #164 is open, contains the complete DoD-1 code change plus both intended verification commits.
Worker did not merge (never does — private repo, dispatcher merges on green) and cannot merge here
regardless since `gh pr checks` never reports a state to watch.
