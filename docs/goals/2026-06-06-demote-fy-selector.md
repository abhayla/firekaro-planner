# GOAL — Demote the global Financial-Year selector (auto current FY + tax-screen-scoped picker)

**Type:** Autonomous refactor contract (run via `/goal`). Execute end-to-end with **zero user
input**. Every design decision is pre-made below — do not pause to ask; make the call the
contract specifies and keep going until the Definition of Done is fully met.

**Owner:** Abhay · **Created:** 2026-06-06 · **Scope:** `src/` (Vue planner SPA) ONLY — plus the
two SSOT docs named in Stage E. Never `server/`, `e2e/`, or `D:\Abhay\VibeCoding\5Wealths\`.
**Invocation:** `/goal docs/goals/2026-06-06-demote-fy-selector.md`

---

## 0. Mission

The global Financial-Year `<v-select>` in the app-bar header is **legacy tax-tracker cruft** — an
internal tax-config key (`ui.currentFY`) leaked into the UI as an every-screen control. It serves a
real need on exactly one screen (tax-planning regime comparison) yet sits in the header on all
screens, and worse, a user can flip it and silently recompute their **entire forward FIRE plan on an
old year's tax slabs**. This run **demotes** it:

1. **Remove** the FY selector from the app-bar header.
2. **Auto-derive** `ui.currentFY` from the wall clock (a new `getCurrentFinancialYear()` helper),
   so `derive()`, the salary/income forms, and nudges always use the *current* year's tax — no
   manual global pick.
3. **Add a page-local `selectedFY`** picker to the tax-planning screen only (current + next
   configured FY), which drives ONLY that screen's regime comparison and never mutates global state.

"Done" = the header carries no FY knob; the dashboard FIRE headline is computed on the auto current
FY and is unaffected by anything on the tax screen; the tax-planning page has its own working FY
picker; both trees green; UI verified; SSOT updated; commits pushed to `main`. **Production deploy is
OUT of scope (Abhay's gate).**

---

## 0.2 PREFLIGHT — idempotency · NO duplication (FIRST action, before any stage)

> **This is the first action of the run, before ANY stage. Non-negotiable.** A parallel session may
> already have implemented part of this. This contract must be **safe to run at any time without
> redoing finished work.** This repo has no formal coverage ledger, so the idempotency sources are
> **`git log` + the live code**:
>
> 1. `git log --oneline -20` — look for a matching `refactor(fy)…` / `feat(fy)…` commit or branch
>    `refactor/fy-selector-scope`. If present, this work may already be done.
> 2. For EACH stage below, grep/read the actual code before building:
>    - Stage A: does `src/lib/expense-history.ts` already export `getCurrentFinancialYear`?
>    - Stage B: is `src/stores/ui.ts` `currentFY` default already auto-derived (not the literal
>      `"2026-27"`), and is `setCurrentFY` already removed?
>    - Stage C: is the FY `<v-select>` already gone from `src/layouts/AppBar.vue`?
>    - Stage D: does `src/pages/tax-planning/Index.vue` already use a local `selectedFY` (no
>      `ui.currentFY` reads remain)?
>    - Stage E: is `.claude/rules/financial-year-handling.md` already rewritten?
>    If a stage is already implemented (confirm by reading, don't trust git alone), **SKIP its build
>    — do a verify-only pass** (run that stage's gate sweep) and move on. Build only the missing delta.
> 3. **Record every skip** in the final report's "skipped (already covered)" list.

---

## 1. Context you need (read first)

| Thing | Path / import | Why it matters |
|---|---|---|
| Existing FY-from-date helper | `src/lib/expense-history.ts` → `financialYearOf(date: Date)` | Reuse it — `getCurrentFinancialYear` wraps it. Do NOT duplicate the Apr–Mar logic. |
| Tax config + FY list | `src/lib/tax.ts` → `AVAILABLE_FYS` (`["2024-25","2025-26","2026-27"]`), `DEFAULT_FY`, `getTaxConfigForFY`, `getTaxConfigCoverage` | The tax-screen picker's options come from `AVAILABLE_FYS`. `getTaxConfigForFY` already falls back for unconfigured FYs — rely on it, don't reinvent. |
| UI store (the FY home) | `src/stores/ui.ts` → `currentFY` ref (default `"2026-27"`), `setCurrentFY` action, hydrate (line ~34), persist (line ~47/52) | The default + hydrate + persistence of `currentFY` change here. `setCurrentFY` has NO real app caller (only `ui.spec.ts`) → remove it. |
| The header | `src/layouts/AppBar.vue` (FY `<v-select>` lines ~142–150; `import { AVAILABLE_FYS } from "@/lib/tax"` line 6) | Delete the select + the now-unused import. KEEP the "Viewing as" member selector. |
| Tax-planning page | `src/pages/tax-planning/Index.vue` — **9** `ui.currentFY` reads (lines ~119, 122, 154, 163, 199, 200, 234, 332, 481) | Migrate every read to a page-local `selectedFY`. Line 481 is `<TaxCliffChart :fy="ui.currentFY" …>`. Header is `LeafPageHeader` (eyebrow at ~332) — the picker goes in its `#actions` slot. |
| FIRE engine (keep reading global) | `src/lib/derive.ts` (`getTaxConfigForFY(lens.currentFY)`), `src/lib/useFireDerive.ts` (`currentFY: ui.currentFY`) | These MUST keep reading `ui.currentFY` (= auto current). Do NOT point them at the tax-screen local ref. |
| Other current-FY consumers (keep as-is) | `src/components/forms/EarnerSalaryForm.vue`, `src/components/forms/OtherIncomeForm.vue` (label `FY {{ui.currentFY}}`), `src/components/dashboard/NudgeStack.vue`, `src/components/dashboard/LifecycleDigestCard.vue` | All correctly want the current FY → leave reading `ui.currentFY`. |
| Header component | `src/components/income-layout/LeafPageHeader.vue` → exposes `#actions` slot (per `SCREEN-STANDARD.md` §3) | Where the scoped FY picker mounts on the tax screen. |

