# ADR-0006 Phase 1c — completion report

Branch `feat/adr-0006-honest-inflation-frame`. 5 commits, all `[skip ci]`. Not pushed, no PR, no
Playwright. Baseline for every figure is HEAD `a9f3c94` (Phase 1 + Phase 2 + Phase 1b).

**Phase 1b's HIGH-1 is resolved.** The fork it stopped on was decided by the FinTech role, and the
whole component-target model has landed along with items (b) through (g).

---

## 1. The decision that unblocked it

**The healthcare corpus reservation drifts at `healthcareInflation` (9%), not at the household
basket.** This supersedes decision (a) of the earlier Phase-1c brief, which said the basket.

The reservation buffers **medical shocks** — a hospitalisation, a surgery, a long-term-care
episode — whose price rises at medical inflation. The household basket's 8%-weighted healthcare
bucket covers **recurring** healthcare spend (premiums, consultations, medicines) inside the
ongoing-expenses corpus. Different rupees, so there is no double count, and Phase-1b's suspected
"triple count" (premium + bucket + reservation) resolves to three distinct obligations.

The consequence Phase 1b flagged as a worry is the mechanism, not a bug: a buffer that is 20% of
the base today grows toward **~44% of it by year 30**. That *is* "the healthcare weight of a
household rises with age" (the FinTech ADR review's own framing), and it is bounded — the weight
can never exceed the buffer's own price path, because the legs are explicit schedules rather than
one blended rate.

**Decision (b) stands as briefed:** a dated goal inflates at its own bucket rate until its due
year and is then held **flat in nominal rupees** (the money was spent then; holding it flat rather
than removing it is the conservative half — the corpus had to carry it to the due date and is
never credited back). A goal falling beyond the horizon inflates throughout.

### The expectation was hit exactly

| Persona | Expected (probe column) | Measured | delta |
|---|---|---|---|
| Sharmas | 55.42 | **55.42** | 0.00 |
| Mehtas | 51.00 | **51.00** | 0.00 |
| Iyers | 57.83 | **57.83** | 0.00 |
| Mauryas | 68.92 | **68.92** | 0.00 |

Guards: every persona <= 70 (Mauryas has **1.08 y** of margin) and <= `planToAge`. Every persona is
**LATER than the pre-ADR headline** — the one apparent exception is the Sharmas (56 -> 55.42), and
that is the step-up leg: the frame leg alone puts them at 73, locked separately as assertion 4 of
`inflation-frame-invariant.spec.ts`. No bound was widened to accommodate anything.

---

## 2. Per-persona: pre-ADR -> Phase 1 -> Phase 1c

Default product lens, stored target age. `needReal` / `needNominal` / `requiredMonthlyReal` from
`requiredMonthlyContributionFor` at the stored target age; MC p50 from the production
`useFireDerive().monteCarlo`.

