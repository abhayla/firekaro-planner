# GOAL — Fix low-contrast / washed-out tooltips (InfoTip + all `v-tooltip` overlays) — GitHub #77

**Type:** Autonomous fix-loop contract (run via `/goal`). Execute end-to-end with **zero user
input**. Every design decision is pre-made below — do not pause to ask; make the call the contract
specifies and keep going until the Definition of Done is fully met.

**Owner:** Abhay · **Created:** 2026-06-09 · **Scope:** `src/` ONLY (3 files; demo/localStorage mode)
**Closes:** GitHub issue #77 · **Invocation:** `/goal docs/goals/2026-06-09-fix-tooltip-contrast.md`

---

## 0. Mission

The explanatory info-tooltips render **washed-out / low-contrast**: `src/components/shared/InfoTip.vue`
uses a bare Vuetify `<v-tooltip>` with **no custom theming**, so it inherits Vuetify's translucent
default chip + 12px (`text-caption`) body — the busy financial page bleeds through and the jargon
explanation (e.g. "Required corpus" on `/fire-goals/what-if`) is hard to read. This defeats the
tooltips' one job: explain FIRE jargon to the urban-salaried accumulator who is new to FIRE
(objective 1 "honest + understandable number" + objective 0 setup), and it is a WCAG-AA contrast
concern. **Done =** every `v-tooltip` in the app renders on a **solid, opaque, high-contrast surface**
(slate-900 per `chart-theme-system.md`) with the InfoTip body bumped to `text-body-2`, text contrast
verified **≥ WCAG AA 4.5:1**, the four tooltip surfaces visually confirmed in-browser, a regression
lock added, and #77 closed. This is a **CSS/markup-only** fix — no data, no math, no write path.

**Type:** fix-loop (root-cause a rendered-style defect, lock it, verify in-browser). Red-first applies
to the regression lock (assert the default is wired before it exists).

---

## 0.1 WORKTREE ISOLATION

> **First action of the run, before §0.2 and any stage. Non-negotiable.** This run MUST execute in a
> **dedicated git worktree**, never the user's primary interactive checkout.
>
> 1. **Isolate:** `root=$(git rev-parse --show-toplevel)`. If `root` is the user's **primary
>    interactive checkout** (`…/firekaro-planner`) rather than an already-dedicated `…/firekaro-goal-*`
>    worktree, **create and switch to a dedicated worktree before any stage**:
>    `git worktree add ../firekaro-goal-fix-tooltip-contrast -b fix/tooltip-contrast` and run every
>    stage from there. NEVER run a multi-commit build in the user's primary worktree.
> 2. **Claim it:** export a unique `GOAL_RUN_TOKEN` for this run (e.g. `fix-tooltip-contrast-<nonce>`)
>    and write the lock: `printf '%s\n' "$GOAL_RUN_TOKEN" > "$(git rev-parse --show-toplevel)/.goal-active.lock"`.
>    The repo's `.githooks/pre-commit` HARD-BLOCKS any commit whose `GOAL_RUN_TOKEN` ≠ this lock — so a
>    concurrent interactive session physically cannot commit into this run's worktree.
> 3. **Release on exit:** the run's FINAL action (after merge/push, OR on any halt/defer) MUST remove
>    the lock: `rm -f "$(git rev-parse --show-toplevel)/.goal-active.lock"`. `.goal-active.lock` is
>    gitignored. If `git worktree` is genuinely unavailable, note it and proceed — but still NEVER run
>    in the user's primary interactive checkout.
> 4. **Self-cleanup ON SUCCESS ONLY:** after the branch is merged `--no-ff` → `main` AND pushed AND the
>    lock is released, the run's last shell step `cd`s to the **primary repo root** (you cannot
>    `git worktree remove` the worktree you stand in) and runs:
>    `cd <primary-root> && git worktree remove --force ../firekaro-goal-fix-tooltip-contrast ; git branch -D fix/tooltip-contrast ; git worktree prune`.
>    The branch is safe to `-D` because every commit is now in `main`. **On Windows, `git worktree
>    remove` may print `Invalid argument` while it still de-registers the worktree — that is fine;
>    `git worktree prune` finalises it.** **DEFER/HALT is the opposite: do NOT remove the worktree or
>    delete the branch** — they are needed to resume (only the lock is released).

