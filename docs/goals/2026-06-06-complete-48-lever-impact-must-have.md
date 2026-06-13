# GOAL — Complete the MUST-HAVE remainder of #48 (lever-impact ranking engine, objective 2)

**Type:** Autonomous **build** contract (run via `/goal`). Execute end-to-end with **zero user
input**. Every design decision is pre-made below — do not pause to ask; make the call the contract
specifies and keep going until the Definition of Done is fully met.

**Owner:** Abhay · **Created:** 2026-06-06 · **Scope:** `src/` (the planner SPA) ONLY — never
`server/`, `.claude/`, `docs/` (except the run's own DEFERRED file), or `D:\Abhay\VibeCoding\5Wealths\`.
**Invocation:** `/goal docs/goals/2026-06-06-complete-48-lever-impact-must-have.md`

---

## 0. Mission

Finish the **must-have** remainder of GitHub issue **#48** so objective 2 ("help the urban-salaried
accumulator get there faster") genuinely works: the user must be able to see, on the FIRE dashboard,
a **ranked list of the biggest *achievable* wins** that move their FIRE date — each stated as
"do X → FIRE ~N years sooner", honesty-banded for the variance-bearing one. The **pure ranking
engine + 2 levers already exist** (`src/lib/lever-impact.ts`, `src/lib/lever-catalog.ts` — trim +
risk-notch). This run adds the **remaining must-have increments only**: (1) the **80CCD(1B) headroom**
lever, (2) a user-parameterised **"save ₹X more/month"** sensitivity, (3) **per-lever confidence
bands** for the variance-bearing lever, (4) the **impure composable** wiring `derive()` → the engine
(with the net-of-existing-contributions double-count guard), and (5) the **`AccelerationCard.vue`**
surface on the FIRE dashboard. This is a **build that completes a partially-built feature** — the
non-negotiable outcome is a working, FinTech-validated, dashboard-visible ranked lever card whose
baseline years-to-FIRE is coherent with the existing FireHero headline (the #20/#47 real-frame
invariant). **Explicitly OUT of scope** (do NOT build — see §6 Guardrails): regime arbitrage,
prepay-vs-invest, per-lever drill-down, employer-NPS ask, tax-page FIRE annotations, the celebrate
phase.

---

## 0.1 WORKTREE ISOLATION — run in a DEDICATED worktree (paste FIRST, before §0.2)

> **First action of the run, before §0.2 and any stage. Non-negotiable.** This run MUST execute in a
> **dedicated git worktree on its own branch**, never the user's primary interactive checkout — the
> user is continuing an interactive session on `feat/lever-impact-engine` in the primary worktree, so
> claiming that branch here would collide (the exact 2026-06-06 incident; memory
> `project_goal_run_worktree_collision`).
>
> 1. **Isolate:** `root=$(git rev-parse --show-toplevel)`. If `root` is the user's primary checkout
>    (`…/firekaro-planner`) rather than an already-dedicated `…/firekaro-goal-*` worktree, create and
>    switch to a dedicated worktree on a **NEW child branch based off the current
>    `feat/lever-impact-engine` tip** (which holds the prior #48 work):
>    `git worktree add ../firekaro-goal-lever48 -b feat/lever-48-must-have feat/lever-impact-engine`
>    and run **every** stage and command from `../firekaro-goal-lever48`. Do NOT check out
>    `feat/lever-impact-engine` directly (it is live in the primary worktree).
>    - If the child branch already exists from a prior run of this contract, reuse its worktree (do
>      not recreate) — the §0.2 preflight makes re-runs idempotent.
> 2. **Claim it:** export `GOAL_RUN_TOKEN=lever48-<short-nonce>` and write the lock:
>    `printf '%s\n' "$GOAL_RUN_TOKEN" > "$(git rev-parse --show-toplevel)/.goal-active.lock"`.
>    The repo `.githooks/pre-commit` hard-blocks any commit whose token ≠ this lock.
> 3. **Release on exit:** the run's FINAL action (after the last commit, OR on any halt/defer) MUST
>    `rm -f "$(git rev-parse --show-toplevel)/.goal-active.lock"`. `.goal-active.lock` is gitignored.
>    If `git worktree` is genuinely unavailable, note it and proceed — but STILL never run in the
>    user's primary checkout while it is on `feat/lever-impact-engine`.

---

## 0.2 PREFLIGHT — read state FIRST (idempotency · NO duplication)

> **First numbered action of the run, after §0.1, before any stage. Non-negotiable.** A parallel
> session may already have implemented part of this contract. This contract must be **safe to run at
> any time without redoing finished work.**
>
> 1. **Read the source-of-truth state:** `docs/PROJECT-LOG.md` §2 (the #48 progress narrative) +
>    GitHub issue #48 body (`gh issue view 48`) + `git log --oneline -20` on `feat/lever-impact-engine`.
> 2. **For every item in this contract, check the actual code before building it.** Grep/read to
>    confirm — do NOT trust the log blindly:
>    - `src/lib/lever-impact.ts` (engine) + `src/lib/lever-catalog.ts` (trim + risk-notch) — these
>      are **DONE**. Verify-only; do NOT rebuild. Build only on top of them.
>    - `grep -n "80CCD\|saveMore\|save-more" src/lib/lever-catalog.ts` — if the 80CCD lever / save-more
>      factory already exist, SKIP that stage (verify-only).
>    - `ls src/lib/lever-bands.ts src/composables/useAcceleration.ts src/components/dashboard/AccelerationCard.vue`
>      — if any exists, that stage is partially/fully done → build only the missing delta, never duplicate.
> 3. **Record every skip** in the final report's "skipped (already covered)" list.

---

## 1. Context you need (read first)

| Thing | Path / import | Why it matters |
|---|---|---|
| Ranking engine (DONE) | `src/lib/lever-impact.ts` — `FireBaseline`, `Lever`, `LeverImpact`, `computeLeverImpact`, `rankLeverImpacts`, `yearsToFire`, `reachesFire` | The pure core you build on. A `Lever` = `{key,label,note?,apply:(b)=>FireBaseline}`. `FireBaseline = {currentCorpus,targetCorpus,monthlySavings,expectedReturn(REAL)}`. Do NOT modify its contract; ADD to it only if a band field is needed. |
| Lever catalog (DONE: trim + risk-notch) | `src/lib/lever-catalog.ts` — `AccelerationContext`, `buildAccelerationLevers(ctx)` | Where the 80CCD lever attaches. Note the explicit anti-double-count comment (no invest-surplus lever) and the risk-notch HONESTY CAVEAT that says confidence bands are the follow-on — this run delivers them. |
| The ONE FIRE kernel | `src/lib/fire-math.ts` — `calculateYearsToTarget` | The engine already reuses it — frame-coherent with the headline. Do NOT duplicate FIRE math. |
| Monte-Carlo bands (obj-1) | `src/lib/monte-carlo.ts` — `MAX_PROJECTION_YEARS`, the MC simulate/percentile API | Source of the obj-1 confidence bands. Reuse it for the variance-bearing lever band (real-frame). Read its exports before wiring. |
| Tax deductions | `src/lib/tax-deductions.ts` (80C/80D/80CCD caps) + `src/lib/tax.ts` (slabs, marginal rate) | 80CCD(1B) cap = ₹50k. Need the household's CURRENT 80CCD(1B) usage + the marginal tax rate to compute the headroom + tax-saved. |
| Pinia-aware derive wrapper | `src/lib/useFireDerive.ts` — `useFireDerive()` exposes `fire.totalCorpus`, `fire.fireNumber`, `fire.annualExpensesToday`, `fire.effectiveSWR`, `fire.blendedReturn`, `fire.yearsToRegular`, `fire.savingsRate`, `fire.monthlyTakeHome`, `householdTaxRecommendation`, `fyTax`, lensed* getters | The composable's data source. Confirm the EXACT field for: bridge-adjusted withdrawable corpus (headline base — NOT raw `totalCorpus` if the bridge moves it), the REAL expected return, monthly contribution, current equity %, and 80CCD(1B) usage. Read it fully before mapping. |
| The kernel itself | `src/lib/derive.ts` | The single FIRE-math function. The headline `currentCorpus`/`targetCorpus`/years it produces are the truth the card MUST match (#20/#47 real-frame). |
| Seed-spec precedent | `src/lib/useFireDerive.seed.spec.ts` | The pattern for testing an impure composable through the real stores — copy it for `useAcceleration.spec.ts`. |
| Dashboard host | `src/pages/fire-goals/Dashboard.vue` | Mount the card here, **between `<BridgeBreakdownCard />` and `<NudgeStack />`** (number → honesty → how-to-get-faster → nudges). Reuse `SectionCard`/existing dashboard card chrome + `formatINRCompact`/`formatPercent`. |
| Card design language | `src/components/dashboard/FireHero.vue`, `BridgeBreakdownCard.vue`, `FireMilestonesCard.vue` | The look/structure the new card must conform to (SCREEN-STANDARD). Reuse Vuetify defaults (`vuetify-conventions.md`); do NOT re-style. |
| What-If (read, don't touch) | `src/pages/fire-goals/WhatIf.vue` | The sandbox with 12 sliders. The card is the *opinionated ranked* view; do NOT move/merge What-If. |

**Gotchas:**
- **Real frame (#20/#47 invariant):** every years-to-FIRE and band MUST be in the SAME real-terms
  frame as the headline. `FireBaseline.expectedReturn` is REAL. Never reintroduce nominal/real
  divergence. The card's *baseline* years MUST equal `fire.yearsToRegular` (±rounding) — that is the
  Rule 26 coherence check.
- **Double-count guard (bug-#11 / D-2026-06-06-11):** `derive()` already sets
  `annualSavings = income − tax − expenses` AS the monthly contribution — the surplus is ALREADY
  invested. So: (a) there is deliberately NO "invest your surplus" lever; (b) the **80CCD(1B) lever's
  acceleration = the marginal TAX SAVED on filling the headroom, redirected to investing — NOT the
  full ₹50k** (the ₹50k itself, if from existing surplus, is already invested); (c) the composable
  MUST assert the net-of-existing-contributions surplus contract in its spec.
- Port **5175**, demo localStorage adapter by default. Seed via "Try the sample" then switch to the
  **Mauryas** persona (the full-spread verification fixture) before Rule 24/26.
- This is **read-only on the user's data** — the card computes from `derive()` and the only interactive
  input is an ephemeral "save ₹X more/mo" stepper (component state, **NOT persisted**). ⇒ **Rule 25
  has no write path to verify** (state it explicitly; do not fabricate a persistence check).

---

## 2. STAGE A — lib: 80CCD(1B) headroom lever + save-more sensitivity factory (pure, TDD)

**File(s):** `src/lib/lever-catalog.ts` (edit) + `src/lib/lever-catalog.spec.ts` (extend, red-first).
**Keep untouched:** `src/lib/lever-impact.ts`'s public contract (extend types only if Stage B needs it).

### Pre-made design decisions (do NOT deviate)
1. **80CCD(1B) lever** attaches in `buildAccelerationLevers(ctx)`. Extend `AccelerationContext` with
   exactly what's needed and nothing more: `currentNps80ccd1bUsed` (₹/yr already claimed under the
   ₹50k 80CCD(1B) sub-limit), `marginalTaxRate` (0..1, the household's top slab rate incl. cess).
2. **Headroom** = `max(0, 50000 − currentNps80ccd1bUsed)`. If headroom ≤ 0 → **omit** the lever
   (locked; no fake impact), same convention as trim/risk-notch.
3. **Acceleration model (the honest, non-double-counting one — D-2026-06-06-11):** the lever's value =
   the **annual marginal tax saved** = `headroom × marginalTaxRate`, treated as **new investable
   cashflow** → `monthlySavings + taxSaved/12`. Do NOT add the ₹50k itself to savings (it is already
   in the surplus). `targetCorpus` unchanged. `note` states the bound transparently, e.g.
   "Fill your ₹X 80CCD(1B) NPS headroom → save ₹Y/yr tax, redirected to investing". Use
   `formatINRCompact`.
4. **Save-more sensitivity** is NOT a fixed catalog entry (its magnitude is user-set). Export a pure
   factory `makeSaveMoreLever(extraMonthly: number): Lever` (key `"save-more"`) whose `apply` adds
   `extraMonthly` to `monthlySavings`, target unchanged, with a `note` like "Invest ₹X more every
   month". Guard `extraMonthly ≤ 0` (return a no-op lever or let the caller omit — pick omit-at-caller;
   the factory assumes a positive amount).
5. Both 80CCD and save-more are **near-deterministic cashflow levers ⇒ point estimates** (no band).
   Only risk-notch (Stage B) carries a band.
6. Keep the module **pure** (`.claude/rules/calculation-modules.md`) — no store/DOM. Round monetary
   outputs with `Math.round`.

### Stage A acceptance
- Red-first specs added and passing: 80CCD lever present iff headroom > 0; impact uses tax-saved-only
  (a test pins that the ₹50k itself is NOT added to savings — the double-count guard); `makeSaveMoreLever`
  perturbs only `monthlySavings`; both produce a positive years-saved on a reachable Mauryas-like baseline.
- **FinTech Domain Analyst** validates the 80CCD tax-saved model + double-count guard against Indian
  tax law BEFORE Stage A's commit (financial math, rules 29/31). Block on any HIGH finding.
- **Stage gate sweep:** static (§4) green. Rule 24/25 N/A (pure lib) — note "skipped: no UI change".
  Rule 26 N/A at lib level (fires at Stage D).

---

## 3. STAGE B — lib: per-lever confidence band for the variance-bearing lever (MC, real-frame, TDD)

**File(s):** `src/lib/lever-bands.ts` (create) + `src/lib/lever-bands.spec.ts` (create, red-first).
Optionally extend `LeverImpact` in `lever-impact.ts` with an OPTIONAL `band?: {p10Years; p90Years}`
field (additive, non-breaking) — do this ONLY if cleaner than a sidecar; default to a sidecar module.

### Pre-made design decisions (do NOT deviate)
1. **Only the variance-bearing lever gets a band.** Trim / 80CCD / save-more are point estimates
   (cashflow, near-deterministic). The **risk-notch** lever raises expected return ⇒ it must show a
   **range of FIRE dates**, not a free-lunch point (closes the HONESTY CAVEAT already written in
   `lever-catalog.ts`).
2. **Reuse `monte-carlo.ts`** — do NOT invent a parallel band method. Compute the band by running the
   obj-1 MC on the **perturbed** baseline (the risk-notch's higher return + its higher volatility) and
   reporting the FIRE-date percentile spread (e.g. p10/p90 years) in the **real frame** (#20). Read
   `monte-carlo.ts` for the exact simulate/percentile entry points and the `reached`/`MAX_PROJECTION_YEARS`
   convention; mirror `reachesFire`.
3. **Volatility input:** the risk-notch increases equity → both expected return AND variance rise. The
   band MUST reflect the higher variance (a wider, possibly worse-left-tail range), not just shift the
   mean — that is the entire honesty point. Source the per-allocation volatility from wherever obj-1's
   MC already gets it (read `monte-carlo.ts` + `useFireDerive`/`derive`); do NOT hard-code a guess —
   if no per-allocation vol exists, surface it as an **Assumption:** in the band note and use the
   MC's existing vol model, and flag it for FinTech.
4. Keep pure. The band is "expected ~N yrs sooner (range A–B yrs)".

### Stage B acceptance
- Red-first specs: the risk-notch band is wider than a zero-vol point; p10 ≤ expected ≤ p90; band is
  in real years; an unreachable perturbed path yields no band (not a fake one).
- **FinTech Domain Analyst** validates the band is genuinely honesty-bearing (reflects added variance,
  real-frame, no optimistic skew) BEFORE commit. Block on HIGH.
- **Stage gate sweep:** static green; Rule 24/25 N/A (lib); 26 at Stage D.

---

## 4. STAGE C — composable: `useAcceleration.ts` (impure derive→engine wiring, double-count assertion)

**File(s):** `src/composables/useAcceleration.ts` (create) + `src/composables/useAcceleration.spec.ts`
(create, red-first via real-store mount — copy `src/lib/useFireDerive.seed.spec.ts`).
**Keep untouched:** `useFireDerive.ts` (read it; do not modify its contract).

### Pre-made design decisions (do NOT deviate)
1. `useAcceleration()` reads the stores via `useFireDerive()` and assembles: the `FireBaseline`
   (bridge-adjusted withdrawable `currentCorpus` — the SAME base the headline uses, NOT raw
   `totalCorpus` if the bridge moves it; real `targetCorpus`; monthly contribution; REAL
   `expectedReturn`) and the `AccelerationContext` (monthlyExpenses, realisticExpenseTrimPct,
   swr=`effectiveSWR`, currentEquityPct, maxEquityPct, realReturnPerEquityPoint, `currentNps80ccd1bUsed`,
   `marginalTaxRate`). Resolve each field's exact source by READING `useFireDerive`/`derive`/`tax*`;
   surface any genuinely-unavailable field as an **Assumption:** with a sane default, never a fabricated value.
2. **Realistic trim %** default = the value already used by the trim lever's existing tests/catalog
   (read it — likely 0.10). Do NOT introduce a new magic number; reuse the catalog's convention.
3. Expose: `rankedLevers` (computed = `rankLeverImpacts(baseline, buildAccelerationLevers(ctx))`
   with bands attached for risk-notch), and `saveMoreImpact(extraMonthly)` (computes
   `computeLeverImpact(baseline, makeSaveMoreLever(extraMonthly))` on demand for the card's stepper).
4. **Net-of-existing-contributions guard (MANDATORY assertion):** the spec MUST prove that levers do
   NOT double-count the already-invested surplus — concretely, assert that with `extraMonthly=0` the
   save-more impact is ~0 years (no phantom acceleration), and that the 80CCD lever's added savings
   equals tax-saved/12 (not ₹50k/12). This is the bug-#11 lock at the composable layer.
5. **Baseline coherence:** the spec MUST assert `yearsToFire(baseline) ≈ fire.yearsToRegular` (±1)
   for a seeded persona — the composable's baseline is the SAME number the headline shows.
6. Keep computation in the pure libs; the composable only wires stores → pure inputs → pure outputs
   (the calculation-modules + pinia-store separation).

### Stage C acceptance
- Red-first specs pass incl. the double-count assertion and the baseline-coherence assertion.
- **FinTech Domain Analyst** + **code-reviewer** (rule 29 independent pass) before commit.
- **Stage gate sweep:** static green; Rule 24 N/A (no rendered change yet); 25 N/A; 26 deferred to D.

---

## 5. STAGE D — UI: `AccelerationCard.vue` on the FIRE dashboard (Rule 24 + 26 + a11y)

**File(s):** `src/components/dashboard/AccelerationCard.vue` (create) + mount in
`src/pages/fire-goals/Dashboard.vue` (edit: import + place `<AccelerationCard />` between
`<BridgeBreakdownCard />` and `<NudgeStack />`). **Keep untouched:** every other dashboard card.

### Pre-made design decisions (do NOT deviate)
1. **Title/intent:** "Your biggest achievable wins" (or equivalent) — an opinionated, RANKED list of
   the accelerators for THIS household, biggest-years-saved first. Decision-support framing, never
   product advice ("here's what *you* could do", not "buy X").
2. **Per lever row:** the label, the transparent **bound `note`** (so rank #1 reads as "biggest
   *achievable* win", not a hidden assumption), and the impact: **"≈ N years sooner"**. For the
   **risk-notch** row ALSO show the **confidence range** ("expected ~N yrs sooner · range A–B yrs")
   AND its risk caveat from the lever `note` — never a bare point for the variance lever.
3. **Save-more control:** an inline **stepper/slider** ("Invest ₹___ more/month") bound to ephemeral
   component state; on change, call `saveMoreImpact(extraMonthly)` and show its live "≈ N years
   sooner". Sensible default step (e.g. ₹5k) + a sane max (e.g. the household's monthly surplus or a
   fixed ceiling). **Not persisted** — pure what-if.
4. **Empty/edge states (three-state render):** if NO lever is reachable (e.g. a household already at
   FIRE, or an unreachable baseline), show an honest empty/′already-on-track′ state — never a fake
   "act now". Guard every division (`isFinite`, `> 0`) per `defensive-coding.md`. Unreachable levers
   are omitted (engine already sorts/handles), not shown with NaN.
5. **Design system:** reuse the existing dashboard card chrome (match `BridgeBreakdownCard`/`FireHero`),
   Vuetify global defaults (`vuetify-conventions.md`), `formatINRCompact`/`formatPercent`. No bespoke
   styling, no new deps. Add `data-testid="acceleration-card"` + per-row testids.
6. **Self-hide** only when there is genuinely nothing to show (no reachable lever AND no surplus to
   save) — otherwise always render (it's the obj-2 flagship surface).

### Stage D acceptance (run the §6 gate sweep before committing)
- The card renders on the FIRE dashboard with the Mauryas persona: ranked levers visible, the
  risk-notch row shows a RANGE, the save-more stepper recomputes live, copy is decision-support not advice.
- **Rule 24 (MANDATORY):** Playwright MCP on the dashboard route (confirm the route in
  `src/router/index.ts` — `Dashboard.vue`): navigate → screenshot → ARIA snapshot → console. ALL three:
  card + ranked rows + range visible in screenshot AND ARIA; zero NEW console errors. Read the PNG.
  Iterate ≤3 → `/fix-loop`.
- **Rule 26 (MANDATORY, cross-page coherence):** assert the card's **baseline years-to-FIRE equals the
  FireHero headline** years (±1 rounding) on the same persona/default lens (family-view OFF) — the
  #20/#47 real-frame coherence check. Also confirm a lever's "N years sooner" is internally consistent
  (perturbed = baseline − N). 3 reconcile cycles → `/systematic-debugging` on divergence.
- **Rule 25:** N/A — no write path (the stepper is ephemeral). Commit msg: "rule 25 skipped: no write-path change".
- **a11y:** `/a11y-audit` on the dashboard → zero Critical+Serious WCAG 2.1 AA (or DEFERRED w/ reason).

---

## 6. Verification gates (standing rules — operative for this run)

> **All 26 rules in `.claude/rules/claude-behavior.md` are operative.** **Rules 24, 25, 26 are
> MANDATORY gates at every task AND every stage boundary** (Abhay mandate). Do not skip, soften, or
> defer the 24/25/26 sweep. They are why this contract yields *proven-working*, not *claimed-working*,
> output. Financial-math stages additionally require **FinTech Domain Analyst** validation of the
> END-TO-END plausibility (rule 31), and every builder stage requires an **independent code-reviewer**
> pass (rule 29) before its commit.

**Static gates (CWD = the dedicated worktree `../firekaro-goal-lever48`, repo root of that worktree):**
`npm run type-check && npm run test:unit && npm run build` — all green before any stage commit
(type-check banner says `firekaro-mvp`; watch the bundle budget on build). There is **no root ESLint**
(frontend has none — server-only); do not invent a lint step for `src/`.

**Rule 24 — UI screenshot verification (Stage D):** self-heal the dev server once (`npm run dev`,
capture PID) if down; drive Playwright MCP (navigate → screenshot → ARIA snapshot → console) against
the dashboard route after seeding the Mauryas persona; ALL three signals pass; read the PNG; ≤3
iterations → `/fix-loop` → `/systematic-debugging`. Graceful degradation → "UI verification skipped
because <reason>" + `completed (deferred — Rule 24)`, never claim complete.

**Rule 25 — persistence:** **N/A for this contract** (no create/update/delete; the save-more stepper
is ephemeral component state). State this explicitly in each stage; do not fabricate a persistence check.

**Rule 26 — post-phase independent + cross-page sweep (ALWAYS fires):** at Stage D, independently
verify the card's substance against the headline (baseline-years coherence, real-frame) on the default
lens; name the consumer (FireHero) explicitly; 3 reconcile cycles → `/systematic-debugging`; unresolved
→ DEFERRED with `Rule 26 stage drift`, never silently green.

**Rule 15 / 17 / 20 / 23:** failures → the skills (no ad-hoc retrying ≥3×); root cause not band-aid;
no synthetic/fake data (surface uncertainty as **Assumption:**); keep going through the full DoD — a
comfortable "all-green-so-far" is not done while must-have increments remain.

**Failure-recovery budget:** per-task ≈15 attempts (≈5 inline → `/fix-loop` → `/systematic-debugging`)
→ then DEFER the task + continue, do not halt. MCP hang: 3-cycle recovery (wait+retry → close+renavigate
→ kill+restart dev server) → DEFER + continue. **Hard halt ONLY:** `npm install` failure; a decision
contradiction inside this contract; an irrecoverable build break after the full budget; OS permission
denial; missing required token. Context-budget anxiety is NOT a halt — hand off via a one-line
continuation note, never fake-complete (`feedback_dont_defer_on_context_judgment.md`).

---

## 7. Commit + push (HANDOFF: commit on the child branch, do NOT push, do NOT merge)

- **Branch:** `feat/lever-48-must-have` (in the dedicated worktree `../firekaro-goal-lever48`,
  based off `feat/lever-impact-engine`). **Abhay merges it into `feat/lever-impact-engine` himself
  after review** — that is why this run does NOT push and does NOT merge (his explicit choice this session).
- **Commits:** one **per stage** (A, B, C, D) — atomic, [Conventional Commits], scope `feat(levers)`
  for A/B, `feat(fire)`/`feat(levers)` for C, `feat(fire)`/`feat(dashboard)` for D. End each message
  with the Co-Authored-By trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Stage ONLY the files each stage touched** — never `git add -A`. Leave the untracked
  `scripts/prod-cdp-sweep.mjs` (and any other pre-existing untracked item) alone.
- **Do NOT push. Do NOT merge to `feat/lever-impact-engine` or `main`.** Final state = N commits on
  `feat/lever-48-must-have`, present in the worktree, unpushed. Print the branch + SHAs for Abhay.
- Never `--no-verify` (the secret-scan + token-lock pre-commit hook must run).

---

## 8. Definition of Done (all MUST be true)

**Build / change:**
- [ ] 80CCD(1B) headroom lever in `lever-catalog.ts` (tax-saved-only model, omitted when no headroom).
- [ ] `makeSaveMoreLever(extraMonthly)` factory (pure, guarded).
- [ ] `lever-bands.ts` — MC-based real-frame confidence band for the risk-notch (variance-bearing) lever.
- [ ] `useAcceleration.ts` composable: derive→FireBaseline+AccelerationContext, `rankedLevers` +
      `saveMoreImpact`, with the double-count assertion AND baseline-coherence assertion in its spec.
- [ ] `AccelerationCard.vue` on the FIRE dashboard (ranked rows + bound notes + risk-notch range +
      live save-more stepper + honest empty state), placed between Bridge and NudgeStack.

**Static gates:**
- [ ] type-check 0 errors · unit tests no regression (existing 858+ green + the new specs) · build succeeds.

**Financial-math validation:**
- [ ] FinTech Domain Analyst validated the 80CCD model, the double-count guard, and the risk-notch
      band's honesty (real-frame, reflects variance) — zero unaddressed HIGH findings.

**Rule 24 (dashboard screen):**
- [ ] screenshot + ARIA + console pass; PNG read + confirmed; zero NEW console errors.

**Rule 25:** N/A — no write path (documented, not skipped silently).

**Rule 26 (cross-page coherence):**
- [ ] card baseline years-to-FIRE == FireHero headline years (±1) on the default lens; lever
      perturbed = baseline − stated-saving.

**a11y:**
- [ ] zero Critical+Serious WCAG 2.1 AA on the dashboard (or DEFERRED w/ reason).

**Independent review:**
- [ ] code-reviewer (rule 29) pass on the diff — zero unaddressed blocker/HIGH.

**Ship:**
- [ ] 4 conventional commits on `feat/lever-48-must-have` (NOT pushed, NOT merged).
- [ ] Any deferrals logged in `docs/goals/.run/2026-06-06-complete-48-lever-impact-must-have-DEFERRED.md`
      with rule status + reason.
- [ ] `.goal-active.lock` removed.

---

## 9. Final report (required on completion)

Produce a closing report with: the worktree path + branch + per-stage commit SHAs; per-stage static
gate results; FinTech validation verdict (per stage that touched math); Rule 24 verdict + PNG path(s);
Rule 26 coherence result (card-vs-headline years); a11y summary; code-reviewer verdict; the
"skipped (already covered)" list from the §0.2 preflight; DoD green/amber/red tally; any DEFERRED
entries with rule status + reason; and the exact `git merge` command Abhay can run to integrate
`feat/lever-48-must-have` into `feat/lever-impact-engine`.

---

## 10. Guardrails (hard stops)

- **`src/` only.** Never `server/`, `.claude/`, `docs/` (except the run's own DEFERRED file),
  `demo/` (n/a here), or `D:\Abhay\VibeCoding\5Wealths\`.
- **OUT of scope — do NOT build:** regime arbitrage (good-to-have, blocked on a
  `household.preferredTaxRegime` + `derive()` change), prepay-vs-invest, per-lever sensitivity
  drill-down, employer-NPS ask, tax-page FIRE-impact annotations, the celebrate phase (it's
  stickiness, deferred behind the must-have core). If tempted, STOP — it is a different issue/tier.
- **No new dependencies.** Reuse existing libs + Vuetify + the design system.
- **No design reinvention** — reuse the named dashboard cards/components; extend over inline.
- **Honesty (rule 20/31):** no synthetic/fake data; no optimistic skew; an absurd lever number
  (e.g. "−40 years") is a STOP-and-root-cause, not a ship. Surface uncertainty as **Assumption:**.
- **Stop only on a true blocker** (§6 hard-halt list). Context-budget anxiety is NOT a blocker —
  hand off via a one-line continuation note, never fake-complete.
- **Strategic items are `TODO(5W):` notes**, not handled here.

---

## Authorization trail

| # | Decision | Choice |
|---|---|---|
| 1 | Scope | Complete the **must-have** remainder of #48 only; defer regime/prepay/drill-down/employer-NPS/tax-annotations/celebrate. |
| 2 | Card home | New **`AccelerationCard.vue` on the FIRE dashboard** (`Dashboard.vue`), between Bridge and NudgeStack (Abhay, 2026-06-06). |
| 3 | Handoff | **Commit on the branch, do NOT push, do NOT merge** — Abhay merges into `feat/lever-impact-engine` after review (Abhay, 2026-06-06). |
| 4 | Branch/worktree | Dedicated worktree `../firekaro-goal-lever48` on child branch `feat/lever-48-must-have` off `feat/lever-impact-engine` — collision-safe (the user keeps the primary worktree on `feat/lever-impact-engine`; 2026-06-06 worktree-collision lesson). |
| 5 | 80CCD(1B) model | Acceleration = **marginal tax saved on the headroom, redirected to investing** — NOT the full ₹50k (double-count guard, D-2026-06-06-11). FinTech-validated in-run. |
| 6 | Confidence bands | **Variance-bearing lever (risk-notch) only**, via `monte-carlo.ts`, real-frame; cashflow levers (trim/80CCD/save-more) stay point estimates. |
| 7 | Save-more | A **user-parameterised ephemeral sensitivity** (stepper in the card), not a fixed catalog lever; not persisted ⇒ Rule 25 N/A. |

---

## References (loaded transitively by the skills this contract invokes)

- `.claude/rules/claude-behavior.md` — rules 15, 17, 20, 23, 24, 25, 26, 29, 31
- `.claude/rules/calculation-modules.md` — pure-lib conventions + colocated specs
- `.claude/rules/tdd-rule.md` — red-green-refactor (Stages A/B/C are TDD)
- `.claude/rules/goal-anchored-decisions.md` — anchor every call to the accumulator persona + obj 2
- `.claude/rules/output-plausibility-verification.md` — the semantic-sanity / headline-plausibility gate
- `.claude/rules/financial-year-handling.md` + `.claude/rules/indian-financial-context.md` — 80CCD(1B) cap, marginal rate
- `.claude/rules/vue-component-conventions.md` + `.claude/rules/vuetify-conventions.md` + `.claude/rules/defensive-coding.md` — the card
- `.claude/rules/pinia-store-conventions.md` — the composable's store access
- `src/lib/lever-impact.ts`, `src/lib/lever-catalog.ts`, `src/lib/monte-carlo.ts`, `src/lib/useFireDerive.ts`, `src/lib/useFireDerive.seed.spec.ts` — the code surface
- GitHub issue **#48** + `docs/PROJECT-LOG.md` §2 + decisions D-2026-06-06-08/09/11 — the scope source of truth
- Skills the run may drive: `/fix-loop`, `/systematic-debugging`, `/a11y-audit`; agents: `fintech-domain-analyst`, `code-reviewer-agent`

---

## ✅ COMPLETION RECORD — run finished 2026-06-06

**Status: COMPLETE. Definition of Done — all green.** Built in the dedicated worktree
`../firekaro-goal-lever48` on branch `feat/lever-48-must-have` (off `feat/lever-impact-engine` @ `d35151c`).
**4 commits, NOT pushed, NOT merged** (Authorization #3 — Abhay merges after review).

### Commits (per stage)
| Stage | SHA | Summary |
|---|---|---|
| A | `e174715` | 80CCD(1B) headroom lever (tax-saved-only, OLD-regime-gated) + `makeSaveMoreLever` factory |
| B | `6c71b6f` | `lever-bands.ts` — MC confidence band for the variance-bearing risk-notch (real-frame) |
| C | `5c442ce` | `useAcceleration` composable (derive→engine wiring) + canonical `derive.returnWeights` exposure |
| D | `e67abdf` | `AccelerationCard.vue` mounted on the FIRE dashboard (Bridge → NudgeStack) |

### Gates
- **Static:** type-check 0 errors · **892 unit tests pass** (62 files, +49 new) · build succeeds.
- **FinTech Domain Analyst** (financial math): validated each math stage; **2 HIGHs found and fixed**
  — (A) 80CCD is OLD-regime-only → regime gate added; (C) equity-risk basis → use canonical
  whole-household `returnWeights` + equity+intl+reit + defensive-sleeve σ funding. **0 unaddressed HIGH.**
- **code-reviewer** (rule 29): APPROVE on every builder stage; all MEDIUMs resolved.
- **Rule 24** (Playwright): card renders with substance, 0 console errors. Evidence captured.
- **Rule 26** (coherence): card "FIRE in ~25.6 yrs" == FireHero headline (25y 7m / 25.583) == engine baseline.
- **Rule 32** (interactive): save-more slider live (₹10k→10mo … ₹1.65L→9.2yrs sooner); risk-notch shows
  its honest range ("≈ 7.7 yrs later to ≈ 9.0 yrs sooner").
- **Rule 25:** N/A (no write path — ephemeral stepper).
- **Rule 33** (blind independent test verification): a context-blind agent re-judged the raw evidence and
  **CONCURRED** on all 7 requirements.

### Deferrals (`docs/goals/.run/2026-06-06-complete-48-lever-impact-must-have-DEFERRED.md`)
1. **a11y color-contrast** — pre-existing design-system-wide `text-success` token debt; the card adds
   ZERO new structural/aria violations. DEFERRED for a system-wide token pass (UI/UX role).
2. **ESOP→`other` bucket** (pre-existing, out-of-scope) — mildly under-states equity exposure
   (conservative). Note on gh-issue #48.

### Skipped (already covered — §0.2 preflight)
- `lever-impact.ts` engine + trim/risk-notch catalog levers were already DONE — built on, not rebuilt.

### Integrate (Abhay, per Authorization #3)
```bash
git checkout feat/lever-impact-engine
git merge --no-ff feat/lever-48-must-have
# optional: git worktree remove ../firekaro-goal-lever48
```

**Product note:** the 80CCD lever is regime-conditional — it correctly OMITS for NEW-regime households
(the persona majority, incl. the Sharmas seed) and surfaces only for OLD-regime filers with unused ₹50k
headroom. That is the honest behavior, not a bug.
