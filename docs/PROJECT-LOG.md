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

**✅ The full-lifecycle QA verification & hardening cycle is now DONE (2026-06-08, D-08-01/02):** Phase A
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

### 2026-06-08
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
