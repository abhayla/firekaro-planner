# GOAL — Readiness-to-stop verdict surface ("Can I pull the trigger?", obj-3 must-have)

**Type:** Autonomous **build** contract (run via `/goal`). Execute end-to-end with **zero user input**.
Every design decision is pre-made below — do not pause; make the call the contract specifies and keep
going until the Definition of Done is fully met.

**Owner:** Abhay · **Created:** 2026-06-06 · **Scope:** `src/` ONLY — never `server/`, `.claude/`,
`docs/` (except the run's own DEFERRED file), or `D:\Abhay\VibeCoding\5Wealths\`.
**Invocation:** `/goal docs/goals/2026-06-06-readiness-to-stop-verdict.md`

---

## 0. Mission

Build the **objective-3 surface that does not exist**: a user-facing **readiness verdict** answering
*"Can I actually pull the trigger and stop working — now, or at what age?"* The MATH already exists —
`computeBridgeCoverage` (`src/lib/bridge.ts`) runs the conservative year-by-year liquidity check and is
consumed ONLY by `derive.ts` today (it moves the effective FIRE age later when the liquid runway can't
cover the bridge years). What is missing is the **decision verdict on top of it**: a clear
ready / not-ready / ready-at-age-N answer with the honest bridge-runway reasoning and "what would make
you ready sooner." `BridgeBreakdownCard.vue` shows the *accumulation-honesty* breakdown (reachable vs
locked, shortfall) — this contract adds the **decision-support verdict** the accumulator's later
lifecycle needs. Done = a dedicated `/fire-goals/readiness` page + a `ReadinessVerdictCard` that turns
the existing bridge outputs into an honest, decision-support "can you stop?" verdict — never advice.

---

## 0.1 WORKTREE ISOLATION (paste FIRST)

