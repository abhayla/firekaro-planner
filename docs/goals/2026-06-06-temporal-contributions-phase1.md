# GOAL — Temporal contributions, Phase 1: per-investment ContributionSchedule + What-If step-up + inline FIRE-date delta

**Type:** Autonomous build contract (run via `/goal`). Execute end-to-end with **zero user input**.
Every design decision is pre-made below — do not pause to ask; make the call the contract specifies
and keep going until the Definition of Done is fully met.

**Owner:** Abhay · **Created:** 2026-06-06 · **Scope:** `src/` (Vue planner) + the `server/` document
layer (Prisma `Json?` field + household-diff mapping + an *authored-not-applied* migration) + `docs/adr/`
+ `docs/`. Never `e2e/`, never `D:\Abhay\VibeCoding\5Wealths\`.
**Invocation:** `/goal docs/goals/2026-06-06-temporal-contributions-phase1.md`
**Tracks:** GitHub issue **#46** (design + the FinTech/Architect review decisions live in its comments).

---

## 0. Mission

FireKaro's FIRE engine is today a **single-snapshot, constant-contribution** projection: `derive.ts`
compounds today's `monthlyContribution = annualSavings/12` flat forward forever. It cannot model a
contribution that **changes over time** — the exact real-world case "I do a ₹5k SIP now, step it up
10%/yr, then stop it at 45." That makes the headline FIRE date a "frozen-today-forever" fiction —
the biggest **honesty** gap (objective 1) after the headline bugs, and it blocks objective 2
("get there faster" — show the user the lever).

**Phase 1 delivers:** a **time-varying contribution model** so a salaried accumulator can express
future contribution changes (step-up %, start/stop) and **watch the FIRE date move**, surfaced both
as a persisted plan (per-investment) and as a live, non-persisting **What-If** override with an
**inline FIRE-date delta**. Plus the governing **ADR** and a **Phase-2 design note** so the next
phase (one-off cashflow events) is not built blind.

"Done" = the FIRE engine resolves contribution **per year** (constant ⇒ byte-identical to today),
driven by a **single time-varying household-savings schedule**; per-investment schedules are
display/plan metadata only and are **provably barred** from corpus inflow (the bug-#11 coherence lock
is a CI assert); the What-If screen recomputes the FIRE date live from a step-up lever with an inline
delta; both trees green; UI verified (rules 24/25/26); FinTech + code-reviewer pass; ADR + P2 note
written; commits pushed to `main`. **Phase 2 (CashflowEvents) is OUT of scope. Production deploy is
OUT of scope (Abhay's gate).**

---

## 0.2 PREFLIGHT — idempotency · NO duplication (FIRST action, before any stage)

> **First action of the run, before ANY stage. Non-negotiable.** A parallel session may already have
> implemented part of this. This contract must be **safe to run at any time without redoing finished
> work.** This repo has no formal coverage ledger → the idempotency sources are **`git log` + the live
> code + issue #46**:
>
> 1. `git log --oneline -25` — look for `feat(fire): contribution-schedule…` / `feat(temporal)…`
>    commits or a branch `feat/temporal-contributions-phase1`. If present, this work may be partly done.
> 2. For EACH stage, grep/read the ACTUAL code before building (don't trust git alone):
>    - A: does `src/lib/contribution-schedule.ts` already exist + export `buildContributionResolver`?
>    - B: does `investmentSchema` in `src/types/household.ts` already carry `contributionSchedule`?
>    - C: is `ContributionSchedule` already a type in `src/lib/fire-math.ts` and does `projectCorpus`
>      resolve contribution per-year (not a scalar)?
>    - D: do the new temporal asserts already exist in `src/lib/headline-plausibility.spec.ts`?
>    - E: does `server/prisma/schema.prisma` `Investment` already have the JSON column + a migration?
>    - F: does `WhatIf.vue` / `LeverValues` already carry a step-up lever; does `InvestmentForm.vue`
>      have a schedule editor?
>    - G: do `docs/adr/0004-*.md` and the P2 design note exist?
>    If a stage is already implemented (confirm by READING), **SKIP its build — verify-only** (run its
>    gate sweep) and move on. Build only the missing delta.
> 3. **Record every skip** in the final report's "skipped (already covered)" list.

---

## 1. Context you need (read first)

| Thing | Path / import | Why it matters |
|---|---|---|
| The projection kernel | `src/lib/fire-math.ts` → `projectCorpus()`, `calculateYearsToTarget()` | The two functions whose `monthlyContribution: number` param becomes a `ContributionSchedule`. |
| **The pattern to mirror** | `src/lib/fire-math.ts` → `ReturnSchedule = number \| ((yearIndex)=>number)` + `resolveReturn()` (the #9 glide-path change) | `ContributionSchedule` is the SAME shape + an identical `resolveContribution()` helper. Year-indexed. Constant ⇒ byte-identical is the proven invariant. |
| Phase-change precedent | `src/lib/fire-math.ts` → `DecumulationOverlay` (stops contributing at `retirementAge`) | Proof the projection already changes behaviour at a future point — segment stops follow the same idea. |
| **The #11 residual decision** | `src/lib/derive.ts` ~lines 330–340 | `monthlyContribution = annualSavings/12` (the residual) is the SOLE corpus inflow; per-investment `monthlyContribution` is DELIBERATELY ignored — adding it was bug #11 (~10× double-count). This contract MUST preserve that: corpus inflow stays the residual (made time-varying). |
| Projection assembly | `src/lib/derive.ts` ~lines 460–670 (esp. `realReturnSchedule`, `calculateYearsToTarget(...)`, `projectCorpus({...})`) | Where the time-varying household savings schedule is built + passed in. `anchorAge` (from DOB) lives here — segment ages resolve against it. |
| Investment model (the Zod SSOT) | `src/types/household.ts` ~lines 209–268 (`investmentSchema`, scalar `monthlyContribution`, `isAutomated`) | Where `contributionSchedule?` is added. Flat Zod for localStorage back-compat (per the file's own note). Shared with `server/` via the `@planner` alias. |
| Store hydrate/persist | `src/stores/household.ts` (migration-on-hydrate, `watch(data, persist, {deep:true})`) | Backfill the scalar `monthlyContribution` → one open segment on hydrate; persist via the storage adapter (never `localStorage` directly). |
| What-If surface | `src/pages/fire-goals/WhatIf.vue` + `src/stores/scenarios.ts` (`LeverValues` already has `monthlyContribution?: number`) | The live non-persisting override. Add a step-up lever here → live FIRE-date recompute. |
| Inline delta component | `src/components/shared/DeltaChip.vue` | Reuse for the "FIRE date −1.4 yr" inline delta. Do NOT inline a new chip. |
| Persisted schedule editor | `src/components/forms/InvestmentForm.vue` (already edits `monthlyContribution`) | Where the opt-in "plan a future change" (step-up%, start/stop age) editor goes. |
| Plausibility CI gate | `src/lib/headline-plausibility.spec.ts` | The sane-bounds gate that MUST grow the temporal asserts (the #11 coherence lock + monotonicity). |
| Server persistence | `server/prisma/schema.prisma` (`Investment` model) · `server/src/lib/household-diff.ts` · `server/src/lib/household-repo.ts` | The `Json?` column + the diff-engine field mapping + an authored-not-applied migration. |
| ADR set | `docs/adr/0003-fire-planner-tax-scope.md` (ADR-0003 — the SWR-absorbs-tax decision the lump-out contract references) | The new ADR-0004 references ADR-0003's tax stance. |

**Gotchas:**
- **One app tree.** This extracted repo is NOT the old `mvp/`/`demo/` monorepo. Frontend = `src/`
  (Vite, **port 5175**); backend = `server/` (Hono, **3100**). Demo persistence = the storage adapter
  → `localStorage` (`firekaro-mvp:<userId>:<entityKey>`), NOT a DB. Never `cd mvp`.
- **REAL frame.** The headline compounds in today's-rupee REAL terms (corpus deflated by general CPI,
  `derive.ts` ~525; target grows at CPI ~664). Schedule amounts and any step-up are therefore **REAL**
  — a nominal step-up that merely tracks ~6% inflation is ALREADY baked into the constant-real
  baseline. Expressing step-up in nominal terms would double-count inflation → optimistic. (FinTech Q2.)
- **`anchorAge` is wall-clock-derived** (`ageFromDOB`). Segment starts are **age-relative**, never
  absolute dates, or they silently drift year-to-year (FinTech/Architect both flagged). Render to
  calendar only on output.
- **The single-kernel rule:** `derive.ts` calls `projectCorpus` ONCE. Keep it that way — the
  flattening lives in the new `contribution-schedule.ts` module, not inline in `derive.ts`.
- **Direct `.monthlyContribution` readers:** `grep -rn "\.monthlyContribution" src server` BEFORE
  shipping — any consumer reading the scalar directly (not through `derive()`/the resolver) is a
  migration risk and must be reconciled. Note `derive.ts` ~461–463 reads it as an EPF *return-drag*
  input (safe — not corpus inflow); do not break that.

---

## 2. STAGE A — `src/lib/contribution-schedule.ts` (NEW pure module, TDD red-first)

**File(s):** `src/lib/contribution-schedule.ts` (create), `src/lib/contribution-schedule.spec.ts`
(create). **Keep untouched:** `derive.ts`, `fire-math.ts` (touched in C).

### Pre-made design decisions (do NOT deviate)
1. Export the types:
   - `interface ContributionSegment { amount: number; startAtAge: number; endAtAge?: number; stepUpPercentPerYear?: number }` — `amount` in **REAL** ₹/month; `startAtAge`/`endAtAge` **age-relative**; `stepUpPercentPerYear` optional, **default treated as 0**, **clamped to [0, 15]**.
   - `type ContributionSegments = ContributionSegment[]`.
2. Export `buildContributionResolver(segments: ContributionSegments, anchorAge: number): (yearIndex: number) => number`:
   - Returns the **monthly** contribution active at `anchorAge + yearIndex`.
   - Segment selection: the segment whose `[startAtAge, endAtAge ?? Infinity)` contains the year's age; on overlap, **the latest-starting matching segment wins** (sorted by `startAtAge`); outside any segment → `0`.
   - Step-up: `amount * (1 + clampedStepUp) ** yearsSinceSegmentStart`, where `clampedStepUp = min(max(stepUpPercentPerYear ?? 0, 0), 0.15)`. Step-up is REAL (do NOT add inflation here).
   - Defensive (`defensive-coding.md`): non-finite or negative → `0`; never `NaN`.
3. Export `scalarToSegments(monthly: number | undefined): ContributionSegments` = `monthly == null ? [] : [{ amount: monthly, startAtAge: 0 }]` (the migration-on-hydrate backfill helper — one open segment from age 0, i.e. always-on, behaviour-identical to a scalar).
4. Export `canonicalizeSegments(segments)` → a stably-sorted, number-rounded array (sorted by `startAtAge`, amounts `Math.round`, step-up rounded to 4 dp) — used so the household-diff `deepEqual` does not see spurious changes from key/JSON-order drift.
5. Keep the module **pure** (no store/DOM/IO import) per `calculation-modules.md`.

### Stage A acceptance (TDD)
- Specs FAIL before implementation, PASS after (`npm run test:unit -- src/lib/contribution-schedule.spec.ts`). Cover at minimum:
  - scalar segment (`scalarToSegments(5000)`) → resolver returns `5000` for every `yearIndex` (**the byte-identity seed**).
  - step-up 10% from age 30, anchor 30 → year 0 = base, year 1 = `base*1.10`, year 2 = `base*1.21`.
  - step-up clamp: `stepUpPercentPerYear: 50` resolves as `15%`, not 50%.
  - stop at `endAtAge`: after the end age → `0`.
  - gap (no covering segment) → `0`; overlap → latest-start wins.
  - `canonicalizeSegments` is order-stable + rounded.
- **Stage gate sweep:** static only — `npm run type-check` + the spec above. Rule 24/25 `skipped: no UI change`.

---

## 3. STAGE B — type model + hydrate backfill (`household.ts` + `household.ts` store)

**File(s):** `src/types/household.ts` (edit — extend `investmentSchema`), `src/stores/household.ts`
(edit — hydrate backfill + persist), plus any colocated store spec. **Keep untouched:** every other
field of `investmentSchema`; the scalar `monthlyContribution` STAYS (back-compat + the simple path).

### Pre-made design decisions (do NOT deviate)
1. Add to `investmentSchema`: `contributionSchedule: z.array(contributionSegmentSchema).optional()` where
   `contributionSegmentSchema = z.object({ amount: z.number().min(0), startAtAge: z.number().int().min(0).max(120), endAtAge: z.number().int().min(0).max(120).optional(), stepUpPercentPerYear: z.number().min(0).max(15).optional() })`. Keep the schema FLAT (the file's localStorage back-compat note).
2. The scalar `monthlyContribution` is the **simple/default path**; `contributionSchedule` is the
   opt-in advanced path. When `contributionSchedule` is present it is authoritative; when absent the
   scalar is used (via `scalarToSegments`). They are never summed.
3. **Migration-on-hydrate** in `src/stores/household.ts`: for each investment lacking
   `contributionSchedule`, do NOT mutate/persist a backfill into the stored blob (keep the stored shape
   minimal); instead the RESOLVER call site (Stage C, in `derive.ts`) treats "no schedule" via
   `scalarToSegments(inv.monthlyContribution)`. (Backfill at READ, not at WRITE — avoids a no-op diff
   churn on every hydrate.) Document this in a one-line comment.
4. Persist via the storage adapter only (never `localStorage` directly); when a schedule IS edited,
   persist it **canonicalised** (`canonicalizeSegments`) so the server diff stays idempotent.

### Stage B acceptance
- `npm run type-check` + `npm run test:unit` clean (root). A store/spec case proves a legacy
  investment with only `monthlyContribution` still resolves correctly (read-path backfill).
- **Stage gate sweep:** static only (type/store change; rendered effect verified in Stage F). Rule 24/25
  `skipped: no rendered change in this stage`.

---

## 4. STAGE C — engine: time-varying contribution, residual-only corpus inflow (the #11 lock)

**File(s):** `src/lib/fire-math.ts` (edit), `src/lib/derive.ts` (edit), plus their colocated specs.
**Keep untouched:** the SWR/inflation/variant/glide/bridge logic; the `DecumulationOverlay` behaviour.

### Pre-made design decisions (do NOT deviate)
1. In `fire-math.ts`: add `export type ContributionSchedule = number | ((yearIndex: number) => number);`
   and `resolveContribution(schedule, yearIndex)` mirroring `resolveReturn` (non-finite → `0`).
2. Change `projectCorpus`'s `monthlyContribution: number` param to `monthlyContribution:
   ContributionSchedule`. In the **accumulation** inner loop, the contribution added each of the 12
   months is `resolveContribution(schedule, y)` (resolved once per YEAR `y`, used for all 12 months).
   **Constant scalar ⇒ byte-identical** to the prior loop (the #9 invariant). Decumulation path
   unchanged (no contributions there).
3. Change `calculateYearsToTarget`'s `monthlySavings: number` → `ContributionSchedule`, resolving at
   `Math.floor(months/12)` (same year-index origin as `projectCorpus` — they MUST agree, or headline
   and chart diverge).
4. **THE #11 CORPUS-INFLOW LOCK (BLOCKER decision from FinTech review):** corpus inflow stays the
   **single household savings residual**, now expressed as a `ContributionSchedule`. In `derive.ts`,
   build ONE household-level resolver:
   - Baseline = today's `annualSavings/12` (unchanged).
   - It becomes time-varying ONLY via the household's own savings-capacity intent (Phase 1 source:
     the What-If/step-up lever for the live path; for the persisted path, Phase 1 keeps the household
     residual flat unless a household-level step-up is set — see decision 5). Pass this household
     schedule into `projectCorpus`/`calculateYearsToTarget`.
   - **Per-investment `contributionSchedule` is DISPLAY/PLAN metadata ONLY** — it MUST NOT be summed
     into corpus inflow. Add a loud comment at the call site citing gh-issue #11. (Re-routing
     per-investment contributions into corpus is exactly the ~10× double-count #11 fixed.)
5. **Phase-1 step-up wiring (kept honest + simple):** the persisted per-investment schedule editor
   (Stage F) drives **display + the investment's own card**, and a **household-level step-up
   assumption** (default **0%**, opt-in) drives the household savings schedule that actually moves the
   FIRE date. (Rationale: only the household residual is the truthful corpus inflow — a per-SIP
   step-up that isn't matched by a higher household residual would double-count. The persisted
   per-investment step-up is therefore plan/intent display in P1; the household-savings step-up is the
   lever that moves the headline. This is documented in the ADR.) Default 0% ⇒ today's headline
   unchanged.
6. Step-up is applied in **REAL** terms (no inflation added — `derive.ts` ~518 already assumes
   savings keep pace with general inflation; a real step-up is net-of-inflation growth on top).

### Stage C acceptance
- `npm run type-check` + `npm run test:unit` clean (root). Existing `fire-math`/`derive` specs STAY
  green (constant ⇒ byte-identical proven). Add a `derive` spec: a household with all-scalar
  contributions + 0% household step-up produces the **exact current headline**.
- **Stage gate sweep:** static only (logic). Rule 24/25 `skipped: no UI change` (UI in F). **Rule 26
  fires** as the §8 coherence reasoning check on the math (no rendered drift yet — full cross-page in F).

---

## 5. STAGE D — plausibility CI locks (`headline-plausibility.spec.ts`)

**File(s):** `src/lib/headline-plausibility.spec.ts` (edit — add temporal asserts). **Keep untouched:**
the existing sane-bounds cases.

### Pre-made design decisions (do NOT deviate) — assert ALL on the DEFAULT lens (`isFamilyView:false`, `viewingMemberId:null`)
1. **Default-path byte-identity:** a persona with all-scalar contributions + 0% household step-up →
   `effectiveFireAge` EXACTLY equals the pre-change baseline (snapshot the current value).
2. **#11 coherence invariant:** the corpus inflow used by the projection equals the resolved household
   savings schedule, and is **NOT** equal to the sum of per-investment `contributionSchedule` amounts
   whenever those differ (the direct CI lock against re-opening #11).
3. **Step-up monotonicity:** a positive household step-up makes `effectiveFireAge` **earlier-or-equal**
   vs 0% (never later).
4. **Stop/pause monotonicity:** a household savings stop/reduction makes it **later-or-equal** (never
   earlier).
5. **FIRE-age sane band:** for any persona with positive savings, `anchorAge ≤ effectiveFireAge ≤
   planToAge`; never `< anchorAge`; a beyond-horizon result surfaces "not within horizon", never an
   absurd age (the #20/#22 classes stay impossible).

### Stage D acceptance
- `npm run test:unit -- src/lib/headline-plausibility.spec.ts` green. **Stage gate sweep:** static only.

---

## 6. STAGE E — server persistence (`Json?` column + diff mapping + authored migration)

**File(s):** `server/prisma/schema.prisma` (edit — `Investment` model), `server/src/lib/household-diff.ts`
(edit — map the field), `server/src/lib/household-repo.ts` (if it enumerates investment columns),
the new migration dir under `server/prisma/migrations/` (authored via `prisma:migrate:create`).
**Keep untouched:** every other model; the diff engine's transaction shape.

### Pre-made design decisions (do NOT deviate)
1. Add a single `contributionSchedule Json?` column to the `Investment` model (per
   `prisma-conventions.md`; `Json?` for variable-structure data — do NOT model child tables in P1,
   YAGNI; the Architect review endorses JSON-first).
2. `household-diff.ts`: include `contributionSchedule` in the Investment insert/update mapping so a
   changed schedule maps to an `update`. Because the frontend persists it **canonicalised** (Stage A
   #4), `deepEqual` stays idempotent (identical PUT → zero writes).
3. **Author the migration but do NOT apply it:** `cd server && npm run prisma:migrate:create` (=
   `prisma migrate dev --create-only`) — generates the SQL, does not touch the DB. Applying it to
   Supabase is a deploy step = **Abhay's gate**. Note this in the final report.
4. Standalone Prisma scripts that hit Supabase while the dev server holds connections MUST append
   `?connection_limit=1` (the session-pooler cap) — but Phase 1 does NOT need to run against the live
   DB; `prisma:validate` + `prisma:generate` + the authored migration + `type-check` are the gates.

### Stage E acceptance
- `cd server && npm run prisma:validate && npm run prisma:generate && npm run type-check && npm run lint
  && npm run test:unit` all green (the `household-diff.spec.ts` no-DB units MUST still pass; add a case
  that a `contributionSchedule` change yields an `update`, an identical one yields `unchanged`).
- A migration file exists under `server/prisma/migrations/` but is **not** applied.
- **Stage gate sweep:** static (server). Rule 24/25 `skipped: no UI change` (server-only).

---

## 7. STAGE F — UI: persisted schedule editor + What-If step-up lever + inline FIRE-date delta

**File(s):** `src/components/forms/InvestmentForm.vue` (edit), `src/pages/fire-goals/WhatIf.vue` (edit),
`src/stores/scenarios.ts` (edit — extend `LeverValues`), reuse `src/components/shared/DeltaChip.vue`.
**Keep untouched:** unrelated form fields; the scenarios resolution order (scenario→household→global).

### Pre-made design decisions (do NOT deviate)
1. **`InvestmentForm.vue` — opt-in "Plan a future change" section** (a `v-expand-transition`
   collapsed by default, per `form-validation-patterns.md`): a step-up % field
   (`suffix="%"`, `type="number"`, hint "real, above inflation", max 15) and optional "starts at age" /
   "stops at age" number fields. When the user fills them, build a `contributionSchedule` (via the
   Stage-A helpers) on save; when untouched, persist nothing new (scalar path stays). Default = no
   schedule, 0% step-up. Reuse existing Vuetify field conventions (`outlined`, `comfortable`); do NOT
   invent a new control.
2. **`scenarios.ts` `LeverValues`** — add `householdStepUpPercentPerYear?: number` (the live lever that
   moves the headline, per Stage C #5). Keep the existing `monthlyContribution?` lever.
3. **`WhatIf.vue`** — add a step-up slider/field bound to `householdStepUpPercentPerYear` (0–15%,
   default 0). On change, the scenario re-derives (non-persisting) and the **FIRE date recomputes
   live**. Render the change as a **`DeltaChip`** next to the FIRE-date readout ("FIRE date −1.4 yr vs
   base"). Reuse `DeltaChip` — do not inline a chip.
4. The What-If lever NEVER persists (scenarios are non-persisting by design); the InvestmentForm
   schedule DOES persist (Rule 25 applies to it).

### Stage F acceptance (run the §8 gate sweep)
- `npm run type-check` + `npm run test:unit` + `npm run build` clean (root).
- **Rule 24** on `/fire-goals` What-If screen + the investment edit dialog (see §8 screens).
- **Rule 25** on the InvestmentForm schedule save (localStorage round-trip — the persisted investment
  carries the canonical `contributionSchedule`).
- **Rule 26** cross-page: the What-If step-up moves the FIRE date on the What-If screen; the **base
  dashboard `/` FIRE headline is UNCHANGED** by the non-persisting What-If lever (proof the override
  doesn't leak into the real plan).

---

## 8. Verification gates (standing rules — adapted to this repo, mandate intact)

> **All rules in `.claude/rules/claude-behavior.md` are operative.** Rules 24/25/26 are MANDATORY at
> every task AND stage boundary (Abhay standing mandate) — they are why this yields *proven-working*,
> not *claimed-working*, output. Conditional gating: logic/server/docs stages gate static-only; UI
> stages (F) fire 24/25; **Rule 26 always fires**.

### Conditional gating
| Rule | Trigger | On skip |
|---|---|---|
| **26** post-phase + cross-page sweep | ALWAYS fires | non-skippable |
| **24** UI screenshot verification | diff touches `*.vue` (Stage F) | commit note `rule 24 skipped: no UI change` (A,B,C,D,E,G) |
| **25** UI→persistence | a UI write path changes (Stage F InvestmentForm save) | `rule 25 skipped: no write-path change` (A,B,C,D,E,G) |

### Rule 24 (Stage F) — self-heal dev server (`npm run dev`, port 5175, capture PID) if down; then per screen:
`mcp__playwright__browser_navigate` → `browser_take_screenshot` → `browser_snapshot` →
`browser_console_messages`. PASS = (a) intended state visible in screenshot, (b) present in ARIA tree,
(c) no NEW console errors. **Exercise interactive functionality (rule 32)**: actually change the
What-If step-up and confirm the FIRE date + `DeltaChip` recompute. ≤3 iterations → `/fix-loop` →
`/systematic-debugging`. MCP genuinely unavailable after self-heal + §9 hang recovery → surface
"UI verification skipped because <reason>" + mark `completed (deferred — Rule 24)`; never claim complete.
- **`/fire-goals` What-If:** step-up lever present; moving it recomputes the FIRE date; `DeltaChip` shows the delta.
- **Investment edit dialog:** the opt-in "Plan a future change" section renders + accepts a step-up.

### Rule 25 (Stage F — persistence = storage adapter / localStorage in demo):
Drive the InvestmentForm, set a step-up on one investment, save. Both signals: (1) the investment
card/list reflects the planned change; (2) via `mcp__playwright__browser_evaluate`, read the persisted
investments entry (the storage-adapter key per `src/lib/storage-adapter.ts`, demo userId) and confirm
it carries the canonical `contributionSchedule` with the expected `stepUpPercentPerYear`. (If the run
is exercising the ServerAdapter path instead, the persistence signal is
`curl -H "x-dev-bypass: true" http://localhost:3100/api/planner/household` showing the schedule —
per `dev-bypass-auth.md`.) UI-only does NOT count.