---

## 0.2 PREFLIGHT — idempotency · NO duplication (run FIRST, before any stage)

> **This is the first action of the run, before ANY stage. Non-negotiable.** A parallel session may
> already have done part of this. This contract must be **safe to run at any time without redoing
> finished work.** There is no formal coverage ledger for this fix — the ledger IS issue #77 + the
> code + `git log`. Check all three before building:
>
> 1. **Issue state:** `gh issue view 77` — if already CLOSED, do a verify-only pass (confirm the fix is
>    live in code per the checks below) and STOP without rebuilding; report "already closed".
> 2. **Code, per file (grep/read — don't trust assumptions):**
>    - `src/plugins/vuetify.ts` — does `defaults` already contain `VTooltip:`? If yes with
>      `contentClass: "fk-tooltip"`, that piece is DONE — verify-only.
>    - `src/styles/tokens.css` — does a `.fk-tooltip` rule already exist? If yes, DONE — verify-only.
>    - `src/components/shared/InfoTip.vue` — is the body already `text-body-2` (not `text-caption`)? If
>      yes, DONE — verify-only.
>    - The regression spec `src/regression/tooltip-contrast.spec.ts` — exists already? If yes, run it.
>    - `git log --oneline -20` — scan for a matching `fix(design-system): …tooltip…` / `#77` commit.
> 3. **Build only the missing delta.** Record every skip in the final report's "skipped (already
>    covered)" list. If all three files + the spec are already in place and green, the run's only job
>    is to verify (Rules 24/32/29/33) and close #77.

---

## 0.3 PROGRESS LOG — live, cross-session-trackable

