# Scope: global

# Output Plausibility Verification — catch "wrong-but-working", not just "broken"

**One-line rule:** A user-facing value that *renders cleanly, type-checks, and passes the
unit tests* can still be **domain-absurd**. Every verification of a user-facing output — above all a
**financial number** — MUST include a **semantic plausibility check** ("is this number SANE for this
scenario?"), not only the mechanical gates ("does it render / persist / pass?"). Mechanical-green ≠
correct. Added 2026-06-03 after a flagship-number bug (`#22`) survived every existing gate.

## Why this rule exists (the failure it kills)

The FIRE headline was wrong **three times** (`#18` missing band, `#20` inflation frame, `#22` lens)
and **every gate stayed green**: type-check passed, the component rendered, the console was clean, and
the unit tests asserted the headline *matched the current computation* (shape) instead of *being
domain-sane* (substance). `#22` showed a 30-year-old affluent dual-income couple retiring at **age
81** — absurd on sight, yet it shipped because no gate asked *"is this plausible?"* and the human
reviewer (me) accepted mechanical-green without the flinch. This is the **shape-vs-substance** class
from `bug-filing-and-sibling-audit.md`, applied to verification rather than to a single test.

`#22` also exposed a second trap: the seed test exercised `isFamilyView:true` (the coherent path)
while the **product default is `isFamilyView:false`** — test and product **diverged**, so the test was
green on a path no user sees.

## CRITICAL RULES

- MUST apply a **semantic sanity check** to every user-facing output value before declaring done —
  especially financial numbers. Ask "would a domain expert / the persona flinch at this?" A FIRE age
  of 81 for a 30-year-old, a savings rate of 3% or 90%, a negative/∞ corpus, a tax > income → STOP and
  investigate the ROOT cause. Do NOT accept it because the suite is green.
- MUST verify on the **DEFAULT PRODUCT path/lens** — the exact inputs/lens a user sees by default
  (here: `isFamilyView:false, viewingMemberId:null`). Never substitute a convenient configuration; a
  test green on a non-default path is the divergence that hid `#22`.
- MUST add a **plausibility bound** to `src/lib/headline-plausibility.spec.ts` for any NEW
  headline/flagship output field — a domain-sane range asserted on the default lens, so an
  absurd-but-rendering value is a CI failure, not a silent ship.
- MUST, for any **financial-math change** (`src/lib/*.ts` FIRE/tax/withdrawal or `assumptions.ts`),
  dispatch the **FinTech Domain Analyst** to validate the **END-TO-END headline** against
  persona-sane bounds — not only the engine internals. (`#20`/`#22` were caught only when FinTech was
  asked "is this final number right for this persona?", not "is the formula right?")
- MUST treat tests that assert "matches the current computation" as **shape locks, not correctness
  proofs** — pair every such lock with at least one **substance** assertion (sane bounds, a coherence
  invariant like numerator/denominator from the same set, or agreement with an independent path).
- MUST NOT close a bug fix without a **sibling sweep** across the SAME class on the default path —
  `#22`'s first fix patched one of ~20 consumers because the sweep was skipped (the exact gap this
  rule forbids). See `bug-filing-and-sibling-audit.md`.

## Relationship to the other gates (no duplication)

- Rules **24/25/26** (`claude-behavior.md`) verify a UI output *renders / persists / matches across
  pages* — **shape**. This rule adds the missing **substance** axis: is the rendered *value* sane.
- **Rule 29** dispatches an independent reviewer; this rule says that review MUST include end-to-end
  plausibility, not just code-craft.
- The **supervisor gate** (`orchestrator-output-validation.md`) requires reproducing a worker's claim;
  this rule says the reproduction MUST include the semantic sanity check, not just re-running tests.
