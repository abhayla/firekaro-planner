# Contract template (house format)

Fill every `<…>` placeholder with a resolved decision. Delete sections that genuinely
don't apply (e.g. a pure process/loop contract has no "design decisions" stage), but
never leave an open question. The two live references this skeleton is distilled from:

- `docs/goals/complete-income-screens-salary-overview.md` — a build/propagation contract
- `docs/goals/2026-05-22-autonomous-issue-loop.md` — a loop/process contract

Match their density. Long is correct — length buys an unattended run that does the right thing.

---

```markdown
# GOAL — <one-line title of what this run achieves>

**Type:** Autonomous <build | propagation | fix-loop | migration | audit> contract
(run via `/goal`). Execute end-to-end with **zero user input**. Every design decision is
pre-made below — do not pause to ask; make the call the contract specifies and keep going
until the Definition of Done is fully met.

**Owner:** Abhay · **Created:** <YYYY-MM-DD> · **Scope:** `<app tree / dir>` ONLY
**Invocation:** `/goal docs/goals/<YYYY-MM-DD-slug>.md`

---

## 0. Mission

<One tight paragraph: the objective and what "done" looks like. State whether this is a
fresh build vs a propagation/refactor vs a fix loop, and the one non-negotiable outcome.>

---

## 0.2 PREFLIGHT — read the coverage ledger FIRST (idempotency · NO duplication)

← PASTE the "§0.2 Preflight" block from `references/baked-in-rules.md` HERE, naming this
project's actual coverage/gap ledger doc. This is the run's FIRST action, before any stage.
It makes the contract safe to run while a parallel session implements part of it: read the
ledger + code + `git log`, SKIP anything already done (verify-only), build only the delta,
and report skips. (Omit only for a true greenfield goal with no prior/parallel work.)

---

## 1. Context you need (read first)

<The exact files / components / stores / composables the run must study, with import
paths. Include any gotchas — e.g. the `cd mvp` CWD trap, autosave behavior to verify,
envelope-unwrap traps. Use a table for component → import → purpose when there are many.>

| Thing | Path / import | Why it matters |
|---|---|---|
| <…> | <…> | <…> |

**Gotchas:** <CWD, persistence key shape, ports, anything that silently misfires.>

---

## 2. STAGE <A> — <name>

**File(s):** `<path>` (<create | rewrite | edit>). **Keep untouched:** `<files the run
must NOT touch>`.

### Pre-made design decisions (do NOT deviate)

1. <Decision, stated as a fact — not a menu. Repeat for every fork: layout, data source,
   props, colors, copy, empty-state, edit/add flow, etc.>
2. <…>

### <Stage> acceptance (run the §<N> gate sweep before committing this stage)
- <Concrete, checkable acceptance criteria.>
- **Stage gate sweep:** static → Rule 24 → Rule 25 (if writes) → Rule 26 (cross-page) →
  a11y/Lighthouse (if UI). All green or DEFERRED-with-reason before the stage's commit.

<Repeat STAGE B, C, … as needed.>

---

## <N>. Verification gates  ← PASTE references/baked-in-rules.md HERE, adapted to the tree

<Insert the standing-rules block. Adapt only the mechanics to the target app tree:
- static-gate commands + the CWD they run from;
- Rule 25 persistence mechanism (DB curl with `x-dev-bypass: true` for the root app;
  localStorage round-trip via MCP for `mvp/`);
- ports and routes.
Keep the mandate intact — do not soften rules 24/25/26.>

---

## <N+1>. Commit + push

<Number of commits and their boundaries. Conventional-commit messages (the right scope
prefix — e.g. `feat(mvp-v5): …`). What to stage (NEVER `git add -A` — name the files) and
what untracked items to leave alone. Branch + push target. Co-author trailer.>

---

## <N+2>. Definition of Done (all MUST be true)

**Build / change:**
- [ ] <…>

**Static gates:**
- [ ] type-check 0 errors · unit tests no regression · build succeeds <+ bundle budget if any>.

**Rule 24 (per UI screen):**
- [ ] screenshot + ARIA snapshot + console_messages pass; PNG read + confirmed; zero NEW console errors.

**Rule 25 (per write path):**
- [ ] dual-signal: UI reflects change AND <persistence> round-trip confirms expected shape/values.

**Rule 26 (cross-page consistency):**
- [ ] mutated resource propagates to every cross-page consumer (name them) — values equal (±1 rounding).

**a11y / Lighthouse (if UI):**
- [ ] zero Critical+Serious WCAG 2.1 AA (or DEFERRED w/ reason) · Lighthouse within target (or DEFERRED).

**Ship:**
- [ ] <N> conventional commits pushed to `<branch>`.
- [ ] Any deferrals logged in `docs/goals/.run/<slug>-DEFERRED.md` with rule status + reason.

---

## <N+3>. Final report (required on completion)

Produce a closing report containing: commit SHAs + per-stage gate results; Rule 24 verdict
per screen + PNG paths; Rule 25 verdict per write path; Rule 26 cross-page result; a11y +
Lighthouse summary; DoD green/amber/red tally; any DEFERRED entries with rule status + reason.

---

## <N+4>. Guardrails (hard stops)

- **<tree> only.** Never write outside it; never write `D:\Abhay\VibeCoding\5Wealths\`.
- **No new dependencies** unless the contract explicitly authorizes one.
- **No design reinvention** — reuse the named shared components; extend over inline.
- **Honesty:** no synthetic/fake data — remove fakery rather than carry it forward.
- **Stop only on a true blocker** (missing token, OS denial, decision contradiction in this
  contract, irrecoverable build break after the full fix budget). Context-budget anxiety is
  NOT a blocker — hand off via a one-line continuation note, never fake-complete.
- **Strategic items are `TODO(5W):` notes**, not handled here — repo-level work only.

---

## Authorization trail

| # | Decision | Choice |
|---|---|---|
| 1 | <fork> | <resolved choice> |
| … | <…> | <…> |

---

## References (loaded transitively by the skills this contract invokes)

- `rules/claude-behavior.md` — rules 15, 17, 20, 23, 24, 25, 26
- `rules/tdd.md` — red-green-refactor (if the contract does TDD)
- `rules/dev-bypass-auth.md` — `x-dev-bypass: true` for root-app Rule 26 API checks
- <the storage-adapter / mvp/CLAUDE.md / section-plan / e2e rule files relevant to this goal>
- <the skills this contract drives: /fix-issue, /fix-loop, /auto-verify, /systematic-debugging, /a11y-audit, etc.>
```
