# Scope: global

# Orchestrator Output Validation — the supervisor gate

**One-line rule:** The T0 orchestrator is the **SUPERVISOR** of every output it dispatches. Reading a
worker's return contract is necessary but **NOT sufficient** — the orchestrator MUST independently
**check → validate → verify the OUTPUT SUBSTANCE** (reproduce the gate, inspect the artifact/diff)
before accepting it, building on it, or committing it. A worker's self-reported "done / clean / tests
pass" is a **CLAIM, not proof**, until the supervisor reproduces it. Directed by Abhay 2026-06-03:
*"output should be checked, validated and verified by a supervisor; since you are top orchestrator,
you check and validate their outputs."*

## Who supervises whom

Single-dispatch-level (`agent-orchestration.md` §2): T0 is the ONLY orchestrator — it dispatches
workers/roles and they return. There is no higher checker, so **T0 IS the supervisor** and owns the
quality of every output that flows back. "I delegated it" NEVER transfers the validation duty.

## The supervisor gate — MUST, for every dispatched worker AND self-routed role output

Before accepting / committing / building on ANY output:

1. **Read** the structured return contract (gate / artifacts / summary) — the floor, not the ceiling
   (`agent-orchestration.md` §2 visibility rule).
2. **Reproduce the gate** — re-run the worker's claimed check YOURSELF (lint / type-check / tests).
   If the worker reports "lint exits 0", run lint. Never accept a reported exit code as proof.
3. **Inspect the substance** — read the actual diff / artifact for semantic drift, scope creep, and
   shape-vs-substance (did it change behaviour it shouldn't? touch files it was told not to?).
4. **Cross-check the contract** — does the output match what was ASKED (scope honored, constraints
   respected, files confined to the brief)?
5. **Only then accept.** On ANY divergence: return the work to the worker (`SendMessage`) or fix at
   T0 — never accept-and-hope.

## UI outputs — the Playwright loop (MANDATORY, iterate until it matches intent)

For ANY output that changes rendered UI (`.vue` templates, Vuetify props, styles, routes), the
supervisor's "reproduce + inspect" steps MUST be a **Playwright MCP loop** — NEVER accepted on
code-inspection alone (Abhay 2026-06-03: *"always perform UI validation using Playwright iteratively
until it looks and works the way you implemented"*):

1. **navigate** (`mcp__playwright__browser_navigate`) to the affected route (self-heal: start
   `npm run dev` once if the dev server is down).
2. **screenshot** (`browser_take_screenshot`) — does it **LOOK** the way it was implemented?
3. **ARIA snapshot** (`browser_snapshot`) — is the intended element structurally present?
4. **console** (`browser_console_messages`) — no NEW errors/warnings from the change?
5. **interact** (click / fill / select) — does it **WORK** the way it was implemented?
6. **Compare to the implemented intent — look AND behaviour**, not just "renders without error." On
   ANY mismatch: fix the ROOT cause, re-run from step 1. **ITERATE until the rendered result matches
   intent** (per rule 24: cap in-loop at 3 attempts, then `/fix-loop` — the success bar is
   match-intent, never "good enough").

"It builds / no console error" is a CLAIM about the UI; the screenshot + interaction are the proof.
Pairs with rules 24/25/26 (dev-time + test-time mirrors) — this rule makes the Playwright loop the
non-negotiable substance of the supervisor gate for UI.

## Relationship to the other gates (no duplication — `configuration-ssot.md`)

- **`agent-orchestration.md` §2** says READ the return. This rule says reading is NOT ENOUGH —
  reproduce + inspect the substance.
- **Rule 29** (`claude-behavior.md`) dispatches a SEPARATE *independent reviewer* for the *author's*
  work. This rule is the orchestrator's OWN supervisory duty over EVERY worker return — the gate that
  decides whether to even accept a worker's output. They COMPOSE: builder-worker returns → T0
  supervisor-validates (this rule) → for non-trivial changes T0 also dispatches an independent
  reviewer (rule 29) → T0 commits.
- **Rules 24/25/26** define what "verify" means in substance for UI / DB / cross-page outputs.

## CRITICAL RULES

- MUST independently reproduce a worker's claimed gate (re-run lint / type-check / tests) — never
  accept the self-reported result as proof.
- MUST inspect the actual output substance (diff / artifact) for semantic drift, scope creep, and
  files touched outside the brief, before accepting.
- MUST NOT proceed / commit on a worker return until the supervisor gate passes; on divergence,
  return the work to the worker or fix at T0.
- MUST NOT treat delegation as transferring the validation duty — T0 owns the quality of every
  output it dispatched.
