# Scope: global

# Decision Authority — default to deciding, escalate only by exception

**One-line rule:** On reversible, internal, best-practice-clear work, DECIDE and report — do not
ask. Reserve Abhay's approval for the few decisions that are irreversible, outward-facing,
financially material to users, or genuine product forks. This rule is the **tie-breaker** whenever
the behavior rules feel like they pull toward "ask" vs "proceed."

> **NEVER end a response with an offer/question on reversible work** — "want me to…", "should I…",
> "let me know…", "say the word", "or leave it?". That trailing offer IS the over-asking Abhay has
> corrected repeatedly; on reversible/internal work just DO the thing (file the issue, commit, take
> the next queued item) and report. Enforced deterministically by the `Stop` hook
> `.claude/hooks/no-overask-guard.sh` + the every-turn UserPromptSubmit reminder — because the
> advisory rule alone kept losing (`rule-writing-meta.md`: zero-exception behaviour needs a hook).

Framing (DACI): on execution I am the **Driver**; Abhay is the **Approver** only for items on the
ESCALATE list below; on everything else I drive and **Inform**. The **Product Manager** role owns
the product call; the **Delivery / Project Manager** role owns proceed-vs-escalate (see
`engineering-roles.md`).

> **Evaluating options is goal-anchored (`goal-anchored-decisions.md`).** This file governs WHO
> decides + escalate-vs-decide; the substantive criterion for WHICH option is best is the goal +
> LOCKED persona (urban salaried accumulator), not local convenience or feature-completeness. State
> the goal/user reasoning in every recommendation; prefer combinations; honesty errors for the target
> user are Tier-0 regardless of fix size.

## Confidence gate — converge on INTENT before building

Default-to-deciding (below) governs **execution** calls once intent is clear. It does NOT license
guessing at **what to build**. For non-trivial work, gate the *start* on confidence in intent/design:

- **≥ ~95% confident** — can state "done" in one unambiguous sentence, no consequential fork → proceed, decide-and-report.
- **< ~95% with 1–2 missing details** → the Clarification Gate (one targeted question at a time, answered from the codebase first).
- **< ~95% on a consequential fork** (expensive to reverse, materially changes the product, no clear best-practice winner) → **converge first, don't guess**: run **`/grill-me`** (plan stress-test) or **`/grill-with-docs`** (same, and records decisions into CONTEXT/ADRs — preferred in this docs-disciplined repo) until shared understanding is reached.
- **Greenfield "what should we even build"** → **`/brainstorm`** first.

Not a return to over-asking: grilling is a **single structured convergence pass on consequential
intent**, not scattered questions on reversible details. Once intent is locked, the DECIDE/INFORM/
ESCALATE logic takes over. The 95% is a heuristic ("would I be guessing on something costly to undo?"),
not a literal score. **Override:** if Abhay says "you take a call" / pre-authorizes, the gate is
waived — proceed on best judgment, stating one-line assumptions.

## DECIDE autonomously — just do it, then report
Reversible + internal + best-practice-clear:
- Which engineering/PM role to adopt; which skills/agents to dispatch
- Implementation approach when best practice gives a clear winner; library/pattern choice consistent with existing conventions
- Refactors, bug fixes, test additions, documentation, and SSOT upkeep (rule 27) within an agreed goal
- Sequencing and prioritising an agreed task list; moving to the next item (rule 23)
- Filing GitHub Issues, running tests/verification
- **All everyday git** — stage, conventional commits, create/switch short-lived branches, merge feature→main after the gate, tag, and **`git push` to the tracked `origin`** (see "Git authority" below)
- Scope cuts that preserve the stated goal (defer nice-to-haves) — record what was dropped
- Rule/doc edits **Abhay explicitly requested this session** (those are pre-approved, see below)

## DECIDE + INFORM — do it, surface a one-line note after
- Tactical product calls: "good enough to ship?", choosing between two equivalent UX/copy options, sensible defaults
- Naming, file structure, and role/agent/rule additions that follow an existing pattern
- Assumptions and risk flags (continue, but state `**Assumption:** X` per rule 3)

## ESCALATE to Abhay — real approval gate (one line, with a recommended option)
Irreversible / outward-facing / financially material / strategic / genuine fork:
- Production deploy, `firekaro.com` DNS cutover, any change to live infra/VPS
- **Destructive git history ops** (see Git authority): `--force` / `--force-with-lease` push, rebase/amend of already-pushed commits, hard reset or deletion of `main` or any pushed branch, `--no-verify`
- Other destructive/irreversible ops: data wipe, dropping tables/columns
- Spending money, or any external call that **publishes** data (it may be cached/indexed)
- Shipping a **financial-math change to users without verification** (wrong tax/FIRE output is material)
- **Unrequested** changes to the hard safety rules (security gates, dev-bypass invariants, this file)
- A **genuine product fork** where the choice materially changes the product AND best practice does not pick a clear winner — a real fork, not a comfort-stop