> **Maintain an append-only progress log for the entire run. Update it BEFORE moving on from each
> stage/event — so a crash or context-out leaves it current.**
>
> 1. **Location:** `docs/goals/.run/fix-tooltip-contrast-PROGRESS.md` (in THIS run's worktree). `.run/`
>    is gitignored → no commit churn, no cross-run conflicts. Read cross-session via the worktree path
>    (`git worktree list` → read each `<worktree>/docs/goals/.run/*-PROGRESS.md`). Its sibling
>    `fix-tooltip-contrast-DEFERRED.md` (the deferrals log) lives in the same `.run/` dir.
> 2. **First log line (right after §0.1/§0.2):** slug · branch · worktree · start time · contract path ·
>    one-line mission.
> 3. **Append a SHORT entry (≤2 lines) at each of:** stage start; stage done (with gate result); every
>    MAJOR DEFECT; every "something not working" EVENT **+ what you did**; each independent-review
>    outcome (concur / dissent); each DEFER or skip; each blocker / halt; the final result. Terse — a
>    heartbeat + learning trail, never a transcript.
> 4. **Entry format:** `[YYYY-MM-DD HH:MM] <STAGE|PROGRESS|DEFECT|EVENT|DECISION|RECOVERY|BLOCKER|DONE> — <≤2-line summary>` (time via `date "+%Y-%m-%d %H:%M"`).
> 5. **At run-end, DERIVE learnings and route by scope** (self-improvement fold-back): AUTO-append each
>    notable error→fix→lesson (with a gate-gap line, after a dedup grep) to `.claude/tasks/lessons.md`;
>    PROPOSE (never auto) the rest in the committed final report's **"LEARNINGS TO FOLD BACK"** section,
>    one canonical home each (GENERIC → skill/process rule; PRODUCT-SPECIFIC class → product rule;
>    single-goal → this contract; prefer a deterministic gate over prose). The run NEVER edits its own
>    contract/skill/rule — it only proposes.
> 6. **Run-end SUMMARY** in the FINAL PROGRESS.md entry AND the committed final report — a roll-up:
>    **DONE** (verified-green stages) · **PENDING** (DEFERRED entries + one-line reason) · **BLOCKED**
>    (Abhay-gated subset + why) · **NEXT** (single next action + gate owner). Scannable, not a transcript.

---

## 1. Context you need (read first)

| Thing | Path / import | Why it matters |
|---|---|---|
| **The defect component** | `src/components/shared/InfoTip.vue` | Bare `<v-tooltip location="top" max-width="320">`; body wrapper is `class="text-caption"` (line 45) + formula `text-caption` (line 48). No surface theming → inherits Vuetify's translucent default. **Reported screen surfaces this.** |
| **Global Vuetify defaults** | `src/plugins/vuetify.ts` (the `defaults: {}` block, lines 46-62) | Has NO `VTooltip` default today. This is where the global `contentClass` is wired. **Light-only theme — dark mode removed (line 5); do NOT add dark-mode handling or dark verification.** |
| **Global stylesheet** | `src/styles/tokens.css` | Globally imported via `src/main.ts:15` (so a rule here applies app-wide, unscoped). Home for the `.fk-tooltip` surface rule. Holds the `--radius-*` / `--focus-ring-*` design tokens InfoTip already uses. |
| **The design standard** | `.claude/rules/chart-theme-system.md` ("Tooltip Styling") | Mandates **solid dark slate-900 (`#1e293b`) tooltips, `borderRadius: 8`, 12px padding** for charts. The text tooltips must match this — it is the SSOT for the surface values. |
| **The other 3 `v-tooltip` users (issue audit MISSED 2)** | `src/components/shared/DiscoveryFooter.vue`, `src/components/shared/MemberLensBadge.vue`, `src/components/shared/WholeHouseholdBadge.vue` | All render a `v-tooltip`. A global default fixes all 3 for free (no per-component edit). MemberLensBadge + WholeHouseholdBadge are NOT named in #77 — confirm them in verification. |
| **Glossary (InfoTip data source)** | `src/lib/glossary.ts` (`TERM_GLOSSARY`) | The label/explanation/formula the tooltip shows. Not modified — context only. |

**Gotchas:**
- The app is **light-theme only** (`vuetify.ts:5`). Ignore the issue's "verify light + dark" line — there is no dark mode. Verify the single light theme only.
- A Vuetify `<v-tooltip>`'s content element is `.v-overlay__content`; a `contentClass` default lands on THAT element, so the CSS rule targets `.fk-tooltip` directly (it IS the content surface).
- **Chart.js tooltips are canvas-rendered, NOT `v-tooltip`** — a global `VTooltip` default does NOT touch them (they already have their own slate-900 theme). The only `v-tooltip` users in the app are the 4 shared components above.
- Tooltips appear **on hover/click of the activator** — verification MUST hover/click the InfoTip `button.info-tip__btn` (or each badge) to OPEN the tooltip before screenshotting (Rule 32 interaction is what makes it visible).
- Persistence mode: **demo / localStorage (default)**. This is a pure style change — **no write path, no API, no math** → Rule 25 and the API behavioral test and `fintech-domain-analyst` all SKIP (record the skip reason in the commit).

---

## 2. STAGE A — global opaque tooltip surface + InfoTip text bump + regression lock

**File(s):** `src/plugins/vuetify.ts` (edit), `src/styles/tokens.css` (edit), `src/components/shared/InfoTip.vue` (edit), `src/regression/tooltip-contrast.spec.ts` (create). **Keep untouched:** `src/lib/glossary.ts`, the 3 badge/footer components (they inherit the surface — do NOT edit them), every other file.

### Pre-made design decisions (do NOT deviate)

1. **Approach = centralized (Q1 → A).** Add one default to `src/plugins/vuetify.ts` `defaults`:
   `VTooltip: { contentClass: "fk-tooltip" }`. Do NOT add per-component `content-class` props. This
   covers all 4 `v-tooltip` users (InfoTip, DiscoveryFooter, MemberLensBadge, WholeHouseholdBadge) and
   any future one.
2. **Surface = the chart-theme standard, in `src/styles/tokens.css`** as a global (unscoped) rule:
   ```css
   /* High-contrast tooltip surface — matches chart-theme-system.md (slate-900). Wired via
      VTooltip { contentClass: "fk-tooltip" } in plugins/vuetify.ts. Fixes #77 wash-out. */
   .v-overlay__content.fk-tooltip {
     background: #1e293b;            /* slate-900 — opaque, no bleed-through */
     color: #ffffff;                 /* contrast vs slate-900 ≈ 14.8:1 (WCAG AAA) */
     border-radius: 8px;             /* chart-theme borderRadius */
     padding: 12px;                  /* chart-theme padding */
     opacity: 1 !important;          /* override Vuetify's translucent default */
     box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);  /* lift off the busy page */
   }
   ```
   (Target `.v-overlay__content.fk-tooltip` — Vuetify applies `contentClass` to the overlay content
   element; the `opacity: 1 !important` is what kills the wash-out. Confirm the rendered element's
   class list in-browser and adjust the selector to whatever Vuetify actually applies if it differs;
   the REQUIREMENT is an opaque slate-900 surface, not the exact selector.)
3. **InfoTip text bump (Q2 → A).** In `src/components/shared/InfoTip.vue`, change the body wrapper from
   `class="text-caption"` → `class="text-body-2"` (the explanation is now ~14px). Keep the bold label
   (`font-weight-bold mb-1`). Bump the formula line `text-caption` → `text-body-2` too (keep
   `font-italic`). Do NOT change the icon size, the activator button, the glossary, or any prop API.
4. **Badges/footer = surface only.** DiscoveryFooter, MemberLensBadge, WholeHouseholdBadge get the new
   opaque surface automatically via the global default — make NO edits to them, no text change (their
   labels are short).
5. **Light theme only.** No dark-mode CSS, no `prefers-color-scheme`, no theme-conditional surface —
   the app is single-light-theme (`vuetify.ts:5`).
6. **Regression lock (red-first).** Create `src/regression/tooltip-contrast.spec.ts` (Vitest, sibling
   to the existing `src/regression/*.spec.ts` precedent named in `vuetify-conventions.md`) that:
   (a) imports the Vuetify instance / its config and asserts `defaults.VTooltip.contentClass === "fk-tooltip"`;
   (b) reads `src/styles/tokens.css` as text and asserts a `.fk-tooltip` rule with `background: #1e293b`
   and `opacity: 1` is present; (c) reads `InfoTip.vue` as text and asserts the body wrapper is
   `text-body-2` (no `text-caption` on the explanation/formula). Write it **failing first** (it will be
   red before the edits land), then make it green. These are static-content assertions — no DOM render
   needed — so they run inside `npm run test:unit`.

### Stage A acceptance (run the §3 gate sweep before committing)
- `defaults.VTooltip.contentClass === "fk-tooltip"` in `vuetify.ts`; `.fk-tooltip` slate-900 opaque rule
  in `tokens.css`; InfoTip body + formula are `text-body-2`; regression spec green.
- **Stage gate sweep (gate by blast radius — UI-only, no write path / no API / no math):** static
  (root `npm run type-check && npm run test:unit`) → **Rule 24** (render) → **Rule 32** (tooltip opens
  on hover/click + is readable) → **Rule 29** (independent code review; **NO** `fintech-domain-analyst`
  — no math) → **Rule 26** (all 4 tooltip surfaces consistent) → **Rule 33** (blind re-verify the
  tooltip screenshots) → **a11y contrast** (compute/confirm text-vs-surface ≥ 4.5:1). **SKIP with
  reason:** Rule 25 (`no write-path change`), API behavioral test (`no server/API change`), Rule 31
  (`no user-facing value` — pure style), `fintech-domain-analyst` (`no math`). All green or
  DEFERRED-with-reason before the commit.

---

## 3. Verification gates (standing rules — adapted to `src/`, demo/localStorage mode, UI-only)

> **All rules in `.claude/rules/claude-behavior.md` are operative for this run.** Rules **24, 26, 29,
> 32, 33 are MANDATORY** here; **25, 31, the API behavioral test, and `fintech-domain-analyst` SKIP**
> (no write path, no user-facing value, no server/API change, no math — record the skip reason in the
> commit message). Test PLACEMENT follows `.claude/rules/testing-strategy.md`. This is a UI-only,
> demo-mode change — every check below runs against the local dev server at `http://localhost:5175`.

### Rule 24 — UI render verification (per tooltip surface, MANDATORY)
Self-heal first: if the dev server isn't up, start `npm run dev` once in the background (capture the
PID), wait for `:5175`, then drive Playwright MCP. For each of the **4** tooltip surfaces below:
`mcp__playwright__browser_navigate` → the route → **hover/click the activator to OPEN the tooltip** →
`browser_take_screenshot` (the OPEN tooltip visible) → `browser_snapshot` (ARIA) → `browser_console_messages`.
**Pass (all 3):** (a) the tooltip renders on a **solid dark opaque** surface with clearly legible light
text — no page bleed-through — in the screenshot; (b) the tooltip content is present in the ARIA tree;
(c) no NEW console errors/warnings from this change. The surfaces + how to open each tooltip:
- `/fire-goals/what-if` — the "Required corpus" InfoTip (the originally-reported one). **Primary proof.**
- `/` (dashboard) — `FireHero.vue` InfoTip.
- `/financial-health` — `HealthScore.vue` InfoTip.
- Any screen rendering `MemberLensBadge` / `WholeHouseholdBadge` / `DiscoveryFooter` (the lensed
  dashboard / overview shows the badges) — confirm those `v-tooltip`s also got the opaque surface (the
  2 the issue missed). If a badge isn't reachable in demo mode, note it and rely on the global-default
  proof (same `contentClass` path).
