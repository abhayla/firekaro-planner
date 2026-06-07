# Baked-in rules block (paste into every contract)

This is the standing-rules block every `/goal` contract carries. Paste it into the
contract's "Verification gates" section (STEP 4), then adapt **only the mechanics** to the
target app tree (see "Tree-specific mechanics" at the bottom). Keep the mandate intact —
the whole reason these contracts produce proven-working results is that 24/25/26 are
non-negotiable gates, not advisory prose.

All rules below live in `.claude/rules/claude-behavior.md`. The contract names them so
they load transitively.

---

## §0.1 Worktree isolation — run in a DEDICATED worktree, claim it with a lock (paste FIRST, before §0.2)

Paste this as the contract's **very first** action, ABOVE §0.2 (paste §0.1 AND §0.2 together as the
contract's opening two sections). It prevents a background `/goal` run from colliding with the user's
interactive session — the root cause of the 2026-06-06 incident, where a run switched the user's
primary worktree onto its feature branch mid-session and a stray docs commit landed on that branch.

> **First action of the run, before §0.2 and any stage. Non-negotiable.** This run MUST execute in a
> **dedicated git worktree**, never the user's primary interactive checkout (which shares its branch +
> working tree with the user's live session).
>
> 1. **Isolate:** `root=$(git rev-parse --show-toplevel)`. If `root` is the user's **primary
>    interactive checkout** (the repo the user works in, e.g. `…/firekaro-planner`) rather than an
>    already-dedicated `…/firekaro-goal-*` worktree, then **create and switch to a dedicated worktree
>    before any stage**: `git worktree add ../firekaro-goal-<slug> -b <feature-branch>` and run every
>    stage from there. NEVER run a multi-commit build in the user's primary worktree.
> 2. **Claim it:** export a unique `GOAL_RUN_TOKEN` for this run (e.g. `<branch>-<nonce>`) and write
>    the lock: `printf '%s\n' "$GOAL_RUN_TOKEN" > "$(git rev-parse --show-toplevel)/.goal-active.lock"`.
>    The repo's `.githooks/pre-commit` hook HARD-BLOCKS any commit whose `GOAL_RUN_TOKEN` does not match
>    this lock — so a concurrent interactive session physically cannot commit into this run's worktree.
> 3. **Release on exit:** the run's FINAL action (after merge/push, OR on any halt/defer) MUST remove
>    the lock: `rm -f "$(git rev-parse --show-toplevel)/.goal-active.lock"`. `.goal-active.lock` is
>    gitignored. If `git worktree` is genuinely unavailable, note it and proceed — but still NEVER run
>    in the user's primary interactive checkout.

---

## §0.2 Preflight — read the coverage ledger FIRST (idempotency · NO duplication)

Paste this as the contract's first numbered section (before any stage). It makes the
contract safe to run at any time, even while a parallel session implements part of it.

> **This is the first action of the run, before ANY stage. Non-negotiable.** A parallel
> session may already have implemented part of this contract. This contract must be **safe to
> run at any time without redoing finished work.**
>
> 1. **Read the project's coverage/gap ledger** (the doc that tracks COVERED vs DEFERRED —
>    name it explicitly in the contract, e.g. `docs/audit/<gap-ledger>.md`). It is the single
>    source of truth for what is already done across all sessions.
> 2. **For every item in this contract, check the ledger + the actual code + `git log` before
>    building it.** If it is in COVERED (or the code already implements it — grep/read to
>    confirm; don't trust the ledger blindly; scan `git log --oneline -20` for matching
>    commits), **SKIP the build** — do a verify-only pass and move on. Do NOT re-implement.
>    If partially done, build only the missing delta. If absent, build it normally.
> 3. **Record every skip** in the final report's "skipped (already covered)" list, so the run
>    visibly did not duplicate work.
>
> This preflight makes the contract **idempotent**: running it after a parallel session that
> did some of it produces only the remaining delta — never a duplicate. Pair it with the DoD
> + guardrail lines that mandate keeping the ledger current (move shipped items to COVERED
> with SHA; record conscious skips in DEFERRED with why + future stage).

---

## §0.3 Progress Log — live, cross-session-trackable + a learning trail (paste THIRD, after §0.1 + §0.2)

Paste as the contract's third opening section. A long autonomous run is otherwise a black box to every
other session — there is no way to see how far it got, what broke, or what it decided until it ends.
This makes the run's progress + major events readable LIVE from another session, and captures the
events/lessons so future runs (and Abhay) can learn from this one.