| Persona | metric | pre-ADR-0006 | Phase 1 | **Phase 1c** | why |
|---|---|---|---|---|---|
| **Sharmas** (30 -> 47) | fireAge | 56 | 54.42 | **55.42** | +1.00 y: the reservation leg at 9% instead of 6.24% over 25 y. Their dated goals are small, so (b)'s cap barely offsets it. |
| | needReal | Rs 10.60 Cr | Rs 11.01 Cr | **Rs 12.17 Cr** | +10.5% on Phase 1 — same cause, compounded over T = 17. |
| | needNominal | Rs 28.54 Cr | Rs 29.66 Cr | **Rs 32.76 Cr** | the same figure in target-year rupees. |
| | requiredMonthlyReal | Inf | Inf | **Inf** | honestly unreachable at 47; the hero says "move the age". |
| | MC p50 | — | 25.83 | **26.83** | tracks the +1 y headline; gap to deterministic 1.42 y. |
| **Mehtas** (45 -> 47) | fireAge | 51 | 50.58 | **51.00** | +0.42 y: same cause, but a 6-year horizon gives it little room. |
| | needReal | Rs 10.23 Cr | Rs 10.28 Cr | **Rs 10.35 Cr** | +0.7% — T = 2, so almost nothing compounds. |
| | needNominal | Rs 11.50 Cr | Rs 11.55 Cr | **Rs 11.63 Cr** | |
| | requiredMonthlyReal | Inf | Inf | **Inf** | |
| | MC p50 | — | 6.00 | **6.17** | gap to deterministic 0.17 y. |
| **Iyers** (38 -> 55) | fireAge | 57 | 56.83 | **57.83** | +1.00 y: reservation leg over a 20-year horizon; small family layer. |
| | needReal | Rs 8.03 Cr | Rs 8.35 Cr | **Rs 8.74 Cr** | +4.7% on Phase 1. |
| | needNominal | Rs 21.63 Cr | Rs 22.48 Cr | **Rs 23.54 Cr** | |
| | requiredMonthlyReal | Rs 1,48,264 | Rs 1,46,273 | **Rs 1,58,421** | +8.3%, **upward** = conservative. Re-recorded in the live-defaults lock with this reason; the +/-8% allowance was NOT widened. |
| | MC p50 | — | 20.58 | **21.58** | gap to deterministic 1.75 y. |
| **Mauryas** (44 -> 50) | fireAge | 68 | 68.33 | **68.92** | +0.59 y only. The reservation leg alone is worth ~+2 y here; (b)'s goal cap claws most of it back — this persona has the largest education goals of the four. That interaction is exactly why the two halves had to land together. |
| | needReal | Rs 11.33 Cr | Rs 11.49 Cr | **Rs 11.90 Cr** | +3.6% on Phase 1. |
| | needNominal | Rs 16.07 Cr | Rs 16.29 Cr | **Rs 16.88 Cr** | |
| | requiredMonthlyReal | Inf | Inf | **Inf** | |
| | MC p50 | — | 25.92 | **26.67** | gap to deterministic **1.75 y**, down from the 3.25 y measured before the band was moved onto the effective drift. |

**`fireNumber` is byte-identical to pre-ADR for all four personas** (Rs 10.60 / 10.23 / 8.03 /
11.33 Cr). The target's *size* has never moved in any phase of ADR-0006 — only its trajectory.
Two-frame agreement (assertion 3) still holds: the chart crossover is 56 / 51 / 58 / 69 against
headline ages 55.42 / 51.00 / 57.83 / 68.92.

---

## 3. What landed, item by item

| Item | Commit | One line |
|---|---|---|
| (a)+(b) kernel | `c9ddd03` | `target(t) = (base + contingency)(1+b)^t + reservation(1+healthcare)^t + sum goal_i(1+rate_i)^min(t, due_i)`, exact to `fireNumber` at t = 0. `regularTargetComponentsRealAt(t)` is the today's-Rs three-way split summing to the total; `effectiveTargetDriftRate` / `...GrowthNominal` are the scalar equivalents anchored on the **solved** horizon. The solver, the bridge `corpusScale` and `projectCorpus` all read the one schedule. |
| (b) solver mirror | `4caeb43` | `required-contribution.ts` reads `needReal` + all three narrated components off the component schedule. `(1+g)^T` over-states the need for any household whose goals fall due inside the horizon, and the steps would stop summing to the headline the moment one did. |
| (d) positive control | `4caeb43` | Rewritten — see section 4. |
| (e) education-goal spec | `4caeb43` | New `planned-goal-drift.spec.ts`: Rs 50 L due in 8 years at a 17-year target is exactly `5,000,000 x 1.09^8 / 1.06^17` = **Rs 36,99,834**, asserted as that literal AND as the formula; a beyond-horizon goal inflates throughout; the leg is provably flat in nominal Rs from year 8 to year 30. |
| (f) Coast chart | `f620207` | `coastTrajectory` takes `fireTargetRealAt`; `FireMilestonesCard` passes the kernel's curve; legend copy is "FIRE target (rising with your costs)"; a non-finite reading falls back to the flat number rather than a NaN axis. Also moved the coast-corpus discount and the Monte Carlo `targetGrowthRate` off the base-leg-only `realTargetDriftRate`. |
| (g) re-baselines | `1f19484` | Golden master (4 snapshots), `derive.spec` Sharmas pin, seed-consistency bands, the live-defaults record, the deflation origin-alignment guard, `useAcceleration`'s baseline. Reasons per persona in section 2 and in the file comments. |