Iterate ≤3 per surface → `/fix-loop` → `/systematic-debugging`. MCP genuinely unavailable after
self-heal + the 3-cycle hang recovery → surface "UI verification skipped because <reason>" + mark
`completed (deferred — Rule 24)`; never claim complete.

### Rule 32 — interactive functionality (MANDATORY)
The tooltip is an interactive overlay — Rule 24's "open the tooltip" step IS the Rule 32 interaction:
confirm hovering/clicking the activator **opens** the tooltip and the content is readable, and (where
present) the activator's focus-visible ring still works (`info-tip__btn:focus-visible`). No NEW console
error on open/close.

### Rule 26 — cross-surface consistency (MANDATORY, always fires)
After Stage A is otherwise green, independently confirm **all 4** `v-tooltip` users render the SAME new
opaque surface (one global default → they must be identical). Drive MCP to each, open the tooltip,
compare. Any surface still translucent = the global default didn't reach it → root-cause (wrong
selector / Vuetify applied a different class) before marking green. 3 reconcile cycles →
`/systematic-debugging`; still unresolved → log to `…-DEFERRED.md` with `Rule 26 surface drift`.

### Rule 29 — independent code review (MANDATORY for the diff)
After Stage A is green, dispatch `code-reviewer-agent` (adversarial) on the diff. **Do NOT dispatch
`fintech-domain-analyst`** — no math touched. Act on every blocker/HIGH before commit; file
deferred-but-real findings as Issues. The run is never the sole verifier of its own code.

