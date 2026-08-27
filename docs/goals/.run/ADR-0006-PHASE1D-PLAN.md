# ADR-0006 Phase 1d — plan

Branch `feat/adr-0006-honest-inflation-frame`, baseline HEAD `472173f` (Phase 1 + 2 + 1b + 1c).
One commit per item, all `[skip ci]`. No push, no PR, no Playwright. `e2e/t380-ui-verify.spec.ts`
stays untracked and untouched.

Sources read first: `docs/adr/0006-real-frame-target-basket-inflation.md`,
`docs/goals/.run/ADR-0006-PHASE1C-REPORT.md`. Every file:line below re-verified against the
working tree, not taken from the brief.

---

## Verified locations

| Finding | Verified site(s) |
|---|---|
| F1 | `useFireDerive.ts:435` `targetGrowthRate: d.value.effectiveTargetDriftRate` (correct) · `lifecycle-digest.ts:205` `targetGrowthRate: derived.realTargetDriftRate` (base leg only), `SnapshotInputs` Pick at `lifecycle-digest.ts:57-70` never threads the effective rate · `headline-plausibility.spec.ts:109,132` `k.realTargetDriftRate`, and those blocks also omit the `historicalReturns` production passes · `lifecycle-digest.spec.ts:173` the same mirror drift |
| F2 | `derive.ts:908` `regularTargetComponentsRealAt(adequacyAge − anchorAge).total / totalCorpus` vs `bridge.ts:18,64-65,217` flat `input.annualExpenses` |
| F3 | `stress-test.ts:173` `basket = args.targetInflation`, fed `fire.householdInflation.value` at `StressTest.vue:42` and `NudgeStack.vue:117` |
| F4 | `derive.ts:770` `const currentCalendarYear = new Date().getFullYear()` |
| F5 | `derive.ts:754-769` `bucketInflationRate` switches on `inflationBucket` only, `default: generalInflation`; `derived-records.ts:71-72` classifies by `kind` |
| F6 | `headline-plausibility.spec.ts:62` measures raw `anchorAge + yearsToRegular`; report §1/§2 quote raw against displayed |
| F7 | `required-contribution.ts:205-209`, `355-357` |
| F8 | `derive.ts` `CPI_WITHIN_YEAR_REINDEX`; fixture `96_766` at `lifecycle-digest.spec.ts:329` |
| F9 | `derive.ts:462-470` NPS annuity offset |
| UI | `FireHero.vue:663` `hh.fireTargetForProgress` (= `k.fireNumber`, `useFireDerive.ts:228`) under a headline quoting `req.needReal` (`FireHero.vue:418`) |

---

## Item-by-item

### F1 — one MC input builder, used by production AND the specs

New exported `headlineBandInputs(k)` in `monte-carlo.ts`: it takes the kernel fields
(`fireWithdrawableCorpus`, `fireNumber`, `effectiveTargetDriftRate`, `monthlyContribution`,
`bandContributionSchedule`, `realBlendedReturn`, `realReturnSchedule`, `portfolioVolatility`) and
returns the complete `MonteCarloInput`, `historicalReturns` included. Production
(`useFireDerive.monteCarlo`, `lifecycle-digest.computeMonteCarloP50Age`) and both plausibility
blocks call it, so they cannot diverge again. `SnapshotInputs` gains `effectiveTargetDriftRate`
(`realTargetDriftRate` stays — it is still read elsewhere), and `useLifecycleDigest.inputs`
threads it. The scalar control block becomes `{ ...headlineBandInputs(k), meanReturnSchedule:
undefined }` so only the glide taper differs, which is what that lock is about.

Then re-measure the 2.0 y tracking bound against the real band and report the per-persona p50 gap.
The bound is NOT widened — a breach is a finding, not a re-baseline.

### F2 — the bridge stops being a mixed frame

`derive.ts` exposes the base leg's own real growth to the bridge:
`bridgeExpenseRealGrowth(t) = regularTargetComponentsRealAt(t).base / baseFireNumber` — goals and
the medical reservation are NOT bridge spending, so only the base leg drives it — and passes
`annualExpensesAt: (t) => annualExpensesToday * bridgeExpenseRealGrowth(t)` into
`computeBridgeCoverage`. `BridgeInput` gains that optional resolver; `coverageAt` reads it per
year (`age − anchorAge`) and falls back to the flat figure when absent, so every existing fixture
is unchanged. `bridge.ts`'s header restates the pair: the drawn pool still earns zero return
(kept, stated), the expense side no longer stands still.

