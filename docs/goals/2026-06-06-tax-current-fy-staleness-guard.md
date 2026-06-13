# GOAL — Tax current-FY staleness guard (prod-visible honesty, obj-1 must-have)

**Type:** Autonomous **build** contract (run via `/goal`). Execute end-to-end with **zero user input**.
Every design decision is pre-made below — do not pause to ask; make the call the contract specifies and
keep going until the Definition of Done is fully met.

**Owner:** Abhay · **Created:** 2026-06-06 · **Scope:** `src/` ONLY — never `server/`, `.claude/`,
`docs/` (except the run's own DEFERRED file), or `D:\Abhay\VibeCoding\5Wealths\`.
**Invocation:** `/goal docs/goals/2026-06-06-tax-current-fy-staleness-guard.md`

---

## 0. Mission

Close the **one remaining accumulation-core honesty hole** (obj-1): the tax-config staleness guard is
**projection-horizon-only**. `getTaxConfigForFY` (`src/lib/tax.ts`) silently falls back to the newest
configured FY when an FY is unconfigured, and the only warning is **DEV-gated** (`import.meta.env.DEV`).
The prod-visible note (`fireProjectionTaxNote`) covers only *projections running past the newest FY* —
NOT the case where the **live current FY itself** goes unconfigured. `TAX_CONFIGS` ends at `2026-27`, so
from **~April 2027** every user's headline take-home / savings / FIRE-date silently computes on stale
`2026-27` slabs with **no prod-visible signal** — a calendar-triggered optimistic-or-wrong number (the
worst failure class for a FIRE planner). **Done = a prod-visible banner** that fires when the live
current FY is unconfigured (or the tax config is past its verified date), telling the user their tax
figures are estimates until the Budget update lands. Small, deterministic, honesty-critical. No new deps.

---

## 0.1 WORKTREE ISOLATION (paste FIRST)

> **First action, before §0.2 and any stage. Non-negotiable.** Run in a DEDICATED worktree on a NEW
> branch off `main` (NOT the user's primary checkout, which is live on `feat/lever-impact-engine`; and
> NOT off that branch — this feature is independent of #48):
> 1. `root=$(git rev-parse --show-toplevel)`. If `root` is the primary checkout (`…/firekaro-planner`),
>    run: `git worktree add ../firekaro-goal-taxstale -b feat/tax-fy-staleness-guard main` and execute
>    EVERY stage from `../firekaro-goal-taxstale`. If that worktree/branch already exists from a prior
>    run, reuse it (the §0.2 preflight makes re-runs idempotent).
> 2. Claim it: `export GOAL_RUN_TOKEN=taxstale-<short-nonce>` →
>    `printf '%s\n' "$GOAL_RUN_TOKEN" > "$(git rev-parse --show-toplevel)/.goal-active.lock"`.
> 3. Release on exit (after the last commit OR any halt): `rm -f "$(git rev-parse --show-toplevel)/.goal-active.lock"`.
> If `git worktree` is unavailable, note it and proceed — but NEVER run in the primary checkout.

## 0.2 PREFLIGHT (idempotency — paste, run FIRST after §0.1)

> A parallel session may have done part of this. Before building each item: read `docs/PROJECT-LOG.md`
> §2 + `git log --oneline -15`, then grep the code:
> - `grep -n "LAST_VERIFIED\|getCurrentFYTaxStaleness\|TaxStalenessBanner" src/lib/tax.ts src/components` —
>   if the helper / banner already exist, SKIP that stage (verify-only); build only the missing delta.
> Record every skip in the final report. NEVER rebuild what exists.

---

## 1. Context you need (read first)

| Thing | Path | Why |
|---|---|---|
| Tax config + coverage | `src/lib/tax.ts` — `TAX_CONFIGS`, `DEFAULT_FY` (="2026-27"), `getTaxConfigCoverage(fy)`, `getTaxConfigForFY(fy)` (the DEV-only-warn fallback at ~line 206), `isProjectedTaxStale`, `fireProjectionTaxNote` | Where the guard attaches. `getTaxConfigCoverage` already returns `{ isConfigured, isFutureUnconfigured, newestConfiguredFy, appliedFy }` — the single source of "is this FY configured" (gh-issue #19, no drift). REUSE it; do NOT add a parallel coverage check. |
| Current FY (wall-clock) | `src/lib/expense-history.ts` — `getCurrentFinancialYear(now = new Date())` | The live current FY. Inject `now` in specs (never the real clock). See `.claude/rules/financial-year-handling.md`. |
| The existing prod note pattern | `src/components/dashboard/FireProjectionChart.vue` (consumes `fireProjectionTaxNote`) | The precedent for a prod-visible tax-staleness note — mirror its honesty tone. THIS guard covers the *current FY*, the gap that note does NOT. |
| App shell (banner mount) | `src/layouts/SidebarLayout.vue` | The wrapper around every sidebar route — the banner mounts here so it shows app-wide. (Disjoint from the parallel readiness/drawdown contracts, which touch router + SidebarNav.) |
| Design system | `.claude/rules/vuetify-conventions.md` + existing `v-alert variant="tonal"` usages | The banner is a `v-alert` — reuse the global Vuetify defaults; no bespoke styling. |

**Gotchas:** the guard MUST be **prod-visible** — do NOT gate it on `import.meta.env.DEV` (that is the
exact bug). Port 5175, demo localStorage. The banner only shows when the current FY is unconfigured, so
TODAY (FY 2026-27, configured) it correctly does NOT render — verification must force a stale date (below).

---

## 2. STAGE A — lib: the prod-safe current-FY staleness signal (pure, TDD red-first)

**File(s):** `src/lib/tax.ts` (edit) + `src/lib/tax.spec.ts` (extend, red-first).

### Pre-made design decisions
1. Add `export const TAX_CONFIG_LAST_VERIFIED = "2026-06-06";` (the date the slabs were last checked
   against the latest Indian Budget) with a one-line comment: "bump this whenever TAX_CONFIGS is updated
   for a new Budget; the staleness guard reads it."
2. Add a PURE helper:
   ```ts
   export function getCurrentFYTaxStaleness(now: Date = new Date()): {
     stale: boolean; currentFy: string; newestConfiguredFy: string;
     reason: "ok" | "current-fy-unconfigured";
   }
   ```
   `currentFy = getCurrentFinancialYear(now)`; `cov = getTaxConfigCoverage(currentFy)`. **stale = true when
   `!cov.isConfigured`** (the live current FY has no slab config → silently using the nearest). Return
   `newestConfiguredFy = cov.newestConfiguredFy`, `reason` accordingly. Keep it pure; inject `now`.
3. Do NOT change `getTaxConfigForFY`'s fallback behaviour (least-wrong is correct, ADR-0003/gh-#6) — this
   stage only ADDS a detectable + prod-surfaceable signal. (You MAY also un-gate the existing DEV-only
   `console.warn` to a `logger`-free no-op or leave it; do not introduce a server logger into `src/`.)

### Stage A acceptance
- Red-first specs: `getCurrentFYTaxStaleness(new Date("2026-06-06"))` → `stale:false` (FY 2026-27 configured);
  `getCurrentFYTaxStaleness(new Date("2027-05-01"))` → `stale:true, reason:"current-fy-unconfigured",
  currentFy:"2027-28", newestConfiguredFy:"2026-27"` (the exact April-2027 footgun). Bound on the injected
  `now`, never the real clock.
- **FinTech Domain Analyst** confirms the staleness definition is correct (current FY unconfigured = the
  real honesty gap; the fallback direction is conservative-or-wrong, hence the estimate banner).
- Stage gate: static (§4) green. Rule 24/25 N/A (pure lib).

## 3. STAGE B — UI: the prod-visible staleness banner (Rule 24)

**File(s):** `src/components/shared/TaxStalenessBanner.vue` (create) + mount in
`src/layouts/SidebarLayout.vue` (edit: import + render at the top of the routed content area).
**Keep untouched:** the sidebar nav, router (the parallel contracts own those).

### Pre-made design decisions
1. `TaxStalenessBanner.vue`: `<script setup lang="ts">`; computes `s = getCurrentFYTaxStaleness()`;
   renders a `v-alert type="warning" variant="tonal"` **only when `s.stale`** (else nothing —
   `v-if="s.stale"`). `data-testid="tax-staleness-banner"`. Copy (decision-support, honest):
   "Tax slabs for **FY {{ s.currentFy }}** aren't loaded yet — your take-home, savings and FIRE figures
   currently use **FY {{ s.newestConfiguredFy }}** slabs and are estimates until the Budget update lands."
   Reuse Vuetify defaults; no bespoke styling beyond spacing.
2. Mount once in `SidebarLayout.vue` at the top of the content slot so it appears on every planner screen.
   It is **prod-visible** (no DEV gate). Not dismissible-persistent (no storage write) — it simply
   self-hides when the config is current. ⇒ **Rule 25 N/A** (no write path).
3. Defensive: guard the computed (`?.`, the helper always returns a value); three-state not needed (it is
   a single conditional banner).

### Stage B acceptance (Rule 24 — MANDATORY)
- Because the banner correctly does NOT render today (FY 2026-27 is configured), verify BOTH states:
  - **Stale state:** drive the browser with the clock forced past the newest FY. Use Playwright MCP
    `browser_evaluate` to confirm `getCurrentFYTaxStaleness(new Date("2027-05-01")).stale === true`, then
    verify the banner renders by temporarily importing the helper with that date in a throwaway probe OR
    (preferred) add a dev-only `?taxFyOverride=2027-28` query seam the banner reads in non-prod to force
    the stale render for screenshotting — if you add the seam, gate it `import.meta.env.DEV` and screenshot
    the banner (testid present in screenshot + ARIA + no NEW console errors).
  - **Healthy state (today):** navigate the dashboard; confirm the banner is ABSENT (correct) and the page
    is otherwise unchanged.
  - Iterate ≤3 → `/fix-loop`. Graceful degradation → surface "UI verification skipped because <reason>".
- **Rule 26:** confirm the banner's `currentFy`/`newestConfiguredFy` match `getCurrentFinancialYear()` +
  `getTaxConfigCoverage` (the single source) — no divergent copy.

---

## 4. Verification gates (operative for this run)

> All 26 rules in `.claude/rules/claude-behavior.md` apply. **Rules 24/26 MANDATORY** at each stage
> (25 N/A — no write path). FinTech validates Stage A's staleness definition (honesty/rule 31).

**Static gates (CWD = the dedicated worktree root):** `npm run type-check && npm run test:unit &&
npm run build` — all green before each stage commit (type-check banner: `firekaro-mvp`; no root ESLint).
**Parallel-run isolation (port):** this contract owns dev-server **port 5175**. Start it with
`npm run dev -- --port 5175 --strictPort` and navigate Playwright to `http://localhost:5175` — the
`--strictPort` makes Vite FAIL rather than silently bump to a busy-neighbour's port (which would
screenshot the wrong worktree). If 5175 is held by a parallel run, treat it as a contention signal and
retry after it frees. NOTE: if the Playwright MCP browser is a single shared instance across sessions,
the UI-verification steps still serialise on it — run this contract's Rule-24 phase when no sibling run
is mid-screenshot.
**Rule 15/17/20/23:** failures → the skills; root cause not band-aid; no fake data; finish the full DoD.
**Failure budget:** per-task ≈15 attempts → DEFER + continue; MCP hang → 3-cycle recovery → DEFER. Hard
halt ONLY: npm install fail / contract contradiction / irrecoverable build break / OS denial / missing token.

---

## 5. Commit + push (HANDOFF: commit on the branch, do NOT push, do NOT merge)

- **Branch** `feat/tax-fy-staleness-guard` (dedicated worktree). Abhay merges to `main` after review.
- **2 commits** (Stage A lib `feat(tax)`, Stage B UI `feat(tax)`/`feat(layout)`), atomic, Conventional
  Commits, Co-Authored-By: `Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Stage ONLY each stage's files (never `git add -A`); leave untracked items (e.g. `scripts/prod-cdp-sweep.mjs`)
  alone. **Do NOT push, do NOT merge.** Print branch + SHAs. Never `--no-verify`.

## 6. Definition of Done (all MUST be true)
- [ ] `TAX_CONFIG_LAST_VERIFIED` + `getCurrentFYTaxStaleness(now)` in `tax.ts` (pure, `now`-injectable).
- [ ] `TaxStalenessBanner.vue` mounted in `SidebarLayout.vue`, prod-visible, renders ONLY when the current FY is unconfigured.
- [ ] type-check 0 errors · unit no regression (+ the new red→green specs) · build succeeds.
- [ ] FinTech validated the staleness definition (no unaddressed HIGH).
- [ ] Rule 24: stale-state banner screenshot/ARIA/console pass; healthy-state (today) banner absent; PNG read.
- [ ] Rule 25 N/A (documented). Rule 26: banner copy matches the single FY-coverage source.
- [ ] 2 commits on `feat/tax-fy-staleness-guard` (NOT pushed, NOT merged). Deferrals (if any) in `docs/goals/.run/2026-06-06-tax-current-fy-staleness-guard-DEFERRED.md`. `.goal-active.lock` removed.

## 7. Final report
Worktree + branch + commit SHAs; per-stage static results; FinTech verdict; Rule 24 verdict (both states) + PNG paths; Rule 26 result; the §0.2 skipped list; DoD tally; any DEFERRED; the `git merge feat/tax-fy-staleness-guard` line for Abhay.

## 8. Guardrails
- `src/` only; never `server/`/`.claude/`/`5Wealths\`. **No new deps.** No design reinvention (reuse `v-alert`).
- **PROD-VISIBLE is the whole point** — never DEV-gate the banner itself (the dev-only force-render SEAM may be DEV-gated, the banner may not).
- Honesty (rule 20/31): the banner says "estimates", never hides the staleness. Stop only on a true blocker.
- Parallel-safe: this contract touches `tax.ts` + a new banner + `SidebarLayout.vue` — disjoint from the readiness/drawdown contracts (which own `router/index.ts` + `SidebarNav.vue`). No coordination needed.

## Authorization trail
| # | Decision | Choice |
|---|---|---|
| 1 | Scope | Prod-visible current-FY staleness guard only (the non-#6 half); fallback behaviour unchanged. |
| 2 | Signal | `getCurrentFYTaxStaleness(now)` reusing `getTaxConfigCoverage` (no parallel coverage logic). |
| 3 | Surface | A `v-alert` banner mounted in `SidebarLayout.vue` (app-wide), prod-visible, self-hiding. |
| 4 | Staleness def | current FY `!isConfigured` ⇒ stale (the April-2027 footgun). `TAX_CONFIG_LAST_VERIFIED` bumped on each Budget update. |
| 5 | Handoff | Commit on branch off `main`, don't push/merge (Abhay merges). |

## References
- `.claude/rules/claude-behavior.md` (15/17/20/23/24/25/26/31) · `.claude/rules/financial-year-handling.md` · `.claude/rules/indian-financial-context.md` · `.claude/rules/calculation-modules.md` · `.claude/rules/vuetify-conventions.md` · `.claude/rules/output-plausibility-verification.md`
- `src/lib/tax.ts`, `src/lib/expense-history.ts`, `src/components/dashboard/FireProjectionChart.vue`, `src/layouts/SidebarLayout.vue`
- Skills/agents: `/fix-loop`, `/systematic-debugging`, `fintech-domain-analyst`, `code-reviewer-agent`