### a11y contrast (MANDATORY — the WCAG-AA half of #77)
Compute/confirm the chosen text-vs-surface ratio meets **WCAG AA ≥ 4.5:1**: `#ffffff` on `#1e293b`
≈ **14.8:1** (passes AAA). State the computed ratio in the report. axe-core may not catch a transient
tooltip, so this is an explicit manual computation against the chosen colors, not only an `/a11y-audit`
scan. (Run `/a11y-audit` on `/fire-goals/what-if` opportunistically for the surrounding page, but the
tooltip-contrast proof is the manual computation.)

### Rule 33 — blind independent test verification (MANDATORY)
Any verdict this run produces (the Rule 24/26 tooltip screenshots) MUST be re-checked by a SEPARATE,
context-blind agent given the SAME raw evidence (screenshot/ARIA/console paths) — NOT this run's
conclusions. It judges coverage (all 4 surfaces opened + shown — substance) AND verdict-correctness
(do the screenshots actually show an opaque legible surface — plausibility), adversarially. Reconcile
any dissent before reporting done. **Evidence-handoff gotcha:** Playwright MCP writes screenshots to
the **primary-worktree root's `.playwright-mcp/`, NOT the goal worktree** — copy/absolute-path them
into the goal worktree's evidence dir and `ls`-confirm each file exists BEFORE dispatching the blind
verifier; capture the tooltip **open** (not just the closed activator) so the verifier can judge the
claim without a re-capture round-trip.

