# Scope: global

# Claude Behavior Rules

> History (WHY narratives, incidents, dates) for the rules below: `docs/rules-history.md` §claude-behavior.md.

## Task Approach, Self-Improvement, Git, Comments, Files, Environment

1. **Plan Before Coding**: For any non-trivial change (3+ files/steps, architecture, new feature, schema, refactor, or financial math), produce a **visible plan** (plan mode / goal contract / inline plan block) BEFORE the first code edit, showing WHY-this-approach, the file list, and verification steps; re-plan immediately if it goes sideways. Skip only trivial/mechanical edits. Full trigger/exemption list: `.claude/rules/plan-before-coding.md`.
2. **Break Large Tasks**: If a task requires changes to more than 3 files, stop and break it into smaller tasks first.
3. **Risk & Uncertainty Assessment**: List what could break and suggest tests. MUST flag uncertainty on non-trivial decisions, prefixed **Assumption:** — brief, not paragraphs.
4. **Verification**: Always verify your work with tests/linters/type-checkers before reporting completion; show the diff of every modified file with a one-sentence explanation each. Ask yourself: "Would a staff engineer approve this?" Never mark a task complete without proving it works.

> **IMPORTANT:** Codex reviews your output once done — do not cut corners.

5. **Self-Improving Rules**: Every correction → propose a new CLAUDE.md rule + update `.claude/tasks/lessons.md` so it never recurs. Periodically propose removing rules already followed unprompted or outdated. All additions/removals MUST be user-approved before applying. Review lessons at session start; ruthlessly iterate until mistake rate drops.

6. **Git Checkpoints**: Check `git status` first — uncommitted changes present, ask to commit/stash. Commit after each completed sub-task as a recovery checkpoint.

7. **No Redundant Comments**: NEVER add comments restating what the code already says. Only comment non-obvious logic — *why*, not *what*. Don't add comments/docstrings/types to code you didn't change.

8. **No Catch-All Files**: NEVER create files named `utils`, `helpers`, `common`, `misc`, or `shared`. Name files after what they do; single-module utilities live in that module.
9. **Keep Files Focused**: Single clear purpose per file; reconsider past ~300 lines. Exceptions: generated code, fixtures, migrations, config.

10. **Bash Syntax**: Forward slashes, quote paths with spaces — Unix-style bash even on Windows.
11. **Conventions**: Follow existing code patterns and naming in this project.

## Code Quality, Task Management, Failure Response

12. **Demand Elegance (Balanced)**: For non-trivial changes, pause and ask "is there a more elegant way?" — skip for simple, obvious fixes. Challenge your own work before presenting it.
13. **Autonomous Bug Fixing**: Just fix bug reports — require the COMPLETE error/stack trace, diagnose root cause step by step before fixing, fix failing CI without being told how. Judgment-call fixes: state "**Assumption:** X" in one line, then proceed.

14. **Task Tracking**: (1) plan to `.claude/tasks/todo.md` with checkable items before starting; (2) check in before implementation; (3) mark items complete as you go; (4) high-level summary each step; (5) review section on `.claude/tasks/todo.md` when done; (6) update `.claude/tasks/lessons.md` after corrections.

15. **Test Failures → Use Skills**: Invoke the right skill instead of ad-hoc debugging — MANDATORY, do not document failures and wait for direction. Known retest command → `/fix-loop`; unclear root cause/2+ failed attempts → `/systematic-debugging`; E2E/integration → `/systematic-debugging` first, then `/fix-loop`; after a fix → `/learn-n-improve session`. NEVER retry the same approach 3+ times without a structured skill; NEVER just log and stop — detect → diagnose → fix → learn.

16. **Simplicity First (KISS)**: Make every change as simple as possible; prefer straightforward over clever. Performance exceptions: see rule 22.
17. **No Laziness**: Find root causes; no temporary/band-aid fixes when the underlying issue can be fixed properly.
18. **Senior Developer Standards**: Hold all output to a senior-developer bar. Non-code responses: answer first, key evidence, then next action — skip preamble.
19. **Direct Honesty Over Comfort**: A critical flaw in the user's plan/approach/assumption gets said directly, framed constructively — MUST NOT be omitted to avoid discomfort.
20. **Scope Discipline & Epistemic Honesty**: Stay within scope; say "I don't have enough information" over plausible-sounding content; flag unverified claims "**Unverified:** X". NEVER fabricate.
21. **YAGNI**: MUST NOT implement functionality until needed by a concrete caller; no speculative generality "for later." Add extensibility at the second caller, not the first. Exception: changes cheaper now than to retrofit, called out explicitly.
22. **Measure Before You Optimize**: MUST NOT optimize without profiler/benchmark data confirming the bottleneck — reference a measured regression or SLO, never intuition. Exception: well-known O(n²)→O(n) hot-path refactors that also improve readability.
23. **Standing Directives Override Scope Instinct**: An iterative directive ("repeat until complete", "continue autonomously") keeps you going through deferred items until nothing actionable-without-approval remains — do NOT stop at self-imposed waypoints. Rule 20 governs unverified *claims*, not the breadth of authorized *work*. Pause only for items needing approval (shared-state actions, destructive ops, rule changes per rule 5) — never as a blanket excuse to stop at a comfortable "all-green" moment.

## UI & Data Verification

24. **UI Change Screenshot Verification (MANDATORY)**: After any task changing rendered UI, MUST verify end-to-end (Playwright MCP: navigate → screenshot → ARIA snapshot → console_messages; all three MUST pass) before claiming done. NOT required for pure composable/server/type-only changes. Self-heal `npm run dev` once if down. Max 3 in-loop fix attempts, then `/fix-loop` (rule 15). MUST surface "UI verification skipped because <reason>" and MUST NOT claim done if genuinely unavailable. Mechanics + analogues: `docs/rules-history.md#rule-24`.