### Rule 26 (ALWAYS — the decisive cross-page checks):
1. **#11 coherence (the headline honesty proof):** with a per-investment step-up set BUT household
   step-up 0%, the dashboard `/` FIRE headline is UNCHANGED — proving per-investment schedules do not
   leak into corpus inflow (visually confirms the Stage-D CI lock).
2. **What-If isolation:** moving the What-If household step-up changes the FIRE date on `/fire-goals`
   but the base dashboard `/` headline (a fresh navigate, no scenario active) is unchanged — the
   non-persisting override doesn't bleed into the real plan.
3. **Lever does move the number:** with a positive household step-up applied as the active scenario,
   the FIRE date is earlier-or-equal and the `DeltaChip` sign/magnitude agrees.
3 reconcile cycles → `/systematic-debugging` → else log DEFERRED with `Rule 26 stage drift`.

### Static gates (run from the stated CWD)
- Root: `npm run type-check && npm run test:unit && npm run build` (repo root).
- Server: `cd server && npm run prisma:validate && npm run prisma:generate && npm run type-check &&
  npm run lint && npm run test:unit`.

### Rule 15/17/20/23 (verbatim)
- **15:** test fails → known retest → `/fix-loop`; unclear/2+ fails → `/systematic-debugging`. Never retry the same approach 3+ times.
- **17:** root cause, never a band-aid (esp. the #11 lock — never "patch" the coherence test, fix the inflow source).
- **20:** no fabricated data; surface uncertainty as `**Assumption:** X`.
- **23:** autonomous run — work the full DoD; don't stop at a comfortable all-green waypoint. Context-budget anxiety is NOT a stop condition.

### Independent verification (rule 29) — before the final merge
- Dispatch `code-reviewer-agent` on the full diff.
- Dispatch `fintech-domain-analyst`: validate that (a) the **#11 corpus-inflow lock holds end-to-end**
  (corpus inflow == household residual, never the per-investment sum), (b) the step-up is REAL-terms
  (no inflation double-count), (c) the FIRE headline stays **persona-sane on the DEFAULT lens** for a
  step-up scenario, and (d) the default-path headline is byte-identical to pre-change. This is the
  Tier-0 honesty gate — a positive finding here BLOCKS merge.
- Act on every blocker/HIGH before merge; track deferred-but-real findings as a GitHub Issue.

---

## 9. Failure-recovery budgets
- **Per-task fix budget:** ~15 attempts (≈5 inline → `/fix-loop` → `/systematic-debugging`) → then DEFER the task and continue; do NOT halt the whole run.
- **MCP browser hang recovery (autonomous):** 3 cycles — (1) wait 10s + retry; (2) `browser_close` + re-navigate; (3) kill the captured dev-server PID + restart + retry. All 3 fail → log DEFERRED + `completed (deferred)` + continue.
- **Hard halts ONLY:** `npm install` failure; a decision contradiction in this contract; irrecoverable build break after the full budget; OS permission denial; missing required token. Context-budget anxiety is NOT a halt — hand off via a one-line continuation note, never fake-complete.

---

## 10. STAGE G — ADR + Phase-2 design note (docs)

**File(s):** `docs/adr/0004-temporal-contribution-model.md` (create — next ADR number after 0003),
`docs/temporal-cashflow-events-p2-design.md` (create). **Keep untouched:** existing ADRs.

### Pre-made design decisions (do NOT deviate)
1. **ADR-0004** (Michael-Nygard format, matching `docs/adr/0003-*`): record the **fork-#1 decision** —
   corpus inflow is the single time-varying household savings residual; per-investment schedules are
   display/plan metadata barred from corpus (the #11 rationale). Record the **year-indexed
   `ContributionSchedule` mirroring `ReturnSchedule`**, the **REAL-terms step-up + 0% default + ≤15%
   cap**, the **age-relative segment** decision, and the **ADR-0003 interaction** (accumulation-phase
   lump-out tax is NOT in SWR — deferred to P2). Status: Accepted.
2. **P2 design note** — capture the four unsolved CashflowEvents sub-problems (from the Architect
   review) + the FinTech event contracts (do NOT build them):
   - sticky-crossover semantics (a transient lump-in crossover that dips back below target must not
     count as FIRE-ready) → `findCrossovers` needs "holds ≥3 consecutive years".
   - `calculateYearsToTarget` → replace with a scan of the `projectCorpus` `ProjectionPoint[]` (one
     extra projection run) so headline + chart can't diverge once events make the curve non-monotone.
   - bridge `corpusScale` → year-indexed corpus array (data already in `ProjectionPoint[]`) so a
     pre-retirement lump-out doesn't over-credit liquidity.
   - event frame/tax contracts: lump in/out are **today's-rupee, injected unescalated** into the real
     frame (no double-inflation); a material **pre-retirement lump-OUT gets a disclosed flat LTCG
     haircut** (gross is optimistic, ADR-0003 only covers retirement-phase tax); **income-change**
     applied pre-tax through the marginal rate; **expense-change** moves BOTH legs (savings − AND
     FIRE-number +); **emiEnd** moves inflow only, FIRE number unchanged, AND removes the recurring EMI
     line (else double-relief); **goalOutflow** is mutually exclusive with `calculateFamilyLayerCorpus`
     for the same goal.

### Stage G acceptance
- Both docs exist, internally consistent with the shipped P1 code. Docs-only → Rule 24/25 `skipped: docs only`.

---

## 11. Commit + push
Branch **`feat/temporal-contributions-phase1`** off `main`. Atomic conventional commits (one per stage,
or sensibly grouped); **name files explicitly — NEVER `git add -A`** (the working tree has an unrelated
untracked `scripts/prod-cdp-sweep.mjs` — do NOT stage it). Suggested commits:
1. `test(fire): contribution-schedule resolver (red-first)` + `feat(fire): year-indexed ContributionSchedule module` (Stage A).
2. `feat(fire): add contributionSchedule to investment model + read-path backfill` (Stage B).
3. `feat(fire): time-varying household savings schedule; bar per-investment schedules from corpus (gh-11 lock)` (Stage C).
4. `test(fire): temporal plausibility locks (coherence + monotonicity)` (Stage D).
5. `feat(server): persist contributionSchedule (Json column + diff mapping + authored migration)` (Stage E).
6. `feat(fire): What-If step-up lever + persisted schedule editor + inline FIRE-date delta` (Stage F).
7. `docs(adr): temporal contribution model (ADR-0004) + P2 cashflow-events design note` (Stage G).

End commit messages with the Co-Authored-By trailer the harness specifies. Run the §8 gate before
merge. **Merge `--no-ff` to `main`, then `git push origin main`.** **Do NOT apply the Prisma migration
to Supabase, do NOT deploy / touch DNS / touch the VPS** — Abhay's gate.

---

## 12. Definition of Done (all MUST be true)

**Build / change:**
- [ ] `src/lib/contribution-schedule.ts` exists (year-indexed resolver, REAL step-up ≤15% cap, age-relative, canonicalise) with passing specs.
- [ ] `investmentSchema` carries optional `contributionSchedule`; the scalar path still works via read-path backfill.
- [ ] `fire-math.ts` `ContributionSchedule` type + `resolveContribution`; `projectCorpus` + `calculateYearsToTarget` resolve per-year; **constant ⇒ byte-identical** proven.
- [ ] `derive.ts` drives corpus from the SINGLE time-varying household savings schedule; per-investment schedules **barred from corpus inflow** (commented, gh-11).
- [ ] `headline-plausibility.spec.ts` carries the 5 temporal asserts (byte-identity, #11 coherence, step-up & stop monotonicity, sane band).
- [ ] Server: `Investment.contributionSchedule Json?` + diff mapping + an **authored-not-applied** migration; `household-diff.spec.ts` covers the new field.
- [ ] UI: opt-in schedule editor in `InvestmentForm.vue`; What-If household step-up lever in `WhatIf.vue`/`LeverValues`; inline `DeltaChip` FIRE-date delta.
- [ ] `docs/adr/0004-temporal-contribution-model.md` + `docs/temporal-cashflow-events-p2-design.md` written.

**Static gates:**
- [ ] Root: type-check 0 errors · unit no regression · build succeeds. Server: prisma:validate + generate + type-check + lint + unit green.

**Rule 24 (per UI screen):**
- [ ] `/fire-goals` What-If — step-up lever moves the FIRE date + `DeltaChip` (screenshot + ARIA + console clean; interaction exercised).
- [ ] Investment edit dialog — "Plan a future change" section renders + accepts a step-up.

**Rule 25 (write path):**
- [ ] InvestmentForm schedule save: UI reflects it AND the persisted investments entry carries the canonical `contributionSchedule`.

**Rule 26 (cross-page — the honesty proofs):**
- [ ] Per-investment step-up with 0% household step-up leaves the dashboard `/` FIRE headline UNCHANGED (#11 coherence visible).
- [ ] What-If household step-up moves `/fire-goals` but not the base dashboard headline (non-persisting isolation).

**Independent verification:**
- [ ] `code-reviewer-agent` + `fintech-domain-analyst` run; the #11 lock + REAL-terms step-up + default byte-identity + persona-sane headline all confirmed; no unaddressed blocker/HIGH.

**Ship:**
- [ ] ~7 conventional commits on `feat/temporal-contributions-phase1`, merged `--no-ff` to `main`, pushed to `origin`. **No deploy; migration authored not applied.**
- [ ] Any deferrals logged in `docs/goals/.run/2026-06-06-temporal-contributions-phase1-DEFERRED.md` with rule status + reason.

---

## 13. Final report (required on completion)
Commit SHAs + per-stage gate results; the **byte-identity proof** (default headline unchanged) and the
**#11 coherence proof**; Rule 24 verdict per screen + PNG paths; Rule 25 persistence result; Rule 26
cross-page results (both honesty proofs); independent-review verdicts (code-reviewer +
fintech-domain-analyst); the authored-migration path (NOT applied — flag as Abhay's deploy gate); DoD
green/amber/red tally; "skipped (already covered)" list from §0.2; any DEFERRED entries.

---

## 14. Guardrails (hard stops)
- **Scope:** `src/` + the named `server/` document-layer files + `docs/adr/` + `docs/` only. Never `e2e/`, `demo/`, `5Wealths\`.
- **No new dependencies.**
- **No design reinvention** — mirror `ReturnSchedule`/`resolveReturn`; reuse `DeltaChip`, the existing Vuetify field + `v-expand-transition` patterns, `AVAILABLE_FYS`/storage-adapter conventions. Extend, don't inline a new pattern.
- **THE #11 LOCK IS NON-NEGOTIABLE:** corpus inflow is the household savings residual; per-investment `contributionSchedule` is NEVER summed into corpus. If a test fails because of this, fix the inflow source, never weaken the coherence assert (rule 17).
- **Honesty (rule 20/31):** step-up is REAL-terms, default 0%, opt-in; never a silent optimistic default. No synthetic data.
- **OUT of scope:** Phase 2 CashflowEvents (lump in/out, income/expense/EMI/goal events) — design-note only, do NOT build. The Prisma migration is AUTHORED, not applied. No production deploy / DNS / VPS — Abhay's gate.
- **Strategic items → `TODO(5W):` notes**, not handled here.

---

## Authorization trail

| # | Decision | Choice |
|---|---|---|
| 1 | Corpus inflow source (the blocker) | **Single time-varying household savings residual**; per-investment schedules display/plan-only, BARRED from corpus (gh-11 ~10× double-count) — locked by a CI coherence assert |
| 2 | Schedule index granularity | **Year-indexed** `number \| ((yearIndex)=>number)`, mirroring `ReturnSchedule`; constant ⇒ byte-identical |
| 3 | Step-up frame + default + cap | **REAL terms**, default **0%**, opt-in/assumption-surfaced, clamped **≤15%/yr** (no inflation double-count vs derive.ts ~518) |
| 4 | Segment anchoring | **Age-relative `startAtAge`** only (never absolute date — anchor-stable vs wall-clock); render to calendar on output |
| 5 | Flattening logic home | **New pure module `src/lib/contribution-schedule.ts`** + colocated spec, written BEFORE `derive.ts`; `derive.ts` still calls `projectCorpus` ONCE |
| 6 | Hydrate backfill | **Read-path** backfill (`scalarToSegments`) — do NOT churn the persisted blob on hydrate |
| 7 | What-if lever that moves the headline | **Household-level step-up** in `LeverValues`/`WhatIf.vue` (only the residual is truthful corpus inflow); per-investment step-up is plan display in P1 |
| 8 | Persisted-schedule UI home | Opt-in `v-expand-transition` section in `InvestmentForm.vue`; inline delta via `DeltaChip` |
| 9 | Persistence shape | `Investment.contributionSchedule Json?` (YAGNI vs child tables), canonical-serialized for diff idempotency |
| 10 | Migration application | **Authored not applied** (`prisma:migrate:create`) — applying to Supabase is Abhay's deploy gate |
| 11 | Phase-2 CashflowEvents | **Design-note + ADR only**, NOT built (4 sub-problems + FinTech event contracts captured) |
| 12 | Production deploy | **Out of scope** — land on `main` + CI; no DNS/VPS |

---

## References (loaded transitively)
- `.claude/rules/claude-behavior.md` — rules 15, 17, 20, 23, 24, 25, 26, 27, 29, 31, 32
- `.claude/rules/tdd-rule.md` — red-green-refactor (Stages A, D)
- `.claude/rules/calculation-modules.md` — pure module + colocated spec discipline (Stage A)
- `.claude/rules/financial-year-handling.md` — wall-clock anchor / `getCurrentFinancialYear` context
- `.claude/rules/pinia-store-conventions.md` — `ref()` state, migration-on-hydrate, persist-via-adapter (Stage B)
- `.claude/rules/prisma-conventions.md` + `.claude/rules/hono-route-conventions.md` — `Json?`, diff engine, migration (Stage E)
- `.claude/rules/dev-bypass-auth.md` — `x-dev-bypass: true` for the ServerAdapter Rule 25 path
- `.claude/rules/vuetify-conventions.md` + `.claude/rules/form-validation-patterns.md` + `SCREEN-STANDARD.md` — the schedule editor UI (Stage F)
- `.claude/rules/vue-component-conventions.md` — `<script setup>`, defensive computed, three-state render
- `.claude/rules/output-plausibility-verification.md` — the substance/sane-bounds discipline (Stage D)
- `.claude/rules/operating-model.md` + `.claude/rules/orchestrator-output-validation.md` — the verification edge (rule 29 pass)
- `src/lib/storage-adapter.ts` — localStorage key shape for the Rule 25 round-trip
- `docs/adr/0003-fire-planner-tax-scope.md` — ADR-0003 (SWR-absorbs-tax) referenced by ADR-0004
- GitHub issue **#46** — the design + FinTech/Architect review decisions this contract implements
- Skills this contract drives: `/fix-loop`, `/systematic-debugging`, `code-reviewer-agent`, `fintech-domain-analyst`, `/a11y-audit` (if the editor warrants it)
