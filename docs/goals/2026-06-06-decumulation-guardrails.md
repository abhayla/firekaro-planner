# GOAL — Post-FIRE decumulation guardrails ("keep them free", obj-4 must-have)

**Type:** Autonomous **build** contract (run via `/goal`). Execute end-to-end with **zero user input**.
Every design decision is pre-made below — do not pause; make the call the contract specifies and keep
going until the Definition of Done is fully met.

**Owner:** Abhay · **Created:** 2026-06-06 · **Scope:** `src/` ONLY — never `server/`, `.claude/`,
`docs/` (except the run's own DEFERRED file), or `D:\Abhay\VibeCoding\5Wealths\`.
**Invocation:** `/goal docs/goals/2026-06-06-decumulation-guardrails.md`

---

## 0. Mission

Build the **objective-4 surface that does not exist**: post-FIRE **decumulation guardrails** for the
accumulator who reaches FIRE — so the plan protects their independence *after* they stop, not just up to
the date. The audit found the math is partly built but **library-only with no user surface**, and one
piece is **absent**:
- **Safe-withdrawal bands** — `floorCeilingWithdrawal` + `DEFAULT_FLOOR_CEILING` (`src/lib/withdrawal-strategy.ts`)
  EXIST but feed only the projection chart (`derive.ts:677`); no card tells the retiree "withdraw ₹X–₹Y
  this year; floor triggered / ceiling capped."
- **Sequence-of-returns warning (DECUMULATION) — ABSENT.** `stress-test.ts` only measures *accumulation*
  (years-to-FIRE) impact; there is no post-retirement depletion/ruin check (a bad early-retirement
  market sequence is the #1 way a retiree goes broke).
- **Annual "still on track?" review** — `LifecycleDigestCard` is accumulation-only; no post-FIRE cadence.

Done = a dedicated `/fire-goals/drawdown` page that surfaces (A) this-year safe-withdrawal bands, (B) a
**new** honest decumulation sequence-of-returns warning, and (C) a post-FIRE "still on track?" summary —
all decision-support, never advice, all in the real-frame the headline uses.

---

## 0.1 WORKTREE ISOLATION (paste FIRST)

> **First action, before §0.2 and any stage. Non-negotiable.** Dedicated worktree, NEW branch off `main`
> (NOT the primary checkout on `feat/lever-impact-engine`; independent of #48):
> 1. If `root=$(git rev-parse --show-toplevel)` is the primary checkout, run:
>    `git worktree add ../firekaro-goal-drawdown -b feat/decumulation-guardrails main` and run EVERY stage
>    from `../firekaro-goal-drawdown`. Reuse it if it exists (§0.2 makes re-runs idempotent).
> 2. Claim: `export GOAL_RUN_TOKEN=drawdown-<short-nonce>` → write `.goal-active.lock` with it.
> 3. Release on exit (after last commit OR any halt): `rm -f "$(git rev-parse --show-toplevel)/.goal-active.lock"`.
> If `git worktree` is unavailable, note it and proceed — never run in the primary checkout.

## 0.2 PREFLIGHT (idempotency — run FIRST after §0.1)

> Read `docs/PROJECT-LOG.md` §2 + `git log --oneline -15`. Then grep before building each item:
> `ls src/lib/decumulation.ts src/pages/fire-goals/Drawdown.vue src/components/dashboard/WithdrawalBandsCard.vue src/components/dashboard/SequenceRiskCard.vue`
> — if any exist, build only the missing delta (verify-only what's done). Record skips in the report.

---

## 1. Context you need (read first)

| Thing | Path | Why |
|---|---|---|
| Withdrawal strategy (DONE) | `src/lib/withdrawal-strategy.ts` — `floorCeilingWithdrawal`, `constantWithdrawal`, `applyWithdrawalRule`, `WithdrawalYearResult`, `DEFAULT_FLOOR_CEILING`, `WithdrawalRuleKind` | The bands engine. REUSE it for Stage A; do NOT duplicate withdrawal math. |
| Monte Carlo (real-frame) | `src/lib/monte-carlo.ts` — the MC simulate/percentile API, `MAX_PROJECTION_YEARS`, the `reached` convention | The honest engine to reuse for the DECUMULATION depletion probability (Stage B), in the REAL frame (#20). Read its exports before wiring. |
| Accumulation stress (precedent) | `src/lib/stress-test.ts` — `runStressScenarios` (years-to-FIRE impact) | The PATTERN to mirror, but Stage B measures **post-retirement depletion**, not years-to-FIRE — a new, distinct check. |
| Derive output | `src/lib/derive.ts` (withdrawal at ~677, `bridgeCoverage` ~751) + `src/lib/useFireDerive.ts` (`fireWithdrawableCorpus`, `effectiveSWR`/`blendedReturn`, ages, `yearsToRegular`) | The Pinia accessors the page reads. Confirm the exact corpus/return/SWR/age fields by reading `useFireDerive`. |
| Assumptions | `src/types/assumptions.ts` — `withdrawalRule` (default `"Constant"`), SWR/inflation, planToAge | The decumulation inputs + the default rule. |
| Routing + nav + design | `src/router/index.ts` (FIRE & Goals block ~line 79), `src/layouts/SidebarNav.vue`, `FireHero.vue`/`BridgeBreakdownCard.vue`, `vue-component-conventions.md` + `vuetify-conventions.md` | Add the route + nav; match the dashboard card chrome + three-state render. |

**Gotchas:** real-frame (#20/#47) — every ₹ band, depletion year, and age is in the SAME real-terms frame
the headline uses (reuse the headline's corpus/return/SWR, never a parallel computation — the 526e100
lesson). The withdrawal default is `"Constant"`; the bands surface shows the Floor/Ceiling guardrail
EVEN when the user's rule is Constant (it's a "here's the safe range" guide, not a setting). Port 5175,
demo localStorage. **Decision-support, never advice.** **Rule 25 N/A** (read-only surface; no writes).

---

## 2. STAGE A — lib: this-year safe-withdrawal bands accessor (pure, TDD red-first)

**File(s):** `src/lib/decumulation.ts` (create) + `src/lib/decumulation.spec.ts` (create, red-first).

### Pre-made design decisions
1. `export function safeWithdrawalBands(input: { corpus: number; swr: number; inflation: number;
   yearsIntoRetirement?: number; priorYearWithdrawal?: number; }): { floor: number; ceiling: number;
   suggested: number; triggered: "floor" | "ceiling" | "none"; }` — a PURE accessor that wraps the
   EXISTING `floorCeilingWithdrawal` + `DEFAULT_FLOOR_CEILING` to produce THIS year's safe range (real ₹).
   Reuse the lib; do not re-derive the Floor/Ceiling rule.
2. Guard non-positive corpus/SWR (`> 0`) → return zeros + `triggered:"none"` (honest empty, the gh-#39 class).
3. Round monetary outputs (`Math.round`). Pure (`calculation-modules.md`).

### Stage A acceptance
- Red-first specs: bands are sane for a retired-corpus persona (floor ≤ suggested ≤ ceiling; all real ₹);
  zero corpus → zeros, not NaN. **FinTech** confirms the Floor/Ceiling reuse is faithful + real-frame.
- Static (§4) green; Rule 24/25 N/A (pure lib).

## 3. STAGE B — lib: decumulation sequence-of-returns warning (NEW math — TDD + FinTech-gated)

**File(s):** `src/lib/decumulation.ts` (extend) + `src/lib/decumulation.spec.ts` (extend, red-first).

### Pre-made design decisions
1. `export function sequenceRiskWarning(input: { corpus: number; annualRealWithdrawal: number;
   expectedRealReturn: number; yearsInRetirement: number; }): { depletes: boolean; depletionAge?: number;
   survivalUnderBadSequence: boolean; note: string; }` — measure whether the corpus **survives to
   `planToAge` under a BAD EARLY-RETIREMENT SEQUENCE**, the #1 retiree-ruin risk. Two honest signals:
   - **Deterministic bad-sequence stress (the must-have):** apply an early-years shock (e.g. a −25–30%
     real drawdown across retirement years 1–3, sourced from the existing `stress-test.ts` shock
     convention — read it; do NOT invent a new magnitude) THEN normal real returns, withdrawing the band
     each year; flag `survivalUnderBadSequence=false` if the corpus hits zero before `planToAge`.
   - **(If cheap) MC depletion probability via `monte-carlo.ts`** applied to the decumulation phase — the
     share of paths that deplete before `planToAge`. Reuse the existing MC; real-frame. If this proves
     heavy, ship the deterministic stress as the must-have and DEFER the MC probability (note it).
2. **Honesty (rule 31 — this is the whole point):** the warning must reflect REAL sequence risk, never an
   optimistic "you're fine." A constant-return projection cannot fail — so this MUST use the bad-sequence
   stress (and/or MC), not a smooth average. Surface uncertainty as a clear `note`.
3. Pure; real-frame; guard all denominators.

### Stage B acceptance
- Red-first specs: a thin-margin corpus + early shock → `survivalUnderBadSequence:false` with a finite
  `depletionAge`; a fat-margin corpus → survives. The bad-sequence path is materially worse than a
  smooth-return path (proving the stress actually bites — the anti-free-lunch lock).
- **FinTech Domain Analyst (MANDATORY — new financial math):** validates the sequence-risk model against
  FIRE/decumulation research (sequence-of-returns is real; the shock magnitude + survival check are
  sound; real-frame; no optimistic skew). Block on any HIGH.
- Static green; Rule 24/25 N/A.

## 4. STAGE C — UI: the drawdown guardrails page (route + nav, Rule 24/26)

**File(s):** `src/components/dashboard/WithdrawalBandsCard.vue` + `src/components/dashboard/SequenceRiskCard.vue`
(create) + `src/pages/fire-goals/Drawdown.vue` (create) + `src/router/index.ts` (route) +
`src/layouts/SidebarNav.vue` (nav). **Keep untouched:** `Dashboard.vue` (dedicated surface, parallel-safe).

### Pre-made design decisions
1. **Route:** `realRoute("/fire-goals/drawdown", "fire-drawdown", () => import("@/pages/fire-goals/Drawdown.vue"))`
   in the FIRE & Goals block. **Nav:** add an "After you retire" entry under FIRE & Goals in `SidebarNav.vue`
   (match the convention — e.g. `mdi-cash-clock`).
2. **`WithdrawalBandsCard.vue`:** reads `useFireDerive()` → `safeWithdrawalBands(...)`; renders this year's
   safe range: "Withdraw **₹{{ floor }}–₹{{ ceiling }}** this year (suggested ₹{{ suggested }})", with a
   one-line explanation of floor/ceiling. Honest empty state when not yet at/near FIRE. `data-testid="withdrawal-bands"`.
3. **`SequenceRiskCard.vue`:** reads `sequenceRiskWarning(...)`; renders an honest warning when
   `!survivalUnderBadSequence` ("A bad market in your first retirement years could deplete your corpus by
   ~age {{ depletionAge }} — consider a cash buffer / lower early withdrawals"), and a reassurance when it
   survives. Decision-support, never advice. `data-testid="sequence-risk"`.
4. **`Drawdown.vue` page:** `LeafPageHeader` ("After you retire") + the two cards + a lightweight **annual
   "still on track?" summary** section (reuse `lifecycle-digest`/headline deltas to show "your plan vs last
   check" — the post-FIRE cadence; a FULL post-FIRE annual-review engine is DEFERRED as good-to-have, note
   it). Three-state render; guard all derives. Most useful for a household at/near FIRE — for a still-
   accumulating user, show an honest "this matters once you reach FIRE — here's the preview" state, never a misleading number.
5. No new deps; reuse the design system; `<script setup lang="ts">`, typed.

### Stage C acceptance (Rule 24 + 26 MANDATORY)
- **Rule 24:** Playwright MCP on `/fire-goals/drawdown` for a near-FIRE persona (e.g. Mauryas) + an
  accumulating persona: navigate → screenshot → ARIA → console. The bands + the sequence-risk verdict are
  visible in screenshot AND ARIA; zero NEW console errors. Read the PNG. ≤3 iterations → `/fix-loop`.
- **Rule 26:** the bands' corpus/SWR + the sequence-risk inputs MUST match the headline's
  (`fireWithdrawableCorpus`, real return, ages) on the default lens — the #20/526e100 coherence check.
- **Rule 25 N/A** (no write path — document it). **a11y:** `/a11y-audit` → zero Critical+Serious (or DEFERRED).

---

## 5. Verification gates (operative)
> All 26 rules apply; **24 + 26 MANDATORY** (25 N/A). **FinTech is MANDATORY on Stage B** (new
> financial math) AND validates Stage A; independent **code-reviewer** (rule 29) before each builder commit.
**Static gates (worktree root):** `npm run type-check && npm run test:unit && npm run build` green per stage (banner `firekaro-mvp`; no root ESLint). **Parallel-run isolation (port):** this contract owns dev-server **port 5177** — start it with `npm run dev -- --port 5177 --strictPort` and navigate Playwright to `http://localhost:5177` (NOT 5175/5176 — those are the tax-guard / readiness contracts' ports; `--strictPort` makes Vite fail rather than screenshot a neighbour's worktree). If the Playwright MCP browser is a single shared instance, run this Rule-24 phase when no sibling run is mid-screenshot. **Rule 15/17/20/23** standard. **Failure budget:** per-task ≈15 → DEFER+continue; MCP hang → 3-cycle recovery → DEFER. Hard halt ONLY: npm install fail / contract contradiction / irrecoverable build / OS denial / missing token.

## 6. Commit + push (commit on branch, do NOT push, do NOT merge)
- **Branch** `feat/decumulation-guardrails` (off `main`). Abhay merges after review.
- **3 commits** (A withdrawal-bands `feat(fire)`, B sequence-risk `feat(fire)`, C UI `feat(fire)`/`feat(dashboard)`), atomic, Conventional Commits, Co-Authored-By trailer. Stage ONLY each stage's files (never `-A`); leave untracked items alone. Never `--no-verify`. Print branch + SHAs.
- **PARALLEL-SAFE NOTE:** this contract edits `src/router/index.ts` + `src/layouts/SidebarNav.vue`, SHARED with the sibling **readiness-verdict** contract. Add your route/nav line within the FIRE & Goals section; a parallel run conflicts only as a trivial adjacent-line addition — resolve by keeping BOTH entries. No other file overlaps.

## 7. Definition of Done (all MUST be true)
- [ ] `safeWithdrawalBands()` (reuses Floor/Ceiling) + `sequenceRiskWarning()` (NEW, bad-sequence survival) in `decumulation.ts`, pure, real-frame, + colocated specs.
- [ ] `WithdrawalBandsCard.vue` + `SequenceRiskCard.vue` + `Drawdown.vue` at `/fire-goals/drawdown` + nav; lightweight annual-review section (full engine DEFERRED).
- [ ] type-check 0 · unit no regression (+ new specs) · build succeeds.
- [ ] **FinTech validated the sequence-risk math** (real sequence-of-returns, no optimistic skew) + Stage A bands; zero unaddressed HIGH. code-reviewer APPROVE.
- [ ] Rule 24: bands + sequence-risk visible on ≥2 personas; PNG read. Rule 26: inputs match the headline. Rule 25 N/A (documented). a11y zero Critical+Serious (or DEFERRED).
- [ ] 3 commits on `feat/decumulation-guardrails` (NOT pushed/merged). Deferrals (incl. MC depletion prob + full annual-review engine) → `docs/goals/.run/2026-06-06-decumulation-guardrails-DEFERRED.md`. `.goal-active.lock` removed.

## 8. Final report
Worktree + branch + SHAs; per-stage static; FinTech (Stage A+B) + code-reviewer verdicts; Rule 24 (per persona) + PNG paths; Rule 26 coherence; §0.2 skips; DoD tally; DEFERRED (MC depletion prob, full annual-review); the `git merge feat/decumulation-guardrails` line for Abhay.

## 9. Guardrails
- `src/` only; no `server/`/`.claude/`/`5Wealths\`. **No new deps.** Reuse withdrawal-strategy + monte-carlo + the design system; no duplicate withdrawal/MC math.
- Honesty (rule 20/31): the sequence-risk warning MUST reflect real sequence-of-returns risk (use the bad-sequence stress / MC, NEVER a smooth-average projection that can't fail). Never optimistic. Decision-support, never advice. Stop only on a true blocker.
- Do NOT mount cards on `Dashboard.vue` (dedicated surface, parallel-safe). Scope discipline: the FULL post-FIRE annual-review loop + MC depletion probability are DEFERRED (good-to-have) — ship the deterministic must-have, note the rest.

## Authorization trail
| # | Decision | Choice |
|---|---|---|
| 1 | Scope | Decumulation guardrails (obj-4): withdrawal bands (reuse) + NEW sequence-of-returns warning + light annual-review; defer MC depletion prob + full annual-review engine. |
| 2 | Surface | Dedicated `/fire-goals/drawdown` page + 2 cards + nav — NOT the dashboard (parallel-safe). |
| 3 | Sequence-risk | Deterministic bad-early-sequence survival check (reuse stress-test shock magnitude) as the must-have; MC depletion probability optional/deferred. |
| 4 | Coherence | Bands/sequence inputs == the headline's corpus/return/SWR/ages (the #20/526e100 frame). |
| 5 | Handoff | Commit on branch off `main`, don't push/merge. |

## References
- `.claude/rules/claude-behavior.md` (15/17/20/23/24/25/26/29/31) · `output-plausibility-verification.md` · `calculation-modules.md` · `tdd-rule.md` · `vue-component-conventions.md` · `vuetify-conventions.md` · `defensive-coding.md` · `financial-year-handling.md` · `indian-financial-context.md`
- `src/lib/withdrawal-strategy.ts`, `src/lib/monte-carlo.ts`, `src/lib/stress-test.ts`, `src/lib/derive.ts`, `src/lib/useFireDerive.ts`, `src/types/assumptions.ts`, `src/router/index.ts`, `src/layouts/SidebarNav.vue`, `src/components/income-layout/LeafPageHeader.vue`
- Skills/agents: `/fix-loop`, `/systematic-debugging`, `/a11y-audit`, `fintech-domain-analyst`, `code-reviewer-agent`
