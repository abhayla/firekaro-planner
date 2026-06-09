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
> 4. **Self-cleanup ON SUCCESS ONLY (so no stale worktree/branch is left behind for the user to prune
>    by hand):** after the branch is merged `--no-ff` → `main` AND pushed AND the lock is released, the
>    run's very last shell step `cd`s to the **primary repo root** (so its own worktree is no longer the
>    CWD — you cannot `git worktree remove` the worktree you are standing in) and runs:
>    `cd <primary-root> && git worktree remove --force ../firekaro-goal-<slug> ; git branch -D <feature-branch> ; git worktree prune`.
>    The branch is safe to `-D` because every commit is now in `main`. **On Windows, `git worktree remove`
>    may print `Invalid argument` while it still de-registers the worktree — that is fine; the leftover
>    empty folder is cosmetic, `git worktree prune` finalises it.** **DEFER/HALT is the opposite: do NOT
>    remove the worktree or delete the branch** — they are needed to resume (only the lock is released).

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

> **Honest standard note (don't pretend otherwise):** this log + fold-back discipline is currently
> **advisory prose** the run is asked to follow — there is **no deterministic enforcement yet**. By
> this repo's own gate-gap lesson (*prose doesn't prevent recurrence; a hook/CI gate does*), the real
> backstop is a deterministic run-completion check (e.g. a `/goal` run cannot be marked done without a
> `<slug>-PROGRESS.md` carrying a `DONE` line + the DONE/PENDING/BLOCKED/NEXT SUMMARY (step 6) + a
> final-report "LEARNINGS TO FOLD BACK" section). That gate is tracked as a candidate (see the
> goal-creator gate-candidate issue) — until it exists, treat §0.3 (the log, the SUMMARY, and the
> fold-back) as best-effort, not guaranteed.