> **Maintain an append-only progress log for the entire run. Update it BEFORE moving on from each
> stage/event — so a crash or context-out leaves it current (it survives where in-context memory does not).**
>
> 1. **Location:** `docs/goals/.run/<contract-slug>-PROGRESS.md` (in THIS run's worktree). `.run/` is
>    gitignored → the log adds no commit churn and never conflicts across parallel runs. It is read
>    **cross-session via the worktree path**: another session runs `git worktree list`, then reads each
>    `<worktree>/docs/goals/.run/*-PROGRESS.md` to see every active run's live status.
> 2. **First log line (right after §0.1/§0.2):** slug · branch · worktree · start time · contract path ·
>    one-line mission.
> 3. **Append a SHORT entry (≤2 lines) at each of:** stage start; stage done (with the gate result);
>    every MAJOR DEFECT found; every "something not working" EVENT **+ what you did about it**
>    (recovery / decision); each independent-review outcome (concur / dissent); each DEFER or skip; each
>    blocker / halt; and the final result. **Terse summaries, not detail dumps** — a heartbeat + a
>    learning trail, never a transcript.
> 4. **Entry format:** `[YYYY-MM-DD HH:MM] <STAGE|PROGRESS|DEFECT|EVENT|DECISION|RECOVERY|BLOCKER|DONE> — <≤2-line summary>` (get the time with `date "+%Y-%m-%d %H:%M"`).
> 5. **At run-end, roll the durable learning into COMMITTED homes** (the `.run/` log is ephemeral — it
>    is cleaned with the worktree): summarize the major defects/events/lessons into the run's committed
>    final report, and append any notable error→fix→lesson (with a gate-gap line) to
>    `.claude/tasks/lessons.md` — so the lesson outlives this run.
>
> Example:
> ```
> [2026-06-07 14:02] STAGE   — A1 static/unit green both trees (root 972, server 150); 0 fixes
> [2026-06-07 14:31] DEFECT  — A7.3 IDOR test was a false proof (schema strips spoofed userId); rebuilt as genuine 2-tenant isolation
> [2026-06-07 15:10] EVENT   — A2 E2E blocked: demo specs vs server-mode frontend; did NOT restart shared :5175 → filed #54, deferred to a controlled demo-mode run
> [2026-06-07 15:20] DONE    — Phase A interim sign-off committed; deploy gate NOT cleared
> ```

---

## Process bar (carry forward verbatim)

> **All 26 rules in `.claude/rules/claude-behavior.md` are operative for this run.** The
> rules below are called out because they are the load-bearing ones for an autonomous
> `/goal` run. **Rules 24, 25, 26 are MANDATORY gates at every task AND every stage
> boundary** — a standing Abhay mandate. Do not skip, soften, or defer the 24/25/26 sweep
> to "later". They are why this contract yields *proven-working* output, not
> *claimed-working* output.

---

## The named rules

### Rule 24 — UI Change Screenshot Verification (per UI screen, MANDATORY)

After any change that alters rendered UI, verify end-to-end before claiming done. Self-heal
first: if the dev server isn't up, start it once in the background (capture the PID for
cleanup), wait a few seconds, confirm the port responds, then drive the browser.

Drive Playwright MCP against the affected route and capture **three signals**:
1. `mcp__playwright__browser_navigate` → the route
2. `mcp__playwright__browser_take_screenshot` — the visual
3. `mcp__playwright__browser_snapshot` — the ARIA accessibility tree
4. `mcp__playwright__browser_console_messages` — the browser console

**Pass criteria — ALL THREE must hold:** (a) intended element/copy/values visible in the
screenshot; (b) same present in the ARIA snapshot (structural, not just pixels); (c) console
shows **no errors/warnings introduced by this change** (pre-existing noise tolerated but
documented). Iterate ≤3 times per screen → on 3rd failure delegate to `/fix-loop` then
`/systematic-debugging`. Graceful degradation: if MCP is genuinely unavailable after
self-heal + hang recovery, surface "UI verification skipped because <reason>" and mark
`completed (deferred — Rule 24)` — never claim complete.

### Rule 25 — UI→persistence verification (per write path, MANDATORY)

After any UI-driven create/update/delete, confirm the write actually persisted — dialog
close / snackbar / optimistic UI do **not** count. Both signals must pass:
1. **UI-rendered signal** — the new/edited row/card reflects the change on screen.
2. **Persistence signal** — independent confirmation the data landed (see tree mechanics).

UI-only is a false positive (catches stale-cache / optimistic-render-without-persist). For
multi-row loops, verify **per iteration**, not at end-of-loop. ≤3 attempts → `/fix-loop`.
Graceful degradation → "persistence verification skipped because <reason>"; never claim complete.

### Rule 26 — post-phase independent + cross-page consistency sweep (MANDATORY, always fires)

After a stage is otherwise green, do an **independent** sweep BEFORE marking it complete — a
passing test is necessary but not sufficient. Verify the substance of every mutated resource
AND its cross-page consumers (name them explicitly in the contract). Drive MCP to each
affected screen + consumer route; confirm the visible substance matches the source of truth
(±1 rounding). 3 reconcile cycles → on unresolved divergence invoke `/systematic-debugging`
with the discrepancy as the failing observation; if still unresolved, log to the DEFERRED
file with `Rule 26 stage drift` and proceed with the degraded state noted — never silently
mark green.

