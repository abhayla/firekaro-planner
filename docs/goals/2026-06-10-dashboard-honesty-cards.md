# GOAL — Dashboard honesty cards: real/nominal toggle (#139) + layoff runway (#140) + plan-vs-actual variance (#138)

**Type:** Autonomous **build** contract (run via `/goal`). Execute end-to-end with **zero user input**.
Every design decision is pre-made below (resolved by an independent Systems-Architect + FinTech-Domain-Analyst
review, Abhay-approved 2026-06-10) — do not pause to ask; make the call the contract specifies and keep going
until the Definition of Done is fully met.

**Owner:** Abhay · **Created:** 2026-06-10 · **Scope:** `src/` + `server/` + `e2e/` + `docs/adr/` ONLY
**Invocation:** `/goal docs/goals/2026-06-10-dashboard-honesty-cards.md`

---

## 0. Mission

Ship three dashboard features that deepen FireKaro's **honesty** (Tier-0) and **stickiness** for the urban
salaried accumulator, in build order **#139 → #140 → #138** (cleanest first, heaviest last):

- **#139 — Real (today's-₹) vs Nominal toggle** on the FIRE projection chart. Pure display-layer deflation; no
  kernel change.
- **#140 — Job-loss / layoff runway card.** Extract a pure `runway.ts`, post-tax-net numerator, full-obligation
  burn — an honest "months you could survive with zero income."
- **#138 — Plan-vs-actual variance card.** A new dedicated `planBaseline` entity + an honest delta that
  **decomposes** progress vs reality vs goalpost (never sells an assumption change as "progress").

"Done" = all three built, every verification gate in §7 green (or DEFERRED-with-reason), both trees static-green,
merged `--no-ff` to `main` and pushed, with an ADR for the `planBaseline` entity. The one non-negotiable outcome:
**no feature ships an optimistic/dishonest number** — each carries the substance test that proves the honest
direction.

---

## 0.1 WORKTREE ISOLATION (first action, before anything)

> **First action of the run, before §0.2 and any stage. Non-negotiable.** Run in a **dedicated git worktree**,
> never the user's primary interactive checkout.
>
> 1. **Isolate:** `root=$(git rev-parse --show-toplevel)`. If `root` is the primary checkout (`…/firekaro-planner`)
>    rather than an already-dedicated `…/firekaro-goal-*` worktree, create + switch before any stage:
>    `git worktree add ../firekaro-goal-dashboard-honesty-cards -b feat/dashboard-honesty-cards` and run every
>    stage from there. NEVER run this multi-commit build in the primary worktree.
> 2. **Claim it:** export a unique `GOAL_RUN_TOKEN` (e.g. `feat/dashboard-honesty-cards-<nonce>`) and write the
>    lock: `printf '%s\n' "$GOAL_RUN_TOKEN" > "$(git rev-parse --show-toplevel)/.goal-active.lock"`. The repo's
>    `.githooks/pre-commit` hard-blocks any commit whose token ≠ the lock.
> 3. **Release on exit:** the run's FINAL action (after merge/push, OR on any halt/defer) removes the lock:
>    `rm -f "$(git rev-parse --show-toplevel)/.goal-active.lock"`. `.goal-active.lock` is gitignored. If
>    `git worktree` is genuinely unavailable, note it and proceed — but still NEVER run in the primary checkout.
> 4. **Self-cleanup ON SUCCESS ONLY:** after the branch is merged `--no-ff` → `main` AND pushed AND the lock is
>    released, the last shell step `cd`s to the **primary repo root** and runs:
>    `cd <primary-root> && git worktree remove --force ../firekaro-goal-dashboard-honesty-cards ; git branch -D feat/dashboard-honesty-cards ; git worktree prune`.
>    On Windows `git worktree remove` may print `Invalid argument` while still de-registering — fine; `prune`
>    finalises it. **DEFER/HALT: do NOT remove the worktree or delete the branch** (needed to resume; only the
>    lock is released).

---

## 0.2 PREFLIGHT — idempotency · NO duplication (first numbered action)

