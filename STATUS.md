# T-350 — CI red-main break-fix — STATUS: BLOCKED-awaiting-billing

## Outcome

**BLOCKED-awaiting-github-actions-billing.** This is NOT a code defect. No commit, config change,
or dependency fix in this repo can resolve it — it requires Abhay to fix billing/spending-limit
settings on his `abhayla` GitHub account.

## Diagnosis (full reproduction, as mandated)

1. Cloned fresh into a dedicated worktree at `C:\Abhay\Ventures\firekaro-planner-t350` off
   `origin/main` (commit `b7614de`).
2. Reproduced the CI workflow's own commands locally, step by step, exactly as `.github/workflows/ci.yml`
   defines them (not inferred from the YAML — actually run):
   - Frontend: `npm ci` → clean install (519 packages). `npm run type-check` (`vue-tsc --build --force`)
     → **zero errors**. `npm run test:unit` (vitest) → **1239/1239 tests passed, 88/88 files**.
     `npm run build` with `VITE_USE_SERVER_ADAPTER=on VITE_API_BASE_URL=""` (the exact CI env) →
     **build succeeded**, `dist/` produced cleanly.
   - Did not need to complete the Backend job locally because the actual root cause was found first
     (below) and confirmed identical across both jobs and both historical failures.
3. **All local reproduction passed. The code is not broken.** This directly contradicted the CI "failure"
   signal, so I checked the actual GitHub Actions run logs rather than trusting the YAML or a summary:
   ```
   gh run view 32976850742 --repo abhayla/firekaro-planner
   ```
   Both jobs (`Backend`, `Frontend`) show a runtime of **2 seconds** — far too fast for a real
   type-check/test/build run — with this annotation on BOTH jobs:
   > "The job was not started because recent account payments have failed or your spending limit
   > needs to be increased. Please check the 'Billing & plans' section in your settings"
4. Checked the OTHER failing run on `main` (2026-06-25, run `28169582273`, commit
   `ac7dc76`) — **identical** annotation on both jobs, identical ~2-3s non-execution.
5. Ruled out repo-level causes:
   - `gh api repos/abhayla/firekaro-planner/actions/permissions` → `{"enabled": true, "allowed_actions": "all"}`
     — Actions are not disabled at the repo level.
   - `gh workflow list` → `CI  active` — the workflow is registered and active, not broken/renamed.
   - The workflow YAML itself is well-formed (jobs ran the same failure pattern instantly, meaning
     the runner was never even provisioned to lint the YAML — this is a pre-flight billing gate, not
     a workflow-syntax failure).
6. **Root cause: GitHub Actions minutes/spend on the `abhayla` account (owner of this PRIVATE repo)
   is blocked** — either a failed payment method or an exceeded spending limit. This is an
   **account-level** setting (Settings → Billing & plans → Spending limits, on github.com), not a
   repository-level one, and is outside what a repo collaborator/token can read or fix via API
   (confirmed: `gh api user/settings/billing/actions` → 404, the billing endpoint isn't accessible
   this way).

## Why no code changes were made

The DoD explicitly allows for: *"If the failure is environmental/config drift ... the fix addresses
that root cause directly and the PR body states what was found and why it broke."* This root cause
IS environmental — but it is a **billing/payment-method** setting on Abhay's personal GitHub account,
not a lockfile, Prisma mismatch, or missing CI secret. There is no repo file, workflow YAML, or
config value that can fix a blocked payment method or spending limit. Opening a PR with no actual
code change (or a placebo change) would not move CI to green — the jobs would still be blocked
before a runner is ever assigned, regardless of what the diff contains.

## What unblocks this (for Abhay)

1. Go to https://github.com/settings/billing (or Settings → Billing and plans, on the `abhayla`
   personal account — NOT an org, since `owner.login: "abhayla"`, `type: "User"`).
2. Check "Payment information" — resolve any failed payment method.
3. Check "Spending limits" — if Actions minutes have hit a hard cap (common on accounts with a $0
   or low spending limit once the free-tier private-repo minutes are exhausted), raise the limit or
   confirm the free-tier allotment reset.
4. Once resolved, re-run the failed workflow: `gh run rerun 32976850742 --repo abhayla/firekaro-planner`
   (or just push any commit) — no code change is needed for CI to go green, since local reproduction
   proves the current `main` already passes every CI step.

## Worktree / branch state

- Worktree: `C:\Abhay\Ventures\firekaro-planner-t350` (branch `t350/ci-red-main-fix`, tracking
  `origin/main`, HEAD = `b7614de`, same as `main` — no commits made, nothing to push).
- No PR opened — there is no code diff to open a PR with; the DoD's PR-and-watch-green step cannot
  be executed against a billing block that a diff cannot fix.

## Handoff

Logged to `docs/comms-go-live-handoff.md` (needs-Abhay register) in the shared main clone, per
CLAUDE.md's mandatory-maintain requirement — see that file's new entry for the tracked item.