### Rule 15 — test failures → use the skills (no ad-hoc retrying)

When tests fail: known retest command → `/fix-loop`; unclear root cause or 2+ failed
attempts → `/systematic-debugging`; E2E/integration → `/systematic-debugging` first (env
issues masquerade as code bugs), then `/fix-loop`. Never manually retry the same approach 3+
times. Never just log a failure and stop — detect → diagnose → fix → (learn).

### Rule 17 — no laziness / root cause over patch

Find and fix the root cause. No band-aid workarounds when the underlying issue can be
identified and fixed properly. (Abhay standing directive: `feedback_root_cause_over_patch.md`.)

### Rule 20 — epistemic honesty / no fabrication

No synthetic or fake data. Surface uncertainty as an explicit "**Assumption:** X" or
"**Unverified:** X", never as confident fiction. A visible gap beats a plausible guess.
Remove existing fakery (e.g. synthetic trend data) rather than carry it forward.

### Rule 23 — standing directives override scope instinct

This is an autonomous run. Keep going through the full Definition of Done — do NOT stop at a
comfortable "all-green" waypoint while authorized work remains. Pause only for a genuine
hard blocker (below) or a shared-state action that needs approval. Context-budget anxiety is
NOT a stop condition (`feedback_dont_defer_on_context_judgment.md`).

---

## Failure-recovery budget block (carry forward verbatim, tune the numbers per goal)

- **Per-task fix budget:** ~15 attempts (≈5 inline → `/fix-loop` → `/systematic-debugging`)
  → then DEFER the task and continue; do NOT halt the whole run.
- **MCP browser hang recovery:** 3 cycles — (1) wait 10s + retry the failing MCP call;
  (2) `mcp__playwright__browser_close` + re-`navigate`; (3) kill the background dev server
  (captured PID) + restart + retry. All 3 fail → log DEFERRED + mark `completed (deferred)`
  + continue. (Note: `feedback_no_browser_close.md` says do NOT force-close a hung MCP
  browser during interactive sessions — but inside an autonomous `/goal` run with no user
  watching, the close-and-restart recovery cycle is the intended unattended path.)
- **Hard halt conditions ONLY:** `npm install` failure; a decision contradiction inside the
  contract; an irrecoverable build break after the full fix budget; an OS permission denial;
  a missing required token/credential. Context-budget anxiety is NOT a halt — hand off via a
  one-line continuation note, never fake-complete (`feedback_dont_defer_on_context_judgment.md`).

---

## Conditional gating (for fix/process contracts where not every task touches UI)

Some contracts (e.g. a bug-fix loop) touch UI on some tasks and not others. Gate 24/25 on
the diff; 26 always fires:

| Rule | Trigger | Behavior on skip |
|---|---|---|
| **26** post-phase independent verification | **ALWAYS fires** | n/a — non-skippable |
| **24** UI screenshot verification | diff touches `*.vue` / component / page / composable | commit msg: `rule 24 skipped: no UI change` |
| **25** UI→persistence verification | diff introduces a UI create/update/delete flow | commit msg: `rule 25 skipped: no write-path change` |

If a fix produces a surprise change to product/write-path code, the gates fire even when
expected to skip.

---

## Tree-specific mechanics (adapt these, keep the mandate)

| Concern | Root app (`src/`+`server/`, port 5173) | `mvp/` (active, port 5175/5173) |
|---|---|---|
| Static gates (CWD) | repo root: `npm run type-check && npm run lint && npm run test:unit && npm run build` | **`cd mvp/`**: `npm run type-check` (banner must say `firekaro-mvp`), `npm run test:unit`, `npm run build` (watch bundle budget) |
| Rule 25 persistence signal | independent API GET: `curl -H "x-dev-bypass: true" <url>` (per `rules/dev-bypass-auth.md`) confirms the row | localStorage round-trip via `mcp__playwright__browser_evaluate` reading `firekaro-mvp:<userId>:<entityKey>` (per `mvp/src/lib/storage-adapter.ts`) |
| Rule 26 cross-page consumers | the API consumer map in `docs/NEW-USER-JOURNEY-TEST-PLAN.md` §3 + the cross-page e2e specs | `useFireDerive()` aggregates + the dashboard/overview screens that read them |
| CWD trap | n/a | **every** npm/playwright command MUST run from `mvp/` — wrong CWD silently runs the parent `firekaro-vue` project |
| Boundary | root app may not touch `mvp/`, `demo/`, or `5Wealths\` | `mvp/` only; never `src/`, `server/`, `demo/`, `.claude/`, or `5Wealths\` |

The `demo/` tree is **frozen** — contracts should not target it unless Abhay explicitly says so.