> **First action, before §0.2 and any stage. Non-negotiable.** Dedicated worktree, NEW branch off `main`
> (NOT the primary checkout on `feat/lever-impact-engine`; this feature is independent of #48):
> 1. If `root=$(git rev-parse --show-toplevel)` is the primary checkout, run:
>    `git worktree add ../firekaro-goal-readiness -b feat/readiness-verdict main` and run EVERY stage from
>    `../firekaro-goal-readiness`. Reuse it if it already exists (§0.2 makes re-runs idempotent).
> 2. Claim: `export GOAL_RUN_TOKEN=readiness-<short-nonce>` → write `.goal-active.lock` with it.
> 3. Release on exit (after last commit OR any halt): `rm -f "$(git rev-parse --show-toplevel)/.goal-active.lock"`.
> If `git worktree` is unavailable, note it and proceed — never run in the primary checkout.

## 0.2 PREFLIGHT (idempotency — run FIRST after §0.1)

> Read `docs/PROJECT-LOG.md` §2 + `git log --oneline -15`. Then grep before building:
> `ls src/lib/readiness.ts src/components/dashboard/ReadinessVerdictCard.vue src/pages/fire-goals/Readiness.vue`
> — if any exist, build only the missing delta (verify-only what's done). Record skips in the report.

---

## 1. Context you need (read first)

| Thing | Path | Why |
|---|---|---|
| The bridge math (DONE) | `src/lib/bridge.ts` — `computeBridgeCoverage(input): BridgeCoverage`, the `BridgeCoverage`/`UnlockEvent`/`BridgeIncome` interfaces | The verdict's data source. Read `BridgeCoverage` fully — it carries effective FIRE age, reachable vs locked corpus, liquidity-shortfall years, unlock timeline, and bridge income streams (EPS/gratuity/rental/NPS annuity). Do NOT recompute any of it. |
| Derive output | `src/lib/derive.ts` (~line 751 `bridgeCoverage:`, ~595 `effectiveFireAge`) + `src/lib/useFireDerive.ts` (`bridgeCoverage`, `fireWithdrawableCorpus`, `yearsToRegular`, ages) | The Pinia-aware accessors the page reads. Confirm the exact age fields (anchor/current age, target retirement age, plan-to age) by reading `useFireDerive`. |
| The existing breakdown card | `src/components/dashboard/BridgeBreakdownCard.vue` | REUSE its rendering of reachable/locked/shortfall/unlock-timeline — the verdict page composes the verdict ABOVE this breakdown, it does not re-implement it. Mount the existing card on the readiness page. |
| Routing + nav | `src/router/index.ts` (the `realRoute(...)` FIRE & Goals block ~line 79) + `src/layouts/SidebarNav.vue` | Add the `/fire-goals/readiness` route + a nav entry under FIRE & Goals. |
| Design system | `FireHero.vue`, `BridgeBreakdownCard.vue`, `.claude/rules/vue-component-conventions.md` + `vuetify-conventions.md` | Match the dashboard card chrome + the three-state render; reuse Vuetify defaults. |

**Gotchas:** real-frame (#20/#47) — all ages/years in the verdict are the SAME bridge-adjusted frame the
headline uses (reuse `fire.yearsToRegular` / `bridgeCoverage`, never a parallel computation; this is the
exact divergence class fixed in the #48 AccelerationCard, 526e100). Port 5175, demo localStorage. The
verdict is **decision-support, never advice** — "here's whether your plan supports stopping", never "you
should retire." **Rule 25 N/A** (read-only surface; no writes).

---

## 2. STAGE A — lib: the pure readiness classifier (TDD red-first)

**File(s):** `src/lib/readiness.ts` (create) + `src/lib/readiness.spec.ts` (create, red-first).

### Pre-made design decisions
1. `export function computeReadiness(input: { bridge: BridgeCoverage; currentAge: number;
   targetRetirementAge: number; }): ReadinessVerdict` — a PURE classifier over the existing bridge
   outputs (no new FIRE math). `ReadinessVerdict = { state; readyAtAge; bindingConstraint; gapYears; headline }`.
2. **States (honest, exhaustive):**
   - `"ready-now"` — the household can stop TODAY (corpus ≥ target AND the bridge runway covers the early
     years at the current age).
   - `"ready-at-age"` — not now, but the plan supports stopping at the bridge-effective FIRE age
     (`readyAtAge = bridge.effectiveFireAge`), with `gapYears = readyAtAge − currentAge`.
   - `"bridge-limited"` — corpus is sufficient but **early-years liquidity is the binding constraint**
     (the bridge pushes readiness later than the corpus-only date) → `bindingConstraint = "liquidity"`.
   - `"corpus-short"` — the corpus itself isn't there yet → `bindingConstraint = "corpus"`.
   - `"unplannable"` — no finite FIRE age (zero/absurd inputs) → honest empty state, never "ready".
3. Reuse the bridge's own reachability/age fields; classify, don't recompute. Guard non-finite ages
   (`Number.isFinite`) → `"unplannable"` (never a false "ready" on zero data — the gh-#39 class).
4. Keep pure (`.claude/rules/calculation-modules.md`); the `headline` string is built in the component,
   not here (lib returns data, not copy) — return the fields, let the card phrase them.

### Stage A acceptance
- Red-first specs across the 5 states using real seed personas (Mauryas/Iyers/Sharmas via `loadSeedPersona`/`loadIyersSeed`/`loadMauryasSeed` + `derive`/`useFireDerive` for the bridge) — at minimum: a corpus-rich-but-bridge-limited persona → `"bridge-limited"`; a still-accumulating persona → `"corpus-short"` with a finite `gapYears`; zero-data → `"unplannable"`.
- **`readyAtAge` MUST equal `bridge.effectiveFireAge`** and be coherent with `fire.yearsToRegular` (the #20 frame; same lesson as #48 526e100 — never more optimistic than the headline).
- **FinTech Domain Analyst** validates the state thresholds (especially: never report `"ready-now"` when the bridge has an early-years shortfall — the optimistic-honesty trap).
- Stage gate: static (§4) green; Rule 24/25 N/A (pure lib).

## 3. STAGE B — UI: the readiness page + verdict card (route + nav, Rule 24/26)

**File(s):** `src/components/dashboard/ReadinessVerdictCard.vue` (create) + `src/pages/fire-goals/Readiness.vue`
(create) + `src/router/index.ts` (add route) + `src/layouts/SidebarNav.vue` (add nav). **Keep untouched:**
`Dashboard.vue` (do NOT add the card there — keep this surface dedicated + parallel-safe).

### Pre-made design decisions
1. **Route:** `realRoute("/fire-goals/readiness", "fire-readiness", () => import("@/pages/fire-goals/Readiness.vue"))`
   in the FIRE & Goals block. **Nav:** add a "Can I retire?" entry under FIRE & Goals in `SidebarNav.vue`
   (match the existing entries' shape/icon convention — e.g. `mdi-flag-checkered`).
2. **`ReadinessVerdictCard.vue`:** reads `useFireDerive()` → `computeReadiness(...)`; renders a clear,
   honest verdict headline per state:
   - ready-now → "Your plan supports stopping now." (with the corpus + bridge confirmation)
   - ready-at-age → "Your plan supports stopping at age {{ readyAtAge }} — {{ gapYears }} years away."
   - bridge-limited → "Your corpus is there, but early-years liquidity sets your date — see the bridge below."
   - corpus-short → "Not yet — about {{ gapYears }} years to go at your current pace."
   - unplannable → honest empty/build-the-plan-first state (never "ready").
   Each verdict states the **binding constraint** + "what would move it" (close the bridge gap / grow the
   corpus). Decision-support framing, never advice. `data-testid="readiness-verdict"` + per-state testids.
3. **`Readiness.vue` page:** a `LeafPageHeader` ("Can I retire?") + the `ReadinessVerdictCard` + the
   EXISTING `BridgeBreakdownCard` below it (the supporting detail). Three-state render; guard all derives.
4. No new deps; reuse the design system; `<script setup lang="ts">`, typed.

### Stage B acceptance (Rule 24 + 26 MANDATORY)
- **Rule 24:** Playwright MCP on `/fire-goals/readiness` for ≥2 personas (a bridge-limited one + a
  corpus-short one — seed via the app, or note the seed path): navigate → screenshot → ARIA → console.
  The correct verdict for that persona is visible in screenshot AND ARIA; zero NEW console errors. Read
  the PNG. ≤3 iterations → `/fix-loop`.
- **Rule 26 (cross-page coherence):** the verdict's `readyAtAge`/years MUST match the FireHero headline
  (`anchorAge + yearsToRegular`, ±1) on the default lens — the #20/#47 real-frame coherence check (the
  exact class fixed in 526e100). Also confirm the verdict agrees with the BridgeBreakdownCard's shortfall.
- **Rule 25 N/A** (no write path — document it). **a11y:** `/a11y-audit` on the new route → zero Critical+Serious (or DEFERRED w/ reason).

---

## 4. Verification gates (operative)
> All 26 rules apply; **24 + 26 MANDATORY** (25 N/A). FinTech validates the readiness thresholds (rule 31 honesty — never a false "ready"). Independent **code-reviewer** (rule 29) before each builder commit.
**Static gates (worktree root):** `npm run type-check && npm run test:unit && npm run build` green per stage (banner `firekaro-mvp`; no root ESLint). **Parallel-run isolation (port):** this contract owns dev-server **port 5176** — start it with `npm run dev -- --port 5176 --strictPort` and navigate Playwright to `http://localhost:5176` (NOT 5175 — that is the tax-guard contract's port; `--strictPort` makes Vite fail rather than screenshot a neighbour's worktree). If the Playwright MCP browser is a single shared instance, run this Rule-24 phase when no sibling run is mid-screenshot. **Rule 15/17/20/23** as standard. **Failure budget:** per-task ≈15 → DEFER+continue; MCP hang → 3-cycle recovery → DEFER. Hard halt ONLY: npm install fail / contract contradiction / irrecoverable build / OS denial / missing token.

## 5. Commit + push (commit on branch, do NOT push, do NOT merge)
- **Branch** `feat/readiness-verdict` (off `main`). Abhay merges after review.
- **2 commits** (Stage A lib `feat(fire)`, Stage B UI `feat(fire)`/`feat(dashboard)`), atomic, Conventional Commits, Co-Authored-By trailer. Stage ONLY each stage's files (never `-A`); leave untracked items alone. Never `--no-verify`. Print branch + SHAs.
- **PARALLEL-SAFE NOTE:** this contract edits `src/router/index.ts` + `src/layouts/SidebarNav.vue`, SHARED with the sibling **decumulation-guardrails** contract. Add your route/nav line within the FIRE & Goals section; if both run in parallel the merge conflict is a trivial adjacent-line addition — resolve by keeping BOTH entries. No other file overlaps.

## 6. Definition of Done (all MUST be true)
- [ ] `computeReadiness()` pure classifier (5 honest states, never false-ready) + colocated spec.
- [ ] `ReadinessVerdictCard.vue` + `Readiness.vue` page at `/fire-goals/readiness` + nav entry; reuses BridgeBreakdownCard.
- [ ] type-check 0 · unit no regression (+ new specs) · build succeeds.
- [ ] FinTech validated thresholds (no false "ready-now"; readyAtAge == bridge.effectiveFireAge). code-reviewer APPROVE.
- [ ] Rule 24: verdict screenshot/ARIA/console pass on ≥2 personas; PNG read. Rule 26: readyAtAge matches the headline (±1). Rule 25 N/A (documented). a11y zero Critical+Serious (or DEFERRED).
- [ ] 2 commits on `feat/readiness-verdict` (NOT pushed/merged). Deferrals → `docs/goals/.run/2026-06-06-readiness-to-stop-verdict-DEFERRED.md`. `.goal-active.lock` removed.

## 7. Final report
Worktree + branch + SHAs; per-stage static; FinTech + code-reviewer verdicts; Rule 24 (per persona) + PNG paths; Rule 26 coherence result; §0.2 skips; DoD tally; DEFERRED; the `git merge feat/readiness-verdict` line for Abhay.

## 8. Guardrails
- `src/` only; no `server/`/`.claude/`/`5Wealths\`. **No new deps.** Reuse BridgeBreakdownCard + the design system; no recompute of the bridge.
- Honesty (rule 20/31): NEVER report ready when the bridge has a shortfall; the verdict is never more optimistic than the FireHero headline (the 526e100 lesson). Decision-support, never advice. Stop only on a true blocker.
- Do NOT also mount the card on `Dashboard.vue` (keep the surface dedicated + parallel-safe).

## Authorization trail
| # | Decision | Choice |
|---|---|---|
| 1 | Scope | A readiness VERDICT on top of the existing bridge math (obj-3); reuse BridgeBreakdownCard for detail. |
| 2 | Surface | Dedicated `/fire-goals/readiness` page + `ReadinessVerdictCard` + nav — NOT the dashboard (parallel-safe). |
| 3 | States | 5 honest states incl. bridge-limited + unplannable; never a false "ready" (rule 31). |
| 4 | Coherence | readyAtAge == bridge.effectiveFireAge, == FireHero headline (±1) — the #20/526e100 frame. |
| 5 | Handoff | Commit on branch off `main`, don't push/merge. |

## References
- `.claude/rules/claude-behavior.md` (15/17/20/23/24/25/26/29/31) · `output-plausibility-verification.md` · `calculation-modules.md` · `vue-component-conventions.md` · `vuetify-conventions.md` · `defensive-coding.md` · `financial-year-handling.md`
- `src/lib/bridge.ts`, `src/lib/derive.ts`, `src/lib/useFireDerive.ts`, `src/components/dashboard/BridgeBreakdownCard.vue`, `src/router/index.ts`, `src/layouts/SidebarNav.vue`, `src/components/income-layout/LeafPageHeader.vue`
- Skills/agents: `/fix-loop`, `/systematic-debugging`, `/a11y-audit`, `fintech-domain-analyst`, `code-reviewer-agent`