> **Maintain an append-only progress log for the entire run. Update it BEFORE moving on from each
> stage/event — so a crash or context-out leaves it current (it survives where in-context memory does not).**
>
> 1. **Location:** `docs/goals/.run/<contract-slug>-PROGRESS.md` (in THIS run's worktree). `.run/` is
>    gitignored → the log adds no commit churn and never conflicts across parallel runs. It is read
>    **cross-session via the worktree path**: another session runs `git worktree list`, then reads each
>    `<worktree>/docs/goals/.run/*-PROGRESS.md` to see every active run's live status. (Its sibling
>    `<slug>-DEFERRED.md` — the deferrals log named in the DoD — lives in the same `.run/` dir with the
>    same gitignored + cross-session-readable treatment.)
> 2. **First log line (right after §0.1/§0.2):** slug · branch · worktree · start time · contract path ·
>    one-line mission.
> 3. **Append a SHORT entry (≤2 lines) at each of:** stage start; stage done (with the gate result);
>    every MAJOR DEFECT found; every "something not working" EVENT **+ what you did about it**
>    (recovery / decision); each independent-review outcome (concur / dissent); each DEFER or skip; each
>    blocker / halt; and the final result. **Terse summaries, not detail dumps** — a heartbeat + a
>    learning trail, never a transcript.
> 4. **Entry format:** `[YYYY-MM-DD HH:MM] <STAGE|PROGRESS|DEFECT|EVENT|DECISION|RECOVERY|BLOCKER|DONE> — <≤2-line summary>` (get the time with `date "+%Y-%m-%d %H:%M"`).
> 5. **At run-end, DERIVE learnings from the log and route them by scope — the self-improvement
>    fold-back, so the same mistake is not repeated next run.** The `.run/` log is ephemeral (cleaned
>    with the worktree), so the durable output goes to committed homes, routed by TYPE (GENERIC vs
>    PRODUCT-SPECIFIC), one canonical home each:
>    - **AUTO (only this — low-risk):** append each notable error→fix→lesson to `.claude/tasks/lessons.md`
>      with a **gate-gap line** (which gate should have caught it + closed-by-hook-or-prose), after a
>      **dedup check** (grep first — never re-add an existing lesson). `lessons.md` is the designated ledger.
>    - **PROPOSE (never auto — needs Abhay's approval):** in the run's COMMITTED final report, write a
>      **"LEARNINGS TO FOLD BACK"** section. Classify each learning by **TYPE first**, then place it in
>      its **ONE canonical home** (`configuration-ssot` — never duplicate; grep before adding), chosen
>      by **blast radius** ("who else would hit this?"):
>      - **GENERIC — about how goals / tests / the process run** (e.g. "headed runs need the PowerShell
>        launcher", "demo vs server-mode E2E", "IDOR test false-proof pattern"). → improve the **skill**
>        (`baked-in-rules.md` / `contract-template.md`) and/or the relevant **process rule**
>        (`.claude/rules/*`). Benefits every future goal.
>      - **PRODUCT-SPECIFIC — about FireKaro itself.** Route by reach: a recurring product **class**
>        (would bite any product work, e.g. the empty-state false-positive family) → a **product rule**
>        (`.claude/rules/*`); a **single-goal** quirk/scope correction → **this goal contract**.
>      - **For BOTH types, prefer a DETERMINISTIC GATE** (hook / CI test / run-profile) over prose where
>        one fits — the standing `lessons.md` gate-gap lesson: prose doesn't prevent recurrence, a gate
>        does. Target preference: **gate → rule/skill prose → contract note.**
>    - **The run NEVER edits its own contract, the skill, or a rule** (cardinal-rule-5 + behaviour rule 5
>      — governance edits need approval). It only PROPOSES. Applying the fold-back is a deliberate
>      post-run `goal-creator` **Mode B** action on Abhay's approval, and the next interactive turn ends
>      with the offer *"want me to fold these learnings into the goal/skill so the next run avoids them?"*
>
> Example:
> ```
> [2026-06-07 14:02] STAGE   — A1 static/unit green both trees (root 972, server 150); 0 fixes
> [2026-06-07 14:31] DEFECT  — A7.3 IDOR test was a false proof (schema strips spoofed userId); rebuilt as genuine 2-tenant isolation
> [2026-06-07 15:10] EVENT   — A2 E2E blocked: demo specs vs server-mode frontend; did NOT restart shared :5175 → filed #54, deferred to a controlled demo-mode run
> [2026-06-07 15:20] DONE    — Phase A interim sign-off committed; deploy gate NOT cleared
> ```
>
> 6. **Run-end SUMMARY (a readable status digest — advisory until #58 gates it, per the note above).**
>    The run's FINAL PROGRESS.md entry AND the committed final report MUST each carry a concise
>    **SUMMARY** — a ROLL-UP of facts already recorded elsewhere, NOT a new source of truth:
>    **DONE** (the verified-green stages) · **PENDING** (= the DEFERRED entries + their one-line reason —
>    no silent skips) · **BLOCKED** (the Abhay-gated subset + why) · **NEXT** (the continuation note —
>    the single next action + who owns the gate). Scannable, not a transcript. The committed final report
>    is the durable copy (survives the worktree); the PROGRESS.md final entry mirrors it for the live
>    cross-session reader.

---

## Process bar (carry forward verbatim)

> **All rules in `.claude/rules/claude-behavior.md` are operative for this run.** The
> rules below are called out because they are the load-bearing ones for an autonomous
> `/goal` run. **Rules 24, 25, 26, 29, 31, 32, 33 are MANDATORY gates at every task AND every
> stage boundary** — a standing Abhay mandate. Do not skip, soften, or defer the
> 24/25/26/29/31/32/33 sweep to "later". They are why this contract yields *proven-working*
> output, not *claimed-working* output.
>
> **Test PLACEMENT is governed by `.claude/rules/testing-strategy.md` (the SSOT) — which
> test type runs in which environment.** The rules below are the dev-time verification
> *mandates* that compose with it; the contract tests **by blast radius of the changed
> surface** (the conditional-gating table below) — full depth within each layer the change
> touches, not "all types always" and not "render-only".

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

### Rule 29 — independent review of the IMPLEMENTATION (not just tests, MANDATORY for non-trivial)

Tests passing proves "it works", not "it's correct + clean". After a non-trivial stage is green,
dispatch an INDEPENDENT reviewer in a fresh context — this run is the orchestrator, so it dispatches
the reviewer wave itself (single-level dispatch): `code-reviewer-agent` on the diff; **ALSO
`fintech-domain-analyst` WHENEVER the diff touches `src/lib/*` tax/FIRE/EPF/withdrawal math or
`src/types/assumptions.ts`** (validate against Indian tax law / FIRE research — the 80CCD(2)-leak
class); `quality-gate-evaluator-agent` for larger/cross-file changes. The reviewer is adversarial
(find the bug, not bless). Act on every blocker/HIGH finding before the stage's commit; track
deferred-but-real findings as GitHub Issues, never silently drop. The run is NEVER the sole verifier
of its own code.

### Rule 31 — output plausibility (semantic sanity, MANDATORY when a value is user-facing)

A number can render, type-check, and pass tests and still be domain-ABSURD (a 30-year-old retiring at
81). For any change that reaches a user-facing value — above all a FIRE/financial headline — apply a
SEMANTIC sanity check on the **DEFAULT product lens** the user actually sees (not a convenient one):
"would the persona / a domain expert flinch at this?" If it's off, STOP and root-cause — never accept
mechanical-green. For any new flagship output add/extend a sane-bounds assertion in
`src/lib/headline-plausibility.spec.ts`; for financial-math changes have `fintech-domain-analyst`
validate the END-TO-END headline against persona-sane bounds, not just the engine internals. A shape
lock ("matches the current computation") is NOT a correctness proof — pair each with a substance
assertion (sane bounds / a coherence invariant / agreement with an independent path).

### Rule 15 — test failures → use the skills (no ad-hoc retrying)

When tests fail: known retest command → `/fix-loop`; unclear root cause or 2+ failed
attempts → `/systematic-debugging`; E2E/integration → `/systematic-debugging` first (env
issues masquerade as code bugs), then `/fix-loop`. Never manually retry the same approach 3+
times. Never just log a failure and stop — detect → diagnose → fix → (learn).

### Rule 17 — no laziness / root cause over patch

Find and fix the root cause. No band-aid workarounds when the underlying issue can be
identified and fixed properly. (Abhay standing directive: `feedback_root_cause_over_patch.md`.)
**For fix-loop contracts this means red-first** (`rules/tdd-rule.md`): reproduce the bug with a FAILING
test BEFORE the fix, then make it pass — the failing test is the proof the root cause was found.

### Rule 20 — epistemic honesty / no fabrication

No synthetic or fake data. Surface uncertainty as an explicit "**Assumption:** X" or
"**Unverified:** X", never as confident fiction. A visible gap beats a plausible guess.
Remove existing fakery (e.g. synthetic trend data) rather than carry it forward.

### Rule 23 — standing directives override scope instinct

This is an autonomous run. Keep going through the full Definition of Done — do NOT stop at a
comfortable "all-green" waypoint while authorized work remains. Pause only for a genuine
hard blocker (below) or a shared-state action that needs approval. Context-budget anxiety is
NOT a stop condition (`feedback_dont_defer_on_context_judgment.md`).

### Rule 32 — interactive functionality (per UI screen with controls, MANDATORY)

"It renders" is shape; "it functions" is substance. After Rule 24 confirms a screen *renders*,
EXERCISE its interactive controls — clicks, tab switches, FY/period selectors, form fill +
submit, dialog open/save/cancel, filters, expand/collapse, and the screen's primary action(s) —
and confirm each *responds* (state changes, data updates, the FIRE figure recomputes, no NEW
console error). A screen can render perfectly with every control dead — that exact gap is why
this rule exists. A "verified" claim that only checked render/console/layout is INCOMPLETE.
(On prod, NON-DESTRUCTIVE interactions only — tab/FY/expand/dialog-open-then-cancel; destructive
functional flows belong to the pre-merge E2E suite, per `testing-strategy.md`.)

### Rule 33 — blind independent test verification (per test verdict, MANDATORY)

Any test verdict this run produces (Playwright/E2E/UI/persistence/any pass-fail) MUST be
re-checked by a **SEPARATE, context-blind** agent given the SAME inputs + the RAW evidence
(screenshots/ARIA/console/persisted data) — NOT this run's own conclusions presented as fact.
The verifier judges BOTH (a) was the testing done *completely* (coverage — substance, rule 32)
and (b) is the verdict *correct* (does the evidence support it — plausibility, rule 31), and is
**adversarial** (find what was missed, not rubber-stamp). Do NOT accept/report a verdict the
blind verifier dissents on — reconcile first. Single-level dispatch: the run's orchestrator
dispatches the tester wave, then dispatches the blind-verifier wave itself with **evidence
paths only**. Applies to the run's OWN test runs too. Full rule:
`.claude/rules/independent-test-verification.md`.

> **Evidence-handoff gotcha (recurring — cost ~1 wasted reconciliation cycle on BOTH the #66/#67 and
> #81 runs).** Playwright MCP writes `take_screenshot` files to the **session/primary-worktree root's
> `.playwright-mcp/`, NOT the goal worktree** — so handing those paths straight to the blind verifier
> makes it (correctly) dissent on a missing/incomplete evidence package that is purely a path issue,
> never a real defect. So: (1) **copy or absolute-path the screenshots INTO the goal worktree's
> evidence dir, and `ls`-confirm each file exists, BEFORE dispatching the blind verifier** — never hand
> a path you haven't verified resolves; (2) **capture a COMPLETE corroborating package the first time**
> — full-page (not cropped), dropdown/menu *open* where relevant, scrolled-to-the-asserted-element, and
> the before/after baseline pair (e.g. consolidated vs lensed) — so the verifier can actually judge the
> claim without a re-capture round-trip.

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

Some contracts (e.g. a bug-fix loop) touch UI on some tasks and not others. Gate 24/25/32 and
the API behavioral test on the diff; 26 and 33 always fire. **Test by blast radius of the
changed surface — full depth in every layer the change touches** (not "all types always", not
"render-only"). A typical full-stack feature (UI + write path + API) trips every row:

| Rule / check | Trigger | Behavior on skip |
|---|---|---|
| **26** post-phase independent + cross-page sweep | **ALWAYS fires** | n/a — non-skippable |
| **33** blind independent test re-verification | fires whenever ANY test verdict is produced | n/a — non-skippable when a verdict exists |
| **29** independent code review (+ `fintech-domain-analyst` if math, + `quality-gate-evaluator-agent` if large) | any NON-TRIVIAL implementation diff (code, not docs) | `rule 29 n/a: trivial / docs-only` |
| **31** output plausibility (sane on the default lens) | diff reaches a user-facing / headline value | commit msg: `rule 31 skipped: no user-facing value` |
| **24** UI screenshot/ARIA/console (render) | diff touches `*.vue` / component / page / composable | commit msg: `rule 24 skipped: no UI change` |
| **32** interactive functionality (controls work) | diff touches UI with interactive controls (forms/tabs/dialogs/filters/primary action) | commit msg: `rule 32 skipped: no interactive UI change` |
| **25** UI→persistence | diff introduces a UI create/update/delete flow | commit msg: `rule 25 skipped: no write-path change` |
| **API behavioral test** (status · envelope · auth-gate · ownership/IDOR) | diff touches `server/src/routes/**`, `server/src/lib/household-*`, or any `/api/**` contract | commit msg: `api test skipped: no server/API change` |

API-only/server-only changes (no UI) still run static gates (`cd server && type-check + lint +
test:unit`, incl. the `DATABASE_URL`-gated integration spec) + the API behavioral test + Rule 29 +
Rule 26; 24/25/32 skip. UI-only changes (no write path) run 24 + 32 + 29 + 26; 25 + the API test
skip. **Rule 29 (independent code review; + FinTech analyst for any `src/lib/*` math or
`assumptions.ts`) fires on EVERY non-trivial code change regardless of layer; Rule 31 (plausibility on
the default lens) fires whenever the change reaches a user-facing/headline value** — both are
layer-agnostic. If a fix produces a surprise change to product/write-path/API code, the corresponding
gates fire even when expected to skip.

---

## Persistence-mode mechanics (adapt the Rule-25 signal to the mode the run exercises)

> Single-app repo (extraction 2026-05-31 — no `mvp/`/`demo/` trees). Two trees: `src/` (Vue planner
> SPA, :5175) + `server/` (Hono/Prisma → Supabase, :3100). Run static gates in BOTH where a change is
> `@planner`-shared (root `npm run type-check && npm run test:unit`; `cd server && npm run type-check &&
> npm run lint && npm run test:unit`). The Rule-25 persistence signal depends on the adapter mode:

| Mode | Rule 25 persistence signal | Rule 26 cross-page consumers |
|---|---|---|
| **localStorage demo adapter** (default — `VITE_USE_SERVER_ADAPTER` off) | localStorage round-trip via `mcp__playwright__browser_evaluate` reading `firekaro-mvp:<userId>:<entityKey>` (per `src/lib/storage-adapter.ts`) | `useFireDerive()` aggregates + the dashboard/overview screens that read them |
| **ServerAdapter** (`VITE_USE_SERVER_ADAPTER=on` → Supabase) | independent API GET `curl -H "x-dev-bypass: true" http://localhost:3100/api/planner/<key>` (per `rules/dev-bypass-auth.md`); wait out the 1.5s write debounce first | same derived consumers + the `/api/planner/*` round-trip |

Boundary for every contract: this repo's `src/`/`server/`/`e2e/` only — never `.claude/` rules from a
build run, never `D:\Abhay\VibeCoding\5Wealths\`.