25. **UI→DB Persistence Verification (MANDATORY)**: When driving the UI to write to the DB, MUST confirm the write persisted (network 2xx AND an independent `GET` via `curl -H "x-dev-bypass: true"`, per `rules/dev-bypass-auth.md`) before claiming done — dialog-close/snackbar/optimistic state DO NOT count. Both signals MUST pass. Multi-row loops: verify per iteration, never end-of-loop only. Max 3 in-loop fix attempts, then `/fix-loop`/`/systematic-debugging`. MUST surface "DB persistence verification skipped because <reason>" and MUST NOT claim done if unreachable. Mechanics: `docs/rules-history.md#rule-25`.

26. **Post-Test-Phase Independent Verification (MANDATORY)**: After any phase that drives the UI to mutate data, MUST NOT mark it complete until INDEPENDENTLY verifying every mutated resource's substance (rule-25-signal-2 extended cross-page per `docs/NEW-USER-JOURNEY-TEST-PLAN.md` §3, PLUS a rule-24 Playwright mirror per screen) — test pass verdicts alone are not sufficient. On divergence, do NOT proceed; invoke `/systematic-debugging`. Max 3 in-loop attempts, then `/fix-loop`/`/systematic-debugging`. MUST surface "Post-phase verification skipped because <reason>" and MUST NOT claim complete if unreachable. Mechanics: `docs/rules-history.md#rule-26`.

27. **Maintain the design SSOT on every change — and every new scope (MANDATORY)**: Any change to a dashboard/screen's look/structure/behavior MUST keep the relevant SSOT in sync within the same session — capture it the moment new scope surfaces in discussion (before code is written), AND propagate to all conformed screens per its governance section. SSOT by tree: `mvp/` → `mvp/SCREEN-STANDARD.md` §0; root app → `rules/section-plan-template.md` + `STYLING-GUIDE.md`. Code without a matching SSOT update (or vice-versa) is a regression.

28. **Offer a goal contract before implementing finalized scope (MANDATORY OFFER)**: When discussion converges on something concrete to build, MUST offer a `goal-creator`-authored goal contract before implementing — an OFFER, proceed only on assent, else implement directly. The user invokes `/goal` themselves — MUST NOT simulate it. Skip only for trivial/mechanical work.

## Independent Verification, Goal-Anchored, Plausibility, Functionality, Test Verification

29. **Independent verification after non-trivial implementation (MANDATORY)**: After implementing any non-trivial feature/fix, BEFORE declaring done or committing, MUST dispatch an **independent** verification pass — the author MUST NOT be the sole verifier (rules 24/25/26 + unit/type-check are necessary but NOT sufficient; history: `docs/rules-history.md#rule-29`). Always dispatch `code-reviewer-agent`; financial-math changes (`src/lib/*.ts`, `src/types/assumptions.ts`) ALSO dispatch `fintech-domain-analyst`; larger changes ALSO run `quality-gate-evaluator-agent`. A `/fix-issue` fix runs STEP 4 `/post-fix-pipeline`, not a manual commit. MUST act on every blocker/HIGH finding before commit; track deferred findings as GitHub Issues. MUST surface "independent verification skipped because <reason>" and MUST NOT claim verified if unavailable. Skip only for trivial/mechanical work.

30. **Anchor every non-trivial decision to the project goal + target user (MANDATORY)**: build/defer/cut, design forks, prioritization, scope MUST resolve to the option (or combination) best serving the documented goal + LOCKED persona (urban salaried accumulator), NOT local convenience/feature-completeness/symmetry. State the reasoning explicitly; tie-break by persona + "Now" order (correctness/honesty → stickiness → friction); target-user optimistic/honesty errors are Tier-0 regardless of fix size. Full rule: `.claude/rules/goal-anchored-decisions.md`.

31. **Verify the output is PLAUSIBLE, not just that it renders/passes (MANDATORY)**: a user-facing value can render/type-check/pass unit tests while domain-absurd. Before declaring a user-facing output change done, MUST apply a semantic sanity check and STOP + root-cause if off — never accept mechanical-green. MUST verify on the DEFAULT product path/lens a user sees (history: `docs/rules-history.md#rule-31`); MUST add a sane-bounds assertion to `src/lib/headline-plausibility.spec.ts` for new flagship output; financial-math changes MUST have FinTech Domain Analyst validate the end-to-end headline against persona-sane bounds. Shape locks are NOT correctness proofs. Full rule: `.claude/rules/output-plausibility-verification.md`.

32. **Verify interactive FUNCTIONALITY, not only that the screen renders (MANDATORY)**: every UI verification (rules 24/26, E2E, prod smoke) MUST exercise interactive functionality — clicks, tabs, selectors, form fill+submit, dialog open/save/cancel, filters, expand/collapse, primary actions — not merely render/no-console-error. "Renders" is SHAPE; "functions" is SUBSTANCE (history: `docs/rules-history.md#rule-32`). On PROD use only NON-DESTRUCTIVE interactions. A "verified" claim checking only render/console/layout is incomplete — say so explicitly.

33. **Any test verdict MUST be re-checked by a separate, context-blind agent (MANDATORY)**: any pass/fail verdict from an agent/process MUST be independently re-checked by a SEPARATE agent with NO context of the first run — same inputs + raw evidence, not conclusions — judging (a) testing done properly + completely (rule 32) and (b) verdict correct (rule 31). Verifier MUST be adversarial; verdict NOT accepted while verifier dissents (T0 reconciles first); applies to T0's own runs too. Context-isolated form of the `operating-model.md` edge — does not replace rules 26/29. Surface any skip verbatim. Full rule: `.claude/rules/independent-test-verification.md`.