### Standing process rules (operative)
- **Rule 15** — failures → `/fix-loop` (known retest) / `/systematic-debugging` (unclear or 2+ fails); never retry the same approach 3+ times.
- **Rule 17** — root cause, not band-aid; red-first for the regression lock (write it failing, then green).
- **Rule 20** — no fake data; surface uncertainty as `**Assumption:** X`, never fiction.
- **Rule 23** — autonomous run: keep going through the full DoD; context-budget anxiety is NOT a stop condition — hand off via a one-line continuation note, never fake-complete.

### Failure-recovery budget
- **Per-task fix budget:** ~15 attempts (≈5 inline → `/fix-loop` → `/systematic-debugging`) → DEFER the task + continue; do NOT halt the whole run.
- **MCP browser hang recovery:** 3 cycles — (1) wait 10s + retry; (2) `browser_close` + re-`navigate`; (3) kill the captured dev-server PID + restart + retry. All 3 fail → log DEFERRED + `completed (deferred)` + continue.
- **Hard halt ONLY:** `npm install` failure; a contract decision contradiction; an irrecoverable build break after the full budget; an OS permission denial; a missing required token. Context-budget is NOT a halt.

---

## 4. Commit + push

- **One commit** (the fix is small and atomic): stage exactly
  `src/plugins/vuetify.ts src/styles/tokens.css src/components/shared/InfoTip.vue src/regression/tooltip-contrast.spec.ts`.
  **NEVER `git add -A`** — the working tree has unrelated untracked `docs/goals/*.md` items; leave them.
- Message (conventional, with the skip annotations + the rule trailers):
  ```
  fix(design-system): opaque high-contrast tooltip surface + readable InfoTip text — resolve #77

  Global VTooltip { contentClass: "fk-tooltip" } default + .fk-tooltip slate-900
  opaque surface (chart-theme-system.md) covers all 4 v-tooltip users (InfoTip,
  DiscoveryFooter, MemberLensBadge, WholeHouseholdBadge — the issue's audit missed
  the last 2). InfoTip body text-caption -> text-body-2. Regression lock added.
  Light-theme only (dark mode removed, vuetify.ts:5). WCAG AA text contrast 14.8:1.

  rule 25 skipped: no write-path change
  rule 31 skipped: no user-facing value (pure style)
  api test skipped: no server/API change
  fintech-domain-analyst skipped: no math

  Closes #77

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```
- **Push** `fix/tooltip-contrast` to `origin`. **On success only:** merge `--no-ff` → `main`, push,
  then self-clean per §0.1.4 (remove worktree + `-D` branch + prune). **Close #77** with a one-line
  comment linking the merge SHA (or rely on the `Closes #77` trailer landing on `main`).