Docs: ADR Decision item (2) now describes the due-year cap, and item (7) — the reservation
triple-count audit — is closed there with the decision and its cost. The Phase-1b report's HIGH-1
section is marked resolved with the decision and the mis-stated-control finding.

`docs/goals/.run/ADR-0006-PHASE1C-STOPPED-kernel.patch` was applied and deleted.

---

## 4. The two assertions that were rewritten, and why that is not loosening

**The ADR positive control** used to say: with all four buckets at CPI, the headline equals a
reference run whose weights are 100% general. That reference kept the LIVE bucket rates, so it
still ran a 9% reservation — the two sides were never the same plan once the reservation got its
own rate. The rewritten control asserts what actually collapses:

- the **base** leg's drift is exactly 0 (`toBeCloseTo(0, 12)`), *and* the base component is flat in
  today's rupees across the whole horizon — a zero rate that the schedule then ignored would pass
  the first check and fail the second;
- the headline is identical **field for field** against a reference computed by the same kernel from
  the same flat bucket rates with the weights forced to 100% general.

It deliberately does **not** assert the AGGREGATE target has zero drift. It cannot: a dated goal
stops inflating while the deflator keeps running, so the goals leg *falls* in real terms after its
due year. The only way to make that assertion pass would be to delete the goal cap — the assertion
would be enforcing the bug. This is Phase 1b's "positive control broken" note, re-diagnosed: the
control was mis-stated, the model was right.

**The deflation origin-alignment guard** used to assert the deflated target sits on `(1+g)^i`. `g`
is now only the base leg's drift, so the Sharmas' line sits ~0.8% above that curve by year 1. It
now asserts the deflated point equals the kernel's own today's-Rs target **point for point**, which
is strictly sharper: it still catches an origin shift (the thing the test exists for) and it also
catches any divergence between the display curve and the solver's curve, which `(1+g)^i` could not.

Everything else was re-recorded, not relaxed: the +/-8% live-defaults allowance is unchanged, the
`fireAge <= 70` gate is unchanged, the 2.0 y MC tracking bound is unchanged, and the
seed-consistency bands were re-tightened just above their new values.

---

## 5. Deviations

1. **Decision (a) as originally written was not implemented** — the owner brief supersedes it with
   the `healthcareInflation` variant, which is what landed. Recorded here because the earlier stop
   report argued the other side.
2. **`required-contribution.spec`'s Sharmas re-feed proof moved from target age 50 to 52.** At 50
   their need is now Rs 12.00 Cr and the honest answer is Infinity, so there is no solved amount to
   re-feed. 52 is the first reachable age. The proof itself — feed the answer back into `derive()`
   and the target must be reached, and one tolerance-step less must not reach it — is unchanged.
3. **Two consumers moved off `realTargetDriftRate` beyond the brief's letter**: the coast-corpus
   discount in `FireMilestonesCard` and the Monte Carlo band's `targetGrowthRate`. Both take one
   scalar and both were reading the base leg only, i.e. under-stating the target — the optimistic
   direction, which is Tier-0. They now read the effective drift. Without the MC move the Mauryas
   p50 sat 3.25 y from the headline it brackets (the plausibility spec's pre-measured failure).
4. **`src/lib/lever-impact.ts`'s `targetGrowthRate` doc contract was updated** (no behaviour
   change) so the next caller does not repeat the base-leg mistake.
5. **`e2e/t380-ui-verify.spec.ts` is untracked in the worktree** and was left alone — it predates
   this round, and no Playwright was run.

---

## 6. Gates

| Gate | Result |
|---|---|
| `npm run type-check` (root) | clean |
| `npx vitest run` (root) | **98 files / 1465 tests passed, 0 failed** (1460 -> 1465; +5 net new) |
| `cd server && npm run type-check` | clean |
| `cd server && npm run lint` | clean |
| `cd server && npm run test:unit` | **21 files / 179 passed, 1 skipped** (the `DATABASE_URL`-gated live integration spec) |
