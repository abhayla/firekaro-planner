# GOAL — Declutter the "What we assumed" bridge card: collapsible + de-duplicated across Dashboard/Readiness — GitHub #74 + #76

**Type:** Autonomous fix/enhancement contract (run via `/goal`). Execute end-to-end with **zero user
input**. Every design decision is pre-made below — do not pause to ask; make the call the contract
specifies and keep going until the Definition of Done is fully met.

**Owner:** Abhay · **Created:** 2026-06-09 · **Scope:** `src/` ONLY (2 files + 1 regression spec; demo/localStorage mode)
**Closes:** GitHub issues #74 + #76 · **Invocation:** `/goal docs/goals/2026-06-09-bridge-card-collapsible-dedup.md`

---

## 0. Mission

The accessible-money bridge card's **"WHAT WE ASSUMED — estimates you can correct"** block is (a) a
long, always-expanded per-holding wall that clutters the FIRE dashboard (#74), and (b) rendered in
full on **two** screens the user navigates between — Dashboard and Readiness — reading as repetitive
(#76). Both stem from the SAME reused component `src/components/dashboard/BridgeBreakdownCard.vue`
(correct DRY) mounted on both hosts. **Fix both together** by parameterizing the one component with a
`variant` prop: **`compact` on the Dashboard** (keep the honest bridge headline — verdict + spendable/
locked bar + bridge-income line + a "see what we assumed → Readiness" link; DROP the assumptions wall
+ unlock-timeline detail there) and **`full` on Readiness** (the canonical decision home, where the
"What we assumed" block becomes **collapsible**, default-collapsed, with the estimate **count** in the
header so the honesty caveats stay discoverable). **Done =** Dashboard shows the compact bridge (no
wall), Readiness shows the full bridge with a collapsible/count-headed assumptions block, one
component still (no duplication, no FIRE-math change), the bridge's effect on the headline FIRE age
still visible on the Dashboard, verified in-browser on both screens, a regression lock added, and #74
+ #76 closed. **No data, no math, no write path** — a presentation/IA refactor only.

**Type:** enhancement/refactor (behaviour of the *rendered IA* changes; the bridge *data* is
unchanged — same `useFireDerive().bridgeCoverage`). Red-first applies to the regression lock.

---

## 0.1 WORKTREE ISOLATION

> **First action of the run, before §0.2 and any stage. Non-negotiable.** This run MUST execute in a
> **dedicated git worktree**, never the user's primary interactive checkout.
>
> 1. **Isolate:** `root=$(git rev-parse --show-toplevel)`. If `root` is the user's **primary
>    interactive checkout** (`…/firekaro-planner`) rather than an already-dedicated `…/firekaro-goal-*`
>    worktree, **create and switch to a dedicated worktree before any stage**:
>    `git worktree add ../firekaro-goal-bridge-dedup -b feat/bridge-card-collapsible-dedup` and run
>    every stage from there. NEVER run a multi-commit build in the user's primary worktree.
> 2. **Claim it:** export a unique `GOAL_RUN_TOKEN` (e.g. `bridge-dedup-<nonce>`) and write the lock:
>    `printf '%s\n' "$GOAL_RUN_TOKEN" > "$(git rev-parse --show-toplevel)/.goal-active.lock"`. The
>    repo's `.githooks/pre-commit` HARD-BLOCKS any commit whose `GOAL_RUN_TOKEN` ≠ this lock — so a
>    concurrent interactive session physically cannot commit into this run's worktree.
> 3. **Release on exit:** the run's FINAL action (after merge/push, OR on any halt/defer) MUST remove
>    the lock: `rm -f "$(git rev-parse --show-toplevel)/.goal-active.lock"`. `.goal-active.lock` is
>    gitignored. If `git worktree` is genuinely unavailable, note it and proceed — but still NEVER run
>    in the user's primary interactive checkout.
> 4. **Self-cleanup ON SUCCESS ONLY:** after the branch is merged `--no-ff` → `main` AND pushed AND the
>    lock is released, the run's last shell step `cd`s to the **primary repo root** (you cannot
>    `git worktree remove` the worktree you stand in) and runs:
>    `cd <primary-root> && git worktree remove --force ../firekaro-goal-bridge-dedup ; git branch -D feat/bridge-card-collapsible-dedup ; git worktree prune`.
>    The branch is safe to `-D` because every commit is now in `main`. **On Windows, `git worktree
>    remove` may print `Invalid argument` while it still de-registers the worktree — that is fine;
>    `git worktree prune` finalises it.** **DEFER/HALT is the opposite: do NOT remove the worktree or
>    delete the branch** — they are needed to resume (only the lock is released).

---

## 0.2 PREFLIGHT — idempotency · NO duplication (run FIRST, before any stage)

> **This is the first action of the run, before ANY stage. Non-negotiable.** A parallel session may
> already have done part of this. The ledger IS issues #74/#76 + the code + `git log`. Check all three
> before building:
>
> 1. **Issue state:** `gh issue view 74` and `gh issue view 76` — if either is already CLOSED, do a
>    verify-only pass for that part (confirm the behaviour is live per the checks below) and do NOT
>    rebuild it; report "already closed".
> 2. **Code (grep/read — don't trust assumptions):**
>    - `src/components/dashboard/BridgeBreakdownCard.vue` — does it already accept a `variant` /
>      `compact` prop? Is the "What we assumed" block already wrapped in `v-expand-transition` with a
>      toggle ref + count-in-header? If yes, that part is DONE — verify-only.
>    - `src/pages/fire-goals/Dashboard.vue` (line ~279) — does it already pass `variant="compact"`?
>    - `src/regression/bridge-card-variants.spec.ts` — exists already? If yes, run it.
>    - `git log --oneline -20` — scan for a matching `feat(fire-dashboard): …bridge…` / `#74` / `#76` commit.
> 3. **Build only the missing delta.** Record every skip in the final report's "skipped (already
>    covered)" list. If everything is already in place + green, the run's only job is to verify
>    (Rules 24/32/26/29/33) and close #74/#76.

---

## 0.3 PROGRESS LOG — live, cross-session-trackable

> **Maintain an append-only progress log for the entire run. Update it BEFORE moving on from each
> stage/event — so a crash or context-out leaves it current.**
>
> 1. **Location:** `docs/goals/.run/bridge-card-collapsible-dedup-PROGRESS.md` (in THIS run's worktree).
>    `.run/` is gitignored → no commit churn, no cross-run conflicts. Read cross-session via the
>    worktree path (`git worktree list` → read each `<worktree>/docs/goals/.run/*-PROGRESS.md`). Its
>    sibling `bridge-card-collapsible-dedup-DEFERRED.md` (the deferrals log) lives in the same `.run/` dir.
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
>    **DONE** · **PENDING** (DEFERRED + reason) · **BLOCKED** (Abhay-gated + why) · **NEXT** (single next
>    action + gate owner). Scannable, not a transcript.

---

## 1. Context you need (read first)

| Thing | Path / import | Why it matters |
|---|---|---|
| **The one shared card** | `src/components/dashboard/BridgeBreakdownCard.vue` | Renders the WHOLE "Accessible-money bridge" card from `useFireDerive().bridgeCoverage` (`bc`). Sections: header chip (`:71-82`), **headline verdict alert** (`:84-107`, shows `bc.effectiveFireAge` — the honesty), spendable/locked bar (`:109-126`), **unlock timeline** (`:128-149`), **bridge-income line** (`:151-156`), and the **"What we assumed" wall** (`:158-188`, `v-for` over `bc.assumptions`, each with a "Fix" deep-link). `show` (`:25-29`) self-hides for a fully-liquid household. |
| **Dashboard host (#74's reported screen)** | `src/pages/fire-goals/Dashboard.vue:279` — `<BridgeBreakdownCard />` | Mounted between `<IndividualFireCard/>` and `<AccelerationCard/>`. **→ change to `variant="compact"`.** |
| **Readiness host (canonical full home)** | `src/pages/fire-goals/Readiness.vue:44` — `<BridgeBreakdownCard />` | Mounted below `<ReadinessVerdictCard/>`. **→ stays default (`full`), UNCHANGED** (default variant = full). |
| **Readiness route (for the Dashboard link)** | `src/router/index.ts:84` — path `/fire-goals/readiness`, name `fire-readiness` | The compact card's "see what we assumed →" link target. Use the route **name** `fire-readiness`. |
| **Conditional-section standard** | `.claude/rules/vuetify-conventions.md` · `form-validation-patterns.md` | Collapsible sections use **`v-expand-transition`**, NOT `v-show`. The collapse animation standard. |
| **Verification persona** | `src/seeds/mauryas.ts` (full-spread portfolio, has locked NPS/PPF → bridge renders assumptions) | Demo-mode fixture so the bridge card actually SHOWS (locked money present). Load via the seed switcher / `loadMauryasSeed`. A fully-liquid persona would self-hide the card and prove nothing. |

**Gotchas:**
- The app is **light-theme only** (`src/plugins/vuetify.ts:5`, dark mode removed). No dark-mode work.
- **One component, parameterized — do NOT create a second component** (#76 acceptance #3: still one `BridgeBreakdownCard`, compact vs full by prop). Keeps DRY + no FIRE-math duplication.
- The bridge **data** is identical on both screens (same `bc` from `useFireDerive`) — this refactor changes only what each *renders*, never the numbers. So no value is newly computed (Rule 31 is a shape-preserving check, not a new headline).
- The card **self-hides** (`show`) for a fully-liquid household — both variants must keep that. Verify with a persona that HAS locked money (Mauryas), else the card won't appear at all.
- Persistence mode: **demo / localStorage (default)**. No write path, no API, no math → Rule 25 + API test + `fintech-domain-analyst` SKIP.

---

## 2. STAGE A — parameterize the bridge card (compact ⟷ full) + collapsible assumptions + regression lock

**File(s):** `src/components/dashboard/BridgeBreakdownCard.vue` (edit), `src/pages/fire-goals/Dashboard.vue` (one-line edit), `src/regression/bridge-card-variants.spec.ts` (create). **Keep untouched:** `src/pages/fire-goals/Readiness.vue` (default variant = full), `src/lib/*` (no math/derive change), every other file.

### Pre-made design decisions (do NOT deviate)

1. **Scope = both #74 + #76 in one coordinated change** (Authorization trail #1). They share one
   component; #76 says "coordinate the fixes".
2. **Canonical full home = Readiness; Dashboard = compact** (#76 lead recommendation, Authorization
   trail #2). Readiness is the "can I stop?" decision screen where assumptions are scrutinised;
   the dashboard is decluttered.
3. **Add a prop:** `variant?: "full" | "compact"` to `BridgeBreakdownCard`, **default `"full"`** (so
   Readiness stays `<BridgeBreakdownCard />`, unchanged). `withDefaults(defineProps<{ variant?: "full" | "compact" }>(), { variant: "full" })`.
4. **`compact` variant (Dashboard) renders ONLY:** the header (icon + "Accessible-money bridge" +
   the covered/gap chip), the **headline verdict alert** (`:84-107` — keeps `bc.effectiveFireAge`
   visible: the bridge's honest effect on the FIRE age must remain on the dashboard), the
   **spendable/locked bar** (`:109-126`), the **bridge-income line** (`:151-156`), and a compact
   **link row**: a small `text` `v-btn`/router-link `:to="{ name: 'fire-readiness' }"` reading
   **"See what we assumed → Readiness"** (with `mdi-arrow-right` / `mdi-information-outline`). It
   **OMITS** the unlock-timeline list (`:128-149`) AND the "What we assumed" wall (`:158-188`).
5. **`full` variant (Readiness) renders everything as today, EXCEPT the "What we assumed" block is now
   collapsible (#74):**
   - Add a `const assumptionsExpanded = ref(false)` — **default COLLAPSED**.
   - Turn the `.section-label` "What we assumed" header (`:161-164`) into a clickable toggle button
     (`@click="assumptionsExpanded = !assumptionsExpanded"`, keyboard-focusable, `aria-expanded`
     bound) that shows the **count** + a chevron: e.g. **"What we assumed — {{ bc.assumptions.length }}
     estimates you can correct"** + a trailing `mdi-chevron-down`/`mdi-chevron-up` that rotates with state.
   - Wrap the assumption `v-for` rows (`:165-187`) in **`v-expand-transition`** with `v-show`-free
     conditional (`<v-expand-transition><div v-if="assumptionsExpanded">…rows…</div></v-expand-transition>`
     — use `v-if` inside the transition per the project standard, NOT a bare `v-show`).
   - The "Fix" deep-links (`fixRoute`) keep working when expanded — no change to `fixRoute`.
   - The count stays visible in the collapsed header → honesty caveats remain discoverable (the
     issue's explicit requirement that they are signposted, not buried).
6. **No persistence of the collapse state** (YAGNI — #74 said "optional"; a local `ref` is enough and
   the count-in-header keeps it discoverable). Do NOT touch the `ui` store.
7. **Dashboard edit:** `src/pages/fire-goals/Dashboard.vue:279` → `<BridgeBreakdownCard variant="compact" />`.
8. **Still ONE component** — no second component, no FIRE-math change, `useFireDerive()`/`bc` untouched.
9. **Light theme only** — no theme-conditional styling.

### Regression lock (red-first) — `src/regression/bridge-card-variants.spec.ts`
Mount `BridgeBreakdownCard` with a seeded household that HAS locked money so the card renders (follow
the mount + Pinia-seed precedent in `src/lib/kernel-invariants.property.spec.ts` /
`src/composables/useFamily.spec.ts`: `setActivePinia(createPinia())` → `loadMauryasSeed()` → mount).
Assert:
1. **`variant="compact"`** → the card does NOT render `[data-testid="bridge-assumption-row"]` and does
   NOT render `[data-testid="bridge-unlock-row"]`, but DOES render the "see what we assumed" readiness
   link (assert a router-link / `to` resolving to `fire-readiness`). The verdict alert
   (`[data-testid="bridge-shortfall-alert"]` or the success alert) IS present (FIRE-age honesty kept).
2. **`variant="full"` (default)** → the "What we assumed" header + count render, but the assumption
   rows are **collapsed by default** (not in the DOM / `v-if=false`); after toggling
   `assumptionsExpanded`, the rows render.
Write it **failing first** (props/behaviour don't exist yet), then make it green. If a full mount proves
infeasible in the `node` test env (Vuetify component deps), fall back to a static template-source
assertion (read the `.vue` as text, assert the `variant` prop + `v-expand-transition` + `assumptionsExpanded`
+ the `compact` `v-if` branches exist) — note the fallback in the spec header. Runs inside `npm run test:unit`.

### Stage A acceptance (run the §3 gate sweep before committing)
- `variant` prop added (default full); compact branch renders only the kept sections + the readiness
  link; full branch's assumptions block is collapsible/default-collapsed with count-in-header;
  Dashboard passes `variant="compact"`; Readiness untouched; regression spec green; ONE component still.
- **Stage gate sweep (gate by blast radius — UI-only, no write path / no API / no math):** static
  (root `npm run type-check && npm run test:unit && npm run build`) → **Rule 24** (render, both
  screens) → **Rule 32** (the collapse toggle + the dashboard link WORK) → **Rule 29** (independent
  code review; **NO** `fintech-domain-analyst` — no math) → **Rule 26** (the FIRE-age the dashboard
  verdict shows equals the Readiness one; cross-screen) → **Rule 33** (blind re-verify the
  screenshots) → a11y (no NEW Critical+Serious; the toggle is keyboard-operable + `aria-expanded`).
  **SKIP with reason:** Rule 25 (`no write-path change`), API test (`no server/API change`), Rule 31
  (`no new user-facing value — layout-only refactor of existing bridge data`; still eyeball the
  rendered bridge figures are unchanged), `fintech-domain-analyst` (`no math`). All green or
  DEFERRED-with-reason before the commit.

---

## 3. Verification gates (standing rules — adapted to `src/`, demo/localStorage mode, UI-only)

> **All rules in `.claude/rules/claude-behavior.md` are operative for this run.** Rules **24, 26, 29,
> 32, 33 are MANDATORY** here; **25, 31, the API behavioral test, and `fintech-domain-analyst` SKIP**
> (no write path; no NEW user-facing value — layout refactor of existing data; no server/API; no
> math — record the skip reason in the commit). Test PLACEMENT follows
> `.claude/rules/testing-strategy.md`. UI-only, demo-mode — every check runs against the local dev
> server at `http://localhost:5175`, with the **Mauryas** persona loaded (so the bridge card renders).

### Rule 24 — UI render verification (per screen, MANDATORY)
Self-heal: if the dev server isn't up, start `npm run dev` once in the background (capture the PID),
wait for `:5175`, load the **Mauryas** seed, then drive Playwright MCP. For each screen: `browser_navigate`
→ `browser_take_screenshot` → `browser_snapshot` (ARIA) → `browser_console_messages`.
- **`/fire-goals/dashboard`** — the bridge card shows the **compact** layout: header chip, verdict
  alert (with the FIRE age), spendable/locked bar, bridge-income line, and the "See what we assumed →
  Readiness" link. It MUST NOT show the per-holding assumptions wall or the unlock-timeline list.
- **`/fire-goals/readiness`** — the bridge card shows the **full** layout with the "What we assumed"
  header showing the **count** and **collapsed by default** (rows hidden); the verdict + bar + timeline
  present.
**Pass (all 3):** intended layout visible in the screenshot; same in the ARIA tree; no NEW console
errors. Iterate ≤3 per screen → `/fix-loop` → `/systematic-debugging`. MCP genuinely unavailable after
self-heal + 3-cycle hang recovery → surface "UI verification skipped because <reason>" + mark
`completed (deferred — Rule 24)`; never claim complete.

### Rule 32 — interactive functionality (MANDATORY — the heart of this change)
- **Readiness:** click the "What we assumed" header → the rows **expand** (v-expand-transition plays) and
  the count/chevron flips; click a **"Fix"** button → it deep-links (navigates) correctly; click the
  header again → rows **collapse**. Confirm keyboard operability (focus the header, Enter/Space toggles)
  + `aria-expanded` flips. No NEW console error.
- **Dashboard:** click the **"See what we assumed → Readiness"** link → it navigates to
  `/fire-goals/readiness`. No NEW console error.

### Rule 26 — cross-screen consistency (MANDATORY, always fires)
The bridge's effect on the headline FIRE age MUST stay consistent: the `effectiveFireAge` shown in the
**Dashboard compact verdict** equals the one on **Readiness** (same `bc` source — they must match
exactly). Drive MCP to both, read the age, assert equal. Also confirm the de-dup didn't drop the
dashboard's bridge honesty (the verdict + bar are still there). 3 reconcile cycles →
`/systematic-debugging`; unresolved → log `…-DEFERRED.md` with `Rule 26 cross-screen drift`.

### Rule 29 — independent code review (MANDATORY for the diff)
After Stage A is green, dispatch `code-reviewer-agent` (adversarial) on the diff. **Do NOT dispatch
`fintech-domain-analyst`** — no math touched. Act on every blocker/HIGH before commit; file
deferred-but-real findings as Issues. The run is never the sole verifier of its own code.

### Rule 33 — blind independent test verification (MANDATORY)
The Rule 24/26 verdicts MUST be re-checked by a SEPARATE, context-blind agent given the SAME raw
evidence (screenshot/ARIA/console paths) — judging coverage (both screens + both variants + the
expand/collapse states shown) AND verdict-correctness, adversarially. Reconcile any dissent before
reporting done. **Evidence-handoff gotcha:** Playwright MCP writes screenshots to the
**primary-worktree root's `.playwright-mcp/`, NOT the goal worktree** — copy/absolute-path them into
the goal worktree's evidence dir and `ls`-confirm each exists BEFORE dispatching the blind verifier;
capture the assumptions block **both collapsed AND expanded** (the before/after pair) so the verifier
can judge the toggle without a re-capture round-trip.

### Standing process rules (operative)
- **Rule 15** — failures → `/fix-loop` (known retest) / `/systematic-debugging` (unclear or 2+ fails); never retry the same approach 3+ times.
- **Rule 17** — root cause, not band-aid; red-first for the regression lock.
- **Rule 20** — no fake data; surface uncertainty as `**Assumption:** X`, never fiction.
- **Rule 23** — autonomous run: keep going through the full DoD; context-budget anxiety is NOT a stop condition — hand off via a one-line continuation note, never fake-complete.

### Failure-recovery budget
- **Per-task fix budget:** ~15 attempts (≈5 inline → `/fix-loop` → `/systematic-debugging`) → DEFER the task + continue; do NOT halt the whole run.
- **MCP browser hang recovery:** 3 cycles — (1) wait 10s + retry; (2) `browser_close` + re-`navigate`; (3) kill the captured dev-server PID + restart + retry. All 3 fail → log DEFERRED + `completed (deferred)` + continue.
- **Hard halt ONLY:** `npm install` failure; a contract decision contradiction; an irrecoverable build break after the full budget; an OS permission denial; a missing required token. Context-budget is NOT a halt.

---

## 4. Commit + push

- **One commit** (atomic IA refactor): stage exactly
  `src/components/dashboard/BridgeBreakdownCard.vue src/pages/fire-goals/Dashboard.vue src/regression/bridge-card-variants.spec.ts`.
  **NEVER `git add -A`** — the working tree has unrelated untracked `docs/goals/*.md` items; leave them.
- Message (conventional, with skip annotations + the trailers):
  ```
  feat(fire-dashboard): compact bridge on Dashboard + collapsible "What we assumed" on Readiness — resolve #74 #76

  BridgeBreakdownCard gains a variant prop (default "full"). Dashboard renders
  variant="compact" (verdict + spendable/locked bar + bridge-income + a "see what
  we assumed -> Readiness" link; drops the per-holding wall + unlock timeline).
  Readiness keeps the full card; its "What we assumed" block is now collapsible,
  default-collapsed, with the estimate count in the header (honesty stays
  discoverable). One component still (no FIRE-math/component duplication). Light
  theme only. Regression lock added.

  rule 25 skipped: no write-path change
  rule 31 skipped: no new user-facing value (layout refactor of existing bridge data)
  api test skipped: no server/API change
  fintech-domain-analyst skipped: no math

  Closes #74
  Closes #76

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```
- **Push** `feat/bridge-card-collapsible-dedup` to `origin`. **On success only:** merge `--no-ff` →
  `main`, push, then self-clean per §0.1.4 (remove worktree + `-D` branch + prune). **Close #74 + #76**
  (the `Closes` trailers land them on merge to `main`).

---

## 5. Definition of Done (all MUST be true)

**Build / change:**
- [ ] `BridgeBreakdownCard.vue` has `variant?: "full" | "compact"` (default `"full"`).
- [ ] **compact** branch renders header + verdict alert (with FIRE age) + spendable/locked bar + bridge-income line + the "see what we assumed → Readiness" (`{ name: 'fire-readiness' }`) link; OMITS the assumptions wall + unlock-timeline list.
- [ ] **full** branch's "What we assumed" block is collapsible via `v-expand-transition` + `assumptionsExpanded` ref (default **collapsed**), header shows the estimate **count** + a chevron; "Fix" deep-links still work when expanded.
- [ ] `Dashboard.vue:~279` passes `variant="compact"`; `Readiness.vue` is UNCHANGED (default full).
- [ ] Still ONE component — no second component, no `useFireDerive`/derive/`src/lib` change, no `ui`-store persistence added.
- [ ] `src/regression/bridge-card-variants.spec.ts` created (compact hides wall+timeline & shows link; full collapses assumptions by default); green.

**Static gates:**
- [ ] root `npm run type-check` 0 errors · `npm run test:unit` no regression (incl. the new spec) · `npm run build` succeeds.

**Rule 24 (per screen — render):**
- [ ] `/fire-goals/dashboard` (Mauryas) shows the COMPACT bridge (no wall, no timeline) + the link; `/fire-goals/readiness` shows the FULL bridge with "What we assumed" collapsed + count. Screenshot + ARIA + console captured; PNGs read + confirmed; zero NEW console errors.

**Rule 32 (interactive functionality):**
- [ ] Readiness: header click expands/collapses the assumptions (transition plays, chevron + `aria-expanded` flip, keyboard-operable); a "Fix" button deep-links. Dashboard: the "see what we assumed →" link navigates to `/fire-goals/readiness`. No NEW console error.

**Rule 25 / API test / Rule 31 / FinTech — SKIP:**
- [ ] Recorded as skipped with reasons in the commit (no write path · no server/API · no new user-facing value · no math). Bridge figures eyeballed unchanged vs current.

**Rule 29 (independent code review):**
- [ ] `code-reviewer-agent` ran on the diff; every blocker/HIGH acted on or filed. (`fintech-domain-analyst` N/A — no math.)

**Rule 26 (cross-screen consistency):**
- [ ] `effectiveFireAge` shown on the Dashboard compact verdict equals the Readiness value; the dashboard still shows the bridge verdict + bar (honesty not dropped).

**Rule 33 (blind independent test verification):**
- [ ] The Rule 24/26/32 verdict re-checked by a separate context-blind agent (evidence copied into the goal worktree + `ls`-confirmed; assumptions captured BOTH collapsed AND expanded); coverage + verdict-correctness concur; dissents reconciled.

**a11y:**
- [ ] The collapse toggle is keyboard-operable with `aria-expanded`; `/a11y-audit` on both screens shows zero NEW Critical+Serious WCAG 2.1 AA (or DEFERRED w/ reason).

**Ship:**
- [ ] 1 conventional commit pushed to `feat/bridge-card-collapsible-dedup`; **on success** merged `--no-ff` → `main`, pushed, worktree/branch self-cleaned (§0.1.4); **#74 + #76 closed**.
- [ ] Any deferrals logged in `docs/goals/.run/bridge-card-collapsible-dedup-DEFERRED.md` with rule status + reason.
- [ ] `docs/goals/.run/bridge-card-collapsible-dedup-PROGRESS.md` maintained throughout (§0.3); a notable lesson appended to `.claude/tasks/lessons.md`; final report carries the SUMMARY + "LEARNINGS TO FOLD BACK".

---

## 6. Final report (required on completion)

Open with a **SUMMARY — DONE / PENDING / BLOCKED / NEXT** (mirror it in the final PROGRESS.md entry).
Then: the commit SHA + per-gate results; **Rule 24 verdict per screen + PNG paths** (compact dashboard,
full readiness, assumptions collapsed + expanded); Rule 32 toggle/link results; Rule 26 cross-screen
FIRE-age equality; Rule 29 review outcome; Rule 33 blind-verify concurrence; the "skipped (already
covered)" list from §0.2; DoD green/amber/red tally; any DEFERRED entries with reason. Plus a
**LEARNINGS TO FOLD BACK** section (routed per §0.3 step 5 — e.g. if a reusable "collapsible-disclosure"
pattern emerged, that's a GENERIC design-system learning → propose adding it to `SCREEN-STANDARD.md` /
`vuetify-conventions.md` per #74's sibling-audit note; the "card reused on 2 screens reads redundant"
IA lesson → propose to the design-system rule). Auto-append only the one-line lesson to
`.claude/tasks/lessons.md`.

---

## 7. Guardrails (hard stops)

- **`src/` only.** Never write outside it; never write `D:\Abhay\VibeCoding\5Wealths\`; never edit `.claude/` rules from this build run.
- **No new dependencies.**
- **No design reinvention / no second component** — parameterize the ONE `BridgeBreakdownCard` (DRY); use `v-expand-transition` (not `v-show`) per the project standard; do NOT touch `useFireDerive`/`derive`/`src/lib`.
- **No FIRE-math change** — this is presentation/IA only; the bridge numbers must be byte-identical to today (same `bc`).
- **No dark mode** — the app is light-only.
- **Honesty:** the bridge's effect on the FIRE age MUST remain visible on the Dashboard (the verdict alert) and the assumption **count** MUST stay visible when collapsed — do NOT fully hide the caveats. No synthetic data; surface uncertainty as `**Assumption:** X`.
- **Stop only on a true blocker** (§3 failure-recovery hard-halt list). Context-budget anxiety is NOT a blocker — hand off via a one-line continuation note, never fake-complete.
- **Strategic items are `TODO(5W):` notes**, not handled here.

---

## Authorization trail

| # | Decision | Choice |
|---|---|---|
| 1 | Scope — which issue(s) | **Both #74 + #76 in one coordinated goal** (decided per decision-authority — reversible IA work the PM role resolves; same component, #76 says coordinate). |
| 2 | #76 canonical full home | **Readiness = full (canonical); Dashboard = compact** — adopting #76's own lead recommendation (the "can I stop?" decision screen is where assumptions are scrutinised; declutters the primary dashboard, obj-0/1). Reversible — Abhay can flip on review/run. |
| 3 | Mechanism | **`variant` prop on the ONE component** (default `"full"`) — no second component (#76 acceptance #3); DRY, no FIRE-math duplication. |
| 4 | #74 collapse default | **Collapsed by default, count-in-header**, `v-expand-transition` — declutters while keeping the honesty caveats discoverable (the issue's recommended default). |
| 5 | Collapse-state persistence | **None (local `ref`)** — YAGNI; #74 marked it optional; the count keeps it discoverable. |
| 6 | Compact contents | verdict alert (FIRE-age honesty kept) + spendable/locked bar + bridge-income line + "see what we assumed → Readiness" link; DROP the assumptions wall + unlock timeline on the Dashboard. |
| 7 | Dark mode | **Light-only** — app has no dark theme (`vuetify.ts:5`). |
| 8 | Persistence mode | demo / localStorage (default) — UI-only, no write path → Rule 25 + API test + Rule 31 + FinTech SKIP. |
| 9 | Regression lock | `src/regression/bridge-card-variants.spec.ts`, red-first (mount-seed precedent, static fallback). |

---

## References (loaded transitively by the skills this contract invokes)

- `.claude/rules/claude-behavior.md` — rules 15, 17, 20, 23, 24, 26, 29, 32, 33
- `.claude/rules/vuetify-conventions.md` — `v-expand-transition` standard + the `src/regression/*.spec.ts` lock precedent
- `.claude/rules/form-validation-patterns.md` — conditional-section (`v-expand-transition`, not `v-show`) standard
- `.claude/rules/testing-strategy.md` — test PLACEMENT SSOT (which test type runs where)
- `.claude/rules/independent-test-verification.md` — rule 33 blind re-verification
- `.claude/rules/operating-model.md` — rule 29 independent-reviewer edge
- `.claude/rules/ui-verification.md` — headed verification (`/verify-ui`), demo-mode + Mauryas-persona gotchas
- `.claude/rules/bug-filing-and-sibling-audit.md` — #74's "standard collapsible-disclosure pattern" sibling-audit note
- `CLAUDE.md` — `derive.ts`/`useFireDerive` spine + the #15 accessible-money bridge layer (`bridge.ts`)
- GitHub issues #74 + #76 — the source requests + analysis
- Skills this contract drives: `/fix-loop`, `/systematic-debugging`, `/a11y-audit`, `code-reviewer-agent`
