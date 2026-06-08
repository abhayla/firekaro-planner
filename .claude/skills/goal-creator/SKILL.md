---
name: goal-creator
description: >
  Authors a "goal contract" — the dense, zero-user-input markdown spec that Abhay
  feeds to the built-in `/goal` command, which then runs autonomously until its
  Definition of Done is met. Use this skill WHENEVER Abhay wants to CREATE, DRAFT,
  WRITE, or PUT TOGETHER a goal / goal contract / goal spec to hand to `/goal` —
  e.g. "create a goal to…", "draft a /goal contract for…", "make a goal that…",
  "write me the contract to feed /goal", "set up an autonomous goal", "new goal: …"
  — or describes a build / fix / migration / audit he wants `/goal` to run
  unattended, even if he doesn't say the word "skill". Interview-first: it grills
  Abhay one question at a time (each with a recommended answer) until every design
  fork is resolved, THEN writes the contract to docs/goals/YYYY-MM-DD-<slug>.md.
  It NEVER runs `/goal` and NEVER commits — those are Abhay's. This is contract
  *authoring*, not *execution*. Do NOT use it to: create an in-app FIRE / financial
  goal record (an app data entry with a target amount or year); execute or run an
  already-written contract (that is the `/goal` command itself, not this skill);
  review or critique an existing contract; directly build something when no
  contract was requested; or write a different artifact (a PRD → /to-prd, a GitHub
  issue → /create-github-issue).
type: workflow
allowed-tools: "Read Write Edit Grep Glob Bash"
argument-hint: "[one-line description of the goal, optional]"
version: "1.4.1"
---

# Goal Creator

## What this is

`/goal` is a built-in Claude Code command Abhay runs himself. You feed it a markdown
**contract** and it executes end-to-end with **zero user input** until the contract's
Definition of Done is met — possibly for hours. This skill's only job is to **author
that contract**. It does not run `/goal`, and it does not simulate it.

Because the `/goal` run is autonomous and long, **every design decision must be made
*before* the run starts**. A single unresolved fork baked into the contract becomes an
hours-long run that builds the wrong thing. That is why this skill is interview-first:
front-load the questions, resolve every branch, and only then write a contract in which
literally every decision is pre-made.

The canonical examples of the house format already live in `docs/goals/` — study them,
they are the spec for what you produce. The two best references (both committed) are
`docs/goals/2026-06-06-temporal-contributions-phase1.md` (a build contract) and
`docs/goals/2026-06-07-full-lifecycle-qa-verification.md` (a verify/process contract).

## The cardinal rules (read before anything)

1. **Never invoke `/goal`.** You author the contract and stop. Abhay runs `/goal` himself.
2. **Never commit.** You write the file and stop. Committing the contract is Abhay's call.
3. **Interview-first, always.** Resolve every fork via the Clarification Gate (STEP 2)
   before writing a single line of the contract. The output must be zero-user-input.
4. **Bake in the standing rules.** Every contract folds in rules 24, 25, 26, 32, 33, 15, 17,
   20, 23 plus the failure-recovery budget block AND the three opening blocks §0.1 (worktree
   isolation), §0.2 (idempotency preflight), §0.3 (live progress log) — see
   `references/baked-in-rules.md`. These are why these contracts produce *proven-working*
   results, not *claimed-working* ones, and why a long run is trackable + learnable from
   other sessions.
5. **Default to a NEW contract file. NEVER edit a contract that may already be running.** A
   `/goal` run loads its contract at launch — editing a live contract is both useless (the
   in-flight run never sees the edit) and dangerous (a later re-run of the mutated file
   duplicates finished work). When Abhay asks to change/extend an existing goal, create a
   SEPARATE delta contract covering only the net-new work. Edit an existing contract in place
   ONLY when Abhay explicitly confirms it has never been run and is not currently running.
6. **Every contract is idempotent (no duplication across parallel sessions).** Its first
   action is a ledger-aware preflight — read the project's coverage/gap ledger + the code +
   `git log`, SKIP anything already done (verify-only, never rebuild), build only the missing
   delta, and report what was skipped. Parallel sessions are normal; no run may redo another's
   work. Paste the "§0.2 Preflight" block from `references/baked-in-rules.md` into every contract.

---

## STEP 0: Load context

Before interviewing, ground yourself so your recommended answers are real, not guesses.

1. **Read the two reference contracts** named above to refresh the exact house format,
   tone, and section set. Skim a third if the new goal resembles one (e.g. a tax/screen
   build → read `docs/goals/2026-06-03-accessible-money-bridge.md`).
2. **Read `references/contract-template.md`** (the skeleton you will fill) and
   **`references/baked-in-rules.md`** (the standing-rules block you will paste).
