# GOAL — FIRE Dashboard redesign to Option D: verdict hero + KPI strip + visual-encoding body

**Type:** Autonomous build contract (run via `/goal`). Execute end-to-end with **zero user input**.
Every design decision is pre-made below — do not pause to ask; make the call the contract specifies
and keep going until the Definition of Done is fully met.

**Owner:** Abhay · **Created:** 2026-06-10 · **Scope:** `src/` (Vue planner SPA) + `e2e/` (spec
updates for the changed dashboard) + `SCREEN-STANDARD.md` + `docs/`. **Never `server/`** (no API/schema
change in this goal), never `.claude/` rules, never `D:\Abhay\VibeCoding\5Wealths\`.
**Invocation:** `/goal docs/goals/2026-06-10-fire-dashboard-redesign-option-d.md`
**Design SSOT:** `docs/design/2026-06-10-fire-dashboard-redesign/option-d-merged.html` (+ its PNG) —
the Abhay-approved mockup this contract realizes. Open it in a browser when in doubt; it outranks
any prose description below.

---

## 0. Mission

The FIRE dashboard (`/fire-goals/dashboard`) is today a **4,487px single-column wall of ~15
equal-weight text cards** — data-rich but unscannable: no visual hierarchy, the first chart appears
~3,000px down, every honesty surface is fully-expanded prose, and there is no 5-second answer to
"am I on track?". Abhay reviewed three redesign directions on 2026-06-10 and approved **Option D**:

- **Hero (from Option C):** one big verdict-colored box — "YOU'LL FIRE AT AGE **55**" + the honest
  48–62 confidence range + the since-you-were-away delta — carrying **three KPI slots (from Option
  A):** *Vs your plan* (✓ on track), *Corpus progress* (₹1.10 Cr / ₹10.55 Cr + progress bar +
  savings rate + SWR), *Biggest win available* (top lever + years-sooner).
- **Body (from Option B):** every text card becomes a **visual encoding** — bridge **unlock-timeline
  bar**, runway **gauge**, plan-variance **waterfall**, ranked-wins **impact bars**, milestone
  **ladder** — plus the existing path chart + donut, a severity-coded suggestions card, and compact
  section tiles.

"Done" = the dashboard renders Option D faithfully (hero → bridge+runway → waterfall+wins →
milestone ladder → individual-FIRE+donut → path-chart+suggestions → trajectory → section tiles →
footers), every datum the old dashboard showed is still reachable (relocated, never deleted), all
honesty invariants hold (confidence band, household-primary number, bridge verdict, no optimistic
defaults, drivers-zero fallback), both trees green, the full member-lens sweep passes, rules
24/25/26/29/31/32/33 verified, SCREEN-STANDARD.md updated, commits merged → `main` and pushed.
**Phase 2 (propagating the visual language to Readiness/Decumulation/Stress-test/Goals) is OUT of
scope. Production deploy is OUT of scope (Abhay's gate).**

---

## 0.1 WORKTREE ISOLATION (first action, non-negotiable)

> **First action of the run, before §0.2 and any stage.** This run MUST execute in a **dedicated git
> worktree**, never the user's primary interactive checkout.
>
> 1. **Isolate:** `root=$(git rev-parse --show-toplevel)`. If `root` is the primary checkout
>    (`…/firekaro-planner`) rather than an already-dedicated `…/firekaro-goal-*` worktree, create and
>    switch FIRST: `git worktree add ../firekaro-goal-dashboard-option-d -b feat/fire-dashboard-option-d`
>    and run every stage from there. NEVER run a multi-commit build in the primary worktree.
> 2. **Claim it:** export a unique `GOAL_RUN_TOKEN` (e.g. `feat/fire-dashboard-option-d-<nonce>`) and
>    write `printf '%s\n' "$GOAL_RUN_TOKEN" > "$(git rev-parse --show-toplevel)/.goal-active.lock"`.
>    The `.githooks/pre-commit` hook hard-blocks commits whose token doesn't match.
> 3. **Release on exit:** final action (success OR halt/defer): `rm -f .goal-active.lock` (repo root).
> 4. **Self-cleanup ON SUCCESS ONLY:** after merge `--no-ff` → `main` + push + lock release, `cd` to
>    the primary root and `git worktree remove --force ../firekaro-goal-dashboard-option-d ;
>    git branch -D feat/fire-dashboard-option-d ; git worktree prune`. (Windows may print
>    `Invalid argument` while still de-registering — fine; `prune` finalises.) **DEFER/HALT: keep the
>    worktree + branch for resume; release only the lock.**

---

## 0.2 PREFLIGHT — idempotency · NO duplication (before any stage)

> **A parallel session may already have implemented part of this. Safe-to-run-anytime is mandatory.**
> This repo has no formal coverage ledger → idempotency sources are **`git log` + the live code**:
>
> 1. `git log --oneline -25` — look for `feat(fire): …option-d…` / `feat(fire): dashboard redesign…`
>    commits or an existing `feat/fire-dashboard-option-d` branch.
> 2. For EACH stage, grep/read the ACTUAL code before building:
>    - A: does `src/lib/dashboard-verdict.ts` exist + export `resolveHeroTone`? Does
>      `src/components/dashboard/FireHero.vue` already render the KPI strip (`data-testid="hero-kpi-strip"`)?
>    - B: does `src/components/dashboard/viz/` exist with the 5 SVG components below?
>    - C: do `BridgeBreakdownCard`/`RunwayCard`/`PlanVarianceCard`/`AccelerationCard`/`NudgeStack`/
>      `FireMilestonesCard` already consume the viz components?
>    - D: does `src/pages/fire-goals/Dashboard.vue` already render the Option-D order; is
>      `LifecycleDigestCard` already absent from it; does SCREEN-STANDARD.md §dashboard describe Option D?
>    If a stage is already implemented (confirm by READING), **SKIP its build — verify-only** (run its
>    gate sweep) and move on. Build only the missing delta.
> 3. **Record every skip** in the final report's "skipped (already covered)" list.

---

## 0.3 PROGRESS LOG — live, cross-session-trackable

> Maintain an append-only log at `docs/goals/.run/fire-dashboard-option-d-PROGRESS.md` (gitignored;
> readable cross-session via `git worktree list`). First line: slug · branch · worktree · start time ·
> contract path · one-line mission. Append a ≤2-line entry at every stage start/done (with gate
> result), every MAJOR DEFECT, every "not working" EVENT + what you did, each independent-review
> outcome (concur/dissent), each DEFER/skip, each blocker, and the final result. Entry format:
> `[YYYY-MM-DD HH:MM] <STAGE|PROGRESS|DEFECT|EVENT|DECISION|RECOVERY|BLOCKER|DONE> — <summary>`.
> At run-end: derive learnings → AUTO-append notable error→fix→lesson lines (with a gate-gap line) to
> `.claude/tasks/lessons.md` (dedup-grep first); PROPOSE everything else in the final report's
> **LEARNINGS TO FOLD BACK** section (GENERIC → skill/process rule; PRODUCT-SPECIFIC → product rule if
> a class, else this contract; prefer deterministic gate over prose). The run NEVER edits its own
> contract, a skill, or a rule. Final entry + final report each carry the **SUMMARY: DONE / PENDING /
> BLOCKED / NEXT** roll-up.

---

## 1. Context you need (read first)

| Thing | Path / import | Why it matters |
|---|---|---|
| **The approved mockup (design SSOT)** | `docs/design/2026-06-10-fire-dashboard-redesign/option-d-merged.html` (+ `.png`) | THE layout/visual spec. Card order, hero anatomy, KPI strip content, every encoding's shape. Outranks prose. |
| The page being rebuilt | `src/pages/fire-goals/Dashboard.vue` | Current card order (chips → digest → hero → individual → bridge → runway → variance → acceleration → nudges → milestones → family → charts → trajectory → tiles → footers). The reorder + removals happen here. |
| The hero | `src/components/dashboard/FireHero.vue` | Reworked IN PLACE into the Option-D hero. Read fully first — every data point it currently renders must survive (relocated, not deleted). |
| Cards being re-skinned | `src/components/dashboard/{BridgeBreakdownCard,RunwayCard,PlanVarianceCard,AccelerationCard,NudgeStack,FireMilestonesCard,IndividualFireCard,FamilyLayerCard}.vue` | Each keeps its script logic/empty-states/testids; only the template's prose body is replaced by a viz component. |
| Digest folding into hero | `src/components/dashboard/LifecycleDigestCard.vue` | Its "since you were away" delta line moves INTO the hero subline. **Grep for any deep-link anchor/testid the WhatsApp nudge targets and carry it onto the hero** before removing the card from Dashboard.vue. The component FILE stays (other consumers may exist — grep first). |
| Existing waterfall precedent | `src/components/charts/CashflowWaterfall.vue` | Mirror its SVG structure/idioms for `PlanVarianceWaterfall`. Do not invent a new waterfall idiom. |
| Charts staying as-is | `src/components/dashboard/{FireProjectionChart,AssetAllocationDonut}.vue`, `src/components/charts/FireTrajectoryChart.vue` | Keep, reposition per mockup. FireProjectionChart KEEPS its #139 Today's-₹/Future-₹ toggle. Trajectory keeps its honest ≤1-point empty state. |
| Section tiles | `src/components/dashboard/SectionCard.vue` | Unchanged component; the 7 tiles render in a compact row per mockup. |
| Chart theming rules | `.claude/rules/chart-theme-system.md` · `src/styles/tokens.css` · `src/plugins/vuetify.ts` | New viz = **hand-built SVG with `viewBox`** (the rule's custom-chart path). Colors from the semantic palette (success/error/warning/primary + fire-orange). Inter for labels, JetBrains Mono for numerics. |
| The derive surface | `src/lib/useFireDerive.ts` (+ `src/lib/derive.ts` — READ-ONLY) | All hero/KPI numbers come from existing derived fields. **This contract changes NO math** — `derive.ts`, `fire-math.ts`, every `src/lib/*` calc module is read-only EXCEPT the new `dashboard-verdict.ts`. |
| Plan-variance data | `src/lib/plan-variance.ts` + `src/composables/usePlanBaseline.ts` | Feeds the waterfall + the "Vs your plan" hero KPI. **Honesty fallback (verified 2026-06-10): a returns-only assumption change yields `attribution` all-zero by design (sign-mismatch guard)** — the waterfall MUST render the honest fallback (headline + goalpost alert, no fabricated bars) in that case. |
| Lever data for "Biggest win" | `src/lib/lever-impact.ts` + whatever `AccelerationCard.vue` consumes (read it) | The hero's third KPI = the top-ranked lever's label + delta. Reuse the card's existing ranking — do NOT re-rank in the hero. |
| Lens coherence | `src/stores/ui.ts` (`viewingMemberId`, `isFamilyView`) + `e2e/member-lens-sweep.spec.ts` + `src/lib/lens-coverage-invariant.spec.ts` | The dashboard is member-attributable: hero + KPIs must re-scope under "Viewing as". The FULL sweep is a mandatory gate (`.claude/rules/member-landscape-verification.md` — no exceptions). |
| Screen governance | `SCREEN-STANDARD.md` | MUST be updated in the SAME run with the Option-D dashboard pattern (rule 27). |
| Persistence mode | demo `LocalStorageAdapter` (default) | The only write path on this screen is plan-baseline lock/re-lock → Rule 25 = localStorage round-trip on `firekaro-mvp:<userId>:plan-baseline`. |

**Gotchas:** run E2E in demo mode (no `.env.local` server adapter — the splash hides "Try the sample"
when `VITE_USE_SERVER_ADAPTER=on`; a server started with stale env silently changes mode). Dismiss the
`.tour-overlay` before any dashboard click/screenshot. The MCP browser writes screenshots to the
session root's `.playwright-mcp/`, not the goal worktree — copy evidence into the worktree's evidence
dir and `ls`-confirm before dispatching the rule-33 blind verifier.

---

## 2. STAGE A — verdict-tone lib + the Option-D hero

**Files:** `src/lib/dashboard-verdict.ts` (create) + colocated `dashboard-verdict.spec.ts` (create,
RED FIRST) · `src/components/dashboard/FireHero.vue` (rework in place).

### Pre-made design decisions (do NOT deviate)

1. `dashboard-verdict.ts` exports one pure function `resolveHeroTone(input) → "ahead" | "on-track" |
   "behind" | "no-baseline"` mapping plan-variance state (no baseline / |Δmonths| < 1 / Δ ≥ +1 /
   Δ ≤ −1) — pure, no store access, TDD red-first.
2. Hero anatomy (exactly the mockup): eyebrow "YOU'LL FIRE AT AGE" → the big age (text-h2-scale,
   weight 800) → subline `in <N>y <M>m (<year>) · most likely <lo>–<hi> allowing for markets` +
   conditional `· moved <X> earlier/later since you were away` (the LifecycleDigest delta, only when
   the digest has a meaningful change — same self-hide logic, moved). Confidence range is
   NON-REMOVABLE (honesty objective 1).
3. Hero tint/border by tone: on-track/ahead → success tint (`#f0fdf4`/`#bbf7d0`-equivalent via theme
   tokens); behind → warning tint; no-baseline → the existing neutral fire-orange gradient. Red is
   NEVER a hero state — red alerts live in the suggestions card.
4. KPI strip (3 slots, separated by hairlines, inside the hero card, stacking vertically < `md`):
   **Slot 1 "VS YOUR PLAN"** — `✓ On track` / `▲ <N> mo ahead` / `▼ <N> mo behind` from
   plan-variance; when no baseline: a compact `Lock this as my plan` button (the existing
   `usePlanBaseline().lockBaseline` — keep `data-testid="plan-variance-lock"` semantics here or on
   the card, one canonical lock control only: the HERO hosts the lock CTA when no baseline; the
   waterfall card hosts Re-lock when locked).
   **Slot 2 "CORPUS PROGRESS"** — `₹<now> / ₹<target>` + a determinate progress bar (% of FIRE
   number) + caption `<pct>% of target · saving <savingsRate>% · SWR <swr>%`. Values from
   `useFireDerive` — household-primary on the default lens, member-scoped under the lens.
   **Slot 3 "BIGGEST WIN AVAILABLE"** — top-ranked lever's short label + `→ <delta> sooner` +
   caption `<n> more wins ranked below ↓`. Source = AccelerationCard's existing ranking (slot hides
   if no levers rank).
5. Every data point FireHero currently renders (read it first) must remain somewhere in the hero
   (stats row / subline / KPI captions) — relocation only, zero data loss. Lean/Fat ages stay if
   currently shown (subline chips per mockup's milestone treatment is Stage C's ladder; hero keeps
   whatever it has today unless the mockup places it elsewhere).
6. The header chip row in Dashboard.vue (`WholeHouseholdBadge`, planning-horizon, estate, stress)
   changes in Stage D: badge + horizon stay as a slim line ABOVE the hero; estate + stress chips are
   REMOVED from the header and become severity entries in the suggestions card (Stage C.5).

### Stage A acceptance
- `dashboard-verdict.spec.ts` written RED first, then green; all 4 tones + boundary (±1 month) covered.
- Hero renders all states: no-baseline (lock CTA), on-track, behind (simulate by assumption change),
  digest-delta present/absent. Rule 24 (screenshot+ARIA+console) per state on the default lens.
- Rule 32: lock CTA responds; under "Viewing as <member>" the hero + KPIs re-scope (member-lens).
- **Stage gate sweep:** static (root type-check + test:unit) → 24 → 32 → 25 (lock CTA writes
  `plan-baseline` key — localStorage round-trip) → 31 (hero values sane on default lens) → 29
  (code-reviewer; FinTech NOT needed — no math changed — unless `dashboard-verdict.ts` thresholds are
  judged financial, then dispatch it) → 26 → 33.

---

## 3. STAGE B — the five SVG viz primitives (TDD red-first)

**Files (all create):** `src/components/dashboard/viz/BridgeUnlockTimeline.vue`,
`viz/RunwayGauge.vue`, `viz/PlanVarianceWaterfall.vue`, `viz/WinsImpactBars.vue`,
`viz/MilestoneLadder.vue` + a colocated `viz/viz-components.spec.ts` (Vitest + @vue/test-utils
mounts, RED FIRST: props in → SVG structure/labels out).

### Pre-made design decisions (do NOT deviate)

1. All five are **pure presentational** components: typed props in (`defineProps<T>()`), SVG out.
   NO store access, NO useFireDerive inside them — the parent cards pass resolved data. Hand-built
   SVG with `viewBox` per `chart-theme-system.md`; INR labels via `formatINRCompact` passed-in
   strings or a `formatINR` import (display-only).
2. **BridgeUnlockTimeline** — horizontal segmented bar: spendable-at-FIRE (success) · locked-till-60
   (warning) · bridge-income (primary), age axis beneath (FIRE age → 58 → 60 → 65 per mockup); props
   `{ spendable, locked, bridgeIncomePerYear, fireAge, segments? }`. Verdict caption stays in the card.
3. **RunwayGauge** — semicircular arc: track + filled arc, center = months (JetBrains Mono) +
   "full-burn runway"; props `{ months, conservativeMonths, zone: "ok"|"warn"|"bad" }` (zone colors
   success/warning/error; zone mapping decided by the CARD: ≥12mo ok, 6–12 warn, <6 bad).
4. **PlanVarianceWaterfall** — mirrors `CashflowWaterfall.vue` idioms; bars: progress (success) /
   reality (error when negative) / goalpost (neutral grey) / net (fire-orange), labels `±N mo`.
   **Honesty fallback:** when `attribution` is all-zero but `fireDateDeltaMonths ≠ 0` (the
   sign-mismatch guard) render NO bars — the card shows the headline + the goalpost info alert only.
   Zero-delta + zero-bars → the card's "right on your plan" state, no waterfall.
5. **WinsImpactBars** — one row per lever: label · horizontal impact bar from a common zero axis ·
   delta (Mono). Deterministic-gain levers = solid success bar; the market-dependent risk-notch =
   striped amber bar spanning its full `[worst, best]` range with BOTH bounds labeled (`−6.5y … +8.4y`
   shape) — the range is the honesty device, never show only the upside. Props
   `{ wins: Array<{label, deltaYears | range:[lo,hi], kind:"sure"|"market"}> }`.
6. **MilestoneLadder** — horizontal rail with progress fill to the current corpus position + pins:
   You·₹now (fire-orange), Lean (₹+age), Regular (₹+age, success), Fat (₹+age, primary). Props
   `{ corpusNow, milestones: Array<{label, amount, age?, color}> }`. Coast/Barista detail keeps
   living in the card below the ladder if the card shows it today.
7. NO new npm dependencies. NO Chart.js for these five (SVG per the rule); Chart.js stays only where
   it already is.

### Stage B acceptance
- `viz-components.spec.ts` RED first then green: per component ≥3 assertions (renders expected
  segment/bar/pin counts from props; labels present; honesty fallback for the waterfall's all-zero
  case; striped-range rendering for the market lever).
- Rule 29 (code-reviewer) on the stage diff. Rules 24/32 deferred to Stage C (these mount only via
  the cards). Static gates green.

---

## 4. STAGE C — card conversions (logic untouched, prose → viz)

**Files (edit):** `BridgeBreakdownCard.vue`, `RunwayCard.vue`, `PlanVarianceCard.vue`,
`AccelerationCard.vue`, `NudgeStack.vue`, `FireMilestonesCard.vue`, `IndividualFireCard.vue` (compact
pass only), `FamilyLayerCard.vue` (compact pass only). **Keep untouched:** every `src/lib/*` calc
module, `derive.ts`, stores.

### Pre-made design decisions (do NOT deviate)

1. Per card: the `<script setup>` data/logic, empty-states, self-hide conditions, and existing
   `data-testid`s ALL survive; only the template body swaps prose for the viz component + a one-line
   verdict caption. Existing caveat copy (runway market-linked warning + ESOP note, bridge
   assumptions link, milestones explainers) is KEPT — placed as captions/alerts under the viz, never
   deleted (honesty invariant).
2. `RunwayCard`: heading stays **"If you stop working today or get fired"** (Abhay-renamed
   2026-06-10, commit `c61acc9`). Gauge zone mapping per Stage B.3. The stable-only + EPF lines stay
   (legend right of the gauge per mockup).
3. `PlanVarianceCard`: keeps lock/empty + locked states; locked state renders the waterfall.
   **Fold in the #155 fix (Abhay-reported bug — allowed as a bug-fix):** after Re-lock, show a
   transient inline acknowledgement (button flips to `✓ Re-locked` ~2s OR a `Baseline re-locked just
   now` caption; pick the button-flip) with `data-testid="plan-variance-relock-ack"`, and render
   `lockedOn` with time-of-day when `capturedAt` is today. Add a component test asserting the ack
   appears on click regardless of variance state. Reference the issue in the commit (`closes #155`).
4. `AccelerationCard`: renders `WinsImpactBars` from its existing ranked levers; keeps its what-if
   save-more control (rule 32 must exercise it). Exposes its top lever for the hero's Slot 3 (export
   a small composable or compute in Dashboard and pass down — pick the simplest that avoids
   duplicate ranking; do NOT compute the ranking twice).
5. `NudgeStack` → "Suggestions — severity-coded": each nudge gets a severity dot (error/warning/info)
   + one-line text + optional mini progress (`1.2 / 6 months` bar per mockup). ADDS two synthetic
   entries sourced from the removed header chips: estate-incomplete (warning; red when corpus > ₹1 Cr
   and no will — the existing chip logic, relocated) and stress-test failures (error when `failed > 0`,
   linking `/fire-goals/stress-test`; respect the existing `stressEnabled && hasFireTarget` gating).
   Red entries sort first.
6. `FireMilestonesCard`: ladder on top (B.6), existing Coast/Barista content below, compacted.
7. `IndividualFireCard` + `FamilyLayerCard`: keep content, tighten to the mockup's compact card
   scale (no new viz mandated); IndividualFireCard's household-primary framing is NON-NEGOTIABLE
   (#81 honesty — household number stays visually primary over any rosier individual figure).

### Stage C acceptance
- Per converted card: Rule 24 (render, default lens) + Rule 32 (its interactions respond: re-lock ack,
  acceleration what-if, suggestion links, FY/toggle where present) + the card's existing unit/E2E
  assertions updated (NEVER deleted — update selectors/expectations to the new structure).
- Rule 25 for the re-lock write (localStorage `plan-baseline` round-trip + the ack renders).
- Rule 31: every rendered ₹/month/age value sane on the default lens (Sharma seed bounds: FIRE age
  40–60, corpus ₹1–3 Cr, runway 30–60 months — flinch-check, not exact locks).
- Rule 29 per stage diff. Rule 26 + 33 at the stage boundary.

---

## 5. STAGE D — Dashboard assembly, responsive pass, governance + sweeps

**Files:** `src/pages/fire-goals/Dashboard.vue` (edit) · `SCREEN-STANDARD.md` (edit) ·
`e2e/member-lens-sweep.spec.ts` + any dashboard E2E/spec referencing removed/moved elements (edit) ·
`src/lib/lens-coverage-invariant.spec.ts` (extend if the screen list changes).

### Pre-made design decisions (do NOT deviate)

1. Final order in `Dashboard.vue`: slim badge+horizon line → FireHero (Option D) →
   row[BridgeBreakdownCard | RunwayCard] → row[PlanVarianceCard | AccelerationCard] →
   FireMilestonesCard → row[IndividualFireCard | AssetAllocationDonut] →
   row[FireProjectionChart (md=8) | NudgeStack-suggestions (md=4)] → FireTrajectoryChart →
   section tiles ("Sections at a glance", unchanged 7) → TrustPill footer → DiscoveryFooter.
   `LifecycleDigestCard` is REMOVED from this page (delta lives in the hero); `ReadinessVerdictCard`/
   `WithdrawalBandsCard`/`SequenceRiskCard` are NOT on this page today — do not add them.
2. Responsive: all 2-col rows collapse to single column < `md`; hero KPI strip stacks < `md`; hero
   always first. Use Vuetify grid (`v-row dense` + `v-col cols="12" md="6"`), no custom breakpoints.
3. Page height target on the Sharma seed, desktop 1280px: **≤ 2,600px** (from 4,487px). Measure via
   `document.body.scrollHeight` and report the number — if above target, compact paddings, do NOT
   delete content to hit it.
4. SCREEN-STANDARD.md: add/replace the dashboard pattern section — Option-D anatomy (verdict hero +
   KPI strip + viz-encoded cards + severity suggestions), naming the mockup path as design SSOT and
   the viz/ components as the reusable primitives for the Phase-2 propagation (rule 27).
5. E2E: update `e2e/member-lens-sweep.spec.ts` expectations if its dashboard selectors changed; the
   sweep itself must PASS on every route. Update any snapshot/dashboard spec asserting the old card
   order/copy. Tests are UPDATED to the new truth, never `.skip`ped (a skip needs a tracking issue —
   `bug-filing-and-sibling-audit.md`).

### Stage D acceptance
- **Full member-landscape sweep (`npx playwright test e2e/member-lens-sweep.spec.ts`, demo mode) —
  PASSES on ALL routes** (mandatory, no exceptions — `member-landscape-verification.md`).
- Root `npm run type-check && npm run test:unit` green (server tree untouched → its gate is
  `cd server && npm run type-check && npm run lint && npm run test:unit` run ONCE at the end to prove
  no accidental cross-tree breakage).
- `npm run test:e2e` green in demo mode.
- Rule 24+32 full-page pass on the assembled dashboard (default lens AND one member lens AND
  family-view on): screenshot + ARIA + console + exercise: #139 toggle, lock/re-lock, acceleration
  what-if, a suggestion link, a section tile navigation.
- Rule 26 cross-page: the relocated estate/stress alerts agree with `/estate-planning` and
  `/fire-goals/stress-test`; hero corpus/target agree with `/investments/overview` + milestones card
  (±1 rounding); biggest-win label agrees with AccelerationCard's top row.
- Rule 31 flinch-check on the assembled default-lens page; extend
  `src/lib/headline-plausibility.spec.ts` ONLY if a new derived headline value was introduced
  (none expected — report "no new flagship output" otherwise).
- Rule 33: blind verifier (separate context, evidence paths only — copied into the worktree evidence
  dir + `ls`-confirmed) re-checks the Stage-D verdicts; reconcile dissents before DONE.
- a11y: `/a11y-audit`-equivalent axe pass on the dashboard — zero Critical+Serious WCAG 2.1 AA new
  violations (SVG viz needs `aria-label`s + the existing `aria` patterns).

---

## 6. Verification gates (standing rules — mandate intact)

> **All rules in `.claude/rules/claude-behavior.md` are operative. Rules 24, 25, 26, 29, 31, 32, 33
> are MANDATORY gates at every task AND stage boundary** — they are why this contract yields
> *proven-working* output. Test PLACEMENT per `.claude/rules/testing-strategy.md` (everything here is
> pre-merge, localhost demo mode; nothing runs against firekaro.com).

- **Rule 24 (render):** per changed screen/state — navigate (self-heal: start `npm run dev` once in
  background, demo mode, capture PID) → screenshot → ARIA snapshot → console. Pass = intended
  element/copy/values visible + present in ARIA + zero NEW console errors. ≤3 iterations →
  `/fix-loop` → `/systematic-debugging`. MCP unavailable after recovery → mark
  `completed (deferred — Rule 24)`, never claim complete.
- **Rule 32 (functionality):** exercise every interactive control listed per stage; each must
  RESPOND (state/data/figure updates, no NEW console error). Render-only verification is INCOMPLETE.
- **Rule 25 (persistence):** the lock/re-lock write → UI signal (ack + card state) AND localStorage
  round-trip `mcp__playwright__browser_evaluate` reading `firekaro-mvp:<userId>:plan-baseline`.
  Dialog-close/optimistic UI never counts.
- **Rule 26 (cross-page sweep):** always fires per stage; consumers named in Stage D acceptance.
  3 reconcile cycles → `/systematic-debugging` → else DEFERRED log with `Rule 26 stage drift`.
- **Rule 29 (independent review):** `code-reviewer-agent` on every stage diff; `fintech-domain-analyst`
  ONLY if any `src/lib/*` math or `assumptions.ts` is touched (this contract intends NOT to — if a fix
  forces it, the FinTech gate fires); `quality-gate-evaluator-agent` on the final cross-file diff.
  Adversarial; act on every blocker/HIGH before the stage commit.
- **Rule 31 (plausibility):** default-lens flinch-check whenever a user-facing value is rendered;
  shape locks paired with substance assertions.
- **Rule 33 (blind verify):** every test verdict re-checked by a separate context-blind agent with
  evidence paths only (copy evidence into the worktree dir + `ls`-confirm first). No DONE while a
  dissent stands.
- **Rule 15 / 17 / 20 / 23:** failures → `/fix-loop` / `/systematic-debugging` (never 3+ manual
  retries); root cause over patch (red-first for any bug found); no fabricated data — surface
  `**Assumption:**` lines; keep going to the full DoD, no comfort-stops.

**Failure-recovery budgets:** per-task ≈15 attempts (≈5 inline → `/fix-loop` → `/systematic-debugging`)
→ DEFER the task, continue the run. MCP hang: wait-10s-retry → `browser_close` + re-navigate → kill
captured dev-server PID + restart → all-fail = DEFERRED + continue. **Hard halts ONLY:** `npm install`
failure · contract self-contradiction · irrecoverable build break after full budget · OS denial ·
missing credential. Context-budget anxiety is NOT a halt — one-line continuation note, never
fake-complete.

---

## 7. Commit + push

- Branch `feat/fire-dashboard-option-d` (created by §0.1). **4 conventional commits**, one per stage:
  1. `feat(fire): dashboard verdict-tone lib + Option-D hero with KPI strip`
  2. `feat(fire): five SVG viz primitives for the dashboard (timeline, gauge, waterfall, bars, ladder)`
  3. `feat(fire): convert dashboard cards to visual encodings (closes #155)`
  4. `feat(fire): assemble Option-D dashboard order + SCREEN-STANDARD + lens-sweep updates`
- Stage ONLY the files each stage names — NEVER `git add -A`; leave unrelated untracked
  `docs/goals/*.md` contracts alone. Every message ends with
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- On full DoD: merge `--no-ff` → `main`, push `origin main`, then §0.1.4 self-cleanup.
  **No production deploy** — that is Abhay's gate; the final report states the dashboard is on `main`
  awaiting his deploy.

---

## 8. Definition of Done (all MUST be true)

**Build:**
- [ ] `src/lib/dashboard-verdict.ts` + red-first spec exist; ALL 4 tones tested.
- [ ] FireHero renders the Option-D hero (big age + confidence range + conditional digest delta) +
      ALL 3 KPI slots, with zero data points lost vs the old hero (enumerate the mapping in the report).
- [ ] ALL 5 viz components exist under `src/components/dashboard/viz/` with red-first spec coverage
      including the waterfall's all-zero honesty fallback and the striped market-range bar.
- [ ] ALL 6 card conversions done (bridge, runway, variance+#155 ack, acceleration, suggestions with
      estate+stress folded in, milestones ladder); every pre-existing caveat/empty-state retained.
- [ ] Dashboard.vue renders the exact Stage-D order; LifecycleDigestCard removed from the page with
      its delta + any nudge deep-link anchor carried into the hero; measured page height reported
      (target ≤2,600px on Sharma desktop).
- [ ] SCREEN-STANDARD.md carries the Option-D dashboard pattern naming the mockup as design SSOT.

**Gates:**
- [ ] Root type-check + test:unit green; server tree gate run once at end, green; `npm run test:e2e`
      green (demo mode); zero `.skip`s added without a tracking issue.
- [ ] **Full `e2e/member-lens-sweep.spec.ts` PASSES on all routes** (no-exceptions gate).
- [ ] Rules 24+32 pass per stage AND on the assembled page in all 3 lens states (default, one member,
      family-view), with the listed controls exercised.
- [ ] Rule 25 dual-signal pass on lock + re-lock (incl. the #155 ack rendering).
- [ ] Rule 26 cross-page consumers (named in Stage D) agree ±1 rounding.
- [ ] Rule 29 review ran per stage + `quality-gate-evaluator-agent` on the final diff; every
      blocker/HIGH closed or filed as an Issue.
- [ ] Rule 31 flinch-check passed on the default lens; headline-plausibility spec extended or
      "no new flagship output" stated.
- [ ] Rule 33 blind verification concurred on every test verdict (dissents reconciled).
- [ ] a11y: zero NEW Critical+Serious WCAG 2.1 AA on the dashboard.

**Ship:**
- [ ] 4 conventional commits on `feat/fire-dashboard-option-d`, merged `--no-ff` → `main`, pushed;
      worktree self-cleaned (§0.1.4). NO deploy.
- [ ] Deferrals (if any) in `docs/goals/.run/fire-dashboard-option-d-DEFERRED.md` with rule + reason.
- [ ] Progress log maintained throughout; final entry + final report carry the SUMMARY roll-up; one
      notable lesson appended to `.claude/tasks/lessons.md`.

---

## 9. Final report (required on completion)

Open with **SUMMARY: DONE / PENDING / BLOCKED / NEXT**. Then: commit SHAs + per-stage gate results ·
the old-hero→new-hero data-point mapping table · Rule 24/32 verdicts per screen/state + PNG paths ·
Rule 25 verdict (lock/re-lock) · Rule 26 consumer table · member-lens sweep result · a11y summary ·
measured page height before/after · DoD tally · deferred entries · **LEARNINGS TO FOLD BACK**
(classified GENERIC vs PRODUCT-SPECIFIC, gate-over-prose, as PROPOSALS) · the closing line that
deploy awaits Abhay.

---

## 10. Guardrails (hard stops)

- `src/` + `e2e/` + `SCREEN-STANDARD.md` + `docs/` only. **Never `server/`, never `.claude/`, never
  `D:\Abhay\VibeCoding\5Wealths\`.**
- **No new npm dependencies.** New viz = hand-built SVG; Chart.js only where it already is.
- **No math changes:** `derive.ts`, `fire-math.ts`, and every existing `src/lib/*` calc module are
  READ-ONLY (sole new lib file: `dashboard-verdict.ts`). If a defect in math is discovered, file a
  GitHub Issue — do not fix it in this run.
- **No content deletion:** every datum/caveat/empty-state the old dashboard showed survives
  (relocated). Honesty surfaces (confidence range, household-primary, bridge verdict, runway
  market-warning, waterfall all-zero fallback, milestones explainers) are NON-REMOVABLE.
- **No design reinvention:** the mockup is the SSOT; reuse `SectionCard`, `CashflowWaterfall` idioms,
  theme tokens; extend over inline styles.
- Stop only on a §6 hard halt. Strategic items → `TODO(5W):` notes.

---

## Authorization trail

| # | Decision | Choice |
|---|---|---|
| 1 | Redesign philosophy | Option D merge: C hero + A KPI slots + B visual body (Abhay, 2026-06-10, after comparing live mockups A/B/C) |
| 2 | Scope | Dashboard only (Phase 1); propagation to other FIRE screens later (Abhay) |
| 3 | Execution form | Goal contract → Abhay runs `/goal` (Abhay) |
| 4 | Mobile | Responsive stacking, hero first (decided — best-practice-clear) |
| 5 | Hero component strategy | Rework `FireHero.vue` in place; no parallel hero component (decided — avoids dead code) |
| 6 | Viz tech | Hand-built SVG primitives, no new deps (decided — `chart-theme-system.md` custom-chart path) |
| 7 | LifecycleDigest | Folded into hero subline; card removed from dashboard, file retained; deep-link anchor preserved (decided) |
| 8 | Estate/stress chips | Relocated into severity-coded suggestions; badge+horizon stay as slim line (decided) |
| 9 | #155 re-lock ack | Folded in as a bug-fix of the rebuilt control (allowed: Abhay-reported defect on an implemented feature) |
| 10 | IndividualFire/FamilyLayer/Trajectory/Donut | Kept, compact, per Stage-D order (decided — honesty surfaces survive) |
| 11 | Persistence mode | Demo LocalStorageAdapter; Rule 25 = localStorage round-trip on `plan-baseline` (decided — UI-only build) |

---

## References (loaded transitively)

- `docs/design/2026-06-10-fire-dashboard-redesign/option-d-merged.html` — the design SSOT
- `.claude/rules/claude-behavior.md` — rules 15, 17, 20, 23, 24, 25, 26, 29, 31, 32, 33
- `.claude/rules/member-landscape-verification.md` — the no-exceptions lens sweep
- `.claude/rules/chart-theme-system.md` · `.claude/rules/vuetify-conventions.md` ·
  `.claude/rules/vue-component-conventions.md` — viz + component idioms
- `.claude/rules/testing-strategy.md` · `.claude/rules/independent-test-verification.md` ·
  `.claude/rules/output-plausibility-verification.md` · `.claude/rules/tdd-rule.md`
- `.claude/rules/e2e-vuetify-timing.md` · `.claude/rules/e2e-test-writing.md` — E2E updates
- Skills driven: `/fix-loop`, `/systematic-debugging`, `/a11y-audit`
- GitHub: #155 (re-lock feedback ack — closed by Stage C)