**Gotchas:**
- **One app tree.** This extracted repo is NOT the old `mvp/`/`demo/` monorepo. Frontend = `src/`
  (Vite, **port 5175**); backend = `server/` (Hono, 3100). Persistence in demo mode = the storage
  adapter → `localStorage` (NOT a DB). Never `cd mvp`.
- **`ui.currentFY` is global and read by `derive()`** — that is exactly the muddle being removed. The
  tax-screen picker must use a **page-local ref**, never write `ui.currentFY`.
- **Legacy persisted `currentFY`.** Old localStorage `ui` blobs may pin a stale `currentFY` (e.g.
  `"2024-25"`). Hydrate MUST ignore/overwrite it with the auto current FY — a stale stored value must
  NOT override the wall-clock default (verify in Rule 25).
- `Date` is injectable: `getCurrentFinancialYear(now = new Date())` — the spec passes a fixed date
  (do NOT assert against the live clock).

---

## 2. STAGE A — `getCurrentFinancialYear()` helper (TDD, red-first)

**File(s):** `src/lib/expense-history.ts` (edit — add export), `src/lib/expense-history.spec.ts`
(edit — add cases). **Keep untouched:** the existing `financialYearOf` logic (reuse it).

### Pre-made design decisions (do NOT deviate)
1. Add `export function getCurrentFinancialYear(now: Date = new Date()): string { return financialYearOf(now); }` to `expense-history.ts`. Home it here next to `financialYearOf` — do NOT create a new catch-all module and do NOT duplicate the Apr–Mar math.
2. TDD red-first: write failing specs FIRST in `expense-history.spec.ts`:
   - `getCurrentFinancialYear(new Date("2025-06-15"))` → `"2025-26"` (mid-year).
   - `getCurrentFinancialYear(new Date("2025-02-10"))` → `"2024-25"` (Jan–Mar belongs to prior FY).
   - `getCurrentFinancialYear(new Date("2025-04-01"))` → `"2025-26"` (Apr boundary).