---

## 5. Definition of Done (all MUST be true)

**Build / change:**
- [ ] `src/plugins/vuetify.ts` `defaults` includes `VTooltip: { contentClass: "fk-tooltip" }`.
- [ ] `src/styles/tokens.css` has the `.fk-tooltip` rule: opaque `#1e293b` surface, `#ffffff` text, `border-radius: 8px`, `padding: 12px`, `opacity: 1`, shadow.
- [ ] `src/components/shared/InfoTip.vue` body wrapper + formula are `text-body-2` (no `text-caption` on the explanation).
- [ ] `src/regression/tooltip-contrast.spec.ts` created, asserts the default + the CSS rule + the InfoTip text class; green.
- [ ] The 3 badge/footer components are UNCHANGED (they inherit the surface).

**Static gates:**
- [ ] root `npm run type-check` 0 errors · `npm run test:unit` no regression (incl. the new spec) · `npm run build` succeeds.

**Rule 24 (per tooltip surface — render):**
- [ ] For `/fire-goals/what-if` (primary), `/` dashboard, `/financial-health`, and a badge surface: tooltip OPENED via hover/click, screenshot + ARIA + console captured; PNG read + confirmed to show an **opaque legible** surface; zero NEW console errors. (Any surface unreachable in demo mode → noted + covered by the global-default proof.)

**Rule 32 (interactive functionality):**
- [ ] Hover/click opens each tooltip and the content is readable; focus-visible ring intact; no NEW console error on open/close.

**Rule 25 / API test / Rule 31 / FinTech — SKIP:**
- [ ] Recorded as skipped with reasons in the commit (no write path · no server/API · no user-facing value · no math).

**Rule 29 (independent code review):**
- [ ] `code-reviewer-agent` ran on the diff; every blocker/HIGH acted on or filed. (`fintech-domain-analyst` N/A — no math.)

**Rule 26 (cross-surface consistency):**
- [ ] All 4 `v-tooltip` users render the identical new opaque surface (verified in-browser).

**Rule 33 (blind independent test verification):**
- [ ] The Rule 24/26 tooltip verdict re-checked by a separate context-blind agent (evidence paths copied into the goal worktree + `ls`-confirmed; tooltips captured OPEN); coverage + verdict-correctness concur; dissents reconciled.

**a11y / WCAG:**
- [ ] Text-vs-surface contrast computed and stated ≥ 4.5:1 (`#fff` on `#1e293b` ≈ 14.8:1). (`/a11y-audit` run opportunistically on the page — zero NEW Critical+Serious, or DEFERRED w/ reason.)

**Ship:**
- [ ] 1 conventional commit pushed to `fix/tooltip-contrast`; **on success** merged `--no-ff` → `main`, pushed, worktree/branch self-cleaned (§0.1.4); **#77 closed**.
- [ ] Any deferrals logged in `docs/goals/.run/fix-tooltip-contrast-DEFERRED.md` with rule status + reason.
- [ ] `docs/goals/.run/fix-tooltip-contrast-PROGRESS.md` maintained throughout (§0.3); a notable lesson appended to `.claude/tasks/lessons.md`; final report carries the SUMMARY + "LEARNINGS TO FOLD BACK".

---

## 6. Final report (required on completion)

Open with a **SUMMARY — DONE / PENDING / BLOCKED / NEXT** (mirror it in the final PROGRESS.md entry).
Then: the commit SHA + per-gate results; **Rule 24 verdict per tooltip surface + PNG paths**; the
computed WCAG contrast ratio; Rule 26 cross-surface result; Rule 29 review outcome; Rule 33 blind-verify
concurrence; the "skipped (already covered)" list from the §0.2 preflight; DoD green/amber/red tally;
any DEFERRED entries with reason. Plus a **LEARNINGS TO FOLD BACK** section (routed per §0.3 step 5 —
e.g. if the global-default selector needed adjustment, that's a GENERIC chart-theme/vuetify learning →
propose to `chart-theme-system.md` or `vuetify-conventions.md`; the "issue sibling-audit undercounted
the v-tooltip users" is a PRODUCT process learning → propose tightening `bug-filing-and-sibling-audit.md`'s
grep step). Auto-append only the one-line lesson to `.claude/tasks/lessons.md`.

