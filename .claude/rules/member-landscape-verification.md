# Scope: global

# Member-Landscape Verification — the full E2E "Viewing as" sweep is mandatory, no exceptions

**One-line rule:** Any review/verification of a change that can affect a **member-attributable or
cross-cutting/display** screen MUST be verified with the **full end-to-end member-landscape sweep** —
driving the real "Viewing as &lt;member&gt;" dropdown across **every** route (`e2e/member-lens-sweep.spec.ts`)
— **never** a subset, a section-Overview spot-check, or a kernel/composable test alone. **No exceptions.**
Directed by Abhay 2026-06-09 after the #66/#81 verification miss (gh #86).

This rule exists because the cheaper methods **structurally cannot** catch the class that shipped: a
must-have feature ("Viewing as" lens) passed FinTech + code-review + rule-33 blind verification yet was
**dead on the tax screen + every leaf** — because all lens tests ran at the kernel/composable layer
(they assert `derive()`/`useFireDerive()` PRODUCE lensed outputs) and the manual sweep exercised the
section Overviews and **generalised** "lens works" to the rest. The full real-dropdown sweep is the only
method that proves each SCREEN actually re-scopes. Root-cause detail: gh #86 + `docs/PROJECT-LOG.md`
D-2026-06-09-03.

## The two-instrument gate (both required)

| Instrument | File | What it proves | Layer |
|---|---|---|---|
| **Static coverage scan** | `src/lib/lens-coverage-invariant.spec.ts` | every member-attributable screen *references* a lensed output (can't be "generalised from a subset" — it ENUMERATES) | fast, deterministic, in `npm run test:unit` |
| **Full E2E member-landscape sweep** | `e2e/member-lens-sweep.spec.ts` | each screen's on-screen ₹ figures genuinely CHANGE when the real dropdown switches member (the prod symptom) | real browser, demo mode |

The scan is necessary-but-not-sufficient (it checks "wired", not "works"); the E2E sweep is the
substance proof. **Verifying the lens / a member-attributable screen requires BOTH.**

## MUST / MUST NOT

- MUST run the **full** E2E member-landscape sweep (every route, real dropdown) to verify any change to:
  the member lens; `derive.ts`/`useFireDerive.ts` lensed outputs; `src/stores/ui.ts` `viewingMemberId`;
  the AppBar "Viewing as" control; or ANY member-attributable / cross-cutting / display screen.
- MUST treat kernel/composable tests, section-Overview spot-checks, and a single-screen manual toggle as
  **necessary-but-NOT-sufficient** — they may NEVER be the SOLE verification of member-lens behavior.
- MUST, when the sweep "won't run" (times out uniformly on every route), first verify the **SWEEP ITSELF
  is not broken** before concluding the change is blocked. This sweep was once **"green by never running"**
  (it waited on `#app[data-hydrated="true"]`, a signal this extracted repo never ships → it timed out 30s on
  every route and verified NOTHING; repaired 2026-06-10 to wait on `.v-select:has(.mdi-eye)` + dismiss the
  `.tour-overlay`). A uniformly-timing-out mandatory gate is a **broken gate, not a green one**.
- MUST keep the sweep's route list **enumerated and complete** — when a new member-attributable screen
  is added, add it to `e2e/member-lens-sweep.spec.ts` **and** the static-scan list in the same change.
  A "we only checked the screens we changed" verification is exactly the miss this rule forbids.
- MUST run the sweep in **demo mode** (LocalStorageAdapter — the standard `npm run test:e2e` / CI flow);
  a local `.env.local` server-adapter dev server has no splash/sample flow and is NOT a valid host for it.
- MUST surface a genuinely-blocked run **verbatim** ("member-landscape sweep SKIPPED because &lt;reason&gt;")
  and MUST NOT claim the change verified — a skip BLOCKS the verified/done claim (no silent skip).
- MUST NOT carve out "small" or "unrelated-looking" changes as exceptions for member-attributable/display
  work — **no exceptions** (Abhay's directive). The boundary is the SCREEN CLASS (member-attributable /
  cross-cutting / display), not the size of the diff.
- Genuinely out of scope (the rule does not govern these): pure backend/server-only changes with no UI
  surface, docs-only changes, and changes that demonstrably touch no member-attributable/cross-cutting
  screen. These are not "exceptions" — they are simply not member-landscape verification.

## Relationship to the other rules (no duplication — `configuration-ssot.md`)

- `claude-behavior.md` rules 24/26/32 (UI render / cross-page / interactive-functionality) and 33 (blind
  test re-check) define the per-screen verification SUBSTANCE; this rule mandates the *full-landscape*,
  *no-subset* SCOPE for the member lens specifically.
- `testing-strategy.md` owns WHERE tests run (this sweep = pre-merge E2E, demo+Supabase localhost, never
  on prod); this rule owns the no-exceptions MANDATE.
- `independent-test-verification.md` (rule 33) still applies — the sweep's verdict is re-checked by a
  separate context-blind agent.

## CRITICAL RULES

- MUST verify any member-attributable / cross-cutting / display change with the FULL E2E member-landscape
  sweep across EVERY route — never a subset, Overview spot-check, or kernel-only test. No exceptions.
- MUST run BOTH instruments (the static coverage scan + the E2E sweep) for member-lens work.
- MUST keep the sweep's route list enumerated + complete; add new member-attributable screens to it in the
  same change.
- MUST surface a blocked sweep verbatim and treat it as BLOCKING the verified claim.
