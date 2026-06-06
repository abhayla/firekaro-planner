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

**Updated: 2026-06-06.**
- **Goal (SSOT `docs/v6-fire-planner-product-plan.md` §9):** research-grounded Indian FIRE planning
  SaaS — correct, honest, sticky, friction-free — serving the **urban salaried accumulator** across
  the whole FIRE lifecycle (5 objectives: effortless setup · honest number · get-there-faster ·
  readiness-to-stop · stay-free-post-FIRE).
- **Realization: ~30–40%.** Production-live (https://firekaro.com since 2026-06-01); the
  **correctness/honesty foundation (objective 1) is the strong win**; objectives 0/2/3/4 are
  partial-to-early; **stickiness is unproven (zero retained users, retention unmeasured).**
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

### 2026-06-06
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
- Open work items: GitHub Issues (`gh issue list`) — current: #41, #43, #44, #45, #46, #47, #48
- **Feature priority tiers (registry = issue labels):** `gh issue list --label must-have` /
  `--label good-to-have` / `--label nice-to-have`. The categorization process is governed by
  `.claude/rules/documentation-management.md` § "Feature tiering registry"; the WHY of each call is in
  the decision log below. Current: must-have #48 · good-to-have #44/#45/#41/#46 · nice-to-have #43/#47.
- Architecture decisions: `docs/adr/` (0001–0003; 0004 temporal model pending the #46 run)
- Autonomous build specs: `docs/goals/`
- Retention backlog: `docs/retention-engagement-features.md`
- Blocked-on-Abhay register: `docs/comms-go-live-handoff.md`
- Cross-session facts/feedback: `MEMORY.md` + `memory/`
- The governance rule: `.claude/rules/documentation-management.md`
