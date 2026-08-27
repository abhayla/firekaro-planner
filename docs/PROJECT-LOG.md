# FireKaro — PROJECT LOG (strategic operating log)

> **The canonical, auto-referred home for strategic/product/roadmap/prioritization decisions + the
> running goal status.** Read this at the start of every session. Governed by
> `.claude/rules/documentation-management.md`.
>
> **What this is:** the narrative index of *what we decided and why*, pointing to the formal artifact
> (GitHub issue / ADR / goal contract). **What this is NOT:** a duplicate of those — architecture →
> `docs/adr/`; work items → GitHub Issues; build specs → `docs/goals/`; product design SSOT →
> `docs/v6-fire-planner-product-plan.md`; cross-session facts → `MEMORY.md`; blockers on Abhay →
> `docs/comms-go-live-handoff.md`; portfolio decisions → `TODO(5W):`. See the doc map in the rule.

---

## §1 — Goal status (keep current)

**Updated: 2026-06-08.**
- **Goal (SSOT `docs/v6-fire-planner-product-plan.md` §9):** research-grounded Indian FIRE planning
  SaaS — correct, honest, sticky, friction-free — serving the **urban salaried accumulator** across
  the whole FIRE lifecycle (5 objectives: effortless setup · honest number · get-there-faster ·
  readiness-to-stop · stay-free-post-FIRE).