Witness spec: on a corpus-100%-locked fixture, coverage must not IMPROVE purely because the target
drifted. Asserted twice — (a) directly on `computeBridgeCoverage`, old mixed frame (drifted
`corpusScale`, flat expenses) vs new (both drifted), and (b) end-to-end through `derive()` at
g = 0 versus the live drift.

### F3 — the stress page's baseline age equals the dashboard's

`StressRunArgs.targetInflation` becomes `targetGrowthNominal`, fed
`fire.effectiveTargetGrowthNominal.value` (the rate the headline was actually solved at) at both
call sites. The name changes because the value is a target GROWTH rate, not an inflation rate —
leaving the old name is how the base-leg mistake keeps getting repeated. `stress-test.spec.ts`
re-baselined with the reason recorded in the file.

### F4 — the kernel never calls `Date`

`DeriveOverrides.currentYear?: number`. `derive()` resolves
`overrides?.currentYear ?? fyStartYear(lens.currentFY)` — never `Date`. Production callers
(`useFireDerive`, `required-contribution` via a new `currentYear` argument its callers pass,
`plan-variance`, `QuickNumber`, `NudgeStack`, `server/lifecycle-runner`) pass
`new Date().getFullYear()`.

Checked, and recorded because the brief offered it: `lens.currentFY` is NOT the pin source for the
specs. Production `ui.currentFY` is wall-clock-derived (`getCurrentFinancialYear`), so the
FY-start fallback equals the wall clock there — but every spec hard-codes `currentFY: "2025-26"`
while the wall clock is 2026, so falling back to the FY inside a spec would move every dated goal
a year and re-baseline the whole golden master for no honesty gain. The specs therefore PIN
`currentYear: 2026`, the year their baselines were measured, which keeps them byte-identical and
deterministic from here on.

### F5 — the bucket falls back to `kind`, not straight to CPI

`bucketInflationRate` becomes `bucketForGoal(g) = g.inflationBucket ?? bucketFromKind(g.kind)`
with `education → education`, `medical → healthcare`, everything else → general. Spec: a goal with
`kind: "education"` and NO `inflationBucket` inflates at 9%, not 6%.

### F6 — units

Report and ADR prose state BOTH: displayed (ceiled) `householdFireAge` pre→post 56→56, 51→51,
57→58, 68→69, with the raw years alongside. `headline-plausibility.spec.ts:62` keeps the raw
measurement and ADDS an explicit `householdFireAge ≤ 70` assertion plus the named per-persona
expectation — Mauryas sits at 68–69 displayed; crossing 70 means the ADR item-4 unreachable state,
never a re-baseline.

### F7 / F8 / F9 — comments and one fixture

F7: rewrite the two `required-contribution.ts` comment blocks to the component schedule.
F8: the within-year CPI re-index factor is 0.969073 (mean of `(1.06)^(−k/12)`, k = 1..12), not
0.96766 — fix both reports' prose and COMPUTE the `lifecycle-digest.spec.ts` fixture rather than
hard-coding it. F9: stated-simplification comment on the NPS annuity offset (a level nominal
annuity against a NET grown at the basket understates the gap slightly; the conservative
alternative is named).

### UI — one target per card

`heroHeadline` (household branch) takes `fireTargetForProgress` and `progressPercent` from the
solver's `needReal` at the hero's own target age — the same number the headline quotes — falling
back to `k.fireNumber` when there is no solved target. The member branch is untouched. The KPI
label says what the denominator is. `FireHero.binding.spec` and the plausibility `heroHeadline`
assertions move with it, with the reason recorded; `Goals.vue`'s household row reads the same
`heroHeadline` fields so the two surfaces cannot disagree.

---

## Gates (every item)

`npm run type-check` · `npx vitest run` · `cd server && npm run type-check && npm run lint &&
npm run test:unit`. Every persona ≤ 70 displayed AND ≤ `planToAge`, or STOP.
