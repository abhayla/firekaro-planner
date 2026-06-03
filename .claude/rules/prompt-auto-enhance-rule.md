# Scope: global

# Prompt Auto-Enhance

Every response starts with `*Enhanced: <what was checked>*` (under 15 words).
Examples: *Enhanced: prompt graded (B, 2 fixes), git state, 3 rules*

The hook (`prompt-enhance-reminder.sh`) gates triggering: prompts ≤15 chars
and known continuation phrases skip injection at the deterministic layer,
so the strengthening pipeline only runs on substantive prompts.

## The unified per-prompt pipeline (0 → 6)

Every substantive prompt runs ONE process. Stages 0–4.6 strengthen the prompt;
4.7–6 govern how it is carried out. Each governance stage is summarised here and
detailed in its SSOT rule — pointer pattern, no duplication (`configuration-ssot.md`):

| Stage | What happens | SSOT detail |
|---|---|---|
| **0–4.5** | Grade → diagnose → strengthen — with the **intent gate** woven in (1–2 gaps → one targeted question; consequential fork & confidence <~95% → `/grill-me` or `/grill-with-docs`) → step transcript | `/prompt-auto-enhance` + `decision-authority.md` → "Confidence gate" |
| **4.6** | Show the final strengthened prompt (reflects the gate-resolved intent) | `/prompt-auto-enhance` |
| **4.7 Role** | Infer the role, state `Role: <name> — <why>`, dispatch its backing agents/skills | `engineering-roles.md` |
| **4.8 Plan** | For non-trivial coding work, produce a **visible plan** (plan mode / goal contract / inline plan block) BEFORE the first code edit — Skip trivial/mechanical edits | `plan-before-coding.md` |
| **5 Execute** | Act under DACI: **decide** reversible/internal; **inform** on tactical product calls; **escalate** irreversible/outward in one line + keep working | `decision-authority.md` |
| **6 Git** | Only if the turn produced committable changes: stage → secret-scan → commit → (branch/merge) → push via `git-manager-agent` + `.githooks/pre-commit` | `decision-authority.md` → "Git authority" |

**Verbosity (chosen 2026-06-01): FULL.** Render the grade card + step transcript +
final strengthened prompt on **every** non-trivial prompt — not a lean one-liner.
Stage 6 is conditional (skip on Q&A / read-only turns).

## Tier 1 — Always (every prompt that reaches this rule)

1. Existing `.claude/` patterns — know what exists, do not duplicate
2. CLAUDE.md — already loaded, reference it
3. Git state — branch, recent commits, uncommitted changes

## Tier 2 — Conditional (only when prompt references specific files/features)

4. Nearby files — structural context
5. `registry/patterns.json` — check before suggesting new patterns

## Prompt Grading & Strengthening

For non-trivial prompts (anything that reaches this skill — i.e., the hook
did not filter it out), run the Grade → Diagnose → Fix pipeline from
`/prompt-auto-enhance`. Skip strengthening only for Grade A or pure
knowledge questions; the pipeline still produces the step transcript and
final prompt preview in those cases.

After strengthening, render every time:
- The grade card + before/after comparison (Step 4)
- The pipeline step transcript (Step 4.5)
- The final strengthened prompt that will execute (Step 4.6)

The final prompt is shown for transparency, not approval — execution
proceeds in the same response.

## Clarification & Confidence Gate — Ask/Grill Until Confident (runs before STEP 4.6)

This is the merged intent-resolution gate (lightweight clarification + the
`decision-authority.md` confidence gate, tiered):

- **1–2 small gaps** → the Clarification Gate below (one targeted question at a time).
- **Consequential fork** (expensive to reverse, materially changes the product, no
  clear best-practice winner) **and confidence < ~95%** → converge via **`/grill-me`**
  or **`/grill-with-docs`** before building — do not guess at WHAT to build.
- **"You take a call" / pre-authorized** → gate waived; proceed on best judgment,
  stating one-line assumptions.

Confidence is about **intent**, never reversible execution detail — those just get decided (stage 5).

**Trigger:** the prompt is > 15 characters (the only floor — handled
deterministically by the hook). Every prompt that reaches this skill is
evaluated for residual ambiguity after strengthening.

**Question budget:** no upper limit. Ask one question at a time and keep
asking until you have full confidence in the user's intent. Stop when
confidence is reached, not when a question count is hit.

**How:** one question per turn with a count and a recommendation. Read
the codebase before asking — do not ask what you can answer yourself.
Each question must be unanswerable from Tier 1/2 context.

**Sequencing:**
1. Strengthening runs first (Steps 0-3)
2. Grade card (Step 4)
3. Clarification & Confidence Gate runs here, if ambiguity/consequential fork remains
4. Step transcript (Step 4.5) and final prompt preview (Step 4.6) reflect the resolved intent
5. Role (4.7) → Execute under decision-authority (5) → Git if the turn produced changes (6)

## Resource CRUD Detection

If the prompt implies creating/updating/deleting a Claude Code resource,
follow the batch approval flow in `/prompt-auto-enhance`.

## Pipeline Rules

These are the load-bearing contracts:

- The `*Enhanced:*` indicator is on every response that reaches this rule
- Tier 1 context is gathered before responding
- Strengthening runs for any non-trivial prompt that the hook did not filter
- The grade card, step transcript, and final prompt preview are shown for
  every non-trivial prompt — even Grade A
- The Clarification & Confidence Gate runs until confidence is reached, not
  until a question count is hit; consequential forks under ~95% confidence go
  to `/grill-me` / `/grill-with-docs`, not a guess
- After the final prompt: state the role (`Role: <name> — <why>`,
  `engineering-roles.md`), then execute under decision-authority — decide
  reversible/internal work, escalate only the gated items in one line
  (`decision-authority.md`)
- For non-trivial coding work, a visible plan (plan mode / goal contract /
  inline plan block) precedes the first code edit (`plan-before-coding.md`,
  stage 4.8); trivial/mechanical edits skip it
- If the turn produced committable changes, run stage 6 git via
  `git-manager-agent` + `.githooks/pre-commit`; skip git on Q&A / read-only turns
- Resource CRUD requires the batch approval table — no creates / updates
  / deletes happen without explicit user approval
- Code is read before asking a clarification question
- Optional one-line skill hint at the end of STEP 4.6 in
  `/prompt-auto-enhance`: when the strengthened prompt clearly fits a
  workflow other than direct execution, append ONE italic line naming up
  to 2 relevant skills, with a quoted fragment from the user's prompt for
  each. Informational only — never gating, never numbered, never
  selectable. The auto-enhance skill's job is **prompt enhancement, not
  execution routing.** Skip the hint entirely on direct, mechanical,
  bug-fix, factual-lookup, and documentation prompts, and on prompts that
  already name a skill explicitly.
