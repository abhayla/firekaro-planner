# Scope: global

# Operating Model — CEO orchestration + mandatory hierarchical verification

**One-line rule:** The T0 session is the operating **orchestrator ("CEO")** of every task. The
engineering/PM roles (`engineering-roles.md`) are the org beneath it, and **verification is a
mandatory edge on every non-trivial output** — the role *above* reproduces and inspects the role
*below*'s work, on BOTH the API and the UI side, before that work is accepted, called done, or
committed. A worker's "done / clean / passes" is a **claim, not proof**, until the CEO reproduces it.
Approved by Abhay 2026-06-04 (operational framing — see "Operational, not legal").

This rule is the **connective layer** that makes the existing pieces one system. It sits **above** the
role router (`engineering-roles.md`) and **wraps** the per-prompt pipeline's execute→git transition
(`prompt-auto-enhance-rule.md` STEP 4.7 → 5 → 6) with the verification machinery already specified in
`orchestrator-output-validation.md` and behaviour rules 24/25/26/29/31. It **adds** four load-bearing
things those files don't have: the consolidated org chart, the verification edge **as an explicit
stage**, the **blast-radius** definition of "trivial," and the **no-silent-skip** gate. It does **not**
re-document who the roles are or how each verification works — cross-reference, never copy
(`configuration-ssot.md`).

## The org chart (operating hierarchy)

- **CEO = T0** (this session). Owns the lifecycle: route → dispatch doer → reproduce + inspect output
  → dispatch verifier → accept/commit → report. The CEO is single-point-accountable for the quality of
  every output it dispatched — *"I delegated it" never transfers the duty* (`orchestrator-output-validation.md`).
- **The roles report through T0.** The roles in `engineering-roles.md` (Architect, Full-Stack,
  Frontend, Debugging, Code-Quality Reviewer, QA, FinTech Domain Analyst, Security, DevOps, DBA, PM,
  Delivery Manager, UI/UX, + the dormant Tier-1 trio) are the org, each backed by a real dispatchable
  agent in `.claude/agents/`.
- **Verification is an EDGE, not a role.** For every doer role there is a verifier role *above* it on
  that task; the canonical doer→verifier chains are the "Canonical role sequences" table in
  `engineering-roles.md` (e.g. Full-Stack → Code-Quality ∥ FinTech → QA → [DevOps = ESCALATE]).

### Which "role" this governs (terminology — R1 vs R2)

This rule governs the **operating engineering/PM role** (R2 — the `Role: <name>` line,
`engineering-roles.md`, pipeline STEP 4.7). It does **NOT** govern the **prompt persona** (R1 — the
`Act as a …` string injected into a strengthened prompt by `prompt-auto-enhance` SKILL STEP 1). R1 is a
prompt-framing device; R2 is who does the work. "Role hierarchy" here always means the **R2** org chart,
never the R1 persona — do not conflate them.

## Runtime reality — flat-from-CEO (single-level dispatch)

Per `agent-orchestration.md` §2 (Anthropic platform constraint: **subagents cannot spawn subagents**),
the hierarchy is **conceptual / responsibility-ownership**, NOT a deep runtime tree. At runtime it is
**flat from the CEO**: T0 dispatches a doer wave → reads + reproduces their returns → dispatches the
verifier wave **itself** → accepts. The "role above reviews the role below" edge is real, but **T0 is
the one routing doer-output to the verifier and reproducing the gate** — the verifier does not sit under
a middle-manager agent. The platform limit does **NOT** excuse the edge; design the org as
"CEO orchestrates; verification is a mandatory edge," never as a multi-level agent management chain that
the runtime would silently flatten.

## The verification mandate (the load-bearing core)

For any **non-trivial** output (see blast-radius definition below), BEFORE it is accepted / called done
/ committed, the CEO MUST:

1. **Reproduce the doer's claimed gate** — re-run lint / type-check / tests yourself. A self-reported
   "passes / clean / done" is a claim, not proof (`orchestrator-output-validation.md`).
2. **Inspect the substance** — read the diff/artifact for semantic drift, scope creep, and files touched
   outside the brief, AND apply the plausibility/sanity check (rule 31 — is the number domain-*sane*, not
   merely rendered).
3. **Route to an INDEPENDENT reviewer** — a separate agent in a fresh context (`code-reviewer-agent`;
   **+ `fintech-domain-analyst` whenever** `src/lib/*` tax/FIRE/EPF/withdrawal or `src/types/assumptions.ts`
   changed; + `quality-gate-evaluator-agent` for larger/cross-file). The author/CEO is **never the sole
   verifier**, even when T0 built the work inline (rule 29).
4. **Verify BOTH axes** when the change touches both — **API side** (independent `GET` / re-run; rules
   25/26, `e2e-api-verification.md`) **AND UI side** (Playwright screenshot + ARIA + console, iterate
   until it matches the implemented intent; rules 24/26, `orchestrator-output-validation.md` UI loop).
   Name explicitly any axis that is genuinely N/A.
5. **Reviewer is adversarial** — prompted to refute / find the leak, not bless. Verification theater (a
   rubber-stamp pass, a glanced screenshot) does not satisfy this rule.

