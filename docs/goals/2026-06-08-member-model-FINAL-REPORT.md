# FINAL REPORT — Member-model coherence (#67) + app-wide "Viewing as" member lens (#66)

**Contract:** `docs/goals/2026-06-08-member-model-coherence-and-app-wide-lens.md` · **Run date:** 2026-06-08
**Branch:** `feat/member-model-coherence-and-lens` (worktree `firekaro-goal-member-model`)

## SUMMARY: DONE
Both must-haves built, verified, and merged. **#67** — earner is now DERIVED from labour income (role
collapsed to `ADULT | DEPENDENT`); **#66** — the "Viewing as &lt;member&gt;" lens now re-scopes every
member-attributable screen app-wide while FIRE/adequacy stays household-scoped and **invariant** to member
selection. No deferrals; no blockers.

- **PENDING:** none.
- **BLOCKED:** none.
- **NEXT:** the 14 parked good-to-haves remain blocked-pending-approval per the must-have focus lock
  (next-strongest: the honesty bugs #64/#65). Optional follow-ups below.

## Commits (atomic, on the branch)
| SHA | What |
|---|---|
| `0363723` | feat(member-model): collapse `Member.role` to ADULT\|DEPENDENT (Prisma migration) |
| `71b7028` | feat(member-model): canonical `isEarningMember` helper + ADULT\|DEPENDENT type |
| `6df8876` | feat(member-model): derive earner from income across kernel, store, seeds, libs (+ specs) |
| `66e7fa3` | feat(member-model): adults roster + earning-derived conditional fields in member/income UI (Closes #67) |
| `801d8da` | feat(member-lens): Viewing-as orthogonal to family-view + lensed income collections (kernel + #66 tests) |
| `49fa21a` | feat(member-lens): lens member-attributable screens app-wide + WholeHouseholdBadge (Closes #66) |
| `281b994` | fix(member-lens): keep household-solvency ratios coherent under a member lens (review follow-up) |

## Per-stage gate results
**Static (both trees, final):** FE `type-check` 0 errors + **1070 unit** pass + `build` ✓ · server
`type-check` 0 + `lint` ✓ + **161** pass (incl. live-DB `planner.integration` round-tripping ADULT through Supabase).

**Stage A (#67):** byte-identical FIRE lock HELD — every seed's FIRE number/age unchanged (derived earner set
reproduces the old EARNER set), locked by the seed + `headline-plausibility` + new `household-migration` specs.
New units: `member-earning.spec` (6), `household-migration.spec` (8), a derive-level business-only-earner test.
Rule 24/25/32 (demo): Adults section collapse, non-earning render (no retire-age + hint), add-salary→earner
transition (KPI 0→1), Rule 25 localStorage round-trip (`role:"ADULT"` + CTC persisted).

**Stage B (#66):** new kernel tests — lensed collections shrink to member+Joint, lens is family-view-orthogonal,
FIRE number/age/corpus/savings invariant across member selection. Rule 24/26/31/32 (demo, Mauryas): investments
Equity ₹1.40Cr→₹35L under "Madhu", insurance = Madhu's policies only, financial-health + fire-goals show the
"Whole household" badge, FIRE invariant. Server-adapter sub-run: Supabase hydration of the ADULT model + lens
driven via the real "Viewing as" dropdown, 0 console errors.

## Rule 24 verdicts (per screen) + evidence
| Screen | Verdict | Evidence |
|---|---|---|
| /wizard/profile + /profile (Adults section, non-earning↔earning) | PASS | `stageA-profile-nonearning-adult.png`, `stageA-profile-earning-adult.png` |
| /income/salary (adults roster, derived Earners KPI) | PASS | DOM (Earners 0→1, CTC persisted) |
| /investments/overview (lensed corpus + allocation) | PASS | DOM (₹3.60Cr→₹1.68Cr hero under Madhu post-fix) |
| /insurance/overview (lensed to member's policies) | PASS | DOM (Madhu LIFE ₹50L/1, HEALTH 0/0) |
| /financial-health (Whole household badge) | PASS | `stageB-financial-health-whole-household-badge.png` |
| /fire-goals/dashboard (badge + FIRE invariant) | PASS | DOM (badge present, FIRE unchanged) |
| server-adapter /investments/overview (lens control) | PASS | `stageB-server-adapter-investments-lens-control.png` |

**Rule 25 (Stage A write paths):** member add/edit → localStorage round-trip confirmed `role:"ADULT"` + salary
persisted; server-adapter health-probe + integration spec confirm Supabase persistence.
**Rule 26:** income/tax/FIRE consumers coherent under the lens; FIRE invariant across all household screens.

## FinTech Domain Analyst verdicts
- **#67 earner predicate:** PASS — labour-income-only definition is correct for every downstream gate
  (salaryIncome, anchor/retire age, 80CCD(2) scoping, EPS/gratuity); earning/longevity correctly DECOUPLED
  (homemaker survivor-years still funded via `isAdultRole`); migration byte-safe; EPS/gratuity correctly null
  for self-employed.
- **#66 FIRE coherence:** PASS — `fire_stays_household_invariant: true`. Adversarial trace: only 5 DISPLAY fields
  read `lensedScope`; every adequacy input (fireNumber, yearsToRegular, totalCorpus, savings, bridge, NPS
  annuity, EPF drag, Monte-Carlo) reads `householdScope`. The #22/#23 incoherence is NOT reintroduced.

## Skipped-as-already-covered (§0.2)
None — preflight found nothing implemented; this was a full build.

## DoD tally
**Phase 1:** ✅ grep `role==="EARNER"` empty + one helper everywhere · ✅ role ADULT\|DEPENDENT + earning-gated
fields · ✅ migration (hydrate + Prisma) FIRE byte-identical · ✅ new units. **Phase 2:** ✅ lens changes
income/investments/liabilities/insurance/tax · ✅ household screens show "Whole household" + unchanged · ✅ FIRE
invariant (locked) · ✅ kernel test · ✅ demo + server-adapter. **Static:** ✅ both trees + build. **Rules
24/25/26/31/32/33:** ✅ with evidence (rule-33 blind verifiers reconciled). **Ship:** ✅ atomic commits, merged
`--no-ff` → main, Closes #67 + #66. **DEFERRED:** none.

## LEARNINGS TO FOLD BACK (proposals only — governance edits need Abhay's approval)
1. **(goal-creator §0.1/§4)** When a `/goal` run executes in a dedicated worktree AND drives the Playwright MCP,
   MCP-written screenshots save to the **session/primary-worktree cwd**, not the goal worktree. Two rule-33
   blind verifiers returned a false-FATAL "screenshots missing" because the cited path (goal worktree) ≠ the
   save location (primary). Fix: pass ABSOLUTE filenames into the goal worktree, or `cp`/`ls`-verify evidence
   paths before handing them to a verifier. (Lesson captured in `.claude/tasks/lessons.md` 2026-06-08.)
2. **(design pattern, candidate for a rule or output-plausibility note)** Lensing a member-attributable screen
   is safe for LISTS/totals, but any **derived RATIO / coverage / warning** on that screen (DTI, SORR coverage,
   adequacy-vs-corpus) must keep numerator and denominator in the SAME scope — a lensed numerator over a
   household denominator emits a misleading per-member signal. Four such mismatches were caught by the
   independent code review post-wiring (DTI, SORR, income-total, investments hero) and fixed. A reusable
   guardrail: "ratios/warnings on a lensed screen compute on the household set (or expose a fully-lensed pair),
   never mixed." Maps to `output-plausibility-verification.md` (numerator/denominator-from-same-set).
3. **(no governance edit needed)** The `adults` (role-roster) vs `earners` (derived) getter split was the key
   to avoiding a no-earner→no-salary-input deadlock when earning became derived — a generic pattern for any
   "derived-status" migration where an editing surface must operate on the pre-derived roster.

_Per `baked-in-rules.md` §0.3 step 5: these are PROPOSALS; the run did not edit its own contract/skills/rules._