3. Then implement → green. No clamping in this helper (clamping to configured FYs is the tax-screen picker's job, Stage D).

### Stage A acceptance
- New specs fail before implementation, pass after (`npm run test:unit -- src/lib/expense-history.spec.ts`).
- `npm run type-check` clean. **Stage gate sweep:** static only (no UI in this stage → Rule 24/25 `skipped: no UI change`).

---

## 3. STAGE B — `ui.ts`: auto current FY + drop the global manual pick

**File(s):** `src/stores/ui.ts` (edit), `src/stores/ui.spec.ts` (edit). **Keep untouched:**
`isFamilyView`, `viewingMemberId`, `lifecycleSnapshot`, and their persistence.

### Pre-made design decisions (do NOT deviate)
1. Default: `const currentFY = ref(getCurrentFinancialYear());` (import from `@/lib/expense-history`) — replace the literal `"2026-27"`.
2. Hydrate: do **NOT** restore `currentFY` from the persisted blob. On every hydrate, `currentFY.value = getCurrentFinancialYear();` — a stale stored FY must never override the wall-clock current FY. (Migration-on-hydrate: silently ignore any legacy `parsed.currentFY`.)
3. Persistence: **remove `currentFY` from the persisted object** and from the `watch([...])` list — it is now derived, not user state. (Keep persisting `isFamilyView`, `viewingMemberId`, `lifecycleSnapshot`.)
4. **Remove the `setCurrentFY` action and its export** (no real app caller — confirmed only `ui.spec.ts` used it).
5. `currentFY` stays exported (read-only consumers: `derive`/`useFireDerive`/forms/nudges keep reading it).
6. Update `src/stores/ui.spec.ts`: delete the `setCurrentFY("2024-25")` persistence test and the legacy-hydrate `currentFY → "2025-26"` expectation; ADD a test that hydrating a blob containing a stale `currentFY: "2024-25"` yields `ui.currentFY === getCurrentFinancialYear()` (stale value ignored); keep the rest.

### Stage B acceptance
- `npm run type-check` + `npm run test:unit` clean (root). **Stage gate sweep:** static only (store change; UI verified in D). Rule 24/25 `skipped: no rendered change in this stage` (the rendered effect is verified in Stage C/D).

---

## 4. STAGE C — remove the global FY selector from the header

**File(s):** `src/layouts/AppBar.vue` (edit). **Keep untouched:** the "Viewing as"
member-lens `<v-select>` and everything else in the app bar.

### Pre-made design decisions (do NOT deviate)
1. Delete the FY `<v-select>` block (the one with `v-model="ui.currentFY"`, `:items="AVAILABLE_FYS"`, `label="FY"`, `prepend-inner-icon="mdi-calendar"`).
2. Remove the now-unused `import { AVAILABLE_FYS } from "@/lib/tax";` (and any other symbol it left orphaned — confirm with type-check).
3. Do NOT touch the member "Viewing as" selector — it is a legitimate cross-screen control.

### Stage C acceptance
- `npm run type-check` clean. **Stage gate sweep:** static → **Rule 24** on the dashboard (`/`) — the header shows the member lens but **NO FY dropdown**; screenshot + ARIA snapshot confirm absence; console clean.

---

## 5. STAGE D — tax-planning page-local FY picker

**File(s):** `src/pages/tax-planning/Index.vue` (edit). **Keep untouched:** the tax math
(`computeTax`, `recommendRegime`, marginal-relief helpers), `TaxCliffChart` itself.

### Pre-made design decisions (do NOT deviate)
1. Introduce a page-local ref: `const selectedFY = ref(defaultTaxFY());` where `defaultTaxFY()` = `currentFY` if it is in `AVAILABLE_FYS`, else the newest `AVAILABLE_FYS` entry. (Use `useUiStore().currentFY` only to seed the default, then never write back to it.)
2. Picker options = `AVAILABLE_FYS.filter(fy => fy >= ui.currentFY)`; if that is empty (current FY beyond all configured), options = `[newest AVAILABLE_FYS]`. This yields "current + next configured FY" for forward tax planning.
3. **Migrate all 9 `ui.currentFY` reads in this file to `selectedFY.value`** — lines ~119, 122, 154, 163, 199, 200, 234 (the `meta` string), 332 (the eyebrow `Tax Planning · FY {…}`), and 481 (`<TaxCliffChart :fy="selectedFY">`). After this, **zero `ui.currentFY` references remain in `Index.vue`** (grep to confirm).
4. Render the picker in the `LeafPageHeader` `#actions` slot: a compact `<v-select>` (`density="compact" hide-details prepend-inner-icon="mdi-calendar" label="Tax year"`), `v-model="selectedFY"`, `:items` = the option list from decision 2. Match the existing app `<v-select>` styling (compact, ~140px).
5. The picker writes ONLY `selectedFY` — it MUST NOT call any ui-store setter or mutate `ui.currentFY`. Switching it recomputes only this screen's regime comparison.

### Stage D acceptance
- `grep -n "ui.currentFY" src/pages/tax-planning/Index.vue` → **no matches**.
- `npm run type-check` + `npm run test:unit` clean (root). **Stage gate sweep:** static → **Rule 24** on `/tax-planning` (picker visible in header, regime comparison renders) → **Rule 26 cross-page** (see §6 — the decisive check: changing `selectedFY` on the tax screen changes the regime comparison/cliff chart there but leaves the dashboard FIRE headline UNCHANGED).

---

## 6. STAGE E — SSOT (rule 27) + screen-standard note

**File(s):** `.claude/rules/financial-year-handling.md` (rewrite the selector pattern),
`SCREEN-STANDARD.md` (one-line note if the header pattern is documented).

### Pre-made design decisions (do NOT deviate)
1. Rewrite `financial-year-handling.md`: REMOVE the global/per-page FY-selector + URL-synced-global-FY pattern (retired tracker heritage). DOCUMENT the new contract: (a) the *current FY* is auto-derived via `getCurrentFinancialYear()` and is NOT user-selectable globally; (b) `derive()`/forms/nudges always use the current FY; (c) manual FY selection exists ONLY on the tax-planning screen as a page-local `selectedFY` for regime comparison (current + next configured FY). Keep the `YYYY-YY` format + helper-function reference sections that are still accurate.
2. `SCREEN-STANDARD.md`: if the app-bar/header controls are described, add a one-line note that the header carries the member "Viewing as" lens but NOT a FY selector (FY is auto + tax-screen-scoped). If the header isn't documented there, skip (note "no change needed" in the report).

### Stage E acceptance
- Docs read back consistent with the shipped code (no claim the global FY selector exists). Static gates already green from prior stages. (Docs-only stage → Rule 24/25 `skipped: docs only`.)

---

## 7. Verification gates (standing rules — adapted to this repo, mandate intact)

> **All rules in `.claude/rules/claude-behavior.md` are operative.** Rules 24/25/26 are MANDATORY at
> every task AND stage boundary. This is a refactor with conditional UI gating (some stages are
> logic/docs-only) — gate per the diff; **Rule 26 always fires**.

### Conditional gating
| Rule | Trigger | On skip |
|---|---|---|
| **26** post-phase + cross-page sweep | ALWAYS fires | non-skippable |
| **24** UI screenshot verification | diff touches `*.vue` (Stages C, D) | commit note `rule 24 skipped: no UI change` (Stages A, B, E) |
| **25** UI→persistence | a UI write path changes | This run **removes** a persisted field; no new write path → Stage B records `rule 25: verify-removal` (below), elsewhere `rule 25 skipped: no write-path change` |

### Rule 24 (Stages C & D) — self-heal dev server (`npm run dev`, port 5175) if down; then per screen:
`mcp__playwright__browser_navigate` → `browser_take_screenshot` → `browser_snapshot` → `browser_console_messages`. PASS = (a) intended state visible in screenshot, (b) present in ARIA tree, (c) no NEW console errors. ≤3 iterations → `/fix-loop` → `/systematic-debugging`. MCP genuinely unavailable after self-heal + the §8 hang recovery → surface "UI verification skipped because <reason>" + mark `completed (deferred — Rule 24)`; never claim complete.
- **Dashboard `/`:** header shows member lens, **no FY dropdown**.
- **`/tax-planning`:** scoped FY picker visible in the `LeafPageHeader` actions; regime comparison renders.

### Rule 25 (adapted — verify the *removal*, persistence mechanism = storage adapter / localStorage):
Via `mcp__playwright__browser_evaluate`, read the persisted `ui` entry (the storage-adapter key per `src/lib/storage-adapter.ts`, demo userId) and confirm it **no longer contains `currentFY`**. Then seed a legacy blob containing `currentFY: "2024-25"`, reload, and confirm `ui.currentFY` resolves to `getCurrentFinancialYear()` (stale value ignored, not restored). Both signals pass = removal verified.

### Rule 26 (ALWAYS — the decisive cross-page check):
Drive MCP through this sequence and confirm the substance:
1. `/tax-planning` — note the regime-comparison numbers + cliff chart at the default `selectedFY`.
2. Change `selectedFY` to the other configured FY → the regime comparison / cliff chart **update**.
3. Navigate to `/` (dashboard) → the **FIRE headline number is unchanged** by step 2 (it is computed on auto `ui.currentFY`, independent of the tax screen's local ref). This is the proof the muddle is gone.
4. Confirm the `OtherIncomeForm`/any `FY {currentFY}` label still shows the auto current FY.
3 reconcile cycles → `/systematic-debugging` → else log DEFERRED with `Rule 26 stage drift`.

### Static gates (run from the stated CWD)
- Root tree: `npm run type-check && npm run test:unit && npm run build` (repo root).
- Server tree (run once at the end as a regression guard — this change shouldn't touch it): `cd server && npm run type-check && npm run lint && npm run test:unit`. Expect green/no-change.

### Rule 15/17/20/23 (verbatim)
- **15:** test fails → known retest → `/fix-loop`; unclear/2+ fails → `/systematic-debugging`. Never retry the same approach 3+ times.
- **17:** root cause, never a band-aid (e.g. if a consumer breaks, fix the migration, don't patch a symptom).
- **20:** no fabricated data; surface uncertainty as `**Assumption:** X`.
- **23:** autonomous run — work the full DoD; don't stop at a comfortable all-green waypoint. Context-budget anxiety is NOT a stop condition.

### Independent verification (rule 29) — before the final commit/merge
- Dispatch `code-reviewer-agent` on the full diff.
- Dispatch `fintech-domain-analyst`: the derive tax-lens input changes from "user-picked global FY" → "auto current FY". Validate the **FIRE headline stays persona-sane on the DEFAULT lens** (family-view off, no member selected) — i.e. the auto-current-FY path produces the same/expected headline a current-year accumulator should see.
- Act on every blocker/HIGH before merge; track deferred-but-real findings as a GitHub Issue.

---

## 8. Failure-recovery budgets
- **Per-task fix budget:** ~15 attempts (≈5 inline → `/fix-loop` → `/systematic-debugging`) → then DEFER the task and continue; do NOT halt the whole run.
- **MCP browser hang recovery (autonomous):** 3 cycles — (1) wait 10s + retry; (2) `browser_close` + re-navigate; (3) kill the captured dev-server PID + restart + retry. All 3 fail → log DEFERRED + `completed (deferred)` + continue.
- **Hard halts ONLY:** `npm install` failure; a decision contradiction in this contract; irrecoverable build break after the full budget; OS permission denial; missing required token. Context-budget anxiety is NOT a halt — hand off via a one-line continuation note, never fake-complete.

---

## 9. Commit + push
Branch **`refactor/fy-selector-scope`** off `main`. Atomic conventional commits (one per stage, or
sensibly grouped); **name files explicitly — NEVER `git add -A`** (the working tree has an unrelated
untracked `scripts/prod-cdp-sweep.mjs` — do NOT stage it). Suggested commits:
1. `test(fire): add getCurrentFinancialYear helper (red-first)` + `feat(fire): getCurrentFinancialYear from wall-clock` (Stage A).
2. `refactor(fy): auto-derive ui.currentFY, drop global manual pick + setCurrentFY` (Stage B).
3. `refactor(fy): remove global FY selector from app-bar header` (Stage C).
4. `refactor(fy): page-local tax-year picker on tax-planning, stop mutating global FY` (Stage D).
5. `docs(fy): rewrite financial-year-handling SSOT for auto-current + tax-scoped FY` (Stage E).

End commit messages with the Co-Authored-By trailer the harness specifies. Run the §7 gate before
merge. **Merge `--no-ff` to `main`, then `git push origin main`.** **Do NOT deploy / touch DNS /
touch the VPS** — production stays on the current build (Abhay's gate).

---

## 10. Definition of Done (all MUST be true)

**Build / change:**
- [ ] `getCurrentFinancialYear()` exists in `expense-history.ts` with passing specs.
- [ ] `ui.currentFY` is auto-derived; not persisted; `setCurrentFY` removed; `ui.spec.ts` updated + green.
- [ ] FY `<v-select>` gone from `AppBar.vue`; orphaned `AVAILABLE_FYS` import removed.
- [ ] `src/pages/tax-planning/Index.vue` uses page-local `selectedFY`; **zero `ui.currentFY` reads remain**; picker in `LeafPageHeader #actions`.
- [ ] `financial-year-handling.md` rewritten; `SCREEN-STANDARD.md` noted (or "no change" recorded).

**Static gates:**
- [ ] Root: type-check 0 errors · unit no regression · build succeeds. Server tree: type-check + lint + unit green (no change).

**Rule 24 (per UI screen):**
- [ ] Dashboard `/` — header has member lens, NO FY dropdown (screenshot + ARIA + console clean).
- [ ] `/tax-planning` — scoped FY picker present; regime comparison renders (screenshot + ARIA + console clean).

**Rule 25 (removal verification):**
- [ ] Persisted `ui` entry no longer contains `currentFY`; a legacy stored `currentFY` is ignored → `ui.currentFY` resolves to the auto current FY.

**Rule 26 (cross-page — the decisive proof):**
- [ ] Changing `selectedFY` on `/tax-planning` updates that screen ONLY; the dashboard FIRE headline is unchanged (computed on auto current FY).

**Independent verification:**
- [ ] `code-reviewer-agent` + `fintech-domain-analyst` run; no unaddressed blocker/HIGH; FIRE headline persona-sane on the default lens.

**Ship:**
- [ ] 5± conventional commits on `refactor/fy-selector-scope`, merged `--no-ff` to `main`, pushed to `origin`. **No deploy.**
- [ ] Any deferrals logged in `docs/goals/.run/2026-06-06-demote-fy-selector-DEFERRED.md` with rule status + reason.

---

## 11. Final report (required on completion)
Commit SHAs + per-stage gate results; Rule 24 verdict per screen + PNG paths; Rule 25 removal-verification result; Rule 26 cross-page result (the tax-screen-vs-dashboard independence proof); independent-review verdicts (code-reviewer + fintech-domain-analyst); DoD green/amber/red tally; "skipped (already covered)" list from the §0.2 preflight; any DEFERRED entries with rule status + reason.

---

## 12. Guardrails (hard stops)
- **`src/` only** (+ the two named SSOT docs). Never `server/`, `e2e/`, `demo/`, or `D:\Abhay\VibeCoding\5Wealths\`.
- **No new dependencies.**
- **No design reinvention** — reuse `LeafPageHeader #actions`, the existing `<v-select>` styling, `financialYearOf`, `AVAILABLE_FYS`, `getTaxConfigForFY`. Extend, don't inline a new pattern.
- **Do NOT repoint `derive()`/`useFireDerive`/forms/nudges** at the tax-screen local ref — they MUST keep reading the auto-current `ui.currentFY`.
- **Honesty (rule 20):** no synthetic data; surface uncertainty as `**Assumption:** X`.
- **No production deploy / DNS / VPS** — Abhay's gate.
- **Out of scope:** the Tier-0 tax-config staleness guard (the `DEFAULT_FY`-hardcode / wall-clock-drift CI trip-wire) is a SEPARATE item — do not build it here. If you touch `DEFAULT_FY`, leave its staleness behavior alone.
- **Strategic items → `TODO(5W):` notes**, not handled here.

---

## Authorization trail

| # | Decision | Choice |
|---|---|---|
| 1 | Remove vs demote the FY selector | **Demote** — remove from global header, keep a scoped picker on tax-planning |
| 2 | Tax-screen picker writes global or local state | **Page-local `selectedFY`** — never mutates `ui.currentFY` (removes the FIRE-plan muddle) |
| 3 | How is current FY determined | **Auto from wall-clock** via new `getCurrentFinancialYear()`; not user-selectable globally |
| 4 | Home for the new helper | `src/lib/expense-history.ts` (next to `financialYearOf`); no new catch-all module, no dup logic |
| 5 | `ui.currentFY` persistence | **Stop persisting it** (now derived); hydrate always recomputes; ignore legacy stored value |
| 6 | `setCurrentFY` action | **Remove** (no real app caller — only `ui.spec.ts`) |
| 7 | Tax-screen picker options | `AVAILABLE_FYS` filtered to `>= current FY` (current + next configured); fallback `[newest]` |
| 8 | Picker placement | `LeafPageHeader #actions` slot on `/tax-planning` |
| 9 | derive()/forms/nudges FY source | **Keep reading auto-current `ui.currentFY`** (unchanged) |
| 10 | Tier-0 staleness guard | **Out of scope** — separate item |
| 11 | Production deploy | **Out of scope** — Abhay's gate; land on `main` + CI only |

---

## References (loaded transitively)
- `.claude/rules/claude-behavior.md` — rules 15, 17, 20, 23, 24, 25, 26, 27, 29, 31, 32
- `.claude/rules/tdd-rule.md` — red-green-refactor (Stage A)
- `.claude/rules/financial-year-handling.md` — the SSOT this run rewrites (Stage E)
- `.claude/rules/pinia-store-conventions.md` — `ref()` state, migration-on-hydrate, persist-via-adapter (Stage B)
- `.claude/rules/vuetify-conventions.md` + `SCREEN-STANDARD.md` — `<v-select>` styling, `LeafPageHeader` (Stage C/D)
- `.claude/rules/vue-component-conventions.md` — `<script setup>`, defensive computed
- `src/lib/storage-adapter.ts` — the localStorage key shape for the Rule 25 round-trip
- `.claude/rules/operating-model.md` + `.claude/rules/orchestrator-output-validation.md` — the verification edge
- Skills this contract drives: `/fix-loop`, `/systematic-debugging`, `code-reviewer-agent`, `fintech-domain-analyst`