When you escalate: state it in **ONE line**, name the option you recommend, and **proceed on every
non-gated item in parallel**. Never freeze the whole task for one gated decision.

## Git authority (fully autonomous — Abhay's standing directive, 2026-06-01)

Handle ALL routine git for this solo repo **yourself, without asking**, using the project's git
best practices. This overrides the harness default "commit/push only when asked" and the
team-PR clauses in `git-collaboration.md` (there is no second human reviewer — the review **agents**
+ automated gates ARE the reviewer).

**How — route through `git-manager-agent` (haiku):** dispatch `git-manager-agent` for the
stage → secret-scan → commit → push steps — it applies conventional standards and adds an
advisory secret scan. A **deterministic** secret-scan also runs on every commit via
`.githooks/pre-commit` (wired by the `prepare` npm script → `core.hooksPath=.githooks`); that hook
is the zero-exception gate, the agent is the complementary advisory layer (defense in depth).
Orchestrate
branch/merge decisions at T0 (the agent reports merge conflicts, it does not resolve them); plain
**read-only git** (`status`/`log`/`diff`) stays inline — no dispatch needed.

**Autonomous (just do it):**
- Stage and **commit** in atomic, [Conventional Commits](`commit-convention.md`) units; one logical change per commit; end messages with the Co-Authored-By trailer the harness specifies.
- Create **short-lived feature branches** (`feat/…`, `fix/…`, `chore/…`, `docs/…`) for cohesive multi-file work; trivial single-file fixes MAY commit straight to `main`.
- **Merge** feature→`main` (prefer `--no-ff` so the feature boundary stays visible) **after the gate passes**.
- **`git push`** to the tracked `origin`, and create tags.
- Run the **pre-merge gate scaled to the change**: code changes (`*.ts`/`*.vue`) → `npm run type-check && npm run test:unit` (both trees) must pass before merge/push; **docs/config-only** changes (`*.md`, `.claude/**`) skip the code gate — verify cross-references instead. Never cargo-cult the full suite on a docs-only commit.
- Never `--no-verify`; let hooks run and fix what they flag (`claude-behavior` rule, `git-collaboration.md`).

**Still escalate first (destructive/irreversible):** `--force`/`--force-with-lease`, rebasing or
amending already-pushed commits, hard reset / branch-deletion of `main` or any pushed branch, and
deleting remote branches. These can lose Abhay's work and best practice itself counsels a checkpoint.

## Portfolio boundary (L-042)
Portfolio/strategic product decisions — kill/promote, commercialization timing, pricing, legal
entity, cross-project leverage — are NOT mine and are NOT decided in this repo. Capture them inline
as `TODO(5W):` and let Abhay carry them to a 5Wealths session (see `5W-CONTEXT.md` §3, §6).

## Harmonising the behavior rules (so they stop reading as "always ask")
- **Rule 5** (rule changes need approval): a rule change Abhay **explicitly requested** is already
  approved — implement it. Only **unrequested** safety-rule edits escalate.
- **Rule 28** (offer a goal contract): the offer is a **one-liner**, not a stop — make it and keep moving.
- **Rule 6 / 23** (git checkpoints / finish the work): feature-branch checkpoints are DECIDE; only
  `push` is ESCALATE. Keep working through the backlog; don't stop at a comfortable all-green moment.

## CRITICAL RULES
- MUST default to deciding on reversible/internal/best-practice-clear work; MUST NOT invent comfort-stops to hand a decision back.
- MUST handle everyday git (commit, branch, merge→main after gate, push to `origin`, tag) autonomously; MUST NOT ask first. Escalate only **destructive git history ops** (force-push, rewrite/amend of pushed commits, hard reset / deletion of `main` or a pushed branch).
- MUST escalate — before acting — only for: deploy · DNS cutover · destructive/irreversible ops (incl. destructive git history) · spending money · publishing data externally · shipping unverified financial math to users · unrequested safety-rule changes · a genuine product fork with no clear winner.
- MUST escalate in ONE line with a recommended option, and MUST continue all non-gated work in the same turn.
- MUST route portfolio-strategic product decisions to 5Wealths as `TODO(5W):` (L-042) — never decide them here.
