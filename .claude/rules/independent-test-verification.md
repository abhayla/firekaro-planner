# Scope: global

# Independent Test Verification — the blind second tester

**One-line rule:** Whenever an agent OR a process performs **testing** (headed/headless Playwright,
E2E, UI verification, a data-entry/persistence run, or any run that emits a pass/fail verdict), that
verdict MUST be independently re-checked by a **SEPARATE agent that has NO context of how the first
test ran** — given the **same inputs + the raw evidence** (not the first agent's conclusions) — whose
job is to judge **(a) was the testing actually done properly + completely, and (b) is the verdict
correct**. The first verdict is **not accepted** until the blind verifier concurs. Directed by Abhay
2026-06-05.

This is the **testing-specific instance** of the verification EDGE in `operating-model.md` and the
supervisor gate in `orchestrator-output-validation.md` — it does NOT replace them; it makes the
"independent reviewer in a fresh context" mandatory and **automatic for every test run**, and adds the
**context-isolation** requirement (the verifier must be blind to the doer's narrative). Cross-reference,
never duplicate (`configuration-ssot.md`).

## Why (the principle)

An agent that ran a test is the worst judge of whether its own test was adequate — it is anchored to
its own plan, inherits its own blind spots, and reads its own "PASS" as truth (the shape-vs-substance
trap, rule 31; the "claimed tested everything" miss that prompted this rule). Independent V&V
(IEEE-1012) and the separation of *doer* and *checker* exist precisely to break that bias. A verifier
with a **clean context** and the **same raw inputs** will catch: coverage gaps (sections/controls the
doer never exercised), evidence that does not actually support the verdict (a green exit code over a
blank screen), and unjustified "PASS" claims.

## The two roles

| Role | Context | Gets | Produces |
|---|---|---|---|
| **Tester** (doer) | its own | the test scope/requirements | raw evidence (screenshots, ARIA, console, DOM, persisted data) **+** a verdict |
| **Blind Verifier** | **fresh — NO knowledge of the tester's run, reasoning, or narrative** | the **same** test scope/requirements **+** the tester's raw **evidence** (NOT its conclusions presented as fact) | an **independent** judgment: coverage-complete? evidence supports the verdict? + a concur / dissent with specifics |

## MUST / MUST NOT

- MUST dispatch a **separate** agent (or process) as the blind verifier — NEVER the same agent that
  ran the test, and NEVER T0 alone reading the tester's summary.
- The verifier MUST be **context-isolated**: its dispatch prompt contains the **original requirements
  + the raw evidence paths**, and MUST NOT contain the tester's transcript, reasoning, or its "PASS/FAIL"
  asserted as ground truth. (State the tester's verdict only as *a claim to be checked*, if at all.)
- The verifier MUST judge **both** axes: **coverage** ("did the test exercise every required
  screen/control/scenario — substance, not shape, rule 32") AND **verdict-correctness** ("does the
  evidence actually support pass/fail — plausibility, rule 31").
- The verifier MUST be **adversarial** — prompted to find what the test missed or got wrong, not to
  bless it. A rubber-stamp "looks good" is a verification-theater failure and does not satisfy this rule.
- The first verdict MUST NOT be accepted / reported as done while the verifier **dissents**; on
  dissent, T0 reconciles (re-test, widen coverage, or dig into the discrepancy) before claiming done.
- Applies to **T0's own testing too**: when T0 itself ran the test (e.g. drove Playwright at T0), T0
  MUST still dispatch a blind verifier — T0 is never the sole verifier of a test it ran (operating-model
  CEO blind-spot).
- MUST be applied at the **blast-radius** bar of `operating-model.md`: every non-trivial test run
  (anything touching a user-facing flow, a rendered value, persistence, or a "is it working?" claim).
  Genuinely trivial checks (a single unit assertion already green in CI) don't need a second agent.
- MUST surface a **skipped** verification verbatim — "independent test verification SKIPPED because
  <reason>" — and that BLOCKS the done/verified claim (no silent skip).

## How (Claude Code mechanism — single-level dispatch)

T0 orchestrates BOTH waves (subagents cannot spawn subagents — `agent-orchestration.md`):

1. **Tester wave** — T0 runs / dispatches the test; evidence is written to disk
   (`verification-evidence/{run_id}/…`), verdict returned as a compact contract.
2. **Blind-verifier wave** — T0 dispatches a SEPARATE agent (e.g. `visual-inspector-agent`,
   `tester-agent`, or `general-purpose`) in a **fresh** dispatch whose prompt = `{original
   requirements + evidence paths + rubric}` and explicitly **excludes** the tester's reasoning. The
   verifier reads the raw evidence and returns `{coverage_complete, verdict_correct, dissents[],
   confidence}`.
3. **Reconcile** — T0 accepts only when the verifier concurs; otherwise re-runs/expands and repeats.

Keep both returns compact (verdicts + evidence paths, not raw screenshot bytes) so T0 context stays
lean.

## Relationship to the other gates (no duplication)

- `operating-model.md` — the general verification edge (reproduce gate + independent reviewer, API+UI).
  This rule is its **mandatory, context-isolated, auto-applied form for TEST outputs**.
- `orchestrator-output-validation.md` — the supervisor must reproduce + inspect; this rule adds the
  **blind second agent** specifically for testing verdicts.
- Rule 26 (`claude-behavior.md`) — post-test-phase independent sweep; this rule names *who* does it
  (a context-isolated agent) and *what* it judges (coverage + verdict-correctness).
- Rule 29 — independent reviewer for *implementation* output; this is its **testing** sibling.
- `testing-strategy.md` — *where* tests run; this rule governs *who verifies the test was done right*.

## CRITICAL RULES

- MUST have every non-trivial test verdict re-checked by a **separate, context-blind** agent given the
  **same inputs + raw evidence** — never the same agent, never T0's summary alone.
- MUST keep the verifier **isolated** from the tester's reasoning/verdict-as-fact, and **adversarial**.
- MUST judge **both** coverage (substance/rule 32) and verdict-correctness (plausibility/rule 31).
- MUST NOT accept/report a test as passed while the blind verifier dissents — reconcile first.
- MUST apply it to T0's own test runs too; MUST surface any skip verbatim (no silent skip).
