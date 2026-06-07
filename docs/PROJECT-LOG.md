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

**Updated: 2026-06-07.**
- **Goal (SSOT `docs/v6-fire-planner-product-plan.md` §9):** research-grounded Indian FIRE planning
  SaaS — correct, honest, sticky, friction-free — serving the **urban salaried accumulator** across
  the whole FIRE lifecycle (5 objectives: effortless setup · honest number · get-there-faster ·
  readiness-to-stop · stay-free-post-FIRE).
- **Realization: ~55–60%.** Production-live (https://firekaro.com); the must-have **accumulation
  core — objectives 0, 1, 2, 3 — is now built AND deployed to prod** (deploy 2026-06-07, SHA
  `d04571c`; #48/#51/#52 closed). **Remaining: objective 4** (post-FIRE decumulation guardrails,
  **#50** — the last unbuilt must-have) **plus stickiness is still unproven** (zero retained users,
  retention unmeasured).
- Calling the goal "achieved" would be the optimism-error the honesty mandate exists to prevent.

---

## §2 — Active priority / roadmap (the "Now" order: correctness → stickiness → friction)

**Current focus chosen 2026-06-06 (REPRIORITIZED by Abhay): COMPLETE THE MUST-HAVE CORE before
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

### 2026-06-07
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