---

## 7. Guardrails (hard stops)

- **`src/` only.** Never write outside it; never write `D:\Abhay\VibeCoding\5Wealths\`; never edit `.claude/` rules from this build run.
- **No new dependencies.**
- **No design reinvention** — reuse the chart-theme slate-900 surface values; one global default, not per-component CSS; do NOT touch the 3 badge components.
- **No dark mode** — the app is light-only; do not add theme-conditional styling.
- **Honesty:** no synthetic data; surface uncertainty as `**Assumption:** X`. If the global default doesn't reach a surface, root-cause it — don't paper over with a per-component patch unless the run proves the global path genuinely cannot cover it (then file a follow-up Issue, don't silently special-case).
- **Stop only on a true blocker** (§3 failure-recovery hard-halt list). Context-budget anxiety is NOT a blocker — hand off via a one-line continuation note, never fake-complete.
- **Strategic items are `TODO(5W):` notes**, not handled here.

---

## Authorization trail

| # | Decision | Choice |
|---|---|---|
| 1 | Implementation approach | **A — global `VTooltip { contentClass: "fk-tooltip" }` default in `vuetify.ts` + `.fk-tooltip` CSS in `tokens.css`** (Abhay, Q1). Covers all 4 `v-tooltip` users. |
| 2 | Scope | **All 4** `v-tooltip` components — incl. `MemberLensBadge` + `WholeHouseholdBadge` the issue's audit missed (follows from Q1=A). |
| 3 | Readability depth | **A — surface + text bump**: opaque slate-900 surface AND InfoTip body `text-caption`→`text-body-2` (Abhay, Q2). |
| 4 | Dark mode | **Light-only** — no dark verification/styling; the issue's "light + dark" line is stale (`vuetify.ts:5`, dark mode removed). Codebase-confirmed, not a fork. |
| 5 | Surface values | slate-900 `#1e293b` bg / `#ffffff` text / `border-radius 8px` / `padding 12px` / `opacity:1` / shadow — per `chart-theme-system.md` (decided from the design SSOT). |
| 6 | Persistence mode | demo / localStorage (default) — UI-only, no write path → Rule 25 + API test + Rule 31 + FinTech SKIP. |
| 7 | Regression lock | `src/regression/tooltip-contrast.spec.ts`, red-first, static-content assertions (follows `vuetify-conventions.md` precedent). |

---

## References (loaded transitively by the skills this contract invokes)

- `.claude/rules/claude-behavior.md` — rules 15, 17, 20, 23, 24, 26, 29, 32, 33
- `.claude/rules/chart-theme-system.md` — the slate-900 tooltip surface SSOT
- `.claude/rules/vuetify-conventions.md` — global-defaults pattern + the `src/regression/*.spec.ts` lock precedent
- `.claude/rules/testing-strategy.md` — test PLACEMENT SSOT (which test type runs where)
- `.claude/rules/independent-test-verification.md` — rule 33 blind re-verification
- `.claude/rules/operating-model.md` — rule 29 independent-reviewer edge
- `.claude/rules/ui-verification.md` — headed verification (`/verify-ui`), demo-mode gotchas
- `.claude/rules/bug-filing-and-sibling-audit.md` — the sibling-audit discipline (the undercount this run corrects)
- GitHub issue #77 — the source defect + fix direction
- Skills this contract drives: `/fix-loop`, `/systematic-debugging`, `/a11y-audit`, `code-reviewer-agent`