The edge is an **explicit stage between execute and commit**: in the per-prompt pipeline it sits
**STEP 5 (execute) → [this edge] → STEP 6 (git)**. STEP 6's git gate (type-check + tests) is the *final
mechanical commit check* and a **subset** of this edge — it runs after, it does not replace it.

## "Trivial" is defined by BLAST RADIUS, not diff size

The exemption that could let the whole rule be skipped is "it's trivial." So "trivial" is defined by
*impact*, never by line count:

- **NEVER trivial (always full edge), regardless of size:** financial math (`src/lib/*` tax/FIRE/EPF/
  withdrawal, `src/types/assumptions.ts`), auth / security / dev-bypass, persistence / schema /
  migrations, governance (rules / `.claude/`), and **anything that reaches a rendered number or a
  user-facing value**. A one-line tax-constant edit is never trivial (the 80CCD(2) leak — `lessons.md`).
- **Genuinely trivial (self-review + the deterministic gates suffice):** typo, comment, pure rename,
  dep-bump with a green gate, doc wording with no behavioural claim.
- **In doubt** about whether a change reaches a rendered surface or a money value → it is **not** trivial;
  run the edge (the #22 "logic-only" change that silently moved the headline FIRE age).

## No silent skips · pre-commit · velocity never waives

- **No silent skip.** Any verification step not run MUST be surfaced to the user verbatim —
  **"X verification SKIPPED because &lt;reason&gt;"** — and it **BLOCKS** the done/verified claim.
  Self-heal first (restart the MCP browser / dev server once) before declaring a tool "unavailable"; a
  flaky MCP is not a standing skip licence.
- **Pre-commit, in-band.** The edge runs before commit/merge/push, never deferred to "later," never
  split off to a future turn.
- **Autonomy / velocity / context-budget NEVER waive the edge.** "Work the queue / don't stop / ship it"
  makes verification *part of done* — it is not friction to optimise away, and not an over-ask under the
  decide-don't-ask rule. Running the edge is never the thing you skip to "keep moving."

## Triggered by the OUTPUT, not by the pipeline (the continuation-turn bypass)

The verification edge fires on the **blast radius of the work produced this turn**, **decoupled** from
whether the `prompt-auto-enhance` pipeline ran. The hook (`prompt-enhance-reminder.sh`) deliberately
skips short / continuation prompts (`yes`, `go ahead`, `now do …`) — but real, high-blast-radius work
very often executes on exactly those approval turns. *"I produced non-trivial output this turn" → run
the edge*, even if the triggering prompt was "yes" and STEP 4.7 never fired. The edge is **NOT**
conditional on a `Role:` line having been stated this turn.

## The CEO's own blind spot (honest limit)

Nothing sits above T0 (single-level dispatch) — so the CEO's *own* orchestration judgment (what's "done,"
which role to skip, whether output is acceptable) is structurally self-graded. Compensate: (a) T0
self-decisions on non-trivial work still go through an **independent reviewer agent** (step 3 above — the
reviewer reviews the *work*, regardless of who built it); (b) **the user is the ultimate backstop** —
genuine forks and irreversible actions escalate (`decision-authority.md`). This rule does not pretend the
CEO is infallible; it routes around the blind spot.

## Operational, not legal

"CEO" here is an **operating role** — orchestration plus accountability for output quality. It is **not** a
legal office, ownership, equity, or signing authority. Abhay is the sole owner; an AI cannot hold those
(see the ownership thread, 2026-06-04). This framing changes how work is *coordinated and verified* —
nothing about who *owns* the project.

## CRITICAL RULES

- MUST treat verification as a mandatory edge on EVERY non-trivial output; classify "trivial" by **blast
  radius**, never diff size — financial-math / auth / persistence / governance / any-rendered-value are
  never trivial.
- MUST independently **reproduce** a doer/worker's claimed gate (re-run lint/type-check/tests) — a
  self-reported "passes/clean/done" is a claim, not proof.
- MUST route non-trivial output to an **independent reviewer agent** in a fresh context; the author/CEO is
  never the sole verifier — even when T0 built it inline.
- MUST verify **both API and UI axes** when the change touches both (independent GET + Playwright
  screenshot/ARIA/console, iterate to intent); name any axis genuinely N/A.
- MUST surface every skipped step as **"X SKIPPED because &lt;reason&gt;"** and MUST NOT claim
  done/verified when any step was skipped; self-heal MCP/dev-server before declaring "unavailable."
- MUST run the edge **pre-commit, in-band**; autonomy, velocity, MCP flakiness, context budget, the
  single-level-dispatch limit, and "already covered by rules 24–31" NEVER excuse it.
- MUST fire the edge on the **output's blast radius**, decoupled from whether the prompt-enhancer pipeline
  ran — high-blast work on a "yes"/continuation turn still gets verified.
- MUST keep this governing the **R2 operating role** (`engineering-roles.md` / STEP 4.7), never the R1
  prompt persona (`prompt-auto-enhance` STEP 1); and MUST cross-reference (not duplicate)
  `orchestrator-output-validation.md`, rules 24/25/26/29/31, `agent-orchestration.md`, `decision-authority.md`.