> **First action after §0.1, before ANY stage. Non-negotiable.** A parallel session may already have built part
> of this. This contract is **safe to run at any time without redoing finished work.**
>
> 1. **Ledger = the live source of truth:** GitHub issues **#139 / #140 / #138** (read their bodies for the
>    locked decisions), `git log --oneline -25` (look for `feat(fire/expenses/...)` commits matching these
>    features), and a grep of the named target files (do the symbols already exist? `deflatedProjection`,
>    `src/lib/runway.ts`, `src/lib/plan-variance.ts`, a `plan-baseline` storage key, `/api/planner/plan-baseline`).
> 2. **For every item in this contract, check ledger + code + `git log` before building.** If it already exists
>    (grep/read to confirm — don't trust a stale assumption), **SKIP the build** → verify-only pass → move on.
>    If partial, build only the missing delta. If absent, build normally.
> 3. **Record every skip** in the final report's "skipped (already covered)" list.
> 4. On completion, **comment on each GitHub issue (#139/#140/#138) with the merge SHA** and close it.

---

## 0.3 PROGRESS LOG — live, cross-session-trackable (third opening section)

> **Maintain an append-only progress log for the entire run. Update it BEFORE moving on from each stage/event.**
>
> 1. **Location:** `docs/goals/.run/dashboard-honesty-cards-PROGRESS.md` (in THIS run's worktree; `.run/` is
>    gitignored). Sibling `dashboard-honesty-cards-DEFERRED.md` in the same dir for deferrals.
> 2. **First log line:** slug · branch · worktree · start time (`date "+%Y-%m-%d %H:%M"`) · contract path ·
>    one-line mission.
> 3. **Append ≤2-line entries at:** each stage start; stage done (with gate result); every major DEFECT; every
>    "something not working" EVENT + what you did; each independent-review outcome (concur/dissent); each DEFER/skip;
>    each blocker/halt; final result.
> 4. **Entry format:** `[YYYY-MM-DD HH:MM] <STAGE|PROGRESS|DEFECT|EVENT|DECISION|RECOVERY|BLOCKER|DONE> — <≤2-line summary>`.
> 5. **At run-end:** AUTO-append each notable error→fix→lesson to `.claude/tasks/lessons.md` (with a gate-gap line,
>    after a dedup grep). PROPOSE (never auto) a **"LEARNINGS TO FOLD BACK"** section in the committed final
>    report, classified GENERIC (skill/process-rule) vs PRODUCT-SPECIFIC (product rule if a class, else this
>    contract), gate-over-prose, one home each. The run NEVER edits its own contract/skill/rules — only proposes.
> 6. **Run-end SUMMARY** in the final PROGRESS entry AND the committed report: **DONE / PENDING (= deferrals +
>    reason) / BLOCKED (Abhay-gated subset) / NEXT (single next action + owner)**.

---

## 1. Context you need (read first)

| Thing | Path / import | Why it matters |
|---|---|---|
| FIRE-math kernel | `src/lib/derive.ts` (real headline `:524-546`; nominal projection `:701-718`) | The real/nominal frame split #139 depends on; DO NOT modify for #139 |
| Projection builder | `src/lib/fire-math.ts` (`projectCorpus`, `findCrossovers`) | Emits the nominal corpus + 3 target lines #139 deflates; crossover = `corpus≥target` per-point |
| Derive wrapper | `src/lib/useFireDerive.ts` | Where `deflatedProjection` (#139) is added; exposes `totalCorpus/fireNumber/yearsToRegular/monthlyContribution/crossovers` (#138/#140 actuals) |
| Projection chart | `src/components/dashboard/FireProjectionChart.vue` (`:62-96` series, `:17-55` crossover plugin) | #139 toggle + label switch live here |
| Liquid classifier | `src/lib/investment-traits.ts` `accessibilityClass` (`:391`) | #140 liquid set = `accessibilityClass==="liquid"` — NOT `accessibleAtAge` |
| Liquidation tax | `src/lib/liquidation-tax.ts` `postTaxLiquidation` | #140 numerator = post-tax-net, NOT gross |
| Accessibility | `src/lib/accessibility.ts` (`:108-134` classes) | Reference for the liquid/epf split; EPF is its own class (excluded from day-1) |
| Snapshot infra | `src/lib/expense-history.ts` (`ExpenseSnapshot` `:23-54`) | #138 does NOT extend this (SRP) — read it to understand why a dedicated entity is used |
| Storage seam | `src/lib/storage-adapter.ts` | #138 `planBaseline` new entity key; key shape `firekaro-mvp:<userId>:<entityKey>` |
| Big store | `src/stores/household.ts` (`recordFireSnapshot` `:306`, `snapshotVersion` `:176/:320`) | Reactivity signal pattern; #138 store wiring |
| Dashboard | `src/pages/fire-goals/Dashboard.vue` (inline runway `:104-111`, snapshot `:184-193`) | Where #140 extraction starts + all 3 cards mount |
| Server planner routes | `server/src/routes/planner.ts` (document GET/PUT pattern) | #138 mirrors here for `/api/planner/plan-baseline` |
| Diff/repo | `server/src/lib/household-diff.ts` · `household-repo.ts` · `server/prisma/schema.prisma` | Confirm #138 is a document blob — **NO new Prisma table** |
| UI store toggle precedent | `src/stores/ui.ts` (`isFamilyView`) | Pattern reference only — #139 toggle is **chart-local**, NOT added here |

**Gotchas (load-bearing):**
- **#139 deflator MUST be `assumptions.values.inflation`** (general CPI ≈6%), read live from the assumptions store — **NEVER hardcode 0.06 and NEVER use the 4-bucket `householdInflation` (~7.9%)**: that re-creates the #20 "FIRE-at-115" bug. The chart's targets are already inflated at general CPI in `projectCorpus`, so deflating both series by the same `(1+inflation)^yearIndex` is internally consistent.
- **#139 do NOT re-derive a parallel projection** — deflate the SAME rounded `corpus`/`targetFor*` points `projectCorpus` emits (a second projection is the #47 divergence vector). `yearIndex` origin = the projection's year-0, identical to the kernel.
- **#139 the real crossover can legitimately read EARLIER than the headline FIRE age** when a liquidity-bridge shortfall pushes the headline later (chart = adequacy crossover; headline = adequacy + bridge). Surface this; do NOT claim "the chart now matches the headline exactly."
- **#140 expenses-only burn understates true burn** → optimistic runway (worst direction). Burn MUST include EMIs + insurance premiums (continue after layoff). Confirm the auto-flow recurring EMI/premium lines are in `monthlyBurn`.
- **#138** current `ExpenseSnapshot` stores only `fireNumber/fireTargetYear/netWorth` — insufficient; the new `planBaseline` captures `fireNumber, fireAge, yearsToFire, netWorth, monthlyContribution` AND a copy of the **assumptions in force** (required for decomposition).
- **Member lens:** the dashboard is member-attributable → the full "Viewing as" E2E sweep is mandatory (`member-landscape-verification.md`, no exceptions). #139's deflation must apply correctly under BOTH the consolidated and the lensed view.
- **Persistence modes:** main UI verification runs in **demo localStorage mode** (default). #138's `planBaseline` server endpoint gets a **dedicated server-mode sub-run** (see §5 + §7) — a check mandated in prose while the env stays demo-only would be silently deferred.
- **CWD:** run static gates in BOTH trees (root + `cd server`). `@planner` alias → `../src`.

---

## 2. STAGE A — #139 Real (today's-₹) vs Nominal toggle  [build FIRST]

**File(s):** `src/lib/useFireDerive.ts` (edit — add computed) · `src/components/dashboard/FireProjectionChart.vue`
(edit — toggle + label switch) · `src/lib/useFireDerive.deflation.spec.ts` or extend the existing seed spec
(create/edit). **Keep untouched:** `derive.ts`, `fire-math.ts` (NO kernel change).

### Pre-made design decisions (do NOT deviate)
1. Add `deflatedProjection` computed in `useFireDerive.ts`: reads a `showRealTerms` flag; when **false** returns
   `projection` byte-identical; when **true** returns each point with `corpus` and `targetForLean/Regular/Fat`
   each divided by `(1 + inf)^(p.year - year0)`, where `inf = assumptions.values.inflation` (live) and `year0` =
   the projection's first year (same origin the kernel uses). Round to integer ₹ (`Math.round`).
2. The toggle is a **chart-local `ref(false)`** inside `FireProjectionChart.vue` (a `v-btn-toggle` / chip pair
   "Today's ₹ / Future ₹") — NOT a persisted `ui`-store preference for v1. Pass its value into the chart's data
   computeds (the chart consumes `deflatedProjection` always; the flag flows from the chart's local ref via a
   prop on `useFireDerive` OR a chart-level deflation of the already-exposed `projection` — prefer exposing a
   `deflateProjection(real: boolean)` helper from `useFireDerive` so the chart owns the toggle state).
3. When the toggle is ON: the Y-axis tick formatter AND the tooltip label MUST append/show **"Today's ₹"** (or
   "Real ₹"); when OFF, "Future ₹" (or no suffix, current behaviour). A scale change with no label change is a
   Tier-0 honesty violation.
4. Crossover markers (`:17-55`) are computed from `fire.crossovers` (calendar years), NOT from projection values
   — they stay valid under deflation (same factor on both series preserves the crossover year). Do NOT recompute
   them from the deflated series.
5. Add a one-line code comment at the deflator citing the #20 fix ("general CPI, NOT householdInflation").
6. Defensive: guard `inf` (`?? DEFAULT general inflation`), `isFinite` the deflated values, three-state render
   unchanged.

### Stage A acceptance (run the §5 gate sweep before committing)
- Unit (TDD red-first): a spec asserting (a) `showRealTerms=false` ⇒ `deflatedProjection` byte-identical to
  `projection`; (b) **the regular-variant crossover YEAR is identical** in real vs nominal for a fixed household;
  (c) that crossover year **equals the headline FIRE year when the bridge is covered** (and may read earlier when
  not — assert the documented relationship, not equality unconditionally).
- Rule 24 + 32: the chart renders in both modes; toggling **flips every plotted ₹ and the axis/tooltip labels**;
  no NEW console error; on the **default lens** the real numbers are plausible (a 2045 ₹7Cr nominal reads as a
  sane ~₹2.8Cr today, not absurd).
- Member-lens: real-terms toggle behaves correctly under the lensed view too (part of the §7 sweep).

---

## 3. STAGE B — #140 Job-loss / layoff runway card  [build SECOND]

**File(s):** `src/lib/runway.ts` (create) · `src/lib/runway.spec.ts` (create) · `src/components/dashboard/RunwayCard.vue`
(create) · `src/pages/fire-goals/Dashboard.vue` (edit — call `computeRunway`, mount the card by the bridge card).
**Keep untouched:** `investment-traits.ts` `isEmergencyFundEligible` (stale-by-design; do NOT rework it here).

### Pre-made design decisions (do NOT deviate)
1. `runway.ts` is a **pure** module (no store/DOM). Signature returns:
   `{ liquidNet, liquidNetConservative, monthlyBurn, runwayMonths, runwayMonthsConservative, epfValue, runwayMonthsWithEpf, volatilePortion }`.
2. **Liquid set = `accessibilityClass(inv) === "liquid"`** from `investment-traits.ts` (Stocks, MutualFunds, FD,
   Gold, Crypto, International, REIT, vested-ESOP) — NOT `accessibleAtAge`.
3. **Numerator = POST-TAX liquidation net:** for each liquid holding compute `postTaxLiquidation(...)` from
   `liquidation-tax.ts` (NOT gross market value). `liquidNet` = Σ post-tax-net of the liquid set.
4. **`monthlyBurn` MUST include EMIs + insurance premiums** (they continue after a layoff) + baseline living
   expenses. Source from the same burn the dashboard uses (`expenses.avgMonthly` + auto-flow recurring EMI/premium
   lines) — verify the recurring EMI/premium lines are actually included; if not, add them. EPF/VPF + salary-funded
   SIP contributions are NOT burn (they stop with salary — and are not in "expenses" anyway).
5. **Conservative line:** `liquidNetConservative` = post-tax-net of **stable instruments only** (FD; exclude
   crypto + equity + ESOP) → `runwayMonthsConservative`. The card shows BOTH ("≈X months on paper, ≈Y months in
   stable assets").
6. **Volatile disclosure:** surface `volatilePortion` (crypto + equity + ESOP share of `liquidNet`) with copy:
   *"Includes market-linked assets — actual runway may be shorter if markets are down when you liquidate."* Vested
   ESOP carries an assumption note ("assumed immediately sellable; private-company ESOP may not be").
7. **EPF excluded from day-1**; show a SEPARATE secondary line "+ EPF (₹X) available ~2 months after exit"
   (`runwayMonthsWithEpf`), clearly labelled as not-day-1.
8. Card placed in `Dashboard.vue` immediately after the bridge card; three-state render; division-by-zero guards
   (`monthlyBurn > 0`).

### Stage B acceptance (run the §5 gate sweep before committing)
- Unit (TDD red-first): runway **DECREASES** when (a) EMIs/premiums are included vs expenses-only, and (b) the
  numerator is post-tax-net vs gross — proving the honest (conservative) direction. Plus: a debt-heavy fixture
  has a materially lower runway than a debt-free one; the conservative line ≤ the headline line.
- Rule 24 + 32: card renders, the volatile disclosure + conservative line + EPF line are visible; values
  plausible on the default lens.

---

## 4. STAGE C — #138 Plan-vs-actual variance card  [build LAST — new entity]

**File(s):** **create** `src/lib/plan-variance.ts` + `src/lib/plan-variance.spec.ts` · **create**
`src/components/dashboard/PlanVarianceCard.vue` · **edit** `src/lib/storage-adapter.ts` (register the new
`plan-baseline` entity key if keys are enumerated) · **edit** a store (a small `usePlanBaseline` composable OR
extend `household.ts`) for capture/hydrate/persist · **edit** `server/src/routes/planner.ts` (+ its Zod) to add
`GET`+`PUT /api/planner/plan-baseline` mirroring the household/assumptions document endpoints · **create**
`docs/adr/NNNN-plan-baseline-entity.md` · **edit** `Dashboard.vue` (mount the card + the "Lock my baseline"
action). **No new Prisma table** (document blob).

### Pre-made design decisions (do NOT deviate)
1. **Dedicated `planBaseline` entity** — a single object stored under a NEW storage-adapter key `"plan-baseline"`
   (NOT an extension of `ExpenseSnapshot` — SRP). Shape:
   `{ capturedAt, fireNumber, fireAge, yearsToFire, netWorth, monthlyContribution, annualExpenses, assumptions: <snapshot copy> }`.
2. **Capture is an explicit user action** — a "Lock this as my starting point" button (in the variance card's
   empty state + a re-lock affordance). NOT auto from the oldest snapshot. On click, capture the current derived
   values + a copy of the assumptions in force.
3. **Server endpoint:** `GET`+`PUT /api/planner/plan-baseline` mirroring the existing document endpoints
   (`apiSuccess`/`apiError` envelope, `userId` from session only, additive Zod schema). It is a JSON blob — NO
   Prisma migration, NO `household-diff` change.
4. `plan-variance.ts` is **pure**: given `(baseline: PlanBaseline, currentDerived, currentAssumptions)` returns a
   **decomposed** delta:
   - `fireDateDeltaMonths` (lead headline; inflation-invariant — from `fireAge`/`yearsToFire`).
   - `attribution: { progress, reality, goalpost }` — decompose the `fireNumber`/date change into: **progress**
     (corpus/net-worth growth, assumptions held at baseline), **reality** (annualExpenses changed), **goalpost**
     (assumptions changed — SWR/inflation/returns/variant/plan-to-age). Method: re-derive the baseline's number
     under each held-constant configuration to isolate each component (state the exact decomposition in the spec).
   - `netWorthDeltaReal` + `fireNumberDeltaReal` — **CPI-rebase** the baseline rupee figures to today
     (`×(1+inf)^Δyears`) before differencing; never a raw nominal rupee delta.
   - `assumptionsChanged: boolean` + the changed keys — flag prominently when goalpost ≠ 0.
5. **Card copy:** lead with "Your FIRE date moved **X months earlier/later** since you locked your plan", then
   the attribution breakdown ("+4 mo from corpus growth, −6 mo from higher expenses, assumptions unchanged"). When
   `assumptionsChanged`, the card MUST say so explicitly and NEVER fold an assumption-driven improvement into
   "progress."
6. **Empty/3-state:** no baseline yet → empty state with the "Lock my baseline" CTA; baseline present → the
   variance card. Defensive guards throughout.
7. **ADR** `docs/adr/NNNN-plan-baseline-entity.md` (next free number) records why a dedicated entity (not
   `ExpenseSnapshot`) — SRP, sparse-field fragility, Zod-drift risk.

### Stage C acceptance (run the §5 gate sweep before committing)
- Unit (TDD red-first): the **substance** spec — a fixture where ONLY an assumption changed (SWR 3.5%→3.0%,
  corpus + expenses identical) reports **"goalpost moved / assumptions changed", NOT "you fell behind"** (the
  attribution puts the whole delta in `goalpost`, `progress≈0`). Plus a **CPI-rebase** spec on the rupee delta
  (flat nominal net worth over 18 months reads as a real decline). Plus: pure progress (corpus up, same
  assumptions/expenses) reports `progress>0, goalpost=0`.
- API behavioral test (server-mode sub-run): `GET`+`PUT /api/planner/plan-baseline` — 200 + envelope shape +
  auth-gate (401 without session) + ownership (userId from session, not body) + round-trip of the full shape
  incl. the assumptions copy.
- Rule 25 (both modes): localStorage round-trip (demo) AND the ServerAdapter API GET (server-mode sub-run) confirm
  the baseline persisted with the assumptions copy intact.
- Rule 24 + 32: capture action works (lock → card appears); plausible attribution on the default lens.

---

## 5. Verification gates  (standing rules — adapted to this tree)

> **All rules in `.claude/rules/claude-behavior.md` are operative.** Rules **24, 25, 26, 29, 31, 32, 33 are
> MANDATORY gates at every task AND every stage boundary.** Do not skip/soften/defer the sweep. Test PLACEMENT
> follows `.claude/rules/testing-strategy.md`; test **by blast radius of the changed surface** (the conditional
> table below) — full depth in every layer the change touches.

**Static gates (BOTH trees, before any commit):** root `npm run type-check && npm run test:unit`; `cd server &&
npm run type-check && npm run lint && npm run test:unit`. Plus `npm run build` (root) succeeds. New honesty-critical
modules (`runway.ts`, `plan-variance.ts`, the #139 deflation) get a **mutation pass** (`npx stryker run` scoped to
them) — a KILLED mutant is the proof, not coverage %.

**The named rules (operative verbatim — full text in `claude-behavior.md`):**
- **Rule 24** (render): per UI screen — screenshot + ARIA + console; intended values visible in BOTH the PNG and
  ARIA; zero NEW console errors. Self-heal the dev server once; ≤3 iterations → `/fix-loop`.
- **Rule 32** (functionality): EXERCISE the controls — the #139 toggle flips every figure + labels; the #140
  card's lines render and recompute; the #138 "Lock my baseline" action captures and the card updates. Each must
  RESPOND.
- **Rule 25** (persistence): #138 write path — dual signal. **Demo mode:** localStorage round-trip via
  `browser_evaluate` reading `firekaro-mvp:<userId>:plan-baseline`. **Server-mode sub-run:** independent
  `curl -H "x-dev-bypass: true" http://localhost:3100/api/planner/plan-baseline` after the ~1.5s write debounce.
- **API behavioral test** (server-mode sub-run, #138 only): status + envelope + auth-gate + ownership/IDOR on the
  new route + the `DATABASE_URL`-gated `planner.integration.spec.ts` extended for `plan-baseline`.
- **Rule 31** (plausibility): every new user-facing value sane on the **default product lens**; add/extend a
  sane-bounds assertion in `src/lib/headline-plausibility.spec.ts` for the real-terms corpus + the runway months +
  the variance delta; `fintech-domain-analyst` validates the END-TO-END numbers, not just internals.
- **Rule 29** (independent review): after each stage is green, dispatch `code-reviewer-agent` on the diff +
  **`fintech-domain-analyst`** (all three touch `src/lib/*` math) + `quality-gate-evaluator-agent` (cross-file).
  Adversarial; act on every blocker/HIGH before the stage commit; file deferred-real findings as Issues.
- **Rule 26** (cross-page): after each stage, independent sweep — the dashboard cards + every consumer of the
  changed derive outputs; substance matches source (±1 rounding).
- **Rule 33** (blind re-verify): every UI/E2E/persistence verdict re-checked by a SEPARATE context-blind agent
  given the raw evidence (copy screenshots INTO the goal worktree's evidence dir + `ls`-confirm before dispatch;
  capture full-page + dropdown-open + before/after pairs the first time). Reconcile any dissent.
- **MANDATORY member-lens sweep** (`member-landscape-verification.md`, no exceptions): the dashboard is
  member-attributable → run the FULL `e2e/member-lens-sweep.spec.ts` (real "Viewing as" dropdown across every
  route, demo mode) + the static `src/lib/lens-coverage-invariant.spec.ts`. #139's deflation must hold under both
  the consolidated and lensed view.
- **Rules 15, 17, 20, 23** operative (skills-on-failure; root-cause-not-patch / red-first; no fake data; finish
  the DoD — context-budget anxiety is NOT a stop).

**Persistence-mode mechanics:** main UI sweeps run in **demo localStorage mode** (default — `VITE_USE_SERVER_ADAPTER`
off). For #138 ONLY, spin a **dedicated server-mode sub-run**: create `.env.local` (`VITE_USE_SERVER_ADAPTER=on`,
`VITE_API_BASE_URL=http://localhost:3100`, `VITE_DEV_BYPASS=true`), start `server/` + root, exercise the
`plan-baseline` endpoint + ServerAdapter persistence, then restore `.env.local`. This is **non-deferrable** (it is
the only proof the new persisted entity round-trips through Supabase).

**Conditional gating:** 26 + 33 always fire. 29 fires on every non-trivial diff (+ FinTech for the math — all three).
31 fires (all three reach user-facing values). 24 + 32 fire (all three are UI). 25 + the API test fire for #138
only (the only write-path/server change); #139 + #140 are read-only display → `rule 25 skipped: no write-path change`,
`api test skipped: no server change`.

**Failure-recovery budget:** per-task ~15 attempts (≈5 inline → `/fix-loop` → `/systematic-debugging`) → DEFER the
task + continue, don't halt the run. MCP hang: 3-cycle recovery (wait+retry → close+navigate → kill+restart dev
server) → DEFER. **Hard halt ONLY:** `npm install` failure · contract decision contradiction · irrecoverable build
break after the full budget · OS permission denial · missing required token. Context-budget anxiety is NOT a halt.

---

## 6. Commit + push

- **Branch:** `feat/dashboard-honesty-cards` (created in the §0.1 worktree).
- **Commits:** atomic, one logical unit per stage (≈3–5): `feat(fire): real vs nominal projection toggle (#139)` ·
  `feat(fire): job-loss runway card with post-tax-net liquidity (#140)` · `feat(fire): plan-vs-actual variance with
  decomposed delta (#138)` · `feat(api): plan-baseline document endpoint (#138)` · `docs(adr): plan-baseline entity`.
  Each commit only after its stage's §5 gate is green (or DEFERRED-with-reason).
- **Stage named files only** — NEVER `git add -A` (the working tree carries unrelated untracked `docs/goals/*` +
  `.run/` items). Co-author trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **On success:** merge `--no-ff` → `main`, push `origin main`, comment+close #139/#140/#138 with the SHA, then
  self-clean the worktree (§0.1.4). **Do NOT deploy to prod** — the new `/api/planner/plan-baseline` endpoint
  reaching production is Abhay's gated call (note it in the final report as a NEXT item).

---

## 7. Definition of Done (all MUST be true)

**Build / change:**
- [ ] #139 `deflatedProjection` + chart toggle + axis/tooltip label switch; deflator = live `assumptions.values.inflation`; no kernel change.
- [ ] #140 pure `runway.ts` (post-tax-net numerator, full-obligation burn, conservative + EPF + volatile-disclosure lines) + `RunwayCard.vue`.
- [ ] #138 dedicated `planBaseline` entity + `GET/PUT /api/planner/plan-baseline` + `plan-variance.ts` (decomposed progress/reality/goalpost, CPI-rebased) + `PlanVarianceCard.vue` + "Lock my baseline" action.
- [ ] ADR `docs/adr/NNNN-plan-baseline-entity.md` written.

**Static gates:**
- [ ] root + `server` type-check 0 errors · unit tests no regression · `npm run build` succeeds · mutation pass on the 3 new honesty-critical modules (surviving mutants closed or explicitly justified).

**Substance specs (the honest-direction proofs — non-negotiable):**
- [ ] #139: real vs nominal crossover YEAR identical for a fixed household; equals headline FIRE year when bridge covered.
- [ ] #140: runway DECREASES when EMIs/premiums included vs expenses-only AND when numerator post-tax-net vs gross.
- [ ] #138: assumption-only-change fixture reports "goalpost moved", NOT "fell behind"; rupee delta CPI-rebased.

**Rule 24 (render):** [ ] each new/changed card screenshot+ARIA+console pass; PNG read; zero NEW console errors.
**Rule 32 (functionality):** [ ] #139 toggle flips every figure+labels; #140 lines render; #138 lock-action captures + card updates.
**Rule 25 (write path — #138):** [ ] dual-signal in BOTH demo (localStorage round-trip) AND the server-mode sub-run (API GET).
**API behavioral test (#138 server-mode sub-run):** [ ] status + envelope + auth-gate (401) + ownership + integration round-trip of the full shape incl. assumptions copy.
**Rule 31 (plausibility):** [ ] real-corpus / runway-months / variance-delta sane on the default lens; sane-bounds added to `headline-plausibility.spec.ts`; FinTech-validated end-to-end.
**Rule 29 (independent review):** [ ] `code-reviewer-agent` + `fintech-domain-analyst` (+ `quality-gate-evaluator-agent`) ran per stage; blockers/HIGH acted on or filed.
**Rule 26 (cross-page):** [ ] dashboard cards + derive consumers consistent (±1).
**Rule 33 (blind re-verify):** [ ] every UI/E2E/persistence verdict re-checked by a separate context-blind agent; dissents reconciled.
**Member-lens (no exceptions):** [ ] full `e2e/member-lens-sweep.spec.ts` + `lens-coverage-invariant.spec.ts` green; #139 deflation correct under consolidated AND lensed views.
**a11y / Lighthouse (UI):** [ ] zero Critical+Serious WCAG 2.1 AA on the 3 cards (or DEFERRED w/ reason).

**Ship:**
- [ ] ≈3–5 conventional commits pushed to `feat/dashboard-honesty-cards`.
- [ ] **On success only:** merged `--no-ff` → `main`, pushed, #139/#140/#138 commented+closed with SHA, worktree self-cleaned (§0.1.4). (DEFER/HALT keeps the worktree.)
- [ ] Deferrals logged in `docs/goals/.run/dashboard-honesty-cards-DEFERRED.md` with rule status + reason.
- [ ] Progress log maintained throughout (§0.3); lessons rolled into the final report + a notable lesson appended to `.claude/tasks/lessons.md`.
- [ ] **NEXT (Abhay-gated, NOT done by the run):** prod deploy of the new `/api/planner/plan-baseline` endpoint flagged in the final report.

---

## 8. Final report (required on completion)

Open with a **SUMMARY — DONE / PENDING / BLOCKED / NEXT** (mirror in the final PROGRESS entry). Then: commit SHAs +
per-stage gate results; Rule 24 verdict per card + PNG paths; Rule 25 verdict (both modes for #138); Rule 26
cross-page result; member-lens sweep result; mutation-kill summary; FinTech end-to-end verdict; a11y summary; DoD
green/amber/red tally; every DEFERRED entry with rule status + reason; the skipped-as-already-covered list (§0.2);
and a **LEARNINGS TO FOLD BACK** section (PROPOSALS only, classified GENERIC vs PRODUCT-SPECIFIC, gate-over-prose).

---

## 9. Guardrails (hard stops)

- **`src/` / `server/` / `e2e/` / `docs/adr/` + `docs/goals/.run/` only.** Never write `.claude/` rules from this
  run; never write `D:\Abhay\VibeCoding\5Wealths\`.
- **No new dependencies.**
- **No kernel change for #139** (display-layer only); **no new Prisma table for #138** (document blob).
- **No design reinvention** — reuse `accessibilityClass`, `postTaxLiquidation`, the document-endpoint pattern, the
  existing card/three-state patterns.
- **Honesty:** no synthetic/fake data; every feature's substance spec proves the conservative (non-optimistic)
  direction; surface uncertainty as an explicit assumption (e.g. the vested-ESOP sellability note).
- **No prod deploy** — the new endpoint reaching production is Abhay's gated call.
- **Stop only on a true blocker** (§5). Context-budget anxiety is NOT a blocker — hand off via a one-line
  continuation note, never fake-complete.
- **Strategic items → `TODO(5W):` notes**, not handled here.

---

## Authorization trail

| # | Decision | Choice |
|---|---|---|
| 1 | All 3 features in one contract / one run | Yes — one `/goal` run, 3 stages |
| 2 | Build order | #139 → #140 → #138 (de-risk: cleanest first, new-entity last) — Abhay-approved |
| 3 | #139 frame conversion | Display-layer deflation in `useFireDerive`; NO kernel change |
| 4 | #139 deflator | `assumptions.values.inflation` (general CPI), live; never hardcode, never householdInflation (#20) |
| 5 | #139 toggle scope | **chart-local ref** (not persisted ui-store) for v1 |
| 6 | #139 headline reconciliation | crossover YEAR identical real/nominal; may read earlier than headline when bridge shortfall — surfaced, not hidden |
| 7 | #140 liquid set | `accessibilityClass==="liquid"` (investment-traits), NOT `accessibleAtAge` |
| 8 | #140 numerator | POST-TAX net (`postTaxLiquidation`), not gross |
| 9 | #140 burn | full obligation incl. EMIs + insurance premiums (not expenses-only) |
| 10 | #140 disclosure | conservative (FD-only) line + EPF-after-2-months line + volatile-asset disclosure |
| 11 | #138 persistence home | dedicated `planBaseline` entity (NOT extend `ExpenseSnapshot`) — SRP |
| 12 | #138 capture | explicit "Lock my baseline" user action (not auto oldest-snapshot) |
| 13 | #138 baseline contents | fireNumber/fireAge/yearsToFire/netWorth/monthlyContribution + assumptions copy |
| 14 | #138 backend | new `GET/PUT /api/planner/plan-baseline` document endpoint; NO Prisma table |
| 15 | #138 variance | DECOMPOSE progress/reality/goalpost; CPI-rebase rupee deltas; lead with FIRE-date-months |
| 16 | #138 ADR | required (`docs/adr/NNNN-plan-baseline-entity.md`) |
| 17 | Verification persistence mode | main UI = demo localStorage; #138 endpoint = dedicated non-deferrable server-mode sub-run |
| 18 | Member-lens | full E2E "Viewing as" sweep + static scan mandatory (dashboard is member-attributable) |
| 19 | Commit/merge | feature branch, atomic per-stage commits, merge `--no-ff`→main + push on success |
| 20 | Prod deploy | NOT done by the run — Abhay-gated (flagged as NEXT) |

---

## References (loaded transitively)

- `rules/claude-behavior.md` — rules 15, 17, 20, 23, 24, 25, 26, 29, 31, 32, 33
- `rules/testing-strategy.md` — test placement SSOT (demo pre-merge; the server-mode sub-run for #138)
- `rules/member-landscape-verification.md` — the no-exceptions full "Viewing as" sweep mandate
- `rules/independent-test-verification.md` — rule 33 blind re-verification
- `rules/output-plausibility-verification.md` — rule 31 sane-on-default-lens
- `rules/operating-model.md` — rule 29 independent-reviewer edge (+ `fintech-domain-analyst` for math)
- `rules/tdd-rule.md` — red-first (mandatory)
- `rules/dev-bypass-auth.md` — `x-dev-bypass: true` for the #138 server-mode API check
- `rules/vitest-config-split.md` — the `DATABASE_URL`-gated integration spec
- `docs/adr/0001-*` (storage seam) · `docs/adr/0004-temporal-contribution-model.md` (frame context)
- skills the run may drive: `/fix-loop`, `/systematic-debugging`, `/auto-verify`, `/a11y-audit`, `/adr`