- **Realization: ~65%.** Production-live (https://firekaro.com); the **full-lifecycle must-have core
  — objectives 0, 1, 2, 3 AND 4 — is built, deployed to prod, AND functionally verified live**
  (deploys 2026-06-07, SHAs `d04571c` → `45201dc`; **#48/#50/#51/#52 closed — must-have registry empty**).
- **NEW (2026-06-08): the full-lifecycle QA verification & hardening cycle is COMPLETE** — Phase A
  (deep correctness + the from-scratch UI data-entry journey across all 4 personas, blind-verified, +
  tax-mutation hardening + the server-mode auth gate) merged to `main` (`b8fadd7`), and **Phase B
  re-verified the LIVE site healthy** (25-screen authed sweep + interactive + blind-verify all PASS,
  D-2026-06-08-02). So the core is now not just built but **independently hardened + prod-verified**.
  (No realization-% bump — QA verifies, it doesn't add features.)
- **Remaining: stickiness is still unproven** (zero retained users, retention unmeasured) + good-to-have
  (#41/#44/#45/#46/#49/#62) + nice-to-have (#43/#47/#53/#63) + adjacent personas (NRI/HUF).
- Calling the goal "achieved" would be the optimism-error the honesty mandate exists to prevent.

---

## §2 — Active priority / roadmap (the "Now" order: correctness → stickiness → friction)

**FOCUS LOCK (2026-06-07, D-2026-06-07-07): MUST-HAVE ONLY** — no new good-to-have/nice-to-have build
without Abhay's explicit per-item approval (`.claude/rules/must-have-only-focus.md`).

**▶ ACTIVE (2026-08-27, D-2026-08-27-01): the Quick Number front door — spec `docs/goals/2026-08-27-quick-number-front-door.md`, stages QN-3→QN-2→QN-1→QN-4→QN-5 via `/get-work-done`.**

**✅ The full-lifecycle QA verification & hardening cycle is DONE (2026-06-08, D-08-01/02):** Phase A
merged to `main` (`b8fadd7`) + Phase B prod-verified PASS. **So the allowed must-have/hardening queue is
now EMPTY.** Everything that remains — stickiness/retention (#44/#45), the other good-to-have
(#41/#46/#49/#62), nice-to-have (#43/#47/#53/#63), adjacent personas (NRI/HUF) — is **BLOCKED by the
focus lock pending Abhay's explicit approval**. **Next decision is Abhay's:** lift the lock for the next
tier (most goal-anchored candidate = stickiness/retention, #44 measurement then #45 loop — the biggest
unproven risk to the goal), or hold. No autonomous work proceeds on lower-tier items until then.

**Prior active work (now complete):** the QA contract `docs/goals/2026-06-07-full-lifecycle-qa-verification.md`
(Phase A pre-prod gate → deploy gate → Phase B post-prod). Testing/hardening of existing features was the
lock's allowed carve-out; that carve-out is now exhausted.

**Prior focus (2026-06-06, REPRIORITIZED by Abhay): COMPLETE THE MUST-HAVE CORE before
stickiness.** Rationale (goal-anchored): there is no point measuring/improving retention on an
incomplete product — a working must-have core is the *precondition* for stickiness. **Scope locked
(D-2026-06-06-07): must-have-now = the accumulation core, objectives 0+1+2; objectives 3+4
(readiness-to-stop, post-FIRE) are the wedge persona's LATER lifecycle — math already built, only UI
missing — sequenced to a later phase.**

**Completeness audit (4 parallel assessors, 2026-06-06; evidence in commit thread):**
- **Obj 1 "honest number" — ~95% ✅** (FIRE date, Monte-Carlo bands, accessible-money bridge wired
  into the headline, stress test, plan-is-alive). No blocking gap. (#47 dormant.)
- **Obj 0 "effortless setup" (manual) — ~90% ✅** (wizard, 8-section CRUD+persist, smart defaults,
  auto-flow, completeness nudges, estate+glossary real). Gaps: **#42 scroll-lock** (self-heals but
  trust-killer) + named-scenario persistence (polish).
- **Obj 2 "get there faster" — ~35% ⚠️ THE must-have gap.** Missing the **lever-impact ranking
  engine** (the core of the objective): no ranking of India-specific levers (regime arbitrage,
  80CCD(1B)/employer-NPS, prepay-vs-invest, savings-rate/step-up, allocation) by years-to-FIRE
  impact with confidence bands; tax levers isolated from FIRE-impact; no celebrate phase. → flagship
  build, tracked as a new issue.

**The must-have-now plan (sequenced):**
1. **Obj-2 flagship — lever-impact ranking engine** (#48; financial math + UI). → IN PROGRESS on
   `feat/lever-impact-engine`. **Done so far (pure core, TDD + double independent FinTech review):**
   (a) the policy-free engine (`src/lib/lever-impact.ts` — per-lever years-to-FIRE delta + ranking,
   honest cap-out reachability); (b) comparability policy DECIDED (D-2026-06-06-08); (c) the
   realistic-max-effort catalog (`src/lib/lever-catalog.ts` — surplus / trim / risk-notch with
   transparent bounds + the risk-notch volatility caveat). **Remaining increments:** (i) India-specific
   levers (regime arbitrage, 80CCD(1B), employer-NPS, prepay-vs-invest — need tax/interest
   recomputation modelling); (ii) the impure composable wiring derive→AccelerationContext (MUST assert
   the net-of-existing-contributions surplus contract — the double-count guard); (iii) the UI surface
   (ranked "biggest achievable wins" card + per-lever sensitivity drill-down + obj-1 confidence bands;
   the bands also close the risk-notch deterministic-yardstick honesty gap) + tax-planning FIRE-impact
   annotations + the celebrate phase.
   **Re-scoped 2026-06-06 (D-2026-06-06-09) — NOT all remaining increments are must-have (anti
   feature-completeness, rule 30):**
   - **MUST-HAVE (makes obj 2 genuinely work) — CORRECTED by D-2026-06-06-11 (regime is moot):**
     the composable (ii); the ranked card (iii-core); the GENUINE behaviour-change levers —
     **trim-expenses ✓ + risk-notch ✓** (built), **80CCD(1B) headroom** (the real India tax lever —
     replaces regime), and a **save-more sensitivity** (replaces the moot invest-surplus); plus
     **confidence ranges on the variance-bearing levers** (risk/return — honesty, closes the free-lunch
     gap). Pure-cashflow levers (trim, 80CCD, save-more) stay point estimates (near-deterministic).
     **Reverted/moot:** regime arbitrage (→ good-to-have, blocked on `preferredTaxRegime`),
     invest-surplus (needs rework to a sensitivity).
   - **SHOULD-HAVE (next, non-blocking):** 80CCD(1B) top-up; prepay-vs-invest (high salience but hardest
     to model honestly → its OWN careful increment); per-lever sensitivity drill-down.
   - **NICE/DEFER:** employer-NPS ask (weakest: small, not user-controllable, lock-in fork); tax-page
     FIRE annotations (polish); **celebrate phase → the STICKINESS phase** (it's retention, which we
     deferred behind the must-have core — folding it in now reopens D-2026-06-06-07).
2. ~~#42 scroll-lock~~ **✅ RESOLVED** (2026-06-06) — fix already shipped (`scroll-lock-recovery.ts`
   router safety net @ 8467055/c2176a1), verified live on `main` (spec 4/4, wired at
   `router/index.ts:201`); was a stale-open issue. Closed.
3. **Obj-2 — connect tax/deduction surfaces to FIRE-impact + prepay-vs-invest + celebrate phase**
   (folded into #48's surfacing).
4. **Obj-0 polish — named scenario persistence.**

**Deferred (was the prior focus — resumes after the must-have core):** stickiness/measurement (#44),
retention loop (#45, also gated on comms go-live), Form16/CAS import (#43, nice-to-have).
DPDP/privacy posture for #44 remains a `TODO(5W)` to settle before instrumenting.

**Parallel/queued (not the active focus):**
- **#46 temporal-contributions Phase 1 — ✅ DONE** (merged to `main` @ `c7c70a5`, autonomous `/goal`
  run complete, no deferrals). Time-varying household savings schedule + REAL opt-in step-up lever;
  per-investment schedules persisted but **barred from the corpus headline** (bug-#11 lock) — plan/
  display only. ADR-0004 written. **Two open follow-ups, both non-blocking:** **#47** chart-vs-headline
  nominal/real frame divergence (only bites once a persisted dashboard step-up UI lands; conservative
  direction, never optimistic) + a missing step-up-ceiling persona-sanity spec. **Deploy-gate B7**
  (`docs/comms-go-live-handoff.md`): the authored-not-applied `contributionSchedule` JSONB migration
  ships automatically on the next redeploy (Abhay's gate) — take a Supabase PITR backup first.
- **#43 Form16/CAS import** (obj 0, effortless setup — the buildable activation-gate friction-killer).
- **#42 scroll-lock prod bug**; **#41 business-income tax modelling.**

---

## §3 — Decision log (append-only, newest first)

### 2026-08-27
- **D-2026-08-27-04 — T-378 (QN-1 + QN-4) BUILT: `/quick`, the ten-card front door, and the
  explainer that has to add up.** A first-time user could not get a FIRE number out of FireKaro in
  three minutes: the seven-step wizard is the right tool for refinement and the wrong one for a
  first answer. `/quick` asks ten conversational questions (money in lakh, rough is fine), then shows
  the T-377 gap hero — and the wizard becomes the explicit "refine your plan" path, still one link
  down on the splash. Design SSOT `docs/design/2026-08-27-quick-number-gap-hero/option-c-merged.html`;
  contract `docs/goals/2026-08-27-quick-number-front-door.md` §4 + §5.
  - **The answers become REAL household data, never a side store** (`src/lib/quick-number.ts`
    `applyQuickAnswers`): adult(s) + kids as members, one "All investments (quick estimate)" line per
    adult, planned goals dated from the kids' ages (education 18 · post-grad 22 · weddings 30 — the
    transcript's own figures), the home loan as a Liability whose auto-flow adds the EMI once. Every
    row carries a stable `quick-` id, so a re-run updates instead of duplicating. Zero Prisma
    changes: the one new field (`quickSource`) rides the server's existing `subtypeData` JSONB.
  - **The load-bearing honesty decision — anchoring the pace on what the user INVESTS.** `derive()`
    grows the corpus from the savings RESIDUAL (income − tax − expenses), not from
    `investments[].monthlyContribution` (gh #11). So the mapping bisects the salary CTC **through the
    real kernel** until that residual equals the monthly investing the user stated. Recording their
    take-home verbatim instead would assume every unspent rupee reaches the market — ~26% optimism in
    the pace for the reference household.
  - **…and its second half, which the first review caught: the unaccounted rupee was SPENT.** Take-home,
    spend, EMI and investing over-determine each other; anchoring on investing alone also implied the
    leftover was neither invested NOR spent — deleting real spending from the one figure the FIRE
    number multiplies by ~30× (1/SWR). It is now a VISIBLE "Unaccounted spending" expense line
    (₹45,000/month for the reference household, ≈₹2 Cr on the number), and card 3's sanity line counts
    the EMI so three impossible answers can no longer be blessed with "sounds right?".
  - **QN-4 explainers must reconcile.** "How we got this" is five steps (base corpus · goals layer ·
    the 20% medical reservation · what you'll have · the same number in future rupees) that ADD UP to
    the headline beside them — an earlier four-step draft explained only ~83% of it. The same
    component renders on the quick result and collapsed inside the dashboard hero. Copy that claimed
    mechanisms the kernel does not run (14% healthcare inflation, a withdrawal-tax engine) was
    rewritten to describe what the number actually contains.
  - **Stated, not buried:** the express path books the whole corpus as ONE equity line to stay at ten
    cards, which is optimistic for anyone holding EPF/PPF/FD money — so the result screen says so and
    points at the full planner. Tracked for QN-6/portfolio work rather than silently shipped.
  - **Verification:** 1358 unit tests green (40 new across `quick-number`, `quick-number-copy`,
    `quick-route`); `e2e/quick-number.spec.ts` walks all ten cards filling every optional field and
    asserts the dashboard shows the same need afterwards (rule 26) with zero console errors and no
    critical/serious axe violations; `e2e/t378-quick-path-verify.spec.ts` captures all ten cards at
    390 and 1280 plus the result, dashboard and planner screens. Both rule-29 reviews
    (`code-reviewer-agent` + `fintech-domain-analyst`) ran and every BLOCKER/HIGH was either fixed or
    recorded here with its reason. `/quick` is enumerated in the member-lens sweep as a documented
    non-participant (it is a layout-less pre-setup route with no "Viewing as" control).
  - **Out of scope, deliberately:** QN-5 levers (the "how to get there" card slot is left for it),
    #167 (the real-frame target grown at 6% CPI rather than the 7.9% basket — pre-existing kernel
    decision, so the "do this" amounts here are understated for the same reason the dashboard's are).

- **D-2026-08-27-03 — T-377 (QN-2) BUILT: the dashboard answers "what must I DO", not just "when
  will it happen".** Until now the FIRE hero made one claim — "you'll FIRE at age 56" — which is a
  *prediction*, not a *plan*. It never told the accumulator the one number they can act on: the
  monthly amount that gets them to the age they actually want. QN-2 flips the headline to **the age
  the user WANTS** ("To retire at 47 you'll need ₹10.60 Cr in today's money · ₹28.54 Cr in 2043") and
  adds the four numbers that make it actionable — need · you'll-have-by-then · gap · **do this
  ₹/month** — plus a live 40–70 retirement-age slider so the trade-off is felt, not explained
  (Sharmas: retire at 47 → ₹3.11 L/month; drag to 52 → ₹1.94 L/month).
  - **How the number is computed (the load-bearing decision):** `src/lib/required-contribution.ts`
    **binary-searches the household real monthly contribution through the REAL `derive()` kernel** —
    NOT a closed-form annuity formula. Every candidate is a full kernel run, so step-up (ADR-0004),
    the accessible-money bridge (#15), horizon-driven SWR, the healthcare reservation, the
    planned-goals family layer (#165/T-376) and the member lens (#81) are all honoured by
    construction. A parallel formula would have been faster and would have quietly disagreed with
    the rest of the app — the exact class of drift the repo has been bitten by (#65, #85).
  - **Bisection needs monotonicity, so monotonicity is PROVEN, not assumed:** a fast-check property
    in `kernel-invariants.property.spec.ts` asserts, over all 4 seed personas × every slider target
    age 40–70, that `derive()`'s headline years-to-FIRE is non-increasing in the monthly
    contribution. It HELD (bridge, horizon-SWR, healthcare and the NPS post-tax offset included), so
    the contract's monotone-scan fallback was not needed. If that property ever fails, the solver
    must fall back to a scan rather than ship a silently-wrong "do this".
  - **Kernel seam:** a new additive, default-OFF `DeriveOverrides { monthlyContributionReal,
    targetRetirementAge }` (`src/lib/derive-overrides.ts`), honoured by `derive()` and forwarded to
    `computeIndividualFire`. Non-finite/out-of-range values are ignored; omitting the object leaves
    every kernel output byte-identical (proven by the untouched golden master + the full suite).
  - **Two signals, two types:** the NEW `GapTone`/`resolveGapTone` (short/surplus/**unknown**) sits
    ALONGSIDE the plan-variance `HeroTone`/`resolveHeroTone`, which is untouched. "Am I ahead of the
    plan I locked?" and "does the money get there at all?" are different questions and both are
    shown. A non-finite gap makes NO claim; an unreachable target renders "Move the age", never a
    fabricated amount.
  - **One retirement age, two sliders (#64 class):** the hero slider and `/fire-goals/what-if` both
    read/write the session-only `ui.whatIfTargetAge` — explicitly excluded from the persisted `ui`
    blob and its watch list. Dragging is a what-if; "Set as my target" is the only write, and it
    writes the household member's `targetRetirementAge`.
  - **`ui.quick` declared here, written by QN-1:** `{ guess, completedAt, createdIds, directPlans }`
    rides the existing `userUiPrefs.prefs` JSON — no new entity key, no Prisma migration. The ONE
    permitted `server/` edit adds it to `uiBodySchema` (a strip-mode `z.object` would otherwise drop
    it silently on PUT, losing the user's gut-feel guess with a 200 OK).
  - **The member-lens sweep earned its keep:** it FAILED on this change and was right to. The big
    number is now the *target* age, which is legitimately identical for two adults sharing a target,
    so "the age must differ per member" had stopped testing lensing. Re-pointed at the hero **need**
    figure (the member's own individual FIRE number) — the figure that actually carries the lens
    now. 22/22 PASS after the fix. Evidence: `e2e/t377-gap-hero-verify.spec.ts` (slider recomputes
    47→52 = ₹3.11 L→₹1.94 L; rule-26 hero need ₹10.6 Cr matched the Goals screen exactly; 1280 +
    390 screenshots; zero new console errors).
  - **Design SSOT:** `docs/design/2026-08-27-quick-number-gap-hero/option-c-merged.html`;
    `SCREEN-STANDARD.md` v1.3 records the pattern. Contract: `docs/goals/2026-08-27-quick-number-front-door.md` §3.
    Coverage-matrix rows C1–C5, E3, E4, F3.
- **D-2026-08-27-02 — T-376 (QN-3) LANDED: `general`/kind-less planned goals now enter the FIRE number
  (closes #165).** Root cause: `derive.ts:449-451` summed only `familyLayer.educationGoals` +
  `familyLayer.marriageEvents` into the corpus lump — a `plannedFuture` line of any other kind
  (`general`/`medical`/unset, the v4-faithful default) was displayed in the planner but silently
  excluded from `fireNumber`/`fireAge`. Fix: `derivedFamilyLayer()` now also exposes
  `allPlannedGoals` (every kind, unfiltered) consumed ONLY by the FIRE-number lump in `derive.ts`;
  `calculateFamilyLayerCorpus`'s arg renamed `educationMarriageLumpToday` → `plannedGoalsLumpToday`
  (spec-mandated). The FamilyLayerCard/NudgeStack display aggregate is UNCHANGED (still
  education+marriage only — out of this stage's scope). Golden-master headlines moved for 3 of 4
  personas, matching their kind-less lines exactly: Mauryas +₹19L ("Car replacement" ₹15L + "Foreign
  vacation" ₹4L, FIRE age 67.08→67.5), Mehtas +₹40L ("Retirement world tour" ₹15L + "Switzerland
  residency" ₹25L, FIRE age 49.42→50.33), Sharmas +₹5L ("Foreign vacation every 3yrs" ₹5L, FIRE age
  55.58→55.67); Iyers unchanged (no kind-less lines). No persona moved >1 year — expected, not a red
  flag. **ADR-0004 follow-up (deferred, not this stage):** goals stay a today-rupee one-shot lump, not
  time-phased/PV-discounted to their `targetYear` — a goal 20 years out is treated identically to one
  next year. Time-phasing the family-layer lump into the temporal contribution schedule
  (`docs/adr/0004-temporal-contribution-model.md`) is real follow-up work, tracked for a future stage,
  not silently dropped. **Why (goal-anchored):** obj-1 honesty — an optimistic FIRE-number error for
  the locked persona is Tier-0 regardless of fix size (`goal-anchored-decisions.md`). PR: see #165.

- **D-2026-08-27-01 — "Quick Number" front door APPROVED for build (Abhay, 00:39 IST) — focus lock lifted for this
  scope.** Trigger: Dezerv "Portfolio Breakdown – Retirement Edition" (`FbYnFUwdODQ`) captured + cross-checked
  (`D:\Abhay\Ventures	ranscripts\FbYnFUwdODQ*.md`). Finding: FireKaro out-rigors the tool on inputs but loses on
  feel — no number in 3 min, no need/have/gap/do-this, no hero-level retirement-age what-if, no "how to get
  there"; plus a Tier-0 honesty bug (`general` planned goals never enter the FIRE number, `derive.ts:449`).
  Design: options A/B → blind review (6.5/6.0) → merged Option C → blind review 8.5 → owner corrections
  (investments copy read as exclusive; "how to get there" half missing) → coverage matrix
  (`docs/design/2026-08-27-quick-number-gap-hero/COVERAGE-MATRIX.md`) → Option C completed (gut-feel guess,
  income sanity, home loan, investment property, explainer, levers, full-planner list). **Spec:**
  `docs/goals/2026-08-27-quick-number-front-door.md` — stages QN-3 (Tier-0 fix) → QN-2 (solver + hero) →
  QN-1 (`/quick` path) → QN-4 (explainers) → QN-5 (levers); QN-6 (InvestmentForm fast-add) + portfolio-review
  items stay locked. Execution via `/get-work-done`, one PR per stage. **Why (goal-anchored):** obj-0
  effortless setup + obj-1 honesty + obj-2 get-there-faster for the LOCKED persona; the honesty bug is
  optimistic for the target user → Tier-0. Process lesson registered (`MECHANISM-DUE` →
  `artifact-built-without-coverage-matrix`).

### 2026-08-26
- **D-2026-08-26-03 — T-349 CLAUDE.md trim LANDED inline on Abhay's explicit approval (supersedes the
  "remain open" clause of D-2026-08-26-01).** `/init` re-review found the cancelled T-349 draft pointed at
  a `.claude/rules/server-backend.md` that did not exist (the file had been written but the global
  `~/.config/git/ignore` ignores `.claude/` — new rule files need `git add -f`, so it never reached git).
  Landed: CLAUDE.md 342→158 lines (3 invariants hoisted into the first 20 lines; backend block →
  `server-backend.md` scoped `server/**`; module inventory → `calculation-modules.md`; `.env.local`
  recipe → README pointer); `hono-route-conventions.md` globs fixed (`server/routes/**` never matched
  `server/src/routes/**`, so that rule had never auto-loaded); README's 5 stale facts corrected
  (24 tables, 7 `SERVER_KEYS`, explicit-dev/test bypass gate, 5 personas, live-since-2026-06-01).
  **Why (goal-anchored):** every session was paying ~5k tokens of inventory before doing work; the
  dangling pointer would have silently deleted all backend knowledge. Fleet fast-lane fix still owned
  by the hub (`plans/get-work-done-fast-lane.md`).

- **D-2026-08-26-02 — CI red-main (T-350) diagnosed as a GitHub Actions billing block, NOT a code
  defect — BLOCKED-awaiting-Abhay, no fix possible in-repo.** Fleet break-fix task fully reproduced
  every CI step locally from a fresh worktree off current `main` (frontend `npm ci`, `type-check`,
  1239/1239 unit tests, `build` with CI's exact env) — all green. `gh run view` on both failing runs
  (2026-06-25, 2026-08-26) showed jobs never started (2-3s), annotated "recent account payments have
  failed or your spending limit needs to be increased" — an account-level billing gate on `abhayla`,
  confirmed not a repo-config issue (Actions enabled, workflow active). **Why (goal-anchored):** a
  code PR cannot fix a payment/spending-limit block, so opening one would be theater, not a fix — the
  DoD's environmental-drift allowance covers config/lockfile drift, not billing. Logged as needs-Abhay
  register item **B8** (`docs/comms-go-live-handoff.md`) with the exact unblock steps. Once resolved,
  CI goes green with **no code change** (proven by the local pass). No PR opened; no commits on the
  `t350/ci-red-main-fix` worktree branch.

- **D-2026-08-26-01 — CLAUDE.md trim (5 items) queued to the fleet as T-349, then CANCELLED by Abhay;
  fleet fast-lane fix moved to the hub.** A `/init` review found `CLAUDE.md` at 342 lines vs the ≤80
  budget (`rule-writing-meta.md`) with ZERO path drift; five relocation-only improvements were listed
  (src/lib inventory → `calculation-modules.md`; backend block → a new `server/**`-scoped rule;
  `.env.local` recipe → README pointer; two stray `#` H1s inside the Commands block; hoist the 3
  invariants — prod boot guard / storage invariant / `isServerMode()` gating — into the first 20
  lines). Dispatched via `/get-work-done` (repo fleet-registered the same day: `GWD\settings.json`
  + 5wealths `PORTFOLIO.yml` → active/pc). Abhay cancelled at 15 min: a 15-minute edit priced at ~2 h
  is a fleet defect, not a cost of the skill. **Why (goal-anchored):** the trim is Tier-3 hygiene;
  the fleet overhead class blocks every small FireKaro task, so it is fixed first.
  **Artifacts:** contract `GWD\queue\T-349-…cancelled.md`; worker's partial diff
  `GWD\evidence\2026-08-26-T-349\`; dirty worktree `firekaro-planner-wt-t349` (branch
  `docs/T-349-claude-md-trim`, kept as the fast-lane acceptance fixture); fix plan
  `claude-best-practices/plans/get-work-done-fast-lane.md`; learning-debt row
  `GWD\MECHANISM-DUE.md → trivial-task-pays-full-fleet-ceremony`. **The five improvements remain
  open** — re-run T-349's contract once the fast lane exists.

### 2026-06-13
- **D-2026-06-13-04 — Re-tier #44, #45, #46 good-to-have → MUST-HAVE** (Abhay, during a good-to-have
  backlog review). **Goal-anchored why:** all three are foundational to objective-1 ("the plan is
  alive" / honesty) + the stickiness objective, not polish. **#46** (temporal model — SIP step-up /
  lump sums / expense-change schedule replacing the flat single-snapshot projection) is the **biggest
  remaining honesty gap** after the headline bugs — flat-forever is both pessimistic (no step-up) and
  optimistic (no shocks). **#45** (wire the existing `nudge-engine.ts` to a live email/WhatsApp channel
  + cadence) — generation is built but **nothing is delivered**, so retention is currently zero-channel.
  **#44** (event/funnel/cohort analytics) — the **measurement backbone**; retention is unimprovable
  while unmeasured. **#59** (close the 98 survived Stryker mutants in `tax.ts`, 69% mutation score) was
  promoted in the same review — tax-math correctness is core to a tax/FIRE product (coverage-% lies;
  mutation score is the real proof of the honest-number promise). Tier label flipped (`gh issue list
  --label must-have` now includes #44 #45 #46 #59 #61 #64 #68 + the batch-4 set below + the originals #86 #137 #141 #142 #162). Note: #44 still carries a
  DPDP/privacy-posture `TODO(5W)` on *what* is collected; #45's live sends stay gated on comms go-live
  (A6) — the *builds* are unblocked.
  - **Also promoted in the same review (batch 3):** **#61** (from-scratch HEADED UI data-entry new-user+family
    journey — the "data ENTRY is not verification" rigor gap; seed-load proved render, not hand-entry),
    **#64** (inconsistent retirement-age labels across screens — honesty/trust, and **investigate-first**: a
    same-event off-by-one would be Tier-0, not just labeling), **#68** (family-member vs separate-login
    cross-tenant identity reconciliation — duplicate data, no link/invite/dedup; an ADR-0001 single-tenant
    architecture gap). All goal-anchored to objective-1 honesty + the multi-user data-model integrity.
  - **Also promoted (batch 4):** **#69** (stale "Name is required" error flashing after a SUCCESSFUL inline
    Add across all forms — looks-broken on every add), **#70** (smart cross-link real-estate holding ⇄
    rental income — stop double-entering a let-out property; cheap, the auto-flow hooks already exist),
    **#71** (remove the redundant zero-entry Banking screen — Abhay-endorsed, analysis done, awaits go),
    **#73** (Net-Worth-over-time chart blank for a populated user — netWorth captured only on Dashboard
    visit + weak empty-state), **#75** (omnipresent FIRE summary on every screen — AppBar chip→popover).
    Friction-reduction (objective-0) + looks-broken polish.
  - **Also promoted (batch 5):** **#85** + **#87** are **tax-correctness** items mis-stating the flagship
    FIRE number — **#85** (derive.ts taxes LLP/Partnership/HUF profit-share that /tax-planning correctly
    exempts per §10(2A); cross-screen tax divergence, the #65 class for partnership income) and **#87**
    (household tax uses a single-aggregate-earner model → over-taxes dual-earner households by ~₹4L/yr on
    the Sharmas → over-states the FIRE date for the dual-income wedge persona; fix = Σ per-earner ITRs).
    Plus **#82** (CI "migrations apply cleanly" gate — closes the proven #67 bad-migration-passes-CI class),
    **#78** (widen What-If slider ranges — trivial), **#79** (capture email+mobile in profile — enabler for
    #68; member email recommended OPTIONAL per DPDP). #85/#87 are objective-1 honesty.
  - **Also promoted (batch 6) — the data-import cluster** (objective-0 "automate" / kill the #1 onboarding
    friction): **#88** (Account Aggregator consent-based read-only fetch — biggest friction-killer; has an
    open **charter fork** on the "no bank connections" line + mandatory DPDP), **#90** (EPFO/UAN balance
    pull), **#91** (NPS PRAN import), **#92** (Demat/broker CAS sync). **#89 (AIS/Form-26AS import) was
    NOT promoted** — left good-to-have. Cross-cutting gates on the cluster: a DPDP data-posture `TODO(5W)`
    + (for #88) the charter interpretation lock. **Abhay commissioned comprehensive per-asset-class research
    on #88** (bank/FD/MF/insurance/NPS — the complete AA FIU consent-fetch process); 5-thread cited research
    DONE + posted to gh #88 (key finding: the FIU **SEBI-RIA/TSP regulatory gate** is the real blocker, not
    the tech; per-asset maturity bank✅/MF✅/NPS🟡/FD🟠/insurance🔴-ULIP-unavailable; ~5–10mo, ~₹5–25L; charter
    + DPDP `TODO(5W)` to lock; ship bank/MF first, FD+insurance manual-primary).
  - **Also promoted (batch 7) — tax tools:** **#95** (CTC/salary-restructuring optimizer — highest-ROI tax
    lever ₹50k–3L/yr, dead-centre for the salaried wedge; objective-2) + **#97** (general capital-gains-on-sale
    estimator — generalises the existing `liquidation-tax.ts`; objective-4 post-FIRE drawdown honesty). #93
    (statement parser), #94 (LTCG harvesting), #96 (advance-tax) left good-to-have.
  - **Also promoted (batch 8) — instruments + levers:** **#108** (geographic-arbitrage lever — often the
    single highest-impact FIRE lever, corpus 30–50% lower; objective-2), **#109** (Lean/Fat FIRE comparison —
    reuses the existing `derive.variants`; objective-1), **#102** (SSY girl-child corpus instrument; obj-0),
    **#103** (SCSS) + **#104** (POMIS) (post-FIRE income instruments; obj-4).
  - **Also promoted (batch 9) — insurance moat + goals:** the **insurance-moat mini-cluster #111** (employer-
    insurance-dependency warning — FIRE-readiness false-positive; obj-3) + **#112** (critical-illness planner;
    obj-3) + **#113** (super-top-up optimizer — ~40–50% cheaper, frees contributions; obj-2/3), and **#115**
    (funded goal-tracks education/marriage/home/parents-care — central to how the Indian accumulator plans;
    builds on existing `plannedFutureKind`; obj-1). **#116 (rent-vs-buy) left good-to-have.**
  - **Also promoted (batch 10):** **#146** (portfolio-vs-NIFTY benchmark — Reddit-validated "is my portfolio
    beating a cheap index?"; obj-1/2) + **#119** (in-context financial-education hub — trust layer; stickiness).
    #117 (nomination audit), #143 (Schedule-FA helper — charter-gated), #144 (full-model export) left good-to-have.
  - **Also promoted (batch 11 — the final 5):** **#156** (Sec 17(2)(vii)/(viia) ₹7.5L employer-retirals
    perquisite not modeled — **optimistic tax bug → under-saving** for high-CTC; the honesty-risk direction,
    Tier-0-adjacent), **#157** (scalar `computeTax` 80CCD(2) ceiling — government-employee cross-screen drift,
    #65/#85 class, conservative), **#161** (member-lens Reports.vue corpus/liabilities sibling, conservative).
  - **REVIEW COMPLETE — all 55 good-to-have reviewed in 11 batches; 40 open must-have total** (`gh issue list
    --label must-have`). The ~18 left good-to-have (deferred polish / charter-gated / lower-priority / already
    honest) = #41 #49 #53 #54 #56 #58 #60 #62 #89 #93 #94 #96 #116 #117 #143 #144 #147 #148 — query the live
    set with `gh issue list --label good-to-have`. **Next: sequence the 40 must-haves into build order** (the
    "Now" priority ladder — correctness/honesty first: #85 #87 #156 #157 + #162; then setup/import #88-#92;
    then stickiness #44 #45 #119 #146; then the feature must-haves) — a separate prioritization pass.
- **D-2026-06-13-03 — Member lens across the REST of the FIRE section ("lens where clean, badge the rest").**
  D-2026-06-13-02 lensed only the Dashboard hero; the other 5 FIRE-section screens still showed household
  figures and ignored "View as &lt;member&gt;" (0 lens refs). Resolved with Abhay (AskUserQuestion 2026-06-13):
  **Goals.vue LENSES** to the selected member's individual FIRE (reuses the hero's `heroHeadline` selector →
  ±0 coherence with the hero + IndividualFireCard, no duplicated math; member caveat at full disclosure parity
  with the hero — names that the individual number skips the healthcare reserve + locked-money bridge); the
  **4 simulation screens (Readiness/StressTest/Drawdown/WhatIf) render the self-gating `WholeHouseholdBadge`**
  — they run whole-household projections with no cheap per-member equivalent (per-member projection = deferred
  **#162** / option A), so the badge makes the household scope explicit + honest. Default ("Whole household")
  view byte-identical; no FIRE-math edit (display-only). **Goal-anchored:** serves the wedge persona's
  honest individual picture (objective 1) without optimistic bias — the badge prevents mistaking a frozen
  household figure for a member one. Built via `/goal` contract `docs/goals/2026-06-13-fire-section-member-lens.md`;
  merged **`3ea2ac6`** (2 commits adab90f + 4047ee9). Verified: type-check 0 · 1239 unit · build · full
  member-lens E2E sweep 22/22 · code-review PASS · FinTech HIGH (caveat parity) fixed + drift-lock · Rule-33
  blind verifier concurred (coverage reconciled by the full sweep). **DEPLOYED to prod + Tier-2 verified
  (`aec52bc`, bundle `usnufzd8`, 2026-06-13):** Abhay authorized; supervisor-reproduced the gates
  (type-check 0, 1239 unit) then redeployed the VPS (frontend-only, backup `firekaro-pre-deploy-20260613-102111.tar.gz`);
  Tier-1 smoke green (bundle `BYJmfDLG`→`usnufzd8`, db connected). **Tier-2 headed prod re-verify on
  `abhayfaircent` — all 5 FIRE screens respond LIVE:** Goals lenses (Whole-household age 56/₹10.55Cr/10%
  vs Rohit age 44/₹4.04Cr/21% + caveat); Readiness/StressTest/Drawdown/WhatIf show the Whole-household badge
  under a member lens (false→true on the lens switch), hidden on Whole-household. Blind verifier (rule 33)
  CONCURRED on the raw prod screenshots (Goals before/after + Drawdown + WhatIf image-verified; Readiness +
  StressTest via the booleans + identical self-gating component). Whole FIRE section + Dashboard now member-lensed live.
- **D-2026-06-13-02 — REVERSE #81's hero-invariance: the FIRE headline SHOULD lens per member.** While
  verifying D-2026-06-13-01 on prod, Abhay clarified his actual intent: when "View as &lt;member&gt;" is
  selected, the **big FIRE headline (age + number) should show THAT member's individual FIRE** (Priya →
  her ₹2.35Cr/age44, Rohit → his ₹4.04Cr; "Whole household" → the combined ₹10.55Cr/age55). This **reverses**
  the D-2026-06-08-19/20/22 (#81) decision that deliberately froze the headline to the household number
  (the #22/#23 guardrail). **Why the reversal is defensible:** when a user EXPLICITLY picks "View as Priya"
  they are asking for Priya's individual picture; the household number is one dropdown-click away + stays the
  labelled default, so the individual headline isn't misread as "the family can stop" — provided the caveat
  stays. The honesty core is PRESERVED differently: the individual number must remain the PROPER per-member
  "mini-household" FIRE (`individual-fire.ts` — attributed corpus/expenses/per-member SWR, already non-absurd
  with the reachability cap), NEVER the absurd household-target÷1-member #22 bug. Confirmed via `AskUserQuestion`
  2026-06-13 ("Lens it to that member"). **Open design forks the build must lock** (the hero has household-only
  sub-parts): what the Monte-Carlo confidence band, the plan-variance / biggest-win KPI strip, and the
  projection chart show under a member lens (lens per-member — needs per-member MC/projection, larger — vs.
  hide-under-lens vs. keep-household-labelled). **Guardrail tests must be REWRITTEN, not deleted** —
  `derive.spec.ts` / `headline-plausibility.spec.ts` currently lock `fireNumber`/`householdFireAge` INVARIANT
  to member selection; the new invariant = headline lenses to the proper individual FIRE, household stays
  combined, the absurd ÷1 result never occurs. Scope = flagship `FireHero.vue` + the honesty guardrail →
  goal-contracted build with FinTech validation. Supersedes the #81 hero-invariance clause; #81's
  individual-FIRE *card* + same-scope rule stay. **BUILT + shipped (`3bbf809`, 2026-06-13):** option B
  locked — band / plan-variance / biggest-win / projection / milestones HIDE under the member lens; the
  lensed hero (headline + corpus-progress + stats) reads the new `heroHeadline` selector with the member
  caveat naming the exclusions (children/shared-split + healthcare reserve + bridge check — FinTech Q7);
  Whole-household byte-identical (spec-locked); guardrail tests rewritten (default-byte-identical ·
  member-sourced · sane-age · magnitude · unreachable→null); 1235 unit + 17/17 member-lens-sweep green.
  FinTech follow-up filed (#162): individual-fire omits the healthcare reservation + bridge gate
  (optimistic vs household methodology) — interim-mitigated by the caveat naming the omissions, full
  option-A math deferred. **DEPLOYED to prod + Tier-2 verified (`093a339`, bundle `BYJmfDLG`, 2026-06-13):**
  Abhay authorized the deploy; supervisor-reproduced the gates (type-check 0, 1235 green) then redeployed
  the VPS (frontend-only, pre-deploy backup `firekaro-pre-deploy-20260613-015241.tar.gz`); Tier-1 smoke
  green (health ok, smoke user.count=3, bundle `D1wUdHhT`→`BYJmfDLG`); **Tier-2 headed prod re-verify on
  `abhayfaircent`: FIRE headline lenses per member LIVE — Whole-household age 56 (₹10.55Cr, band shown) vs
  Priya 44 (₹2.35Cr) vs Rohit 44 (₹4.04Cr), caveat renders, band hides under lens; blind-verifier (rule
  33) CONCURRED on the raw screenshots.** Both members rounding to age 44 is a legitimate coincidence
  (years/dates differ: 14y11m→2041 vs 14y3m→2040; numbers differ) — per-member sourcing spec-locked.
- **D-2026-06-13-01 — Prod deploy of `d7f11aa` (member-lens dashboard section-card fix).** Abhay reported on
  prod that switching the AppBar "View as &lt;member&gt;" lens didn't refresh the dashboard. Root-caused (after
  a faithful 2-earner reproduction in demo + server-adapter + the production build) to the Investments/
  Liabilities/Expenses **section cards showing the whole-household VALUE beside a per-member COUNT** —
  `Dashboard.vue` read household `fire.totalCorpus`/`totalLiabilitiesValue` for the headline while the
  subtitle read lensed lists, so the value stayed frozen ("same value all the time"). Fix exposes member-
  scoped display twins `lensedTotalCorpus`/`lensedTotalLiabilitiesValue` and lenses the three card headlines;
  the FIRE number/hero stays whole-household (the #22/#23 honesty guardrail — FIRE math untouched, default
  path byte-identical). Verified: 1223 unit tests + a new per-card coherence/Joint-overlap substance lock +
  demo member-lens-sweep green; independent code-review + FinTech analyst both ship-cleared. **Deployed**
  `git archive HEAD | ssh tar` → `npm ci && build && pm2 reload` (frontend-only, no migration; pre-deploy
  backup `firekaro-pre-deploy-20260613-000745.tar.gz`). **Post-deploy verification:** Tier-1 smoke green
  (`/api/health` ok, `/api/internal/smoke` user.count=3, **bundle hash `Bldil8Gc`→`D1wUdHhT`** = new build
  serving) + Tier-1.5 unauth UI green (live login renders + Google button interactive, console clean).
  **Tier-2 (authed dashboard lens confirmation on prod) PASSED** — drove the live authed dashboard with the
  dedicated test account `abhayfaircent` (seeded session in `e2e/.auth/user.json`, 2-adult Sharmas household),
  NON-DESTRUCTIVE (only switched "View as", read values). The reported frozen-value bug is **gone on prod**:
  Investments re-scopes Whole-household **₹1.10 Cr → Priya ₹27 L → Rohit ₹89 L** (value now matches the 11/5/9
  instrument count); Income/Expenses/Tax also lens; Liabilities identical (the only loan is Rohit-shared →
  correctly full-value for both); 0 unexpected console errors. Sibling on `/financial-health/reports` filed as
  **#161** (good-to-have).

### 2026-06-12
- **D-2026-06-12-01 — Notifier becomes the portfolio-wide monitoring standard; healthchecks.io retired;
  distributed via the hub.** Abhay asked how a deployed project knows to wire Notifier, how Claude/a repo
  knows a project's prod-deploy + Notifier-link status, and why fuel-prices is still told to use
  healthchecks.io now that Notifier exists — and that the answer be uniform across ALL projects.
  **Decision (he delegated: "go with your recommendation"), 3 forks locked:** (1) build a **missed-heartbeat
  watchdog** into Notifier so it replaces healthchecks.io/UptimeRobot/external pingers; (2) prod-status
  knowability is **dual-source** — each repo's CLAUDE.md "Production & monitoring" block (the read-layer a
  Claude session consults) + **Notifier's admin config/heartbeat state as the authoritative live
  "linked & alive" registry**; (3) **promote** FireKaro's `server/src/lib/owner-notify.ts` into the
  **claude-best-practices hub** as a `notifier-integration` rule + portable helper (TS+Py) + a standard
  CLAUDE.md block, distributed via `update-practices`/`synthesize-project`. **Goal-anchored:** this serves
  the portfolio's owner-observability (5W-PRINCIPLES — productized, scale-from-day-1, automate) and removes
  per-project monitoring-tool sprawl; it is infra-standardization (decidable), not a kill/promote/pricing
  call. **Artifacts (authored this session, NOT yet run/committed):** three independently-runnable `/goal`
  contracts staged in `docs/goals/` — `2026-06-12-notifier-hub-pattern.md` (→ hub),
  `2026-06-12-notifier-heartbeat-watchdog.md` (→ Notifier), `2026-06-12-notifier-rollout-fuel-prices.md`
  (→ fuel-prices, repeatable per consumer). The build runs in those repos (not firekaro-planner); the live
  WhatsApp/Telegram delivery test + fuel-prices prod secret/redeploy are Abhay-gated (spend/outward/prod).
  `TODO(5W):` if Abhay wants this recorded as a formal **portfolio monitoring standard** (it touches every
  Financial-pillar project), capture it in `5Wealths\` — this repo only stages the engineering contracts.

### 2026-06-11
- **D-2026-06-11-02 — Notifier DEPLOYED to prod + FireKaro owner-detectors (batch 1) LIVE.** Notifier
  runs on the Hostinger VPS as PM2 `notifier` (isolated from `firekaro-api`; all 3 channels —
  Telegram/WhatsApp/email-via-Apps-Script — verified from the box). FireKaro now calls `notifyOwner()`
  at 3 detectors (5xx, DB-down, signup) via a fire-and-forget client that can't break the app;
  independent-reviewed (0 HIGH, 2 MED fixed: DPDP PII-off-by-default + truncated 5xx body), merged
  `898b9ba`, deployed (health+smoke green, deploy-green ping reached Telegram msg-16, site renders).
  Goal-anchored note: owner-alerts are OPS/infra (protect the live app + help Abhay), not a user-facing
  product feature — the bigger goal lever (retention/stickiness) remains focus-locked pending Abhay.
  The Apps Script web-app + the VPS deploy were both done by Claude driving the browser / SSH (Abhay
  only logged into Google). `TODO(5W):` register Notifier as shared Financial-pillar infra.
- **D-2026-06-11-01 — Owner-notification system: catalog approved + built as the SEPARATE generic
  project `Notifier` (`D:\Abhay\VibeCoding\Notifier`, github.com/abhayla/Notifier).** Research-grounded
  owner-alert catalog for FireKaro (Tier 1 real-time page / Tier 2 same-day / Tier 3 signup-activation
  joy-pings / Tier 4-5 daily-weekly digests — full list in the 2026-06-11 session) is FireKaro's
  detector backlog; the *dispatch* layer was grilled (gateway-service vs library → **gateway**, Abhay
  approved) and generalized for all apps (IPODhan, AlgoChanakya — which Abhay is consolidating onto the
  Hostinger VPS). Channels are pure config: Telegram bot / WhatsApp-Wati (fail-closed allowlist,
  terminal-status verify) / SMTP email / digest queue. FireKaro-side wiring (calling `/notify` from the
  detector events) is a FOLLOW-UP, gated by the focus lock + deploy gate. `TODO(5W):` register Notifier
  as a shared Financial-pillar infra asset in the PROJECT-MAP.

### 2026-06-10
- **D-2026-06-10-11 — PROD DEPLOY (Abhay-approved): Option-D dashboard + runway rename live on
  firekaro.com.** Standard `DEPLOY.md` redeploy from `main` `b57c253` (backup tar
  `firekaro-pre-deploy-20260610-232031` → git-archive ship → build → prisma no-op (frontend-only, no
  pending migrations) → pm2 reload). **All three verification tiers green, rule-33 blind-verified
  (concur ×3, 0.86):** Tier-1 health+smoke (`user.count=3`, 36ms) + bundle hash CHANGED
  `D3DbQ_qR→Bldil8Gc`; Tier-1.5 unauth login renders/functions, console = only the 2 expected unauth
  messages; Tier-2 authed (test acct `abhayfaircent`) — Option-D hero + KPI strip + gauge + renamed
  runway heading + #139 toggle all live, ZERO console errors. **Triage note:** the hero's "Lock this
  as my plan" CTA on the test account looked like a lost-baseline bug but is CORRECT — the baseline
  belongs to `abhayinfosys` (server GET verified returning that account's data:null correctly; DB blob
  intact). Blind-verifier coverage notes (fold into the next deploy checklist): exercise the
  sign-in control, capture raw authed console dump, timestamp the pre-deploy bundle-hash capture.
- **D-2026-06-10-10 — Option-D FIRE-dashboard redesign SHIPPED to `main` (merge `a828811`; closes #155).
  Deploy awaits Abhay.** The /goal run executed the full contract in a dedicated worktree: 4 stage
  commits (`f3e46b6` verdict lib + hero, `8db05be` five SVG viz primitives, `543a6d3` card conversions
  + #155 re-lock ack, `d9b3763` assembly + SCREEN-STANDARD v1.2). All gates green: 1,222 frontend +
  165 server tests, member-lens sweep 16/16, e2e 72-passed (the 2 sidebar-accordion failures are
  PRE-EXISTING on main → filed **#159**; unrelated), a11y sweep green, 3 adversarial reviews + 2
  rule-33 blind verifications (every HIGH/blocker fixed in-run: fabricated-claim finite guards,
  zero-corpus ladder-fill honesty, bridge-label overlap → legend). **Honest deviation:** measured page
  height 4,485px vs the contract's ≤2,600px target — unreachable without deleting mandated honesty
  content (the no-deletion guardrail dominates); the real wins are the instant 5-sec verdict + first
  viz at 551px (was ~3,000). Pre-existing lens observation filed **#160** (Investments tile mixes
  household value with member-lensed count). Phase-2 propagation of the viz language to
  Readiness/Decumulation/Stress-test/Goals remains open (SCREEN-STANDARD v1.2 names the primitives).
- **D-2026-06-10-09 — FIRE-dashboard redesign decided: Option D (C-hero + A-KPI-strip + B-visual-body),
  dashboard-first scope, /goal execution.** Abhay flagged the dashboard as data-rich but confusing (no
  hierarchy, no graphics, no 5-sec answer; 4,487px text wall, first chart ~3,000px down). Grill-me
  session compared 3 high-fidelity mockups built on the live Sharma figures
  (`docs/design/2026-06-10-fire-dashboard-redesign/` — committed as the design SSOT); Abhay merged his
  picks into **Option D**: C's big verdict hero (FIRE age + 48–62 band + since-away delta) carrying A's
  3 KPI slots (vs-plan · corpus progress bar · biggest win), with B's visual encodings replacing text
  cards (bridge unlock-timeline, runway gauge, variance waterfall, wins impact-bars, milestone ladder,
  severity-coded suggestions). Scope: dashboard Phase 1; propagate to other FIRE screens later
  (SCREEN-STANDARD governance). Honesty surfaces are NON-REMOVABLE (relocate, never delete); no math
  changes; no new deps (hand-built SVG per chart-theme rule); #155 re-lock ack folds in as a bug-fix.
  Goal contract authored (goal-creator): `docs/goals/2026-06-10-fire-dashboard-redesign-option-d.md`
  (uncommitted — Abhay's call); Abhay runs `/goal` himself.
- **D-2026-06-10-08 — Abhay's "deleted PIFS still shows" prod report: root-caused as the zero-profit
  orphan bug, filed #158 (`bug`+`good-to-have`).** Prod-aware triage (read-only DB + PM2 logs): no
  delete-PUT ever reached the server — the row was EDITED to ₹0 profit (11:37Z), after which
  `Business.vue`'s browse columns (gated on `kindsWithMoney` > 0) stopped rendering it while the KPI
  tiles ("Active: 1", "Largest ₹0/yr") still counted it → invisible, undeletable orphan. The suspected
  classes (diff-engine delete, transaction-expiry 500, write-behind flush loss) were each investigated
  and RULED OUT (server logs show zero 500s; repo delete path verified sound). Tiering: good-to-have —
  CRUD works outside this edge and a workaround exists (add a same-kind moneyed row to re-render the
  column, then delete both); Abhay's override wins. Sibling audit: OtherSources has the same predicate
  split but is UI-guarded (amount>0 enforced) — latent, noted in #158; investments + passive-business
  grid safe. Also triaged: PIFS-as-PvtLtd modeling analysis (profit routing/legal-kind + retained-earnings
  asset gap) delivered in-session, discuss-mode — NOT filed pending Abhay's "file it" (extends #85).
- **D-2026-06-10-07 — Deployed `ffac86d` (salary % inputs, D-2026-06-10-06) to prod; ALL post-deploy
  tiers + rule-33 blind verification PASSED.** Runbook redeploy (backup `firekaro-pre-deploy-20260610-162129`
  → git-archive ship → build → pm2 reload; no migrations). Tier-1: health+smoke green (DB 41ms), bundle
  `B0tsCBuV→D3DbQ_qR`. Tier-1.5: login renders, console = expected unauth 401 + boot warning only,
  **Sign-in click-through verified** (redirects to accounts.google.com). Tier-2 (authed test account):
  Edit-salary dialog serves the new % fields + law hints; existing record derives 0% for absent fields (no
  resurrection); **sector flip 0→14→0 verified live, cancelled (no prod writes)**. Blind verifier CONCURRED
  (independently proved the feature in the served lazy chunk `Salary-D6YbIaol.js`); its coverage dissents
  (console-as-artifact, sign-in functionality, sector-default live proof) were closed in a follow-up pass.
  Known residual: non-zero %-derivation not demonstrable on prod without a write — verified pre-merge
  (local server-adapter round-trip: stored ₹22.5L/₹2.25L → derived 50/10).
- **D-2026-06-10-06 — Salary form: Basic + employer NPS become PERCENTAGE inputs with LAW-grounded,
  sector-aware defaults (Abhay's screenshot feedback; FinTech-reconciled).** The Edit-salary dialog now
  asks Basic as **% of CTC** (fresh-entry default **50%** — the Code on Wages wage floor, codes in force
  21 Nov 2025) and employer NPS as **% of basic** (default **govt 14%** — statutory mandatory — / **private
  0%**), converting to ₹ on save; the persisted `MemberSalary` ₹ model and the tax engine are unchanged.
  **Deviation from Abhay's literal "default 14%":** the rule-29 FinTech pass graded flat-14 a **Tier-0
  optimistic default** (corporate NPS is minority opt-in; flat-14 fabricates ≈₹98K/yr tax benefit at ₹45L
  CTC for non-NPS private users) — sector-aware implemented instead, ceiling kept discoverable in the hint;
  Abhay can flip to flat-14 with one word. Code review caught + fixed a BLOCKER in the first cut: defaults
  now prefill **only for brand-new entries**; existing records derive %s from stored ₹ (absent → 0%, never
  resurrected), and 0-amounts persist as ABSENT so gratuity/EPS honesty disclosures keep rendering. New
  module `src/lib/salary-percent.ts` (+19-test spec); member-lens sweep 16/16; 1186 unit tests green.
  Deferred to issues: Sec 17(2)(vii) ₹7.5L employer-retirals perquisite gap; scalar `computeTax` sector
  drift (form preview + tax-planning vs `derive()`).
- **D-2026-06-10-05 — Abhay's manual prod verification of #138/#139/#140: 2 reports triaged, 1 issue filed
  (#155, good-to-have), 1 copy rename shipped.** (a) **"Re-lock not working"** → root-caused as a UX
  feedback gap, NOT a functional bug: full lock→variance→re-lock→reset cycle reproduced green in demo, and
  a read-only prod-DB check confirmed his `planBaseline` persisted (`capturedAt 09:13:59Z`) — the button
  works but its success state is pixel-identical to its prior state (no snackbar infra app-wide, `lockedOn`
  is day-granular). Filed **#155** (`bug`+`good-to-have`; sibling audit: class contained to this one
  action). (b) **"FIRE target over time blank"** → NOT a bug: his account has exactly **1** monthly
  snapshot (`expense_snapshots` count=1); the FireTrajectoryChart honestly renders its empty state until
  a 2nd monthly point accrues (July) — by design (A30.3, real-data-only). (c) **Runway-card heading
  renamed** at Abhay's direction to "If you stop working today or get fired" (`c61acc9`, gate + screenshot
  verified; on main, NOT yet deployed). Also during repro: confirmed the attribution-chips absence on a
  returns-only assumption change is the DESIGNED sign-mismatch fallback in `plan-variance.ts` (drivers 0,
  goalpost alert still shown), not a defect.
- **D-2026-06-10-04 — SECURITY FIX (Abhay-approved): enabled Supabase RLS deny-all on all 25 prod tables —
  closes the 2 CRITICAL advisor warnings.** Triggered by the Supabase Security Advisor email
  (`rls_disabled_in_public` + `sensitive_columns_exposed` on `zymbhuwuguzeueslwhyz`): the anon-keyed PostgREST
  Data API could read/write/delete every table (PAN/salary/family) with RLS off — no second layer. Fixed
  per the long-standing handoff **B1** (now RESOLVED). DBA→Security role. Ran `ENABLE ROW LEVEL SECURITY` on
  all 25 `public` tables via the `postgres` `DATABASE_URL` (session pooler, `connection_limit=1`). **Safety
  gate FIRST** (abort-if-unsafe): confirmed the role is `postgres` = superuser/bypassrls AND owner of all 25
  tables → RLS-exempt (table owners bypass RLS without FORCE) → the app is NOT locked out. **Verified:**
  25/25 `rowsecurity=true`; the script's `prisma.user.count()=3` read works through RLS; and the **LIVE prod
  app** smoke is green post-change (`/api/internal/smoke` `user.count=3, 37ms`, `/api/health` prod+db,
  public 200) — proving the deployed app reads fine while the anon/`authenticated` Data-API roles now get
  deny-all (subject to RLS, no policies). Reversible (`DISABLE ROW LEVEL SECURITY`). The old B1 note
  "enabling RLS breaks the app" was WRONG for this app (it uses the owner/bypassrls `postgres` role + no
  anon-key path). Caveat: anon REST path not black-box-tested (no anon key in-session) — mechanism is sound;
  the advisor will clear on its next scan. The throwaway `enable-rls.mjs` was deleted.
- **D-2026-06-10-03 — TIER-2 AUTHED PROD VERIFICATION: PASSED (both deploy gaps closed).** Abhay logged in
  on the LIVE site (dedicated session) so the authed path could be checked. **Google "browser may not be
  secure" automation-block hit + solved** (per app-login learnings): bundled Chromium is detected → relaunched
  with REAL Chrome (`channel:'chrome'`) + a persistent profile + the automation signature stripped
  (`ignoreDefaultArgs:['--enable-automation']`, `--disable-blink-features=AutomationControlled`) → Google
  accepted it. **Security:** the persistent capture pulled in 47 cookies incl. the full Google session →
  sanitized `e2e/.auth/user.json` to the 2 FireKaro `__Secure-better-auth.session_*` cookies only, deleted the
  Google-session profile dir; `e2e/.auth/` is gitignored (nothing committed). **Authed evidence:**
  `/api/auth/get-session` 200 (real session, expires 2026-06-17); **`/api/planner/plan-baseline` 200
  `{"success":true,"data":null}`** (the new #138 endpoint round-trips authed in prod — the gap from D-10-02
  CLOSED). Full-page authed dashboard screenshot → **rule-33 blind verifier CONCUR**: (#139) "TODAY'S ₹ |
  FUTURE ₹" toggle present + honest caption (inside the "Your path to FIRE" card, NOT the page header — my
  evidence over-claimed "header", corrected); (#140) "If your income stopped today ≈ **3 yrs 4 mo**" (post-tax
  ₹69.43L liquid) + conservative "≈1 month stable (₹2L FD)" + "+EPF ₹24L ~2mo after exit → ≈4yr 6mo" — exactly
  the locked design; (#138) correct EMPTY "LOCK THIS AS MY PLAN" state (consistent with `data:null`, NO
  fabricated variance) — and the "moved 5 months earlier" banner is the SEPARATE pre-existing "SINCE YOU WERE
  AWAY" lifecycle digest, not #138. FIRE headline age 56/2052 plausible; real data (Rohit ₹4.04Cr/Priya ₹2.35Cr);
  no crash/NaN/broken layout. **Residual (correctly-scoped, non-destructive prod):** the POPULATED #138
  post-lock variance state was NOT exercised on prod (PUT would write to the real account — forbidden); it
  rests on the pre-merge server-mode sub-run evidence. **One minor bug filed `#154`** (demo-mode footer copy
  "data stays on your device — no backend" shows on the authed/server-backed dashboard). Net: the 3 cards are
  now **verified working on live authed prod**. Tooling: `scripts/prod-login-capture.mjs` (reusable Tier-2
  session-seed with the anti-Google-block fix). Pointer: D-10-02.
- **D-2026-06-10-02 — PROD DEPLOY (Abhay-instructed): shipped the 3 honesty cards + the new
  `/api/planner/plan-baseline` endpoint to https://firekaro.com.** DevOps/Release role. Per `DEPLOY.md`
  §Redeploy from local clone @ `5cb8c8f`: backup (`firekaro-pre-deploy-20260610-095928.tar.gz`) →
  `git archive | ssh tar` → `npm ci && build` (both trees) → `prisma:generate` + `migrate:deploy`
  (**"No pending migrations"** — #138 rides the existing `userUiPrefs` blob, ADR-0005, no new table) →
  `pm2 reload firekaro-api` (zero-downtime). **Tier-1 smoke ✓:** `/api/health` prod+db-connected;
  token `/api/internal/smoke` `user.count=3, 40ms` (real Prisma read); public 200; **bundle hash CHANGED**
  `index-B78CCwg3.js → index-B0tsCBuV.js` (new build live); `/api/planner/plan-baseline` 401 (route mounted,
  not 404). **Tier-1.5 live UI ✓:** login renders + "Sign in with Google" present; console clean of all-but
  the expected unauth `401 /api/planner/me` + `[boot]` warning (the warning fires from the NEW bundle).
  **Rule-33 blind re-verify (separate context-blind agent, raw evidence incl. the screenshot): CONCUR
  (qualified)** — all 6 infra checks PASS. **TWO honest Tier-2 gaps surfaced (not hidden):** (1) the authed
  `/api/planner/plan-baseline` round-trip and (2) the **3 dashboard cards rendering with real prod data** are
  BOTH unverified in prod — `DEV_BYPASS_AUTH=false` + no logged-in Google session in-session (the cards work
  in demo/localStorage; prod authed-path needs a session). So **"deploy healthy" = infra/unauth-surface sound,
  NOT "the new cards are verified working in prod."** Rollback ready (backup tar). **NEXT (Abhay-gated):**
  Tier-2 authed prod check (login the dedicated test account `abhayfaircent@gmail.com` → verify the 3 cards +
  the plan-baseline lock/round-trip) when a session is seeded. Pointers: #138/#139/#140 (closed), D-10-01.
- **D-2026-06-10-01 — SHIPPED 3 must-have dashboard honesty cards (#139 #140 #138).** One `/goal` run
  (contract `docs/goals/2026-06-10-dashboard-honesty-cards.md`), merged `--no-ff` → `main` (`14f0dfd`,
  pushed) + final report `069fe3f`. **What:** (#139) real today's-₹ vs nominal projection toggle —
  display-layer deflation at general CPI, crossover-year provably preserved; (#140) job-loss / layoff
  runway — post-tax-net liquid ÷ full-obligation burn, conservative FD floor, market-linked disclosure,
  EPF-after-2mo, vested-ESOP only; (#138) plan-vs-actual variance — dedicated `planBaseline` entity
  (`GET/PUT /api/planner/plan-baseline`, no new table; ADR-0005) + decomposed progress/reality/goalpost
  delta that never sells an assumption change as progress (sign-guarded, CPI-rebased). **Why (goal-anchored):**
  all three deepen Tier-0 **honesty** (objectives 1 + 3) for the LOCKED accumulator — in-scope under the
  MUST-HAVE focus lock (all three carry `must-have`). **Verification:** type-check both trees + unit
  (root 1167 · server 165 incl. live Supabase integration) + build; member-lens sweep 16/16 (repaired a
  pre-existing broken `#app[data-hydrated]` wait that meant the sweep had never actually run); a11y 0
  critical/serious; per-stage independent code-review + FinTech + blind-verifier (3 HIGH honesty defects
  caught + fixed: #140 volatile-undercount, #138 normalization sign-flip + lost-update race); mutation
  pass on the new modules. **NEXT (Abhay-gated):** prod deploy so `/api/planner/plan-baseline` reaches
  production (cards work in demo without it). Artifacts: issues #139/#140/#138 (closed), ADR-0005, final
  report `docs/goals/2026-06-10-dashboard-honesty-cards-FINAL-REPORT.md`, lessons in `.claude/tasks/lessons.md`.

### 2026-06-09
- **D-2026-06-09-11 — FEATURE DISCOVERY round 3: REAL Reddit mining (RSS path works!) → 8 net-new, HELD un-filed.**
  **Method correction (supersedes the D-09-09 "Reddit hard-blocked" claim):** Reddit's `.json`/OAuth endpoints
  403 without credentials, but the **RSS path works unauthenticated** — `https://www.reddit.com/r/<sub>/top/.rss`
  and `.../search.rss?q=...` return HTTP 200 real Atom data with a browser User-Agent (via curl/Bash, not the
  blocked WebFetch). Mined **824 unique posts** across FIREIndia, FIRE_Ind, IndiaInvestments, personalfinanceindia,
  IndianStreetBets + global financialindependence/leanfire/fatFIRE/coastFIRE (top-year + top-all + 8 feature-wish
  search queries each). 253 feature-wish/app-gap posts; read all. **Strong signal CONFIRMING the existing backlog**
  (validates priority): multi-account net-worth aggregation (#88 AA), privacy-first/no-SMS tracking (#145, many
  posts), expense/bank-statement parsing (#93), AIS reconciliation (#89), Schedule FA/RSU (#143), LTCG/loss
  harvesting (#94, an actual "TaxHarvestLab" build), document/legacy vault + nomination (#117/#118), geographic
  arbitrage (#108), rent-vs-buy (#116), sabbatical/mini-retirement runway (#140). **8 genuinely NET-NEW (deduped
  vs built + #1–#145), grounded in real posts:** `good-to-have` — (1) portfolio-return-vs-NIFTY/index benchmark
  comparison [repeated: "compare my returns to NIFTY"]; (2) prepay-vs-invest (loan part-payment vs SIP) calculator
  [repeated]; (3) UPI transaction de-noising / smart categorization ["UPI makes my statement a grocery receipt",
  India-specific]. `nice-to-have` — (4) manual/CSV import + manual-entry-first mode [extends #144; the
  spreadsheet-native crowd wants to bring data IN]; (5) standalone take-home/in-hand salary calculator [funnel
  utility, "most are broken"]; (6) expected-inheritance / ancestral-property as a future asset [India-specific,
  "only child, parents own 1.5Cr"]; (7) guided "next-rupee" prioritization flowchart, India-adapted [complements
  #119 education hub; cf. the popular r/FI "FIRE Flow Chart"]; (8) encashable-leave + uncommon asset types in
  net worth [minor]. **Out-of-scope (charter):** "Digital CFO that tells you what to do next", AI MF/stock
  screeners, trading journals/F&O tools (advice/execution). **FILED `#146`–`#153`** (3 good-to-have `#146`–`#148`,
  5 nice-to-have `#149`–`#153`) — tiers are best-judgment, Abhay's re-label wins. **Build NOT scheduled** —
  focus-lock holds; these are backlog only. Pointer: D-09-09 (round-2), D-09-08 (round-1).
- **D-2026-06-09-10 — TIERING + FILING (Abhay's call): the 9 round-2 community-signal features filed as
  `#137`–`#145`, with a must-have override on 6.** Abhay set the tiers (his override wins, intake protocol):
  **6 `must-have`** — `#137` tax-optimal post-FIRE withdrawal sequencing, `#138` plan-vs-actual variance
  tracker, `#139` real-vs-nominal (today's-money) toggle, `#140` job-loss/layoff runway, `#141`
  asset-allocation drift + rebalancing plan, `#142` exportable year-by-year cashflow table; **2
  `good-to-have`** — `#143` Schedule-FA / foreign-asset ITR-disclosure helper (⚠️ borders tax-FILING vs the
  planning charter — Abhay's scope call recorded in the issue), `#144` full-model data export/portability;
  **1 `nice-to-have`** — `#145` privacy-first / no-account local-only marketed mode. **Build is EXPLICITLY
  DEFERRED** ("don't implement, just create issues — I'll take a call later") — so although the must-have
  registry (previously empty) now holds 6 items, the focus-lock outcome is: **filed, NOT scheduled**; no
  autonomous build proceeds until Abhay greenlights per item (`must-have-only-focus.md`). Bodies carry the
  honest provenance caveat (Reddit inaccessible → adjacent-source triangulation, not scraped posts). Pointer:
  D-2026-06-09-09 (the discovery).
- **D-2026-06-09-09 — FEATURE DISCOVERY round 2 (Abhay-instructed): community-signal mining for net-new
  features — HELD as a list, NOT filed (per Abhay's "list-for-review first" choice).** Goal: features Indian
  FIRE/PF Reddit users wish for that are neither built nor already filed. **HONEST LIMITATION (surfaced, not
  hidden):** **Reddit is hard-blocked for the web tools** — `reddit.com`/`old.reddit.com`/`.json`/`search.json`
  all denied to the user-agent, two Redlib mirrors 403/ECONNREFUSED, no Reddit MCP. So findings are **NOT
  scraped Reddit posts** — they are the SAME-persona signal triangulated from accessible adjacent sources
  (freefincal + its downloaded trackers, Zerodha Varsity, ClearTax/Tax2win/TaxGuru, moneyview, jumpp.finance)
  + demand-proving standalone tools (QuitRunway; IT-dept 42-MNC Schedule-FA drive). Labelled as such, not
  presented as verbatim Reddit. **9 genuinely net-new (deduped vs built + all 136 issues):** `good-to-have` —
  (1) Schedule FA / foreign-asset ITR-disclosure helper [⚠️scope: borders tax-FILING vs planning — Abhay's
  charter call]; (2) tax-optimal post-FIRE withdrawal sequencing (which account first); (3) plan-vs-actual
  variance tracker (stored baseline vs actuals); (4) real-vs-nominal (today's-money) display toggle; (5)
  job-loss/layoff runway + sabbatical scenario; (6) asset-allocation drift alert + rebalancing plan; (7)
  full-model data export/portability; (8) exportable year-by-year cashflow projection table. `nice-to-have` —
  (9) privacy-first / no-account "local-only" marketed mode (capability partly exists via LocalStorageAdapter;
  the product framing is net-new). **Borderline → NOT new:** DTAA-FTC-for-LRS folds into `#134`; anonymous
  peer FIRE-cohort comparison already = `#122`; ad-free/no-data-selling = positioning, not a feature.
  **Not filed** — focus-lock stays in force; backlog is pull-only on per-item approval. **Open blocker (Abhay's
  side):** verifiable Reddit-thread signal needs an authenticated path (paste thread URLs after `!`, or connect
  a Reddit/browser MCP) — adjacent-source triangulation is the honest best-effort without it.
- **D-2026-06-09-08 — FEATURE DISCOVERY (Abhay-instructed): web-researched the Indian PF/FIRE feature universe →
  filed 49 net-new candidate issues `#88`–`#136`.** Web research (INDmoney/ET Money/Kuvera/Scripbox/freefincal/
  theindianfirecalculator + PFRDA/EPFO/IT-dept 2025-26 rules) was **deduplicated** against FireKaro's built
  features (SGB/REIT/International/gold/EPF/VPF/NPS/ESOP/bridge/lever-engine/decumulation/member-lens all
  already shipped) and the 35 open issues (Form16+CAS `#43`, analytics `#44`, retention `#45`, etc.). The
  remaining net-new were filed **one issue per feature** at Abhay's explicit instruction, grouped C1–C8:
  C1 import/automation (`#88`–`#93`), C2 tax (`#94`–`#101`), C3 instruments (`#102`–`#107`), C4 FIRE depth
  (`#108`–`#110`), C5 insurance/readiness (`#111`–`#114`), C6 goals/engagement/trust (`#115`–`#124`), C7 India
  nuances (`#125`–`#130`), C8 adjacent-persona Tier-3 (`#131`–`#136`). **Tiering (goal-anchored, rule 30):
  22 `good-to-have` + 27 `nice-to-have`; 0 must-have** (the must-have core is already shipped — calling any
  net-new feature must-have would be feature-completeness bias). C8 (HUF/NRI/farmer/joint-family) labelled
  `nice-to-have` because they serve a DIFFERENT persona than the locked salaried wedge → explicitly deferred.
  **Out-of-scope (NOT filed, recorded here):** direct MF/stock/US-equity investing, AI/product-recommendation
  advisor, human-CFP connect, micro-savings round-ups — all violate the *decision-support-not-advice /
  no-execution* charter. **OPEN FORK (Abhay's call, recorded in `#88`):** does *"no bank connections"* forbid
  read-only Account-Aggregator/statement ingestion too, or only transactional/execution links? My read =
  read-only consent ingestion is planning-side + in-scope; needs Abhay's charter lock before the C1 cluster is
  built. **Nothing is scheduled to build** — focus-lock (`must-have-only-focus.md`) stays in force; these are a
  queryable backlog, pulled only on per-item approval. Filed via `gh issue create` (the create-github-issue
  skill is test-failure-specific; its preflight+dedup+signature *process* was applied to feature intake).
- **D-2026-06-09-07 — PROD DEPLOY (Abhay-instructed): shipped the #86 tax-lens fix + member-lens verification
  infra to https://firekaro.com.** HEAD `94417e4` (CI-green). Per `DEPLOY.md` §192: backup
  (`firekaro-pre-deploy-20260609-133919.tar.gz`) → `git archive HEAD | tar` → `npm ci && build` →
  `prisma:generate` + `migrate:deploy` (**"No pending migrations"** — display-only change) → `pm2 reload
  firekaro-api` (zero-downtime). **Verified:** Tier-1 smoke (`/api/health` → prod+db connected; token
  `/api/internal/smoke` → `user.count=3, 31ms` real Prisma read) ✓; **bundle hash CHANGED**
  `index-CDAHCs9Y.js → index-B78CCwg3.js` (new build live, not cached) ✓; public `200` ✓; Tier-1.5 live UI
  (login renders + "Sign in with Google" present; only the expected unauth `401 /api/planner/me` + `[boot]
  not authenticated` console) ✓. The tax-lens fix (verified on-screen at localhost demo, same frontend code)
  is now in the live bundle. **SKIP surfaced (not silent, per `member-landscape-verification.md` / Tier-2):**
  authenticated prod tax-screen verification needs a logged-in session (none available in-session) — to be
  run when a session exists. Rollback ready (backup tar above). Pointer: gh #86.
- **D-2026-06-09-06 — FIXED (#86): tax-planning now lenses to the selected member, same-scope.** The one
  genuinely-broken screen (per D-05/06). FinTech-spec'd ("B'-fallback") → Full-Stack built → independent
  code-review (rule 29) clean on the #23 same-scope axis → on-screen verified. The screen now reads income
  from `fire.lensedEarners/Businesses/OtherIncome` AND deductions from a member-scoped `deriveDeductions`
  (over `{...household.data, members: lensedEarners, investments/liabilities/insurance: lensed*}`), so
  member-income and member-deductions are SAME-SCOPE — never the #23 leak (member-income ÷ household-deductions).
  Per-earner table hidden under the lens. **Verified on-screen (Sharmas): household tax ₹11.66L → Rohit
  ₹5.74L → Priya ₹1.85L; figures domain-plausible (rule 31).** Default no-lens path byte-identical (type-check
  + 1114 unit). Commits `15c08e8` (fix) + `0a94d8e` (review MEDIUMs: earners-set deductions + typed
  scopedHousehold). The static gate un-skipped (now green) + tax-planning moved to the E2E sweep's WORKING.
  **FinTech flagged a SEPARATE pre-existing issue (not this fix): the household-aggregate tax view computes
  tax on COMBINED income as one filer (₹11.66L) which over-states vs the sum of individual ITRs (~₹7.59L) —
  candidate for its own issue.** Not pushed (local for review). Pointer: gh #86.
- **D-2026-06-09-05 — EMPIRICAL on-screen lens sweep (#86) OVERTURNS the static broken-list; static
  analysis proven unreliable (vindicates the E2E mandate).** Abhay challenged my static "5 broken" list
  ("did you review on the screen?"). Drove the REAL "Viewing as" dropdown across all 27 routes via
  Playwright MCP on a data-rich member-balanced household (loaded the **Sharmas** seed into an isolated
  demo server — the dev-bypass household was too sparse/0-salary to test). **VERIFIED BROKEN (4):**
  `tax-planning`, `liabilities/overview`, `liabilities/loans`, `expenses/planned`. **Static was WRONG on 3
  of ~6:** `insurance/policies` + `expenses/recurring` actually WORK (re-scope via child components, no
  page-level token → static false-positive), and it MISSED `liabilities/overview` (has `lensedLiabilities`
  but shows ₹38L/1-loan even for Priya who owns 0 → static false-negative). **Separate class — household-by-
  design but MISSING the "Whole household" badge:** `expenses/overview`, `investments/buckets`,
  `fire-goals/{goals,what-if,drawdown,readiness,stress-test}` (only fire-goals/dashboard shows it + individual
  FIRE). **Key learning: token-presence ≠ re-scopes → the static `lens-coverage-invariant.spec.ts` is only a
  weak heuristic (both false +/−); the full E2E sweep is authoritative** (exactly why Abhay mandated it,
  D-04). Corrected: #86 (verified-findings comment), the E2E spec BROKEN/WORKING lists, the static gate
  (removed the 2 false-positives + caveat). Not pushed (local for review). Pointer: gh #86.
- **D-2026-06-09-04 — NEW RULE (Abhay-directed, approved): `member-landscape-verification.md` — the full
  E2E "Viewing as" sweep is the mandatory verification for any member-attributable/display change, NO
  exceptions.** Abhay: "all future review verification should be done in this heavier, full end-to-end member
  landscape — no exceptions." Encodes the lesson from the #86 verification miss: kernel/composable tests +
  section-Overview spot-checks are necessary-but-NOT-sufficient and may never be the SOLE verification of the
  lens; the real-dropdown-across-every-route sweep is required. Two instruments: `src/lib/lens-coverage-invariant.spec.ts`
  (static "is it wired" — in `npm run test:unit`) + `e2e/member-lens-sweep.spec.ts` (real-browser "does it
  re-scope"; demo mode; the 5 broken routes are `test.fixme(#86)` until wired). Boundary = the SCREEN CLASS
  (member-attributable/cross-cutting/display), not diff size; pure backend/docs are out of scope (not
  "exceptions"). Cross-ref `testing-strategy.md` (placed as pre-merge E2E) + rules 24/26/32/33; no duplication.
  **E2E live-run note:** the sweep is structurally validated (parses, runs, fixme/skip correct) but could not be
  executed green locally this session — the local dev env is locked to server-adapter mode (`.env.local`
  `VITE_USE_SERVER_ADAPTER=on`, no demo splash) + Vite cold-start exceeded the splash wait; it runs in CI/demo
  (`npm run test:e2e`). The static scan IS proven (RED on the 5 dead screens → quarantined). Pointer: gh #86.
- **D-2026-06-09-03 — Member "Viewing as" lens dead on tax + leaf screens → filed gh #86 (`bug`,
  `must-have`) + built the root-cause VERIFICATION FIX first (Abhay-directed).** Abhay reported (prod) the
  "Viewing as" filter does nothing on the tax screen + expenses overview; full per-screen audit confirmed
  the lens reaches the section **Overviews** but is **dead on 5 member-attributable leaves** (tax-planning/Index,
  liabilities/Loans, insurance/Policies, expenses/Recurring, expenses/Planned) — while financial-health/* (#81 P3)
  correctly lens. **Root cause of the bug:** (1) two-sources-of-truth — `useFireDerive().annualTax` IS lensed but
  `tax-planning/Index.vue` never imports `useFireDerive` (runs its own `computeTax` over `household.earners`); (2)
  leaf screens read `household.data` directly. **Root cause of the VERIFICATION MISS (the priority — Abhay: fix
  the process before re-implementing, else it recurs):** every #66/#81 lens spec runs at the KERNEL/COMPOSABLE
  layer (asserts `derive()`/`useFireDerive()` PRODUCE lensed outputs) — ZERO test asserts a `*.vue` SCREEN
  CONSUMES one; no member-lens E2E; the manual Rule-24/32 sweep exercised Overviews + generalized to the prose
  DoD screen-list; Rule 33 is structurally blind to a coverage hole (re-checks captured evidence, not
  never-captured screens). **Process fix landed:** `src/lib/lens-coverage-invariant.spec.ts` — a static scan
  enumerating every member-attributable screen, asserting each references a lensed output (mirrors
  `storage-invariant.spec.ts`; the missing screen-consumption rung — can't be "generalized from a subset" again).
  Proven RED on exactly the 5 dead screens, then quarantined `it.skip` (gh #86) so the suite is green; the lens
  fix un-skips it. **Tiered must-have** (the lens was re-tiered must-have D-2026-06-08-05; it's non-functional on
  its core claimed screens → the feature doesn't genuinely work). **Open sub-decision (Abhay):** fire-goals
  analytical leaves + expenses/Overview = household-only-+badge (recommended) vs individual re-scope. **Open
  governance proposal (needs Abhay approval, rule 5):** add a rule — "a cross-cutting/lens feature's acceptance
  MUST be an enumerated per-surface machine gate, not a prose screen-list; kernel-output tests ≠ screen-consumption
  coverage." NOT implemented (the lens fix is gated on Abhay's go). Pointer: gh #86; extends #66/#81.
- **D-2026-06-09-02 — TRUST-FIX TRIAGE (#64 + #65): diagnosed both honesty-coherence issues
  read-only (FinTech), then fixed the real bug (#65) and held the labeling one (#64).** Both were
  filed `good-to-have` with a "investigate first — bug or labeling?" gate. Ran two parallel read-only
  FinTech traces (in-scope: verifying already-shipped features). Verdicts split:
  - **#65 = real CORRECTNESS bug → FIXED** (commit `477b6b0`, on `main`, **not deployed**). /tax-planning
    fed *gross* rent into `computeTax`, omitting §24(a) — over-stated tax ~₹56k (₹12.22L vs the correct
    ₹11.66L). Root-cause fix: extracted the §24a/§24b/§71 collapse into ONE shared `computeHousePropertyTax()`
    (`tax-deductions.ts`) consumed by BOTH `derive.ts` and the page → screens converge; behaviour-identical
    on derive (golden master unchanged). Independently verified (FinTech: math correct, ~22.9% persona-sane;
    Code-Quality: approve, no circular import). Why-anchored: a *wrong financial output* is Tier-0 correctness,
    always in-scope under the must-have-only lock; it was in the Abhay-approved trust-fix bucket.
  - **#64 = LABELING-ONLY → HELD.** No off-by-one: 56 = computed FIRE age, 47/50 = target inputs, all
    correct, just ambiguously labeled ("55" wasn't even reproducible from Sharmas data). Pure copy work →
    `good-to-have` → **blocked pending Abhay's explicit go** (must-have-only lock). Verdict + recommended
    copy recorded on the issue; not built.
  - **#85 FILED** — a *separate, pre-existing* divergence both reviewers surfaced: `derive.ts` `businessShare`
    taxes LLP/Partnership/HUF profit-share that /tax-planning treats as exempt (§10(2A)). Same "two screens,
    one engine, divergent base" class as #65; needs FinTech validation; `good-to-have`, blocked.
  Pointers: #65 (closed), #64 (open, held), #85 (open, filed).
- **D-2026-06-09-01 — PROD DEPLOY: shipped the merged member-lens stack + the #72 label fix to
  firekaro.com (Abhay-approved); smoke-gate GREEN.** Shipped local `main` HEAD `f608cf2` (carries #66/#67
  member lens, #81 member-level FIRE view, #72 Financial-Health label, + governance/hook commits) via
  `git archive | ssh | tar` (the box has NO `.git`) → `npm ci` + `npm run build` + `prisma generate` +
  `pm2 reload firekaro-api`. **Backup taken first** (`firekaro-pre-deploy-20260609-082211.tar.gz`).
  **Smoke (Tier-1) all green:** health 200 (VPS+public), DB round-trip `user.count=3` 200, public SPA 200
  serving fresh bundle `assets/index-HF1EayzF.js`, no post-reload errors. **Correction:** SSH WAS available
  (`~/.ssh/firekaro_v6_vps` → root@72.61.240.224) — I'd wrongly claimed "no SSH" from a stale DEPLOY.md note;
  Abhay caught it. Fixed DEPLOY.md (real git-archive|tar redeploy + rollback-from-backup + Access section;
  removed the stale "no SSH"/`git pull` text). **Trust-fix bundle:** #72 shipped; **#69/#64/#65 deferred** to
  focused pieces (not "cheap"); **stickiness #44/#45 paused** pending Abhay's go. Tier-2 authed UI verification
  of the member lens is on-demand (needs Abhay's session). Pointers: #66/#67/#81/#72 (all closed/merged).

### 2026-06-08
- **D-2026-06-08-22 — BUILT + SHIPPED: member-level financial view (#81), via the `/goal` autonomous run of
  the D-2026-06-08-21 contract.** Merged `--no-ff` → `main` (`01f0866`, **Closes #81**), pushed; branch
  `feat/member-level-financial-view` (Phase commits `fb82345`+`4d2c1e9`, `b2aead2`, `52328d4`). **3 phases,
  each independently FinTech-validated + code-reviewed + blind-verified (rule 33):** (1) member-attributable
  itemised expenses (`ownerId` rings + owner picker; household FIRE total invariant); (2) standalone
  individual FIRE per adult + household−Σ(adults) gap + caveat card + "Viewing as" restricted to adults; (3)
  Financial-Health member lens on all 6 screens via one **same-scope resolver** (`useFireDerive().memberFinancials`
  — a member's Joint share uses the same split % on both sides of every ratio) + non-earner health-score
  caveat. Honesty invariants held: household FIRE primary + invariant to member selection; never member÷household.
  **The verification edge caught + forced fixes for 3 real defects:** a pre-existing **#67 migration bug**
  (`UPDATE "Member"` vs `@@map("members")` → 42P01, never deployed — fixed + both pending migrations deployed
  to Supabase); a Phase-2 **absurd-age leak** (`calculateYearsToTarget` 1200-month cap → finite age 130+, now
  unreachable→∞); a Phase-3 **optimistic same-scope mismatch** (Joint at 100% over a split denominator
  over-stated a member's emergency runway ~2× → unified to the split). Static green both trees (root 1100 unit
  + build; server 161 incl. live Supabase integration). Tier: good-to-have (built on Abhay's explicit `/goal`
  invocation). Pointer: gh #81 (closed); the #67 migration gap → propose a CI migrate-dry-run gate (see lessons).
- **D-2026-06-08-21 — Member-level financial view (attributable expenses + individual/household FIRE + FH
  lens) → filed gh #81 + authored goal contract (good-to-have, NOT run).** Grilled with Abhay one-question-
  at-a-time (after he corrected me for assuming household-only FIRE instead of asking — see
  [[feedback_grill_on_multi_option_forks]]); full design resolved. **Key decisions:** individual FIRE =
  STANDALONE (each adult a mini-household); dependents EXCLUDED from individual, shown as the household−Σadults
  gap; expense `ownerId` widened to any member + "Kids (shared)" (rings derive from owner+role); unified split
  % (default 50/50, configurable) for shared expenses + joint corpus; surfaced via "Viewing as" + a comparison
  card + caveat; **view filter = Household + ALL adults (earning or not), dependents hidden** (Abhay's
  pushback: a housewife-with-prior-corpus + a kid-turning-18 must stay visible); FH lenses the
  member-attributable screens incl. an individual Health Score (same-scope + non-earner caveat). **Honesty
  invariants:** household FIRE/figures primary + invariant to member selection (no #22/#23); never
  member-numerator ÷ household-denominator (#23/`281b994`). One goal, **3 phases**, sequenced after #66/#67
  (now merged). Contract `docs/goals/2026-06-08-member-level-financial-view.md` — NOT committed, NOT run
  (Abhay commits + runs `/goal`). Pointer: gh #81; extends #66/#67.
- **D-2026-06-08-20 — BUILT + SHIPPED: the 2 must-haves #67 → #66 (member-model coherence + app-wide member
  lens), via the `/goal` autonomous run of the D-2026-06-08-19 contract.** Branch
  `feat/member-model-coherence-and-lens`, merged `--no-ff` → main. **Phase 1 (#67):** `role` collapsed to
  `ADULT | DEPENDENT`; "earner" is now DERIVED from labour income via ONE canonical helper
  `isEarningMember(member, businesses)` (salary CTC>0 OR active business; capital income excluded) — zero
  `role === "EARNER"` left in `src/`; the store gained a derived `earners` getter + a new `adults` roster
  (so a salary-less adult is still selectable/giveable income — the no-earner→no-salary-input deadlock the
  derived set would otherwise create); hydrate + Prisma data-migration map old roles → ADULT; **every seed's
  FIRE number/age is byte-identical** (derived earner set reproduces the old EARNER set; locked by the seed +
  plausibility + migration specs). **Phase 2 (#66):** the "Viewing as &lt;member&gt;" lens is now orthogonal
  to family-view and lenses every member-attributable screen (income / investments / liabilities / insurance /
  tax) to that member + Joint, while household-only screens (expenses / financial-health / fire-goals) stay
  household-scoped behind a new `WholeHouseholdBadge` ("Whole household"). **FIRE / adequacy stays
  household-scoped and INVARIANT to member selection** — the #22/#23 honesty guardrail held (FinTech
  adversarial-traced: only 5 DISPLAY fields read lensedScope; all adequacy reads householdScope).
  **Verification:** static green both trees (FE type-check + 1070 unit incl. new member-earning / migration /
  #66-lens / business-only-earner specs; server type-check + lint + 161 incl. live-DB integration round-tripping
  the ADULT role through Supabase); Rule 24/25/26/31/32 UI demo-mode (non-earning→earning transition, lens
  re-scoping ₹1.40Cr→₹35L, badges) + a server-adapter sub-run (Supabase hydration + lens-via-dropdown);
  rule-29 independent FinTech + code-review (both PASS) + rule-33 blind verifiers (reconciled). A post-review
  pass fixed 4 lens-coherence display issues (DTI / SORR / income-total / investments-Overview hero —
  numerator-lensed/denominator-household mismatches that emitted misleading per-member signals). Closes #67 +
  #66. Pointers: gh #67, gh #66; contract `docs/goals/2026-06-08-member-model-coherence-and-app-wide-lens.md`.
- **D-2026-06-08-19 — Build-now selection: the 2 must-haves (#67 → #66); focus lock lifted for these two;
  goal contract authored.** Abhay: "suggest which ones to implement now; implement them as goal." Selected
  the only 2 must-haves, sequenced **#67 (member-model coherence: earner derived from income) FIRST →
  #66 (app-wide member lens)** — same member/owner domain, and #66's lens reads #67's clean model. The 14
  good-to-haves stay parked (next-strongest if scope widens: the honesty bugs #64/#65). All design forks
  pre-resolved (see the contract's authorization trail: #67 earning=labour-income-only + role ADULT/DEPENDENT
  + computed isEarning + role-migration; #66 Viewing-as⊥Family-view, lens member-attributable surfaces only,
  FIRE stays household-scoped + invariant). **Goal contract authored** (analysis→build handoff per rule 28):
  `docs/goals/2026-06-08-member-model-coherence-and-app-wide-lens.md`. Contract is NOT committed and NOT run
  — committing + invoking `/goal` are Abhay's (feedback_goal_is_user_invoked). Pointers: gh #67, gh #66.
- **D-2026-06-08-18 — Capture email + mobile in profile → filed gh #79 (`enhancement`, `good-to-have`,
  area:auth-identity, analysis-only). CEO opinion: agree on direction, push back on 2 of the rules.** Abhay
  proposed email mandatory for logged-in user + adult members, optional for child; mobile optional. **Verified:**
  Member has no email/phone (net-new); logged-in user email ALREADY held via Better Auth/OAuth (`User.email`);
  mobile already exists as consent-gated `CommsConsent.whatsappNumber`. **My refinements (honest CEO pushback):**
  (1) don't re-ask logged-in user email — confirm read-only from OAuth (automate-don't-re-ask); their mobile
  reuses the comms whatsappNumber (consent-gated), not a parallel field; (2) adult-member email MANDATORY →
  recommend **optional** — it's third-party PII captured without that person's consent (DPDP lawful-basis), the
  FIRE math doesn't need it, only useful once we message/reconcile (#68, not live), blocks obj-0 setup; require
  email at the point of INVITING a member (when #68 ships), not at profile entry; (3) child contact = minors'
  PII (DPDP verifiable-parental-consent) → optional, prefer don't-prompt. **Capture ≠ consent-to-message**
  (consent stays the separate gate). **Open decision (Abhay's):** adult-member email mandatory vs optional;
  lead = optional. **Tiered `good-to-have`** (enabler for #68 identity + comms/stickiness; FIRE core works
  without it; logged-in email already held → not must-have/Tier-0). Enabler for gh #68. Implementation gated.
  Pointer: gh #79.
- **D-2026-06-08-17 — What-If sandbox slider min/max ranges too narrow → filed gh #78 (`enhancement`,
  `good-to-have`, fire-goals).** Abhay (screenshot, `/fire-goals/what-if`): widen lower/upper limits on all
  sliders (e.g. inflation capped — healthcare 15%, general only 10%). **Verified caps in `WhatIf.vue`:**
  step-up 0–15 (L411), expected-return 3–18% (L435), SWR 2–5% (L441), general-inflation 2–10% (L447),
  healthcare-inflation 3–15% (L453), retire-by-age →75 (L240); equity 0–100 already full. **Scope sharpened
  by sibling audit:** the caps are essentially **localized to the What-If sandbox** — `AssumptionsPanel.vue`
  (the REAL plan, Preferences) is mostly **free numeric entry** (no min/max) except an SWR clamp 0.5–10% (L32),
  so the committed plan is NOT capped → this is sandbox-exploration friction, not a Tier-0 honesty block.
  **FinTech guardrails for the fix (gated):** SWR floor strictly >0 (`fireNumber=expenses/swr` ∞ at 0); engine
  already shows "—" for non-converging combos (return≤inflation). Proposed wider bounds in issue. **Tiered
  `good-to-have`** (flagship obj-2 exploration improved + mild honesty angle—can't model 12% inflation in
  sandbox; but real plan already free-entry, feature works). Implementation gated. Pointer: gh #78.
- **D-2026-06-08-16 — Tooltips (`InfoTip`) are low-contrast / washed-out → filed gh #77 (`enhancement`,
  `good-to-have`, area:design-system, analysis-only).** Abhay (screenshot, `/fire-goals/what-if`): the
  "Required corpus" tooltip is open but not clearly visible. **Root cause (in code):** `InfoTip.vue` renders a
  BARE `<v-tooltip>` with no custom content styling → inherits Vuetify's default ~0.9-opacity translucent
  tooltip + 12px `text-caption` text; busy page bleeds through → washed-out. No global tooltip theming exists,
  and it contradicts the project's own `chart-theme-system.md` (which mandates solid slate-900 tooltips).
  Single-fix-wide-impact: shared `InfoTip` used in 4 surfaces (FireHero, EarnerSalaryForm, HealthScore,
  WhatIf) + sibling raw `v-tooltip` in DiscoveryFooter. Fix direction: opaque high-contrast surface
  (match chart-theme) + `text-body-2` + verify WCAG AA, centralized in InfoTip/vuetify defaults. **Honesty
  caveat:** report came via a glare-affected phone photo so on-screen severity is unconfirmed, but the CSS
  defect is real in code. Tiered `good-to-have` (app works + info present → not must-have; but a real
  readability/WCAG-contrast defect on the jargon-comprehension layer for the FIRE-novice persona → above
  nice-to-have). **Analysis-only — NOT implemented.** Pointer: gh #77.
- **D-2026-06-08-15 — "What we assumed" bridge card duplicated on Dashboard + Readiness → filed gh #76
  (`enhancement`, `good-to-have`, area:design-system, analysis-only).** Abhay asked why the duplication.
  **Verified:** same component `<BridgeBreakdownCard/>` rendered on both `Dashboard.vue:269` and
  `Readiness.vue:44` → **NOT code duplication** (correct DRY component reuse); the redundancy is **IA/content**
  (same heavy card + assumptions wall on two screens). Intent: bridge is relevant to both the headline-honesty
  (dashboard, it moves FIRE age) and the readiness verdict (Readiness, evidence for "can I stop?"); fine in
  isolation, redundant back-to-back. **Recommendation: one canonical full home + compact reference on the
  other** — lead = full on **Readiness** (the decision screen), compact bridge summary + link on Dashboard;
  alt lighter fix = collapsed-by-default on the secondary (pairs with #74). **Tiered `good-to-have`** (IA
  declutter; correct + present, nothing broken → not Tier-0). Final canonical-home pick is Abhay's. Related:
  #74 (collapsible), #75 (omnipresent FIRE). Implementation gated. Pointer: gh #76.
- **D-2026-06-08-14 — Omnipresent FIRE summary on every screen → filed gh #75 (`enhancement`, `good-to-have`,
  area:design-system, analysis-only). Recommended: AppBar chip → expandable popover.** Abhay: the user should
  see the FIRE headline/details from any screen (persistent element / floating window / other). **Analysis:**
  data is already global (`useFireDerive()` reads stores app-wide) → pure UX-surface question; reuse
  `FireHero.vue`; no persistent widget exists; host = `SidebarLayout.vue` (compact app-bar + v-main).
  **Recommendation = Option A: compact persistent FIRE chip in the AppBar (always-visible key figure) that
  expands to a rich popover** (FireHero content + dashboard link). Beats B floating/FAB (obscures content,
  gimmicky), C sticky-strip (eats vertical space), D right-rail (competes with nav). Goal-anchored: keeps the
  honest FIRE number omnipresent (obj-1) + strong stickiness lever, no content obstruction, reuses the
  existing v-menu pattern. **Must:** chip is prominent + mobile-collapses; figure stays HOUSEHOLD-scoped under
  the member lens (honesty, cf #66); graceful "finish setup" empty state; no FIRE-math duplication. **Tiered
  `good-to-have`** (stickiness/omnipresence; product works without it; not a correctness error → not Tier-0;
  stickiness sits after the must-have core in the Now-order). Final pattern pick is Abhay's; lead = A.
  Implementation gated. Pointer: gh #75.
- **D-2026-06-08-13 — "What we assumed" (FIRE dashboard Bridge card) should be collapsible → filed gh #74
  (`enhancement`, `good-to-have`, area:design-system, analysis-only).** Abhay (screenshot, prod): the
  "WHAT WE ASSUMED — estimates you can correct" block is a long always-expanded list that clutters the
  dashboard. **Verified:** `BridgeBreakdownCard.vue:159-188` renders the assumptions `v-for` unconditionally
  (one row + Fix btn per holding), so it scales into a wall of text. Fix: collapse toggle on the header +
  `v-expand-transition` (project standard, not v-show) + show the count when collapsed (keeps the honesty
  caveats discoverable). **Default-state minor fork:** recommend collapsed-by-default-with-count (declutter
  while transparency stays one tap away); expanded-default is the alternative. **Tiered `good-to-have`**
  (readability polish; info fully present today, no wrong number → not Tier-0). Sibling: if other dashboard
  cards have unbounded always-expanded disclosure blocks, standardize the collapsible pattern in
  SCREEN-STANDARD (rule 27). Implementation gated. Pointer: gh #74.
- **D-2026-06-08-12 — "Net Worth over time" chart blank for a populated user → filed gh #73 (`bug`,
  `good-to-have`, financial-health).** Abhay reported (prod): the Net Worth over time graph on
  `/financial-health/networth` is blank despite entering full data. **Root cause (verified — by-design +
  a wiring gap, NOT a crash):** `NetWorthOverTime.vue` is real-history-only (Rule-20 honesty, no synthetic
  back-projection) — `isEmpty` when `netWorth` points ≤1 (L27); the series accrues **one real point per
  calendar month**, and `netWorth` is stamped **only when the Dashboard is visited** (`Dashboard.vue` L190
  `recordFireSnapshot(..., netWorth)`; `maybeCaptureSnapshot` records none). So a current-month user has ≤1
  point → honest empty-state. Storage is fine (adapter→server `/api/planner/expense-history`, not
  localStorage-only). **Secondary genuine gap:** the Net Worth screen itself doesn't call
  `recordFireSnapshot`, so a user who never opens the Dashboard accrues 0 points → blank **forever** (the very
  screen showing the trend doesn't feed it). **Fix (gated):** (1) capture netWorth from `NetWorth.vue` too
  (clear bug); (2) product call — show a labelled forward *projection* (planning value) vs. wait for real
  history. **Sibling class:** same "historical-only, needs ≥2 monthly points, Dashboard-only capture" applies
  to `FireTrajectoryChart` + `ExpenseTrendChart` (tracked together). **Why missed:** specs drive
  `recordFireSnapshot` directly, never assert a non-Dashboard screen captures a point, nor the
  fully-populated-new-user screen experience (shape-vs-substance). **Tiered `good-to-have`** (data correct +
  core FIRE number works; secondary-chart value/UX + latent wiring gap, not Tier-0 correctness/data-loss);
  noted Abhay may bump to must-have (blank-forever "looks broken"). Implementation gated. Pointer: gh #73.
- **D-2026-06-08-11 — "Financial Health" section mislabeled "Health" + heart icon (medical misread) → filed
  gh #72 (`bug`, `good-to-have`, area:design-system, analysis-only).** Abhay: the section gives a wrong
  (medical) feeling. **Verified:** `SidebarNav.vue:75-76` = `title:"Health"` + `icon:"mdi-heart-pulse"` (path
  `/financial-health`); `cmdk-registry.ts:41-46` mirrors it. **Why:** sidebar uses short labels (Income/Taxes/
  Investments/…) so "Financial Health" was shortened to "Health" — but unlike the unambiguous siblings,
  "Health" collides with the member Health attribute + Health insurance, and mdi-heart-pulse reinforces the
  medical read. **Contained to 2 files** (page headers like "Health Score"/"Net Worth" are legitimate
  sub-page names — safe). Fix: rename → "Financial Health" (fits the Investments/Liabilities length) +
  finance-semantic icon (e.g. mdi-finance/mdi-chart-line); mirror in cmd-K; reflect in design SSOT (rule 27).
  **Tiered `good-to-have`** (clarity/trust polish on a core nav element; cheap, high-ROI; not a wrong-number/
  functional defect → not must-have/Tier-0). Implementation gated. Pointer: gh #72.
- **D-2026-06-08-10 — Remove the redundant "Banking" screen → filed gh #71 (`good-to-have`,
  area:financial-health/IA, analysis-only).** Abhay: *"why is there a Banking screen at all? clicking 'open
  holding' takes me to the holdings screen where I enter the details — what's the use of Banking?"* **Verdict:
  he's right — `/financial-health/banking` (`Banking.vue`) is a value-less read-only re-list, redundant on
  BOTH ends:** (1) it has zero data entry — FD/Cash entries are created on Investments → Holdings (its own
  empty-state CTA literally routes there); (2) the liquidity *concept* is already owned, with more value
  (months-of-burn coverage + 6-month target + gap + adequacy), by the adjacent **Emergency Fund** screen,
  which uses the SAME `isEmergencyFundEligible` filter. Banking shows a strict subset, minus the math. Root
  cause: vestigial IA from the retired tax-tracker monorepo (v6 has no bank-account data model — "no bank
  connections"). Fork → **Option A REMOVE** (recommended); B repurpose-into-bank-manager rejected (contradicts
  v6 scope); C leave rejected. Tiered `good-to-have` (app works today; not a correctness/honesty regression,
  so not must-have; but a real IA-friction/clarity fix for objective-0 setup, above nice-to-have). Clean
  removal: exactly 4 refs (route/page/sidebar/cmdk), no tests/redirects depend on it. **Analysis-only — NOT
  implemented.** Pointer: gh #71.
- **D-2026-06-08-09 — Smart cross-link real-estate holding ⇄ rental income (stop double data-entry, both
  directions) → filed gh #70 (`good-to-have`, area:data-entry-ux, analysis-only).** Abhay: a property is
  often both an asset (holding) and a rental-income source, but must be entered twice with no link — the
  forms should offer the reciprocal entry. **Verdict: agreed, and architecturally cheap** — the app already
  has all 3 hooks: the link field (`otherIncomeLine.sourceEntityId`, business-only today), the auto-flow
  pattern (`autoFlow{EMI,Insurance,Salary}` keyed by `source`+`sourceRefId`, strip/regenerate), and the
  `realEstateRole==='Investment'` (let-out) signal. So it's an extension of the shipped auto-flow pattern,
  not new architecture. **Design musts:** link not copy (reuse `sourceRefId`, e.g. `source:"auto-realestate"`);
  always optional (PrimaryResidence/untracked-source cases); one canonical direction (holding=parent);
  **NOT a double-count** (value→corpus vs rent→income are distinct — contrast SIP #11) — verify cross-create
  doesn't inflate corpus inflow; §24 rental tax stays on the income line. **Tiered `good-to-have`**
  (goal-anchored: strong obj-0 "effortless setup" + 5W-#3 automate-don't-re-ask fit, but product works with
  manual double-entry and it's not a correctness/honesty error → not must-have/Tier-0; friction band of the
  Now-order). Top good-to-have. Implementation gated. Pointer: gh #70.
- **D-2026-06-08-08 — Stale validation errors after a SUCCESSFUL inline Add → filed gh #69 (`bug`,
  `good-to-have`, cross-cutting forms).** Abhay reported (prod): on `/liabilities/loans`, after clicking
  **Add loan** the loan IS added + persists, but the cleared **Loan name** field shows "Name is required".
  **Root cause (verified):** `src/components/forms/LoanForm.vue` — fields carry Vuetify reactive `:rules`
  (`nameRules` L85/172, `positiveRules`, `rateRules`); `addLoan()` resets `draft` to empty/null (L113–122)
  after a successful add, which **re-triggers reactive validation** on the now-dirty-but-empty fields →
  stale "required"/"> 0" errors. Add button is correctly `:disabled` by `isAddValid`, so this is a
  **stale-validation-DISPLAY bug, NOT a data bug** (loan saves fine). **Sibling audit:** shared "inline Add X"
  pattern — class extends to **7 forms** (LoanForm + RecurringExpense/PlannedFuture/InsurancePolicy/Business/
  Investment/OtherIncome), **EarnerSalaryForm safe** (edit-only, no add-reset). ≥3 instances → prefer ONE
  shared fix instrument (`v-form` ref + `resetValidation()` after add, or a `useInlineAddForm()` composable)
  + one generic catch-test, per `bug-filing-and-sibling-audit.md`. **Why missed:** no coverage of post-add
  *form state* — existing checks assert the row persisted (data substance) but never "no error visible after
  a successful add" (form-UX shape-vs-substance gap). **Tiered `good-to-have`** (goal-anchored: data entry +
  honest FIRE number genuinely WORK; this is trust/friction on objective-0 setup, not Tier-0 financial-honesty
  or data-correctness; not nice-to-have because it's a visible "looks broken" artifact app-wide). Implementation
  gated — no fix until Abhay says go. Pointer: gh #69.
- **D-2026-06-08-07 — Family-member ↔ separate-login identity reconciliation: NOT handled, architecturally
  impossible today → filed gh #68 (`good-to-have`, area:auth-identity, analysis-only).** Abhay's scenario: he
  adds family members (data records); one member later logs in with their own Google account and re-enters
  data → the same person now exists in two disconnected tenants with no link/dedup. **Honest verdict
  (verified):** v6 is single-tenant (ADR-0001) — a member is a `Member` data record owned by one `userId`,
  with NO `email`/`linkedUserId`/`User` relation (`@@unique([userId,entityId])`, unique per-owner) and NO
  family/invite/link/merge routes. So the system cannot even detect the two are the same person — by
  deliberate v6 design (the retired FIREKaro-Vue `Family/FamilyUser/Invitation` multi-user schema was NOT
  carried over). **NOT a math bug** — the planner's FIRE number reads only its own household, so a member's
  separate account doesn't corrupt it; harm is data-architecture/SSOT + redundant entry + confusion → not
  Tier-0. **Tiered `good-to-have`** (goal-anchored: wedge persona = single planner models the household;
  works without multi-user login; **escalates to must-have IF separate family-member login/invitations are
  offered**). Identity key MUST be the verified Google **email** (only reliable cross-tenant key).
  Recommended path (A): keep single-planner households + capture optional member email NOW (cheap
  future-proofing, YAGNI "cheaper now than retrofit") + clearly communicate members≠logins; defer full
  multi-user invite/merge (B/C) until greenlit. Implementation gated. Pointer: gh #68.
- **D-2026-06-08-06 — Member earner-derivation (gh #67) re-tiered `good-to-have` → `must-have`.** Abhay
  overrode my D-04 tiering: "recategorize it to must-have." Rationale he's anchoring to: the member
  earner/non-earner model is a **foundational data-model contract** on the income path that feeds the FIRE
  headline (`derive.ts` gates ALL income on `role==="EARNER"`), not peripheral polish — the member model
  doesn't genuinely work correctly until earner-status stops being a flag that can silently disagree with the
  income data (honest-number + effortless-setup for the core salaried-accumulator-+-spouse persona). Issue
  #67 label swapped (`good-to-have`→`must-have`) + body tiering section rewritten. **Still analysis-only —
  NOT implemented** (Abhay's standing "don't implement it yet" holds; must-have status ≠ build-now until he
  gives the go). Supersedes the tiering in D-2026-06-08-04. Pointer: gh #67.
- **D-2026-06-08-05 — "Viewing as &lt;member&gt;" lens re-tiered `good-to-have` → `must-have`; product fork
  resolved to Option A (lens the member-attributable screens app-wide) → gh #66 reframed (analysis-only, NOT
  implemented).** Abhay reported on prod (firekaro.com) that changing the global "Viewing as" dropdown doesn't
  change screen data; root-caused (verified at kernel: `derive()` re-scopes `lensedInvestments` 11→9 on the
  Sharmas seed; only 3 `*.vue` surfaces consume the lensed outputs; all other section screens read
  `household.data` un-lensed by design). Originally tiered `good-to-have` (wedge persona is often solo → dropdown
  hidden). **Abhay overrode: "to me this is a must-have feature."** That call also resolves the A/B fix fork →
  **Option A** (the lens MUST filter app-wide), not B (scope the control down). **Honesty-bounded scope (the
  load-bearing #22/#23 constraint):** lens only the genuinely member-attributable surfaces — income
  (salary per-member + business/other-income `ownerId`), investments/liabilities/insurance (`ownerId`/`insuredPersonId`),
  tax (lensed `annualTax`/`fyTax`). **Do NOT lens** (no ownership data OR honesty-core): expenses (recurring/planned
  carry NO `ownerId` → inherently household), and FIRE/adequacy/readiness/drawdown/stress/net-worth/health-score
  (must stay household-scoped — the FIRE-age-81 #22 class). `derive()` already exposes most lensed collections
  (`lensedInvestments/Liabilities/Insurance/Earners` + lensed display fields); income business/other-income need
  lensed outputs added or page-level `ownerId` filtering. **Implementation gated** ("don't implement yet"). Full
  surface map + acceptance criteria + test plan in the issue. Pointer: gh #66.
- **D-2026-06-08-04 — Member "earner" should be DERIVED from income, not a manual role flag → filed gh #67
  (`good-to-have`, analysis-only).** Abhay flagged that marking an adult `EARNER`/`NON_EARNING_ADULT` "does
  not look correct — if earnings are added for him then he is an earner, else not." FinTech+PM verdict: he's
  right, with a refinement — `role` conflates TWO orthogonal axes: **adult-vs-dependent** (NOT derivable —
  homemaker & child both ₹0 but differ in longevity/horizon, MUST stay explicit) and **earning-vs-non-earning**
  (IS derivable from income presence, the redundant flag). Today `derive.ts` gates ALL income on
  `role==="EARNER"` (lines 91/116/189), fully decoupled from whether salary exists → two-sources-of-truth
  contradiction (NON_EARNING_ADULT-with-salary silently drops income; EARNER-with-no-salary = ₹0 earner).
  **Tiered `good-to-have`** (goal-anchored) — **⚠ tiering SUPERSEDED by D-2026-06-08-06 (→ `must-have`).**
  Consumer/surface map + open design questions in the issue body. Pointer: gh #67.
- **D-2026-06-08-03 — HEADED production verification (Abhay-requested, watchable) → PASS; 2 coherence nits
  filed.** Abhay: "perform the same type of test in production also, as much as possible, headed." **Honest
  boundary held:** the dev test's from-scratch data-ENTRY writes data → forbidden on prod by
  `testing-strategy.md` (non-destructive only, even on the test account), so this is the maximum
  NON-DESTRUCTIVE prod test, headed. Ran `prod-authed-sweep-full.mjs` (already headed) + `prod-functional-sweep.mjs`
  (added a `HEADED` env toggle) **via the PowerShell tool** (native display = watchable; Bash runs on an
  invisible display per `ui-verification.md`). Results: **25-screen authenticated sweep PASS** (all render,
  0 console/page errors, no bounces, fresh screenshots) + **interactive sweep PASS** (levers, assumptions
  dialog open→close, readiness verdict age-56 coherent, tax-year selector, staleness banner correctly
  absent). **Blind re-verify (rule 33):** a context-blind agent opened 24/25 + 3/3 → PASS (healthy, no
  NaN/errors, FIRE age 56 plausible, cross-screen figures reconcile — income ₹51.70L, portfolio ₹2.05Cr,
  net worth ₹1.67Cr, planned-expenses match Goals). **2 non-blocking coherence nits found + filed:** **#64**
  (retirement-age labels read inconsistent across screens — 56 vs 55/50 vs 47, same year 2052; investigate
  labeling-vs-off-by-one), **#65** (two "annual tax" figures ₹12.22L vs ₹11.66L without explaining the model
  difference). Both good-to-have (filing a finding is allowed under the focus lock; building the fix is not,
  pending approval). *Why logged:* completes the watchable prod test Abhay asked for — prod re-confirmed
  healthy headed + independently, with 2 honest UX-coherence follow-ups tracked. → §1.
- **D-2026-06-08-02 — DECISION (taken, Abhay delegated): NO deploy; executed Phase B prod verification →
  PASS, blind-verified. The full QA goal lifecycle is now complete.** Abhay: "you take the decision and
  perform." **Deploy decision:** NO redeploy — the only product-code change since the last prod release
  (`45201dc`) is a no-behavior `logger.ts` redaction refactor, so a deploy ships zero user-facing change;
  not worth the prod risk. **(Correction 2026-06-08, after Abhay flagged it: the product-code delta since
  `45201dc` is actually TWO files — `server/src/lib/logger.ts` (redaction refactor) AND `src/lib/tax.ts`
  — but `tax.ts`'s +28 lines are 100% `// Stryker disable` COMMENTS (zero runtime/build change; verified
  non-comment-line count = 0), so both are genuinely no-behavior and the deployed bundle is byte-identical.
  Everything else changed since the deploy is test specs / scripts / docs / screenshots — dev artifacts NOT
  shipped to prod. The "no user-facing change → deploy optional" conclusion stands; the earlier "only
  logger.ts" phrasing was imprecise.)** Went straight to **Phase B against the live site** (non-destructive, read-only):
  **B1** `/api/health` GREEN (prod up, env=production, DB connected) + unauth `/login` render PASS (zero
  page errors; the 401 is the expected auth-gate); `/api/internal/smoke` honestly SKIPPED (no local
  `SMOKE_TOKEN` — `/api/health` covers DB). **B2** test-account session valid (`abhayfaircent@gmail.com`,
  `/api/planner/me` 200) → **25-screen authenticated sweep PASS** (every route renders, no `/login`
  bounces, **zero console/page errors**) + **interactive functional sweep PASS** (obj-2 levers compute
  "5 months earlier", assumptions dialog open+close, obj-3 readiness "Not yet" age 56 coherent with
  dashboard, tax-year selector interactive, staleness banner correctly absent) — all NON-DESTRUCTIVE
  (`testing-strategy.md`). **B3 blind re-verify (rule 33):** a context-blind agent reviewed the prod
  screenshots → PASS (healthy, no NaN/errors, FIRE age 56 + figures domain-plausible + cross-screen
  coherent; re-derived the EF + net-worth math). **B4 rollback:** N/A (no deploy, no failure). Evidence:
  `verification-screenshots/PROD-authed-FULL-*` (25) + `PROD-functional-*`. **Net: Phase A (verified+merged
  `b8fadd7`) → deploy gate (no-deploy decision) → Phase B (prod PASS) — the full-lifecycle QA goal is
  COMPLETE; prod is verified healthy.** Honest caveats: `/api/internal/smoke` not run (no token); the blind
  agent opened a 15/25 + 3/3 representative spread; 2 new issues from the re-run remain open (#62 first-login
  no-migration good-to-have, #63 demo seed-switcher nice-to-have). *Why logged:* records the delegated deploy
  decision + the prod-verification result that closes the goal. → §1/§2.
- **D-2026-06-08-01 — QA re-run (delta) SUPERVISOR-VERIFIED + merged to main; Phase A complete; deploy is
  near-optional (no product change).** The re-run (`chore/full-lifecycle-qa-2`) executed the 3 deltas and
  self-reported "Phase A DoD fully met." Supervisor check (rules 29/33, not a rubber-stamp): **§A2.6** —
  all 4 personas (Mauryas/Sharmas/Iyers/Mehtas) hand-entered from scratch through the real forms (every
  field), each gated to a CLEAN run, **blind-verified by a context-blind agent**, 40 post-entry
  screenshots; it **found + fixed a real bug** (Sharmas 2nd-earner salary selector → FIRE 69→56) ✅;
  **#60** — server-mode dev-bypass-OFF auth gate verified (401 even with header; all guarded routes →
  /login) + locked (`auth.spec.ts` 6 tests); first-login = no demo→server migration BY DESIGN
  (code-confirmed) → filed **gh #62** (good-to-have; prod is always server-mode+login-first) ✅; **#59** —
  tax.ts mutation 68.85%→**85.27%** via 75 exact-value differential tests + exclusion of
  **genuinely-equivalent** mutants — I read every Stryker-disable: all `financialYear`/`assessmentYear`/
  `isDefault` display-metadata never read by any computation + a DEV-only warn + a far-future ±1yr note
  (legit equivalents, not gaming); zero killable survivors on reachable slab/surcharge/relief ✅. Also
  filed **gh #63** (demo seed-switcher chip; nice-to-have). **Merged `chore/full-lifecycle-qa-2`→`main`
  (`b8fadd7`)**, clean (disjoint); post-merge gate GREEN (root 1053 / server 162, type-check 0, lint 0);
  pushed. **The ONLY product-code delta since the last prod deploy (`45201dc`, D-07-06) is
  `server/src/lib/logger.ts` — a no-behavior redaction refactor** → a new deploy ships nothing user-facing;
  **Phase B (prod verification) can run against the current live site, or after an optional hygiene
  redeploy.** Deploy + the SSH push remain Abhay's gate/credential. *Why logged:* records the verified
  Phase-A completion + the deploy-is-optional finding before the deploy/Phase-B decision. → §2.
### 2026-06-07
- **D-2026-06-07-13 — Re-run PREP done: merged the completed Phase-A QA branch to main + verified main green.**
  Abhay delegated the prep ("you do all the prep; I'll run /goal in another session"). Merged
  `chore/full-lifecycle-qa` (~63 green locks — 22 commits) into `main` via `--no-ff` (merge `086bc67`);
  the merge was **clean (fully disjoint** — branch = test/engine/signoff files, main = docs/skill/contract
  files, zero conflict candidates). Installed the merged devDeps (fast-check/Stryker), ran the post-merge
  gate **GREEN**: root type-check 0 / **978** unit (69 files), server type-check 0 / lint 0 / **156** unit
  (incl. live-DB IDOR/isolation/round-trip). Pushed `main` (`647555f..086bc67`). Verified the golden-master
  snapshot was unchanged (the git "M" was a Windows CRLF-only touch — content identical, no FIRE-headline
  drift). Deleted the merged local branch + pruned its worktree; the re-run uses fresh names
  (`firekaro-goal-qa2` / `chore/full-lifecycle-qa-2`, §0.1). Updated the contract §0.0 to mark the
  prerequisite SATISFIED. **The goal is now ready to re-run** — `/goal docs/goals/2026-06-07-full-lifecycle-qa-verification.md`
  will skip the done work (§0.2 preflight) and execute only the delta (§A2.6 4-persona gated loop, #59, #60).
  *Why logged:* records that the merge/prep gate (D-09's "Abhay's gate") is cleared + main is green. → §2.
- **D-2026-06-07-12 — §A2.6 refined to a SEQUENTIAL, GATED per-persona loop (Abhay's directive).** Per
  Abhay: enter each persona FROM SCRATCH one at a time — **Mauryas first** (full entry → verify → fix
  iteratively until a CLEAN run) → only THEN the next (Sharmas, then Iyers, then Mehtas) → loop through
  **all 4 data-bearing personas**, each gated to zero-open-issues before advancing, **no exceptions, no
  thinner passes**. Updated §A2.6f (the gated loop + order), the A2.6 acceptance, the §13 DoD line, and
  noted the engine sub-task (`enter-persona-via-ui.mjs` holds only the Maurya dataset → add a from-scratch
  entry dataset per persona; never a seed-load). Persona set decided goal-anchored: Mauryas (single,
  full-field-coverage) + the 3 urban-salaried target-persona archetypes (Sharmas/Iyers/Mehtas); Empty =
  zero-data new-user, covered by A2.5b. *Why logged:* materially changes how §A2.6 executes (gated
  sequential, not parallel/either-order). Tracked under #61. → §2.
- **D-2026-06-07-11 — CEO review: the QA run "verified the new-user journey" via SEED-LOAD, not
  from-scratch UI hand-entry → contract hardened (§A2.6) + skill generalized + #61.** Abhay's check: did
  the run create a new family + enter every field from the UI + compute the FIRE number + verify all
  reports + screenshots verified by multiple roles, iteratively fixed? **Verified answer: NO.** The run's
  A2.5a tested entry *surfaces* + guards + **"Try the sample" (loads the Sharma SEED)** + read-only
  `verify-persona.mjs` screenshots; A5's 68 screens were seed-loaded (read-only), blind-verified by one
  agent; it never drove the headed `enter-persona-via-ui.mjs` for a from-scratch new-user + family build.
  That proves *render*, not *entry* (`ui-verification.md` "data ENTRY is not verification"). **Fixed:**
  (GENERIC → goal-creator SKILL.md STEP 4) "'tested via UI'/'new-user journey' = HAND-ENTRY, not
  seed/demo-load"; (SPECIFIC → the QA contract) new mandatory **§A2.6** — from-scratch headed every-field
  UI data-entry journey → FIRE-from-entered → all-reports coherent+plausible → post-entry per-screen
  screenshots multi-role + blind verified → iterative fix-loop → across ≥2 household shapes (single +
  dual-income family); seed/demo-load explicitly does NOT count. Tracked **#61**; lessons.md entry added.
  Independently reviewed (rule 29). *Why logged:* a genuine coverage gap the run's self-grade hid, caught
  by the owner/CEO check — now durable in skill + contract so the re-run actually does it. → §2.
- **D-2026-06-07-10 — Applied the Mode-B fold-back from the QA run's learnings (generic→skill,
  specific→contract).** The QA run's misses (D-09) traced to two contract-AUTHORING defects, now fixed
  at the source. **GENERIC → `goal-creator`:** (a) "DoD verbs are load-bearing — an autonomous run
  satisfies the literal checkbox and stops" (state ACTION + COMPLETENESS bar; "report" ≠ "close to
  threshold"; "represented" ≠ "all N×M") — SKILL.md STEP 1 + contract-template DoD note; (b) "provision
  the env for every mandated check — a conflicting-env check gets a dedicated non-deferrable sub-run, or
  it WILL be deferred" — SKILL.md STEP 4 quality bar; + a lessons.md entry. **SPECIFIC → the QA
  contract** (`2026-06-07-full-lifecycle-qa-verification.md`, complete-not-running so editable): A7.6
  now requires CLOSING `tax.ts` survived mutants to ≥85%/zero-on-slabs (#59) not just reporting; A2.5
  gained a provisioned, **non-deferrable §A2.5d server-mode + dev-bypass-OFF sub-run** (auth-gate /login
  bounce + 401 + first-login transition, #60); A3 now states the completeness bar (targeted high-risk
  cross-product required, full 55-cell explicitly optional). A re-run's §0.2 preflight does only the
  delta. *Why logged:* the self-improvement loop working as designed — the run's gaps became durable
  skill+contract upgrades so they don't recur. Independently reviewed (rule 29). → §2.
- **D-2026-06-07-09 — Supervisor completeness assessment of the full-lifecycle QA `/goal` run (Phase A
  "complete"); correctness strong, completeness ~85%, two gaps elevated + tracked.** The QA run (branch
  `chore/full-lifecycle-qa`, 21 commits, `RELEASE-READINESS-SIGNOFF-2026-06-07.md`) self-graded Phase A
  complete. Applying the supervisor lens (a run is the worst judge of its own completeness): "complete"
  = every stage **addressed/represented**, NOT exhaustively done. **Correctness — strong + blind-verified**
  (kernel invariants, per-persona plausibility, empty/partial honesty closing #39 family, multi-tenant
  isolation, persistence integrity, resilience; the edge caught + fixed a real IDOR false-proof; ~63 locks).
  **Completeness — real named gaps**, ranked by product impact: (1) **A7.6 mutation 73%, 98 survived in
  `tax.ts`** — REPORTED not closed; the top correctness hole for a tax/FIRE product → filed **#59**;
  (2) **deferred dev-bypass-OFF auth gate + first-login localStorage→ServerAdapter transition** (A2.5a) —
  the PII-protecting auth gate is still a false-PASS and the orphaned-demo-data risk is unconfirmed →
  filed **#60**; (3) A3 exhaustive 5×11 matrix (layers represented, full cross-product not run — targeted
  high-risk pass recommended over grinding all 55); (4) minor: A4 lifecycle/comms dry path, Mehtas what-if
  baseline; (5) Phase B (post-prod) — correctly deferred to after deploy. E2E is demo-mode + headed-only,
  not CI (→ #54). **Recommendation:** the branch is sound — **merging the locks is worthwhile (Abhay's
  gate per the sign-off)**, but treat Phase A as "complete with documented non-blocking gaps," NOT a clean
  deploy pass; run #59 + #60 (server-mode continuation) before deploy confidence; **production deploy stays
  Abhay's gate** (decision-authority). *Why logged:* document-on-decision — captures the honest completeness
  verdict so it isn't lost on an unmerged branch. → §2.
- **D-2026-06-07-08 — Built the goal-run self-improvement loop into `goal-creator` + remediated its own
  independent-review findings.** Added (a) a §0.3 **live cross-session progress log**
  (`docs/goals/.run/<slug>-PROGRESS.md`, discover via `git worktree list`); (b) a **run-end learnings
  fold-back** + **Mode B** (post-run apply on approval); (c) a **two-type learning taxonomy** —
  **GENERIC** → skill/process-rule vs **PRODUCT-SPECIFIC** → a product rule if a recurring class else
  the goal contract; prefer a deterministic gate over prose; one canonical home + dedup — *grilled with
  Abhay via `/grill-me`* (the routing fork). Commits `a273bc8`/`1be51f5`/`f63a48a` + the remediation
  `<this commit>`. **An adversarial independent review (rule 29) then found this session's own
  governance slips** — no `lessons.md` entries, no PROJECT-LOG entry (this one), a missed SemVer bump, a
  triplicated taxonomy that drifted once, stale `mvp/`/`demo/` tree refs in the skill, and the core
  irony that the loop is **advisory prose** in a repo whose lesson is "prose doesn't prevent recurrence;
  gates do." **All remediated:** 3 lessons added; this entry; SemVer→1.3.0; taxonomy de-duplicated to
  one canonical home (`baked-in-rules §0.3`) + pointers; tree refs retargeted to the single-app reality
  (closes #57); volatile snapshot removed from `must-have-only-focus.md`; an honest advisory-pending-a-gate
  note added + the gate candidate filed (#58). *Why logged:* document-on-decision was the gap the review
  caught — this closes it. → §2.
- **D-2026-06-07-07 — Locked focus to MUST-HAVE ONLY (new standing rule) + authored a full-LIFECYCLE
  QA verification goal (pre-prod gate + post-prod verification).** Abhay's directive: "focus only on
  must-have features; make this a rule; do not touch good-to-have/nice-to-have until I explicitly
  approve" + (as QA process lead) "ensure everything is properly tested BEFORE prod deploy AND verify
  everything AFTER prod deploy." **Acted (explicitly approved to execute):** (1) created
  `.claude/rules/must-have-only-focus.md` (global) — no new good-to-have/nice-to-have build without
  explicit per-item approval; explicit carve-out = testing/verification/hardening/bug-fixing of
  already-implemented features (any tier) + Tier-0 fixes (resolves "only must-have" vs "test ALL
  features"); reads tier from issue labels; cross-refs goal-anchored-decisions + documentation-management.
  (2) Authored `docs/goals/2026-06-07-full-lifecycle-qa-verification.md` — an autonomous QA `/goal`
  contract structured as **Phase A (pre-production gate)** → **hard DEPLOY GATE (Abhay)** → **Phase B
  (post-production verification)**. Phase A (localhost:5175 + Supabase, never full-suite/load/pentest on
  prod): both trees static+unit+integration, full E2E, 9-layer functional sweep (backend/API/render/
  UI→DB/cross-page/interactive/three-state/negative-boundary/a11y/responsive/dark-mode) × 8 sections × 5
  personas × each process, plausibility (31) + Lighthouse + security, screenshot-EVERY-screen/process
  evidence archive + MULTI-ROLE visual review (UI/UX·QA·FinTech·a11y) + blind verify (33), coverage +
  traceability matrix + severity triage, ending in a release-readiness sign-off. Phase B (after Abhay
  deploys; NON-DESTRUCTIVE only): Tier-1 smoke, change-is-live, Tier-2 authenticated non-destructive
  sweep, synthetic monitoring, blind re-verify, Abhay-gated rollback. Deploy + rollback are Abhay-gated
  (the contract halts at the deploy gate). Contract left UNCOMMITTED per the goal-contract convention
  (Abhay edits → runs `/goal`). *History note:* an earlier same-day attempt over-executed on a "just
  hand me the polished prompt" turn and was reverted (`dd874c7`); after two review rounds (added
  screenshot-per-screen + multi-role review, then the pre/post-prod lifecycle split) Abhay approved
  execution. *Why logged:* a standing prioritization lock + the current active QA focus. → §1/§2.
- **D-2026-06-07-06 — DEPLOYED obj-4 #50 to production + functionally verified live; the full
  must-have core (obj 0→4) is now COMPLETE in prod.** Abhay authorized ("do it"). Shipped pinned
  `main` `45201dc` (obj-1/2/3 + obj-4 #50 + the SequenceRiskCard HIGH fix) to the VPS
  (`git archive | ssh tar`), rebuilt SPA, `pm2 reload` zero-downtime; migrate = "no pending" (#50
  added no migration). Pre-deploy backup `firekaro-backup-predeploy-45201dc-*.tgz`. **Smoke green**
  (/api/internal/smoke ok, db connected, user.count 3, 114ms; /fire-goals/drawdown 200; code in live
  bundle). **Authenticated functional sweep PASS** (test account abhayfaircent): `/fire-goals/drawdown`
  renders all 3 sections — safe-withdrawal range (preview ₹27.43–41.14L on the ₹10.55 Cr FIRE number,
  suggested ₹34.28L ≈3.3%), sequence-risk **real "Watch early years" verdict** ("under normal markets
  your corpus lasts; a bad early sequence could deplete by ~age 79", plan-to 90) — **the HIGH fix
  confirmed live (no false alarm)** — and the annual check-in; zero console/page errors, numbers
  coherent. **Independently blind-verified** (separate context-blind agent: accept, conf 0.9, no
  dissents/plausibility flags). **#50 closed → must-have registry empty (#48/#50/#51/#52 all closed).**
  *Milestone:* the urban-salaried accumulator's WHOLE FIRE lifecycle (obj 0→4) is now built, deployed,
  and verified in production. Next frontier = stickiness (unproven) + good-to-have. → §1.
- **D-2026-06-07-05 — Supervisor verification of #50 (obj-4) caught + fixed a deploy-blocking HIGH;
  #50 now verified-ready (NOT yet deployed).** Abhay asked to verify "is #50 fully implemented?"
  before deploying. Independent supervisor pass (rule 29/33, operating-model): reproduced the gates
  (type-check 0, **938** unit, build green); dispatched an independent **FinTech Domain Analyst**
  (PASS-with-nits, **NO HIGH** optimistic-honesty defect — the sequence-of-returns math is a genuine
  bad-early-sequence depletion stress, real-frame, well-guarded; nits = representative-not-worst
  shock + a small documented `startingCorpus` tail-drift) AND an independent **code-reviewer** which
  caught a **HIGH**: `SequenceRiskCard.vue` rendered a red "your corpus runs short even under normal
  markets" alarm to a **no-data user** (`fireNumber===0`, the gh-#39 empty-data false-positive class,
  rule-31 honesty) — the sibling `WithdrawalBandsCard` guards this; `SequenceRiskCard` didn't.
  **Fixed at root:** `sequenceRiskWarning()` now returns `unplannable`; the card branches to a neutral
  "we can't stress-test yet" state on that one lib-owned signal. Locked by 3 new lib specs (decumulation
  14→17; full 938 green); type-check + build green. Backfilled the missing run DEFERRED file.
  **Verdict: as-merged #50 was NOT fully implemented (1 HIGH); after the fix it is functionally
  complete + deploy-ready. NOT yet deployed** (Abhay's gate; verification was the requested first step).
  *Why logged:* textbook independent-verification win — the run self-verified green + claimed
  code-review APPROVE, but the blind supervisor pass caught an optimistic-honesty bug before a user saw
  it (mirrors D-12). **Separate finding (NOT #50) → filed:** the splash's "Try the sample" demo-entry
  button is GONE (only "Begin wizard" remains), so `verify-persona.mjs` / `enter-persona-via-ui.mjs` /
  the ui-verification rule's gotcha are stale → localhost persona-render is currently blocked; the
  drawdown page's definitive rendered verification will be the post-deploy prod sweep.
- **D-2026-06-07-04 — SHIPPED obj-4 post-FIRE decumulation guardrails (must-have) + merged to `main`.**
  Ran `docs/goals/2026-06-06-decumulation-guardrails.md` via `/goal` in an isolated worktree
  (`feat/decumulation-guardrails` off `main`); Abhay merged it (`d891875`, `--no-ff`). Adds the
  `/fire-goals/drawdown` "After you retire" surface: (A) `safeWithdrawalBands()` — this-year safe
  range, REUSING the existing Floor/Ceiling rule (no duplicated withdrawal math); (B) NEW
  `sequenceRiskWarning()` — an honest deterministic bad-early-sequence depletion stress (the #1
  retiree-ruin risk; never a smooth average that can't fail, rule 31); (C) two cards + page + a
  lightweight annual check-in. Pure real-frame lib (`src/lib/decumulation.ts` + 14 specs).
  **Verification:** type-check 0, 935 unit tests, build green (pre- AND post-merge on `main`);
  **FinTech Domain Analyst** first BLOCKED on a band-coherence HIGH (`floor≤suggested≤ceiling` broke
  when a guardrail fired) → fixed at root (band anchored to `suggested`, one frame) + catch-tests →
  re-gate PASS; **code-reviewer** APPROVE (lib + UI); **Rule 24** across 3 personas (Sharmas
  accumulating/at-risk, Iyers resilient, Mehtas near-FIRE/depletes — all three sequence-risk branches,
  zero console errors, PNGs read); **Rule 26** coherence confirmed live (every card input is the
  headline's own derive value; Mehtas' realReturn-1.6% < SWR-3.25% depletion is an honest longevity
  signal, not a frame bug). Pointer: goal contract + `docs/goals/.run/2026-06-06-decumulation-guardrails-DEFERRED.md`
  (DEFERRED: MC depletion probability, full post-FIRE annual-review engine, pre-existing shared-chrome
  a11y debt). *Why logged:* obj-4 ("stay free post-FIRE") must-have is now in `main` — the
  full-lifecycle wedge (obj 0→4) for the urban-salaried accumulator is feature-complete on the core.
- **D-2026-06-07-03 — Prod AUTHENTICATED functional verification of obj-1/2/3 PASSED (rule 32),
  independently re-verified (rule 33).** Drove the live site logged-in (valid saved session, test
  account `abhayfaircent@gmail.com`) headless + non-destructive via `scripts/prod-functional-sweep.mjs`
  (session validity pre-checked by `scripts/prod-session-check.mjs` → `/api/planner/me` 200). Results:
  **obj-2 AccelerationCard** renders "biggest achievable wins" with real per-lever deltas (≈2.6 yr /
  1.5 yr / 10 mo sooner; the "invest more" slider is interactive); **obj-3 `/fire-goals/readiness`**
  shows verdict "Not yet" + the accessible-money bridge breakdown, **age 56 == the dashboard headline**
  (rule-26 coherence), nav entry "Can I retire?" present+active; **obj-1 tax-staleness** banner
  correctly ABSENT for the configured FY. Zero console/page errors, no `/login` bounces, no implausible
  numbers. A **separate context-blind agent** re-checked the screenshots + report and concurred
  (accept, conf 0.88). **Honest caveats:** (a) obj-1's POSITIVE firing path (banner shows when the live
  FY is unconfigured) is NOT exercisable non-destructively on prod — covered only by unit tests at
  merge; (b) trim/risk levers verified as *computed* (not placeholder) but only the save-more slider
  was toggled. Evidence: `verification-screenshots/PROD-functional-2026-06-07T03-07-18-915Z/`
  (gitignored). *Why logged:* completes the "test it on prod" step Abhay asked for; the deployed
  must-have core is now functionally verified live, not just smoke-checked.
- **D-2026-06-07-02 — DEPLOYED the must-have accumulation core (obj-1/2/3) to production.** Abhay
  authorized + sequenced the deploy (run obj-4 #50 in a parallel `/goal` session; deploy obj-1/2/3
  here). Shipped pinned `main` SHA `d04571c` to the VPS (`git archive | ssh tar` — private repo, the
  box isn't a git checkout), rebuilt the SPA, applied the one pending migration **B7**
  (`contributionSchedule` JSONB — additive nullable, the only schema change; B6 rental-tax was already
  live in the box's 9), `pm2 reload firekaro-api` zero-downtime. Pre-deploy code backup
  `firekaro-backup-predeploy-d04571c-*.tgz` on the box. **Smoke green:** `/api/internal/smoke`
  {ok, db connected, user.count:3, 125ms}, `/api/health` ok, schema up to date (10 migrations),
  homepage + `/fire-goals/readiness` 200, and obj-1/2/3 surface copy confirmed in the freshly-built
  live bundle. **#48/#51/#52 closed (completed AND deployed).** *Backup note:* Supabase free tier has
  no on-demand PITR; the additive-nullable migration is trivially reversible (`DROP COLUMN`) + daily
  auto-backup covers it — proceeded on that risk assessment. *Deferred → Tier-2 on-demand:*
  authenticated UI **functional** verification on prod (needs the dedicated test-account Google
  session; `testing-strategy.md`). **Registry now: must-have = #50 OPEN only** (obj-4, building in the
  parallel session). #50's deploy still needs: merge `feat/decumulation-guardrails`→`main` +
  independent verify (rule 29/33) + a second (migration-free) deploy.
- **D-2026-06-07-01 — Completed the must-have GitHub-issue registry (filed #50/#51/#52); affirmed
  obj-3/4 as must-have.** At Abhay's request ("find the goal's must-have features; if not logged as
  issues, file them — do not implement yet"), audited the full-lifecycle goal (§9, all 5 objectives)
  against the issue registry. Found the must-have set **~90% delivered to `main`** but with registry
  gaps → filed: **#50** post-FIRE decumulation guardrails (obj-4 — the only fully-unbuilt must-have;
  contract `docs/goals/2026-06-06-decumulation-guardrails.md` authored, not run); **#51** current-FY
  tax-staleness guard (obj-1; built+merged @6ab9c8c/c08f91a, deploy-pending); **#52** readiness-to-stop
  verdict (obj-3; built+merged @6b697f0/ec1eb5e, deploy-pending). All labelled `must-have`.
  *Tiering call (goal-anchored, rule 30):* **obj-3 and obj-4 ARE must-have, not "later/good-to-have"** —
  §9 lists them as part of THE goal ("in-scope for our own user who reaches FIRE"); D-2026-06-06-07's
  "obj 3+4 = later phase" was a *sequencing* call, and the team has since shipped obj-3 + authored obj-4
  as must-have contracts (D-13/D-14). They are the LAST must-haves in sequence. Supersedes the §2
  implication that obj 3+4 sit outside the must-have set. **Registry now: `gh issue list --label
  must-have` = #48 (obj-2, on main) · #50 (obj-4, unbuilt) · #51 (obj-1, deploy-pending) · #52 (obj-3,
  deploy-pending).** *Per the user's instruction: do NOT implement yet.* **Cross-cutting blocker for
  the "deployed in production" half of the goal:** obj-1/2/3 are merged to `main` but NOT live — the
  production redeploy is Abhay's gate (B7, `docs/comms-go-live-handoff.md`).

### 2026-06-06
- **D-2026-06-06-14 — SHIPPED obj-3 readiness-to-stop verdict (the "can I pull the trigger?" surface);
  merged to `main` (cd78485).** The `/goal` run on `docs/goals/2026-06-06-readiness-to-stop-verdict.md`
  built it in 2 commits on `feat/readiness-verdict`: (a) **`src/lib/readiness.ts`** — a PURE
  `computeReadiness()` classifier over the EXISTING accessible-money bridge (no new FIRE math), 5 honest
  states `ready-now / ready-at-age / bridge-limited / corpus-short / unplannable`, `readyAtAge ==
  bridge.effectiveFireAge` verbatim (never more optimistic than the FireHero headline — bakes the
  526e100 lesson); (b) **`/fire-goals/readiness`** page + `ReadinessVerdictCard` (decision-support, never
  advice) above the REUSED `BridgeBreakdownCard` + a "Can I retire?" nav entry. **Verification:** FinTech
  Domain Analyst PASS (zero optimistic-honesty defects), code-reviewer APPROVE ×2, type-check 0, 921 unit
  (post-merge), build green; Rule 24 screenshot/ARIA/console on Sharmas (age 56) + Mauryas (age 67); Rule
  26 readyAtAge == round(anchorAge+yearsToRegular) on both; Rule 25 N/A (read-only). Merged cleanly with
  the already-merged tax-staleness sibling (no conflict). *Why logged:* obj-3 (the wedge persona's
  readiness-to-stop lifecycle stage) now has its decision-support UI — math was already built, only the
  verdict surface was missing. **Run DEFERRED note** (non-blocking): `bridge-limited`/`ready-now`/
  `ready-at-age` are not seed-reachable (all 5 seeds covered+accumulating → corpus-short) so they are
  unit-locked, not screenshot-verified — a near-FIRE-with-locked-money seed would let `bridge-limited`
  get a real on-screen fixture (good-to-have follow-up). Branch `feat/readiness-verdict` + worktree
  `firekaro-goal-readiness` retained (cleanup later).
- **D-2026-06-06-13 — Authored the 3 remaining must-have goal contracts (the obj-1/3/4 queue) for
  parallel `/goal` runs.** With #48 done (D-12), the remaining must-have set is contracted, sequenced,
  and parallel-safe — Abhay runs them in separate sessions: (1) **tax current-FY staleness guard**
  (obj-1, small — the last accumulation-core honesty hole; prod-visible banner when the live FY is
  unconfigured) → `docs/goals/2026-06-06-tax-current-fy-staleness-guard.md`; (2) **readiness-to-stop
  verdict** (obj-3 — a "can I pull the trigger?" verdict on the existing bridge math) →
  `docs/goals/2026-06-06-readiness-to-stop-verdict.md`; (3) **decumulation guardrails** (obj-4 —
  withdrawal bands reuse + NEW post-FIRE sequence-of-returns warning + light annual review) →
  `docs/goals/2026-06-06-decumulation-guardrails.md`. Each contract self-isolates into its own worktree
  off `main` (§0.1) + an idempotency preflight (§0.2), commits-but-does-not-push (Abhay merges), and bakes
  the 526e100 real-frame/never-more-optimistic-than-headline lesson. **Parallel-safe by design:** disjoint
  file sets, except #2/#3 both add a route+nav line (`router/index.ts` + `SidebarNav.vue`) — a trivial
  adjacent-line merge, noted in both. *Why logged:* the must-have roadmap after #48 is now durably
  tracked as runnable contracts, not chat. obj-1 first (small, closes the core); obj-3/4 are the wedge's
  later lifecycle (math built, UI missing). Contracts left UNCOMMITTED per the goal-contract convention
  (edit-then-run). Good-to-have follow-ups remain: #44/#45/#41/#49 + the untracked ones from the audit.
- **D-2026-06-06-12 — #48 SHIPPED then the supervisor edge caught a HIGH honesty defect; fixed. #48
  must-have core now genuinely complete.** The `/goal` run built + merged the #48 remainder (80CCD
  lever, MC band, composable, AccelerationCard) onto `feat/lever-impact-engine` (merge 84fde1e). The
  run self-verified green — but the operating-model verification edge (independent FinTech +
  Code-Quality, rule 29/33) caught what the run's seed spec missed: on the **bridge-limited Iyers
  persona the card showed the SCALAR corpus-only years (~17.5) — 1.4yr MORE OPTIMISTIC than the honest
  bridge-adjusted headline (~18.9)** — the rule-31/bug-#22 optimistic-skew class on a flagship action
  surface (the run's spec only tested Sharmas, where the bridge is inactive → diff 0). **Fixed**
  (526e100): card always renders the honest `headlineYears`; when `bridgeBinding`, the scalar per-lever
  deltas are dropped for an honest "your date is bridge-limited" caveat; +4-persona rule-31 plausibility
  sweep + a dep-free template-binding lock. FinTech PASS, Code-Quality re-review APPROVE, 903/903 green,
  type-check clean; committed (NOT pushed — Abhay merges). **Deferred → #49 (good-to-have):** make the
  per-lever deltas themselves bridge-aware (re-run `derive()` per lever) to restore quantified figures
  for liquidity-limited households; the caveat makes the current state honest now. *Why logged:* a
  textbook win for the independent-verification mandate — self-verification shipped an optimistic-honesty
  bug; the blind review pass caught it before it reached a user. **#48 = done** (modulo #49); the next
  must-have is the obj-1 tax current-FY staleness guard (small) then the obj-3/4 surfaces (later phase).
- **D-2026-06-06-11 — FinTech gate caught 2 moot levers; corrected the must-have obj-2 lever set.**
  A lever only has value if it changes something `derive()` doesn't already assume optimal.
  **Regime arbitrage = MOOT** (`derive()` auto-`recommendRegime()`s + taxes at the optimal regime;
  no persisted "regime the user files under") → reverted the inert `lever-tax.ts`; regime becomes
  **good-to-have, blocked on a `household.preferredTaxRegime` + `derive()` change** (a Tier-0 honesty
  surface). **invest-surplus = MOOT/double-count** (`annualSavings = income−tax−expenses` IS already
  `monthlyContribution`) → rework to a "save ₹X more/mo" sensitivity. **80CCD(1B) headroom = GENUINE**
  (`derive()` uses *actual* `deriveDeductions()`, not assumed-max) → it REPLACES regime as the must-have
  India tax lever. *Why logged:* my earlier "regime = cleanest must-have" call (D-09) was wrong; the
  verification edge corrected the lever set before it shipped. Corrected must-have levers: trim ✓ +
  risk-notch ✓ (built) + 80CCD(1B) headroom + save-more sensitivity; invest-surplus needs rework.
- **D-2026-06-06-10 — Set up a proper feature-tiering PROCESS (was missing).** Audit found the tier
  decisions were captured in PROJECT-LOG but there was NO queryable registry and the issues weren't
  tiered. Fix: GitHub issue LABELS `must-have`/`good-to-have`/`nice-to-have` are the registry
  (`gh issue list --label …`); the process is codified in `documentation-management.md` § "Feature
  tiering registry"; the WHY stays here. Applied tiers to all open issues (#48 must; #44/#45/#41/#46
  good; #43/#47 nice). *Why:* Abhay's standing requirement to keep must/good/nice features properly
  documented — decisions alone weren't enough without a maintained, queryable home + a process.
- **D-2026-06-06-09 — Re-scoped #48's remaining increments: only ~half are must-have.** Must-have =
  composable + ranked card + **regime arbitrage** (highest-ROI, cleanest-to-model India lever) +
  confidence ranges on variance-bearing levers (honesty). Should-have = 80CCD(1B), prepay-vs-invest
  (own careful increment), sensitivity drill-down. Nice/defer = employer-NPS ask, tax-page annotations,
  **celebrate phase → stickiness phase** (it's retention, deferred behind the core). *Why (goal):*
  anti-feature-completeness (rule 30) — build the minimum that makes obj 2 genuinely answer the
  accumulator's "biggest achievable win?", sequenced by value-per-modelling-risk, not "the catalog
  looks incomplete". See §2.
- **D-2026-06-06-08 — Lever comparability policy = realistic max-effort + transparent bounds + obj-1
  confidence bands + per-lever sensitivity drill-down** (#48). Decided with the FinTech + PM role
  (Abhay: "use proper role and take decision"), goal-anchored to the accumulator's "what's my biggest
  *achievable* win?". Rejected per-₹ efficiency (crowns tiny-headroom levers) and pure user-set
  sensitivity (abdicates the "rank them" mandate). *Why logged:* it's the load-bearing honesty
  decision gating every lever definition. Engine + 3-lever catalog shipped on `feat/lever-impact-engine`.
- **D-2026-06-06-07 — Reprioritized to COMPLETE THE MUST-HAVE CORE (obj 0+1+2) before stickiness;
  scope = accumulation core, defer obj 3+4 to a later phase.** Abhay's call: complete the app's
  must-have feature set before measuring retention (a working core is the precondition for
  stickiness). A 4-assessor completeness audit found obj 1 ~95% / obj 0 ~90% / **obj 2 ~35% — the
  lever-impact ranking engine is the hollow core**. Obj 3+4 are the wedge persona's later lifecycle
  (math built, UI missing) → sequenced later, NOT must-have-now. Stickiness (#44/#45) + Form16/CAS
  (#43) deferred behind the core. *Why (goal):* serves the LOCKED accumulator persona's "get there
  faster" objective, the biggest must-have gap. → flagship issue (lever engine) + §2 plan.
- **D-2026-06-06-06 — Temporal-contributions Phase 1 SHIPPED to `main`.** Autonomous `/goal` run of the
  #46 contract completed with no deferrals; merged @ `c7c70a5` (+ ADR-0004, the persisted
  `contributionSchedule` column, the What-If step-up lever, plausibility locks). Migration is
  authored-not-applied → tracked as deploy-gate **B7**. Two non-blocking follow-ups filed: **#47**
  (chart/headline frame divergence + step-up-ceiling spec gap). *Why logged:* closes the §2
  "Abhay runs /goal when ready" status; the honesty-objective foundation is now stronger.
- **D-2026-06-06-05 — Created the documentation-management system.** New rule
  `.claude/rules/documentation-management.md` (doc taxonomy + document-on-decision trigger +
  auto-reference protocol) + this `docs/PROJECT-LOG.md` + a `CLAUDE.md` pointer. *Why:* strategic
  decisions had no single durable, auto-referred home and could be forgotten across sessions.
- **D-2026-06-06-04 — Next priority = stickiness/measurement (#44).** *Why:* biggest unproven risk to
  the goal; correctness just served; can't improve unmeasured retention. See §2.
- **D-2026-06-06-03 — Temporal-contributions model FINALIZED + Phase-1 contract authored.** Independent
  FinTech + Architect review resolved the corpus-inflow blocker → **residual-only inflow; per-investment
  schedules barred from corpus (the bug-#11 lock); year-indexed schedule; REAL-terms opt-in step-up;
  age-relative segments.** Contract: `docs/goals/2026-06-06-temporal-contributions-phase1.md`; ADR-0004
  to be written by the run. *Why (goal):* the "frozen-today-forever" projection was the top objective-1
  honesty gap. → issue **#46**.
- **D-2026-06-06-02 — Tracked the untracked buildable frontier as issues.** **#43** Form16/CAS import,
  **#44** analytics instrumentation, **#45** retention delivery loop. *Why:* they lived only in
  roadmap prose; now durably tracked.
- **D-2026-06-06-01 — Goal-achievement assessment: ~30–40% realized.** Correctness strong, stickiness
  unproven, objectives 0/2/3/4 partial-to-early. *Why logged:* the honest baseline that anchors
  prioritization. → §1.

---

## §4 — Pointers (the formal artifacts this log indexes)

- Product design SSOT + objectives §9: `docs/v6-fire-planner-product-plan.md`
- Open work items: GitHub Issues (`gh issue list`) — current: #41, #43, #44, #45, #46, #47, #48, #49, #50, #51, #52
- **Feature priority tiers (registry = issue labels):** `gh issue list --label must-have` /
  `--label good-to-have` / `--label nice-to-have`. The categorization process is governed by
  `.claude/rules/documentation-management.md` § "Feature tiering registry"; the WHY of each call is in
  the decision log below. Current: must-have #48/#50/#51/#52 · good-to-have #44/#45/#41/#46/#49 ·
  nice-to-have #43/#47.
- Architecture decisions: `docs/adr/` (0001–0003; 0004 temporal model pending the #46 run)
- Autonomous build specs: `docs/goals/`
- Retention backlog: `docs/retention-engagement-features.md`
- Blocked-on-Abhay register: `docs/comms-go-live-handoff.md`
- Cross-session facts/feedback: `MEMORY.md` + `memory/`
- The governance rule: `.claude/rules/documentation-management.md`
