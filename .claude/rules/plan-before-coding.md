# Scope: global

# Plan Before Coding

**One-line rule:** For any non-trivial change, produce a **visible plan** BEFORE writing the first
line of code. Planning is the cheapest place to catch a wrong approach; code written before a plan
is the most expensive place to discover one.

This file is the SSOT for the "plan first" discipline. `claude-behavior.md` rule 1 points here. It
sits **after** the intent/confidence gate (`decision-authority.md` — which decides *what* to build)
and **before** TDD (`tdd-rule.md`) and the 7-step workflow (`workflow.md`).

## When a plan is MANDATORY

Produce a plan before the first code edit when ANY of these hold:
- The task touches **3+ files**, or needs **3+ ordered steps**.
- It's a **new feature, screen, endpoint, schema change, refactor, or migration**.
- It involves an **architectural decision or trade-off** with more than one defensible answer.
- It changes **financial math** (`src/lib/*.ts` tax/FIRE/EPF/withdrawal, `src/types/assumptions.ts`).
- You would otherwise be **guessing at structure** — you cannot yet name the files you will change.

## When a plan is NOT required (just do it)

- Typo / one-line fix / rename / dependency bump / comment.
- A single-file change with one obvious, unambiguous edit.
- Read-only investigation, Q&A, or running tests/verification.

Do NOT gold-plate a plan onto trivial work — that is its own waste (KISS, `claude-behavior.md` rule 16).

## What the plan MUST contain

A plan is not a restatement of the ask. It MUST show:
1. **Approach + WHY** — the chosen approach and why it beats the alternatives (rules 1, 12), not just *what* you will do.
2. **Files to create/modify** — the concrete list, by path. If you cannot list them, you are not ready to plan — explore the codebase first.
3. **Build sequence** — ordered steps, each independently verifiable.
4. **Verification** — how each step is proven: which spec, which `npm run` command, which UI/DB signal (rules 24/25/26).
5. **Risks / assumptions** — what could break, plus `**Assumption:** X` for anything uncertain (rule 3).

## How to surface it

- **Substantive / multi-step work** → use **plan mode** (`EnterPlanMode`) so the plan is reviewed before any edit; execute on approval. When requirements are still unclear, run `/brainstorm` or `/writing-plans` first.
- **Finalized scope ready to build** → offer a goal contract via `goal-creator` first (rule 28) — the contract IS the plan for autonomous `/goal` runs.
- **Smaller-but-non-trivial work** that does not warrant plan mode → write a short **inline plan block** (Approach / Files / Steps / Verification) in the response BEFORE the first `Edit`/`Write`.

## Relationship to the other gates (no duplication)

- **Confidence gate** (`decision-authority.md`) decides WHAT to build by converging on intent. Planning comes AFTER intent is locked and decides HOW.
- **TDD** (`tdd-rule.md`) red-first follows the plan: the plan names the tests; TDD writes them failing-first.
- **Goal contract** (rule 28 / `goal-creator`) is the planning artifact for unattended `/goal` runs.
- The per-turn pipeline (`prompt-auto-enhance-rule.md`, stage 4.8) injects the plan-first reminder every substantive turn so this is not missed under context pressure.

## CRITICAL RULES
- MUST produce a visible plan (plan mode, goal contract, or inline plan block) before the FIRST code edit on any non-trivial change.
- MUST include the concrete file list + WHY-this-approach + verification steps — a plan missing these is a restatement, not a plan.
- MUST re-plan immediately if the approach goes sideways mid-implementation (rule 1) instead of pushing forward.
- MUST NOT force a plan onto trivial/mechanical work (KISS) — the trigger list above is the gate.
- MUST NOT duplicate the confidence-gate / TDD / goal-contract content — cross-reference, never copy (`configuration-ssot.md`).