3. **Recall the relevant project memory** — especially `feedback_goal_is_user_invoked.md`
   (you author, Abhay runs), `feedback_rule24_25_pre_commit.md`, `feedback_take_judgment_call.md`,
   `feedback_dont_defer_on_context_judgment.md`, and `feedback_enumerate_before_greenfield.md`.
4. **Identify the target layer + persistence mode early.** This is a single-app repo
   (extracted standalone 2026-05-31 — the old `mvp/`/`demo/` monorepo split no longer exists):
   `src/` (Vue planner SPA, :5175) + `server/` (Hono/Prisma → Supabase, :3100). The contract's
   Rule-25 verification must match the mode the run exercises: **localStorage round-trip** (demo
   adapter, default) OR **`curl -H "x-dev-bypass: true"` API check** (ServerAdapter when
   `VITE_USE_SERVER_ADAPTER=on`). Confirm which mode in the interview. See CLAUDE.md "Cold-start".

If Abhay gave a one-line goal as an argument, use it to seed the interview — don't re-ask
what he already told you.

---

## STEP 1: Map the fork inventory

Before asking anything, privately enumerate every decision the contract must pin down.
This is the "enumerate before greenfield" discipline — surface the full inventory first,
then march through it. A complete contract resolves at minimum:

- **Mission** — the one-paragraph objective. What does "done" look like?
- **Target app tree + scope boundary** — which app; what files/dirs are in vs out;
  which boundary contracts apply (`mvp/` only? never `5Wealths\`?).
- **Type of goal** — fresh build, propagation/refactor, bug-fix loop, migration, audit.
- **Context-to-read-first** — the exact files/components/stores the run must study, with
  import paths and any gotchas (e.g. the `cd mvp` CWD trap).
- **Pre-made design decisions** — every design fork the run must NOT pause on. This is
  the bulk of the interview for build contracts. Each must be a decision, not a menu.
- **Stage breakdown** — how the work splits into stages, and the per-stage acceptance.
- **Verification gates** — the static gates (type-check/test/build) for the target tree,
  plus rules 24/25/26 adapted to the tree, plus a11y/Lighthouse if UI.
- **Failure-recovery budgets** — per-task fix budget, MCP-hang recovery, hard-halt list.
- **Commit + push policy** — how many commits, message format, branch, push target,
  what NOT to stage (the working tree often has unrelated untracked items).
- **Definition of Done** — the checkbox list that gates completion. **DoD verbs are load-bearing: an
  autonomous run satisfies the LITERAL checkbox and stops.** State the ACTION + the COMPLETENESS BAR
  explicitly — "**report** the score" yields a report, NOT closed gaps (say "**close** survived mutants
  on X to threshold Y" if you want them closed); "every layer **represented**" yields representation,
  NOT the exhaustive matrix (say "**all** N×M cells" for exhaustive, or "a **targeted** subset by
  criteria Z" — and name which). Never write "each X" when you mean "a representative X" — the run will
  pick the weaker reading. (Learned from the QA run: "report the mutation score" + an exhaustive-sounding
  A3 both got satisfied at the weakest literal reading.)
- **Final report** — what the closing report must contain.
- **Guardrails** — the hard stops (no new deps, no design reinvention, honesty/no-fake-data,
  TODO(5W) boundary, etc.).

Some of these you can answer yourself by reading the codebase (STEP 0) — do that and
don't ask. Only the genuine forks go to the interview.

---

## STEP 2: Interview (Clarification Gate)

Grill Abhay **one question at a time**, each with an explicit **recommended answer**, until
you reach high confidence that every fork is resolved. This mirrors his prompt-auto-enhance
Clarification Gate and the way every good contract here was authored.

Rules for the interview:

- **One question per turn.** Never batch. Wait for the answer before the next question.
- **Always recommend.** Frame as "Should X be A or B? Recommended: A, because Y." Abhay
  often just confirms the recommendation — a good recommendation makes the interview fast.
- **Read code before asking.** If the codebase answers it, read it and state the answer as
  an assumption to confirm, rather than asking an open question.
- **Highest-leverage first.** Ask the fork that constrains the most downstream decisions
  first (usually: target tree → goal type → mission → scope → design decisions).
- **No upper limit, but no padding.** Keep going until confident; stop when confident.
  Don't invent questions to hit a count, and don't stop early at a comfortable point.
- **Track an authorization trail.** As each fork resolves, note the decision. The contract
  will include this trail (see the template's "Authorization trail" table) so the run — and
  Abhay later — can see what was decided and why.

When you believe the tree is resolved, **summarize the resolved decisions back to Abhay as
a final checkpoint** and get a go-ahead before writing. If new forks surface mid-write,
return to the interview — never paper over a gap with a guess.

---

## STEP 3: Confirm the output path

**First, the in-flight check (cardinal rule 5).** If this work extends or overlaps an
existing goal, determine whether that goal is running or has run:
- Ask Abhay, or infer from context (he said "I'm running it", a parallel session exists,
  the file has matching `feat(...)` commits in `git log`).
- **If it is running / has run → author a SEPARATE delta file. Do NOT edit the existing
  contract in place.** The delta covers only net-new work and relies on the §0.2 preflight
  (cardinal rule 6) to skip anything already done.
- Only edit an existing contract in place when Abhay explicitly confirms it has never been
  run and is not running.

Then derive a kebab-case slug from the mission and propose the path:

```
docs/goals/YYYY-MM-DD-<kebab-slug>.md
```

For a delta of an existing goal, make the slug make that explicit, e.g.
`docs/goals/YYYY-MM-DD-<base-slug>-delta.md`. Use today's date (get it with
`date +%Y-%m-%d` if unsure). Confirm the exact path with Abhay before writing — a one-line
confirmation, not a full question round.

---

## STEP 4: Write the contract

Fill `references/contract-template.md` with the resolved decisions. **Paste the §0.1
(worktree isolation) + §0.2 (idempotency preflight) + §0.3 (live progress log) blocks as
the contract's opening three sections**, then **paste the standing-rules block** from
`references/baked-in-rules.md`, adapting only the tree-specific mechanics (DB vs
localStorage for Rule 25; the right static-gate commands; the right ports/paths). Do not
water the rules down — adapt the *mechanics*, keep the *mandate*. The §0.3 progress log
makes the run trackable from other sessions; name its path `docs/goals/.run/<slug>-PROGRESS.md`.

Quality bar for the contract you write (this is what separates a good contract from a
vague one):

- **Zero open questions.** Every design fork is a stated decision. The run must never
  need to ask Abhay anything. If you wrote "decide whether to…", you failed — go decide.
- **Concrete, not abstract.** Real file paths, real component/import names, real prop
  shapes, real commands with the right CWD. "Use the shared components" is weak; naming
  each component + its import + its props is strong. The reference contracts show the bar.
- **Verification is load-bearing, not decorative.** Rules 24/25/26 appear as MANDATORY
  per-task/per-stage gates with explicit pass criteria and the exact MCP/curl calls — not
  a hand-wave. This is the entire reason the contract format exists.
- **Provision the env for every mandated check — don't mandate a check the run's own env can't
  reach.** If the contract requires a check that needs a different environment than the main run
  (e.g. an auth-gate test needs dev-bypass **OFF** while the main sweep runs dev-bypass **ON**, or a
  server-mode path vs a demo-mode sweep), give that check its **own dedicated sub-run with its own env
  setup** and mark it **non-deferrable** if it's a security/data-integrity gate. A check mandated in
  prose while the preflight sets a conflicting env WILL be deferred — exactly what happened to the QA
  run's dev-bypass-OFF + first-login checks (#60).
- **"Tested via the UI" / "the new-user journey" = HAND-ENTRY through the real forms, NOT a seed/demo
  load.** If a contract must prove a user can *build* data (create a household, enter salary + sections
  from scratch → get a correct, fully-reported plan), mandate a **headed, from-scratch, every-field UI
  data-entry pass** (`enter-persona-via-ui.mjs` + per-section overview verify + fix-loop, per
  `ui-verification.md` "**data ENTRY is not verification**"). A seed fixture / "Try the sample" demo-load
  / read-only `verify-persona.mjs` screenshot proves *render*, not *entry* — never let it satisfy an
  entry/journey requirement (the QA run's gap, #61).
- **Honest defaults.** No synthetic/fake data; remove fakery rather than carry it forward.
  Surface uncertainty as an explicit assumption in the contract, never as fiction.
- **Self-contained.** The run should not need to consult this skill or any chat history —
  everything it needs is in the contract (plus the rule files it names, which load
  transitively). List those references explicitly (see the template's References section).

Match the density and structure of `docs/goals/2026-06-06-temporal-contributions-phase1.md`. It is
long on purpose: length here buys an unattended run that builds the right thing.

---

## STEP 5: Stop — hand off, don't execute

Print, and then stop:

1. The path you wrote, e.g. `docs/goals/2026-05-29-<slug>.md`.
2. The ready-to-paste invocation line:
   ```
   /goal docs/goals/2026-05-29-<slug>.md
   ```
3. A one-line note: the contract is written but **not committed** — committing it is
   optional and yours to trigger, and **you run `/goal` yourself** when ready.

Do **not** invoke `/goal`. Do **not** `git add`/`git commit`. Do **not** start building.
The skill's deliverable is the contract file and the invocation line — nothing more.

---

## Mode B: Fold run learnings back (post-run self-improvement loop)

The above (STEP 0–5) is **Mode A — author a contract**. **Mode B folds a COMPLETED run's learnings
back** into the goal/skill so the same mistake isn't repeated — the self-improvement loop. Use it when
a `/goal` run has finished and Abhay wants its learnings applied, OR proactively **offer it at the end
of any session where a run just completed**. NEVER mid-run (cardinal rule 5 — the in-flight run already
loaded its contract).

1. **Read the run's learnings** — its `docs/goals/.run/<slug>-PROGRESS.md` (the §0.3 log: defects,
   "X not working + what I did" events, decisions, recoveries) **and** the committed final report's
   **"LEARNINGS TO FOLD BACK"** section.
2. **Classify + route each learning per the canonical taxonomy in `references/baked-in-rules.md` §0.3
   step 5** (the single source of truth — do NOT restate it here). In brief: GENERIC → skill/process-rule;
   PRODUCT-SPECIFIC → a product rule if a recurring class, else the goal contract; prefer a deterministic
   gate over prose for both; one canonical home.
3. **Dedup** — grep the target home before adding; skip anything already covered. One learning = one home.
4. **PROPOSE, then apply on approval.** These are skill/rule/contract = governance edits (rule 5) →
   show Abhay the concrete diffs and apply ONLY on his go-ahead. The one-line `lessons.md` entry the
   run already auto-appended needs no re-approval.
5. **Honor cardinal rule 5** — if the target contract may be re-run, prefer generalizing (a/b) or a
   delta; edit a specific contract in place only when Abhay confirms it is safe.
6. **End with the offer** if it wasn't the trigger: *"Want me to fold these learnings into the
   goal/skill so the next run avoids them?"*

---

## CRITICAL RULES

- **NEVER invoke `/goal` and NEVER commit.** Author the contract, print the invocation
  line, stop. (Memory: `feedback_goal_is_user_invoked.md`.)
- **NEVER edit a contract that may be running — default to a new delta file.** Editing a
  live contract is ineffective (the run already loaded it) and causes duplication on re-run.
  Edit in place only when Abhay confirms the goal has never run and is not running.
- **Every contract opens with the §0.2 ledger-aware idempotency preflight** (read ledger +
  code + `git log` → skip done → build only the delta → report skips). No run duplicates
  another parallel session's work.
- **Every contract carries the §0.3 live progress log** — append-only
  `docs/goals/.run/<slug>-PROGRESS.md`, ≤2-line entries at each stage boundary + every major
  defect / "something not working + what you did" event / decision / recovery / blocker, so any
  other session can track the run live (`git worktree list` → read the log), and the major
  events/lessons roll into the committed final report + `.claude/tasks/lessons.md` at run-end.
- **Mode B (fold-back) only PROPOSES skill/rule/contract edits for Abhay's approval** (governance,
  rule 5); the only auto-write is the one-line `lessons.md` entry. Route learnings per the canonical
  taxonomy in `references/baked-in-rules.md` §0.3 step 5 (GENERIC → skill/process-rule;
  PRODUCT-SPECIFIC → product rule if a class, else the contract; gate over prose; one home, dedup),
  and end with the offer. NEVER fold back into a contract that may be running (cardinal rule 5) —
  generalize or write a delta instead.
- **Interview-first, one question at a time, each with a recommended answer**, until every
  fork is resolved. The contract must be zero-user-input.
- **Every contract bakes in rules 24, 25, 26, 32, 33, 15, 17, 20, 23 + the failure-recovery
  budget block** (`references/baked-in-rules.md`), with mechanics adapted to the target app
  tree, and tests **by blast radius of the changed surface** (the conditional-gating table:
  UI render+functionality, UI→persistence, a dedicated API behavioral test for server/API
  changes, cross-page sweep + blind re-verify always). Test PLACEMENT (which type runs where)
  follows `.claude/rules/testing-strategy.md`.
- **Match the house format** in `docs/goals/` and the skeleton in
  `references/contract-template.md`. Concrete paths/components/commands, never abstractions.
- **Resolve the persistence mode first** — localStorage demo adapter (default) vs ServerAdapter
  (`VITE_USE_SERVER_ADAPTER=on` → `x-dev-bypass` API) — and match the Rule-25 gate to it. Single-app
  repo: `src/` (:5175) + `server/` (:3100); no `mvp/`/`demo/` trees (extraction 2026-05-31).
- **No open questions in the output.** "Decide whether to…" in a finished contract is a bug.
- **Honor the boundary contracts** the contract operates under (e.g. `mvp/` only; never
  write `5Wealths\`; surface strategic items as `TODO(5W):`).
