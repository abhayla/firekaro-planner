# Scope: global

# Documentation Management — durable homes + document-on-decision + auto-reference

**One-line rule:** Every significant decision, plan, or discussion-conclusion MUST land in its **one
canonical durable home BEFORE the turn that produced it ends**, and the relevant home MUST be
**auto-referred** (read at session start + consulted before related work) — so nothing decided is
ever forgotten across sessions. Created 2026-06-06 at Abhay's direction ("how are you ensuring proper
documentation is done, maintained, and referred as and when needed?").

This rule is the **governing index** over the existing documentation mechanisms. It does NOT replace
them — it names the canonical home for each artifact type, adds the **one missing layer** (a strategic
operating log for product/roadmap decisions that previously had no home), and defines the
**document-on-decision** trigger + the **auto-reference** protocol. Per `configuration-ssot.md`:
**cross-reference, never duplicate** — each fact lives in exactly one home.

## The canonical doc map (artifact type → its ONE home)

| Artifact type | Canonical home | Owned/governed by |
|---|---|---|
| **Strategic / product / roadmap / prioritization decision** (the "operating log") | **`docs/PROJECT-LOG.md`** (append-only, dated) | this rule |
| Architecture decision (schema, engine, data-model fork) | `docs/adr/NNNN-*.md` (`/adr` skill) | ADR process |
| Bug / feature / task work item | **GitHub Issues** (SSOT) | `bug-filing-and-sibling-audit.md` |
| **Feature priority tier** (`must-have` / `good-to-have` / `nice-to-have`) | **GitHub issue LABEL** (queryable: `gh issue list --label must-have`) — the WHY of the call goes in PROJECT-LOG | this rule (§ below) |
| Autonomous build spec | `docs/goals/YYYY-MM-DD-*.md` (`goal-creator`) | goal-creator skill |
| **Live goal-run progress + major events** (cross-session, while a `/goal` runs) | `docs/goals/.run/<slug>-PROGRESS.md` (append-only, gitignored; **discover active runs via `git worktree list`** → read each worktree's `docs/goals/.run/*-PROGRESS.md`). Durable lessons roll into the committed final report + `.claude/tasks/lessons.md` at run-end. | goal-creator skill (§0.3) |
| Product design SSOT (objectives, persona, screens) | `docs/v6-fire-planner-product-plan.md` §9; `SCREEN-STANDARD.md` | rule 27 |
| Stable convention / how-we-work | `CLAUDE.md` + `.claude/rules/*.md` | `configuration-ssot.md` |
| Multi-step procedure | `.claude/skills/*/SKILL.md` | `configuration-ssot.md` |
| Cross-session fact / preference / feedback | `MEMORY.md` + `memory/*.md` | the memory system |
| Session continuity (in-flight state) | `.remember/*.md` | the remember system |
| Blocked-on-Abhay item | `docs/comms-go-live-handoff.md` (the needs-Abhay register) | CLAUDE.md callout |
| Portfolio / strategic-5W decision | `TODO(5W):` note → carried to `5Wealths\` | L-042 (`5W-CONTEXT.md`) |

**`docs/PROJECT-LOG.md` is the narrative index ABOVE the others** — it records *what was decided and
why* and POINTS to the formal artifact (the issue #, ADR, goal contract). It is NOT a duplicate of
them. It is specifically for the strategic/product/operating decisions that previously evaporated into
chat (goal-status calls, prioritization, "what we're building next and why").

## Feature tiering registry (must-have / good-to-have / nice-to-have — MUST)

Every feature/work-item is categorized into exactly one priority tier, and that categorization is
**documented, queryable, and maintained** — never left only in chat. The mechanism (chosen to leverage
the work-item SSOT without a drifting parallel doc, per `configuration-ssot.md`):

- **The registry = GitHub issue LABELS** `must-have`, `good-to-have`, `nice-to-have` (Abhay's exact
  terms). The live registry is a query: `gh issue list --label must-have` (or `good-to-have` /
  `nice-to-have`). There is **no separate feature-tier markdown doc** — that would drift from the
  issues. Definitions: **must-have** = the app/objective doesn't genuinely work without it;
  **good-to-have** = important to the goal but the product works without it, sequenced after must-haves;
  **nice-to-have** = valuable polish/edge, lowest priority, often deferred.
- **Every feature issue MUST carry exactly one tier label** (alongside `enhancement`/`bug`). When an
  issue is filed or its priority is re-decided, set/replace the tier label **in the same turn**.
- **Sub-features inside one issue** (e.g. the #48 lever increments) → a tier-tagged **checklist in the
  issue body**, since they share one issue number.
- **The WHY of each tiering call → `docs/PROJECT-LOG.md` decision log** (the tier label says *what*; the
  decision entry says *why*, goal-anchored). Re-tiering is a `Document-on-decision` event (below).
- **Tiering is goal-anchored** (`goal-anchored-decisions.md`, rule 30): tier by importance to the goal +
  LOCKED persona, NOT by feature-completeness ("the catalog looks incomplete" is not a reason to
  must-have something).

## Document-on-decision (the trigger — MUST, every turn that decides)

When a turn produces a **significant** decision/plan/conclusion (a prioritization call, a design fork
resolved, a goal-status judgment, a scope cut, a "next we do X because Y"), you MUST, **before that
turn ends**, write it to its canonical home above. This EXTENDS rule 27 (which covers design-SSOT) to
**all** decisions. A decision that lives only in the conversation is an **undocumented decision** — a
regression of this rule. For a strategic/product/roadmap decision specifically, append a dated entry
to `docs/PROJECT-LOG.md` §Decision-log (newest first), with: the decision, the goal-anchored *why*,
and a pointer to any formal artifact (issue/ADR/contract).

"Significant" = anything you would not want yourself or Abhay to have to re-derive next session.
Trivial mechanical work (a typo fix, a rename) is exempt. When unsure, log it — a cheap line beats a
forgotten decision.

## Auto-reference (the "referred as and when needed" requirement — MUST)

- **At session start:** read `docs/PROJECT-LOG.md` (current goal status + active priority + recent
  decisions), `docs/comms-go-live-handoff.md` (blockers on Abhay), and `MEMORY.md` (auto-loaded). This
  recovers "where we are + what was decided" without re-reading chat history.
- **Before related work:** consult the relevant canonical home first — e.g. before a build, read the
  goal contract / issue; before an architecture change, read the relevant ADR; before a
  prioritization call, read PROJECT-LOG §Active-priority. Do not re-decide what is already recorded.
- **This rule auto-loads** (global scope) so the protocol itself is always in context; `CLAUDE.md`
  carries a one-line pointer to PROJECT-LOG (mirroring the needs-Abhay register callout) so the log is
  surfaced every session.

## Maintain (keep it current — MUST, mirrors rule 27)

- Keep PROJECT-LOG's §Goal-status and §Active-priority **current** — when the priority shifts or a
  milestone ships, update them in the same session (a stale status is worse than none).
- When a logged decision is superseded, append a new dated entry that supersedes it (append-only —
  never silently rewrite history; mark the old one `SUPERSEDED by <date>`).
- Move shipped roadmap items to "done" with the commit/issue reference; keep the log lean (archive
  old decision entries below a fold, don't delete the record).

## MUST / MUST NOT

- MUST record every significant decision in its canonical home **before the turn ends** — never leave
  it only in chat.
- MUST route each artifact type to its ONE home per the doc map; MUST NOT create a parallel/shadow doc
  (e.g. a second decision log, a `docs/bugs/` folder, a duplicate needs-Abhay file) — that violates
  `configuration-ssot.md` and `bug-filing-and-sibling-audit.md`.
- MUST read PROJECT-LOG + the needs-Abhay register at session start, and the relevant home before
  related work.
- MUST keep PROJECT-LOG's status/priority current and append-only on decisions (supersede, don't
  rewrite).
- MUST NOT duplicate content across homes — PROJECT-LOG POINTS to issues/ADRs/contracts, it does not
  copy them.
- MUST route portfolio-strategic decisions to `TODO(5W):` (L-042), not into PROJECT-LOG.
