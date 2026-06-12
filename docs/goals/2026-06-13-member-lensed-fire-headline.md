# GOAL — Member-lensed FIRE headline: the FIRE hero shows the selected member's individual FIRE

> **✅ RUN COMPLETE — 2026-06-13.** All 3 stages built, verified, merged `--no-ff` → `main`
> (**`3bbf809`**; stage commits `bd1b932` / `f30cc5a` / `6656fbc`; docs `f850769`), pushed.
> Gates: 1235/1235 unit · type-check 0 · build ✓ · FULL member-lens-sweep **17/17** (incl. the new
> FIRE-hero-differs lock) · a11y PASS · rules 24/26/29/31/32/33 green, blind-verifier dissents
> reconciled. Live verify: Whole-household 56/₹10.55 Cr byte-identical · Priya 44/₹2.35 Cr ·
> Rohit 44/₹4.04 Cr + caveat + hide/restore round-trip, console clean.
> **Deferred (sanctioned):** prod Tier-2 re-verify — *prod not yet deployed, Abhay's gate*; rule 25
> — *no write-path change*; FinTech HIGH option-(a) math fix → **gh #162** (caveat names the
> omissions as interim mitigation). Evidence + run logs: `docs/goals/.run/` (primary).
> DoD checkboxes below ticked by the run; design content above/below unmodified.

**Type:** Autonomous **build** contract (run via `/goal`). Execute end-to-end with **zero user
input**. Every design decision is pre-made below — do not pause to ask; make the call the contract
specifies and keep going until the Definition of Done is fully met.

**Owner:** Abhay · **Created:** 2026-06-13 · **Scope:** `src/` (Vue planner SPA) ONLY
**Invocation:** `/goal docs/goals/2026-06-13-member-lensed-fire-headline.md`

---

## 0. Mission

When the AppBar **"View as &lt;member&gt;"** lens selects an adult, the **big FIRE headline** in the
dashboard hero (`FireHero.vue`) MUST show **that member's individual FIRE** — age, number, and
corpus-progress — instead of the whole-household figure it shows today. **"Whole household"** (the
default, `viewingMemberId === null`) MUST stay **byte-identical to today** (the combined household
FIRE). This **reverses** the #81 hero-invariance decision per **PROJECT-LOG D-2026-06-13-02**.

The per-member number already exists and is honest: `src/lib/individual-fire.ts` computes each adult's
standalone "mini-household" FIRE (attributed corpus/expenses, per-member SWR, a reachability cap that
prevents absurd ages); `derive()` exposes `individualFireByMember`. So this is a **DISPLAY wiring +
honest-caveat** change consuming already-validated numbers — NOT the absurd "household-target ÷ 1
member" #22 bug.

**Design = option B** (pre-decided, goal-anchored): the hero's **household-only sub-parts** (the #18
Monte-Carlo confidence band, the plan-variance + biggest-win KPI slots, and the sibling
`FireProjectionChart` + `FireMilestonesCard`) are **HIDDEN under a member lens** and replaced with a
clear caveat; only the **member-attributable** parts (headline age/number, corpus-progress, the
annual-savings/take-home stats) lens to the member. Option A (full per-member Monte-Carlo + projection
for a coherent lensed hero) is a **documented FUTURE enhancement, explicitly OUT of scope** (YAGNI).

**The one non-negotiable outcome:** on prod, switching "View as" between two adults makes the **big
FIRE age change per member** (e.g. Priya age 44 / ₹2.35Cr vs Rohit / ₹4.04Cr vs Whole-household
55 / ₹10.55Cr), while the household default is provably unchanged and the individual headline is never
domain-absurd.

---

## 0.1 WORKTREE ISOLATION (run's very first action)

> **First action of the run, before §0.2 and any stage. Non-negotiable.** This run MUST execute in a
> **dedicated git worktree**, never the user's primary interactive checkout (it shares its branch +
> working tree with the user's live session).
>
> 1. **Isolate:** `root=$(git rev-parse --show-toplevel)`. If `root` is the user's **primary
>    interactive checkout** (`…/firekaro-planner`) rather than an already-dedicated `…/firekaro-goal-*`
>    worktree, **create and switch to a dedicated worktree before any stage**:
>    `git worktree add ../firekaro-goal-member-fire-headline -b feat/member-lensed-fire-headline` and run
>    every stage from there. NEVER run a multi-commit build in the user's primary worktree.
> 2. **Claim it:** export a unique `GOAL_RUN_TOKEN` (e.g. `member-fire-headline-<nonce>`) and write the
>    lock: `printf '%s\n' "$GOAL_RUN_TOKEN" > "$(git rev-parse --show-toplevel)/.goal-active.lock"`.
>    `.githooks/pre-commit` HARD-BLOCKS any commit whose `GOAL_RUN_TOKEN` ≠ this lock.
> 3. **Release on exit:** the run's FINAL action (after merge/push, OR on any halt/defer) removes the
>    lock: `rm -f "$(git rev-parse --show-toplevel)/.goal-active.lock"`. `.goal-active.lock` is gitignored.
>    If `git worktree` is genuinely unavailable, note it and proceed — but still NEVER run in the user's
>    primary interactive checkout.
> 4. **Self-cleanup ON SUCCESS ONLY:** after the branch is merged `--no-ff` → `main` AND pushed AND the
>    lock released, the run's last shell step `cd`s to the **primary repo root** and runs:
>    `cd <primary-root> && git worktree remove --force ../firekaro-goal-member-fire-headline ; git branch -D feat/member-lensed-fire-headline ; git worktree prune`.
>    (On Windows `git worktree remove` may print `Invalid argument` while still de-registering — fine;
>    `git worktree prune` finalises it.) **DEFER/HALT keeps the worktree + branch for resume** — only the
>    lock is released.

---

## 0.2 PREFLIGHT — idempotency · NO duplication (run's first numbered action)

> **First action of the run, before ANY stage. Non-negotiable.** A parallel session may already have
> implemented part of this contract. It must be **safe to run at any time without redoing finished work.**
>
> 1. **Read the ledger of record for this work:** `docs/PROJECT-LOG.md` §3 — entries **D-2026-06-13-02**
>    (this decision), **D-2026-06-13-01** (the section-card lens fix already shipped in `d7f11aa`), and
>    **D-2026-06-08-19/20/22** (#81 — the decision this reverses). PROJECT-LOG is the cross-session source
>    of truth for what is done.
> 2. **For every item in this contract, check PROJECT-LOG + the actual code + `git log --oneline -25`
>    before building it.** Concretely: `grep -n "lensedHeadline\|individualHeadline" src/lib/useFireDerive.ts`
>    and read `src/components/dashboard/FireHero.vue` for any `viewingMemberId`/`individualFireByMember`
>    branch — **if the headline already lenses, SKIP the build and do a verify-only pass.** If partial,
>    build only the missing delta. If absent, build normally.
> 3. **Record every skip** in the final report's "skipped (already covered)" list.

---

## 0.3 PROGRESS LOG — live, cross-session-trackable

> **Maintain an append-only progress log for the entire run. Update it BEFORE moving on from each
> stage/event** — so a crash/context-out leaves it current.
>
> 1. **Location:** `docs/goals/.run/2026-06-13-member-lensed-fire-headline-PROGRESS.md` (in THIS run's
>    worktree; `.run/` is gitignored → read cross-session via `git worktree list` → each worktree's
>    `docs/goals/.run/*-PROGRESS.md`).
> 2. **First line:** slug · branch · worktree · start time (`date "+%Y-%m-%d %H:%M"`) · contract path · mission.
> 3. **Append ≤2-line entries at:** stage start; stage done (gate result); every major DEFECT; every
>    "something not working" EVENT **+ what you did**; each independent-review outcome (concur/dissent);
>    each DEFER/skip; each blocker/halt; the final result.
> 4. **Format:** `[YYYY-MM-DD HH:MM] <STAGE|PROGRESS|DEFECT|EVENT|DECISION|RECOVERY|BLOCKER|DONE> — <≤2 lines>`.
> 5. **At run-end, derive learnings + route by scope:** AUTO-append each notable error→fix→lesson (with a
>    gate-gap line, dedup-grep first) to `.claude/tasks/lessons.md`; PROPOSE a **"LEARNINGS TO FOLD BACK"**
>    section in the committed final report (GENERIC → skill/process-rule; PRODUCT-SPECIFIC class → product
>    rule, else this contract; gate over prose; one home, dedup). The run NEVER edits its own contract/skill/rule.
> 6. **Run-end SUMMARY** (final PROGRESS entry + committed report): **DONE** (verified-green stages) ·
>    **PENDING** (deferred + one-line reason) · **BLOCKED** (Abhay-gated + why) · **NEXT** (single next action + owner).

---

## 1. Context you need (read first)

| Thing | Path / import | Why it matters |
|---|---|---|
| **The hero (main change)** | `src/components/dashboard/FireHero.vue` | Headline (`fireAge`/`yearsToRegular`/`fireYear`), the #18 band (`band`/`fullBandCopy`), bridge subline, KPI strip (Vs-plan / Corpus-progress / Biggest-win), stats line. ALL read household `fire.*` today. |
| **Composable seam** | `src/lib/useFireDerive.ts` | Exposes `individualFireByMember`, `memberFinancials`, `fireNumber`, `totalCorpus`, `progressPercent`, `yearsToRegular`, `anchorAge`, `householdFireAge`, `annualSavings`, `monthlyTakeHome`. Stage A adds a convenience **lensed-headline selector** here. |
| **Per-member FIRE source (read-only)** | `src/lib/individual-fire.ts` | `computeIndividualFire` → `{ memberId, name, individualFireNumber, individualFireAge, yearsToIndividualFire, attributableCorpus, attributableAnnualIncome, attributableAnnualExpenses, anchorAge, … }`. The reachability cap (≈ lines 200-208: `reachable = anchorAge + rawYearsToFire <= planToAge`; else `Infinity`/sentinel) is the honesty guard — DO NOT weaken. |
| **Kernel (read-only)** | `src/lib/derive.ts` | `individualFireByMember`, the `lensedScope`/`householdScope` honesty seam, `applyMemberLens = !isSolo && viewingMemberId != null`. The household `fireNumber`/`totalCorpus` stay household — do NOT touch the FIRE math. |
| **Lens state** | `src/stores/ui.ts` (`viewingMemberId`) · `src/layouts/AppBar.vue` (`viewingValue`/`memberOptions`, adults-only) | The selected member id; null = Whole household. |
| **Keep as-is** | `src/components/dashboard/IndividualFireCard.vue` | The "Household vs individual FIRE" comparison card STAYS (it is the secondary comparison; do not remove). |
| **Hidden-under-lens siblings** | `src/components/dashboard/FireProjectionChart.vue`, `FireMilestonesCard.vue`, mounted in `src/pages/fire-goals/Dashboard.vue` | Household-only — gate hidden under a member lens (option B). |
| **Guardrail tests (REWRITE, not delete)** | `src/lib/derive.spec.ts` (the "FIRE number/age INVARIANT to member selection" test ~line 248 + the new "member-lens cards" coherence test from `d7f11aa`), `src/lib/headline-plausibility.spec.ts` | Currently LOCK household-invariance — must be rewritten to the NEW invariant (below). |
| **Member-landscape sweep** | `e2e/member-lens-sweep.spec.ts` + `src/lib/lens-coverage-invariant.spec.ts` | The mandated full "Viewing as" verification (per `member-landscape-verification.md`). The dashboard headline now lenses → extend the dashboard assertion to require the FIRE-age token to differ per member. |

**Gotchas:**
- **Display-only change — NO new write path.** Rule 25 (UI→persistence) is **N/A** (skip with reason); there is no new `/api` or storage write. Static gates run in the **root tree only** (`npm run type-check && npm run test:unit`) — the `server/` tree is untouched (skip its gates with reason).
- **`individualFireAge` is per-member** (uses each member's own `ageFromDOB`). Two members landing on the same age is a legitimate coincidence, not a bug — assert it is *sourced* from `individualFireByMember`, not that the two ages differ.
- **Never weaken the reachability cap** in `individual-fire.ts` — it is the guard against the absurd age. If a member's individual FIRE is unreachable within `planToAge`, the headline must render the honest "—/not within horizon" path, NEVER a literal absurd age (the `fire-confidence-band` / rule-31 sentinel discipline).
- **Whole-household byte-identical:** when `viewingMemberId === null`, every hero field must equal today's exactly. Lock this with a test (Stage A).

---

## 2. STAGE A — composable selector + guardrail-test rewrite (kernel/composable; FinTech-gated)

**File(s):** `src/lib/useFireDerive.ts` (edit — add the lensed-headline selector), `src/lib/derive.spec.ts`
(rewrite the invariance test), `src/lib/headline-plausibility.spec.ts` (rewrite the invariance lock + add
the new lensed-headline sane-bounds lock). **Keep untouched:** `src/lib/derive.ts`, `src/lib/individual-fire.ts`
(read-only — the numbers already exist and are correct).

### Pre-made design decisions (do NOT deviate)
1. **Add one convenience selector** `heroHeadline` (computed) to `useFireDerive` that returns a normalized
   shape the hero consumes, branching on `ui.viewingMemberId`:
   - **Whole household** (`viewingMemberId == null`): `{ isMember:false, memberName:null, fireAge: householdFireAge, yearsToFire: yearsToRegular, fireNumber, corpusForProgress: totalCorpus, fireTargetForProgress: fireNumber, progressPercent, annualSavings, monthlyTakeHome, reachable: Number.isFinite(yearsToRegular) }` — i.e. **exactly today's household values** (byte-identical).
   - **Member selected**: resolve `r = individualFireByMember.find(m => m.memberId === viewingMemberId)`. If found: `{ isMember:true, memberName:r.name, fireAge:r.individualFireAge, yearsToFire:r.yearsToIndividualFire, fireNumber:r.individualFireNumber, corpusForProgress:r.attributableCorpus, fireTargetForProgress:r.individualFireNumber, progressPercent: clamp 0..100 of attributableCorpus/individualFireNumber, annualSavings: memberFinancials.surplus, monthlyTakeHome: memberFinancials.monthlyTakeHome, reachable: Number.isFinite(r.yearsToIndividualFire) }`. If NOT found (stale id) → fall back to the household branch (never crash).
2. **`reachable:false` honesty path:** when the member's individual FIRE is not within horizon (`yearsToIndividualFire` is `Infinity`/sentinel), `heroHeadline.fireAge` is `null` and the hero renders the honest "—" / "not within your working life" copy — NEVER a literal absurd age (rule 31 / `fire-confidence-band`).
3. **Do NOT change any household field** (`fireNumber`, `totalCorpus`, `householdFireAge`, `yearsToRegular`, `annualSavings`, `progressPercent`, `monteCarlo`, `projection`) — they remain household and are still consumed by every non-hero consumer (FireMilestones, StressTest, WhatIf, Goals, the netWorth snapshot, NudgeStack). `heroHeadline` is ADDITIVE.
4. **Guardrail-test REWRITE (red-first — write the new assertions, watch them fail against the un-wired hero/selector, then implement):**
   - `derive.spec.ts`: KEEP the existing "household FIRE number/age INVARIANT to member selection" test for the **kernel** fields (`fireNumber`/`householdFireAge`/`totalCorpus`/`annualSavings` stay invariant — those are the FIRE-math guardrail and DO NOT change). ADD a new test that `individualFireByMember` for a member yields a `individualFireNumber < household fireNumber` and a finite-or-honest `individualFireAge` (the proper mini-household number, never household÷1).
   - `headline-plausibility.spec.ts`: the headline-honesty lock changes target. REWRITE so it asserts: (a) `heroHeadline` on the **default lens** (`viewingMemberId:null`) equals the household values byte-identically (the #22/#23 protection on the DEFAULT path is preserved — the persona's default view is unchanged); (b) `heroHeadline` for a selected member sources from `individualFireByMember` (number == that member's `individualFireNumber`); (c) the lensed `heroHeadline.fireAge`, when present, is **domain-sane** — `≤ planToAge` and `≥ the member's current age` (the absurd ÷1 age-81 result can never render); (d) an unreachable member yields `fireAge == null` (honest "—"), never a sentinel number.
5. **No new dependency. No `derive.ts` math edit.** If a needed field is missing from `individualFireByMember`/`memberFinancials`, expose it read-only from the existing kernel computation — do not recompute FIRE math in the composable.

### Stage A acceptance
- `npm run type-check` (root) 0 errors; `npm run test:unit` (root) green incl. the rewritten guardrail tests; the new lensed-headline + sane-bounds + default-byte-identical locks all PASS.
- **Stage gate sweep:** static (root) → Rule 31 (the headline IS a user-facing value — the new `headline-plausibility` locks ARE the rule-31 sane-bounds assertions) → **Rule 29: `code-reviewer-agent` + `fintech-domain-analyst`** (this touches `src/lib/*` FIRE display logic — FinTech MUST validate the lensed headline is the honest mini-household FIRE, the caveat semantics are sound, the default path is unchanged, and no optimistic under-save framing is introduced) → Rule 26 (the selector's consumers) → Rule 33 (blind re-verify any test verdict). Rules 24/25/32 skip (no UI yet). All green before commit.

---

## 3. STAGE B — FireHero.vue lenses the headline (UI render + functionality)

**File(s):** `src/components/dashboard/FireHero.vue` (edit). **Keep untouched:** `IndividualFireCard.vue`.

### Pre-made design decisions (do NOT deviate)
1. **Headline** reads `fire.heroHeadline.value` (Stage A). Member selected → eyebrow `"<Name>'s individual FIRE — you'll FIRE at age"`, big number `heroHeadline.fireAge` (or the honest "—" when `!reachable`), `when` line from `heroHeadline.yearsToFire`. Whole household → today's copy verbatim.
2. **Caveat (member lens only)** — render below the headline, always when `heroHeadline.isMember`:
   *"This is **{Name}'s individual** FIRE — it funds only their own lifestyle (excludes the children + their split of shared costs). The **whole household** can stop at **age {householdFireAge}** (₹{household fireNumber}). Switch to **Whole household** above for your full plan."* Use `fire.householdFireAge`/`fire.fireNumber` for the household figures in the caveat (household stays available — the honesty anchor).
3. **Hide household-only sub-parts under the member lens** (`heroHeadline.isMember === true`): the #18 confidence **band** (`band`/`fullBandCopy` block), the **bridge subline**, the **"since you were away" delta**, and the **"Vs your plan"** + **"Biggest win available"** KPI slots. Keep the **"Corpus progress"** KPI slot but lens it: target `heroHeadline.fireTargetForProgress`, value `heroHeadline.corpusForProgress`, `progressPercent` from `heroHeadline.progressPercent`. Keep the **stats line** but lens it: annual-savings = `heroHeadline.annualSavings`, monthly-take-home = `heroHeadline.monthlyTakeHome`, blended-return stays household (it is an assumption, not member-attributable — label unchanged).
4. **Tone tint:** under the member lens use the neutral `fire-hero--no-baseline` gradient (the verdict tones depend on the household plan-variance which is hidden under the lens — do not show a verdict tone for an individual view).
5. **Whole-household view is BYTE-IDENTICAL:** every branch above must collapse to today's exact template/values when `!heroHeadline.isMember`. The `data-testid`s (`fire-hero`, `fire-hero-age`, `hero-kpi-corpus`, etc.) stay; add `data-testid="fire-hero-member-caveat"` for the new caveat.

### Stage B acceptance
- Root static green. **Rule 24** (render): drive the dashboard — Whole household shows 55/household (unchanged); View-as Priya shows Priya's individual age + the caveat; View-as Rohit shows Rohit's. Screenshot + ARIA + console clean (PNG read + confirmed). **Rule 32** (functionality): switching the "View as" dropdown RECOMPUTES the headline live (the big age changes), the band/plan/win slots disappear under the member lens and reappear on Whole household, no NEW console error. **Rule 31**: each lensed age is persona-sane (within working life). **Rule 29**: `code-reviewer-agent` (UI diff). **Rule 26**: the IndividualFireCard's numbers for the same member agree (±1) with the new hero headline. **Rule 33**: blind re-verify the screenshot verdict. Rule 25 skips (no write). All green/deferred-with-reason before commit.

---

## 4. STAGE C — Dashboard.vue gates the household-only siblings under the lens (UI)

**File(s):** `src/pages/fire-goals/Dashboard.vue` (edit).

### Pre-made design decisions (do NOT deviate)
1. Under a member lens (`ui.viewingMemberId != null`), **hide** `<FireProjectionChart>` and `<FireMilestonesCard>` (option B — they are whole-household-only). Wrap each in `v-if="!ui.viewingMemberId"`. Do NOT hide `IndividualFireCard` (it is the relevant comparison under the lens), the section-card row, the donut, bridge, or runway (those already lens correctly from `d7f11aa`).
2. Do NOT add a second "switch to Whole household" note here — the hero caveat (Stage B decision 2) already carries it; avoid duplicate copy.
3. Whole-household view renders every component exactly as today.

### Stage C acceptance
- Root static green. **Rule 24/32**: under the member lens the projection chart + milestones are gone, on Whole household they return; no NEW console error. **Rule 29** (UI diff). **Rule 26** (always). **Rule 33** (blind). All green before commit.

---

## 5. Verification gates (standing rules — adapted to this tree)

> **All rules in `.claude/rules/claude-behavior.md` are operative.** Rules **24, 26, 29, 31, 32, 33 are
> MANDATORY** at every task AND stage boundary (Abhay standing mandate). Rule 25 is **N/A for this
> contract** (display-only; no write path) — skip with the reason `rule 25 skipped: no write-path change`.
> Test PLACEMENT follows `.claude/rules/testing-strategy.md`. This is a **member-attributable / display
> change → `.claude/rules/member-landscape-verification.md` applies in full** (the static lens-coverage
> scan + the FULL E2E "Viewing as" sweep — never a subset).

**Static gates (root tree only):** `npm run type-check && npm run test:unit` (the `server/` tree is
untouched → `server` gates skip with reason).

**Rule 24** (per UI screen — render): self-heal the dev server if down; drive Playwright MCP →
`browser_navigate` `/fire-goals/dashboard` → `browser_take_screenshot` → `browser_snapshot` →
`browser_console_messages`. ALL THREE must hold for Whole-household AND each member. ≤3 iterations →
`/fix-loop` → `/systematic-debugging`.

**Rule 32** (interactive functionality): exercise the **"View as"** dropdown — Whole household → Priya →
Rohit → Whole household — and confirm the **big FIRE age recomputes each switch**, the household-only
sub-parts hide/reappear, no NEW console error. "It renders" is not enough.

**Rule 31** (output plausibility — the headline IS the flagship value): on EACH lens the FIRE age is
domain-sane (≥ member's current age, ≤ planToAge); the **default Whole-household view is byte-identical**
to today (the persona's default is unchanged). The `headline-plausibility.spec.ts` locks (Stage A) are
the regression form of this.

**Rule 29** (independent review): `code-reviewer-agent` on every non-trivial diff; **`fintech-domain-analyst`
on the Stage-A `src/lib/*` change** — validate the lensed headline is the honest mini-household FIRE, the
caveat is sound, the default path unchanged, no optimistic under-save framing. Act on every blocker/HIGH
before that stage's commit; file deferred-but-real findings as Issues.

**Rule 26** (cross-page, always): the hero headline for a member agrees (±1) with that member's row in the
`IndividualFireCard` and with the `individualFireByMember` API path; the Whole-household headline equals the
household FIRE everywhere it appears.

**Rule 33** (blind test re-verification, always when a verdict exists): every Playwright/UI verdict this run
produces is re-checked by a SEPARATE context-blind agent given the SAME inputs + RAW evidence (screenshot
paths copied INTO the goal worktree's evidence dir + `ls`-confirmed first; full-page, dropdown-open,
before/after Whole-household-vs-member pair). Reconcile any dissent before accepting.

**Member-landscape sweep (mandatory, `member-landscape-verification.md`):** run BOTH —
`src/lib/lens-coverage-invariant.spec.ts` (static) AND the FULL `e2e/member-lens-sweep.spec.ts` (real
dropdown, every route, demo mode). **Extend the dashboard assertion** so it now also requires the
**FIRE-hero age token** (`[data-testid="fire-hero-age"]`) to DIFFER for ≥1 member vs Whole household
(the new behavior). If the sweep "won't run", first verify the sweep itself isn't broken (it waits on
`.v-select:has(.mdi-eye)` + dismisses `.tour-overlay`) — a uniformly-timing-out gate is broken, not green.

**Prod Tier-2 re-verify (the acceptance proof Abhay asked for):** AFTER merge, drive a **headed** browser
(launched via the **PowerShell** runner, not Bash — Bash runs on an invisible display per
`ui-verification.md`) against **live firekaro.com** using the seeded dedicated test account session
`e2e/.auth/user.json` (`abhayfaircent`, ~7-day life — if expired, surface "authed prod re-verify SKIPPED —
session expired" and DEFER, do not fake). NON-DESTRUCTIVE (only the "View as" dropdown). Capture
screenshots for Whole household / Priya / Rohit and confirm the **big FIRE age differs per member** on
the live deployed build. (This is post-merge verification of the change in `main`; the **prod deploy
itself is Abhay's gate** — do NOT deploy from this run.)

**Failure-recovery budget:** per-task ~15 attempts (≈5 inline → `/fix-loop` → `/systematic-debugging`) →
DEFER + continue. MCP hang: 3 cycles (wait+retry → close+navigate → kill+restart dev server) → DEFER. Hard
halt ONLY: `npm install` failure, contract decision-contradiction, irrecoverable build break after the full
budget, OS permission denial, missing required token. Context-budget anxiety is NOT a halt — hand off via a
one-line continuation note, never fake-complete.

---

## 6. Commit + push

- **3 commits** (one per stage), conventional, scope `feat(fire)`:
  1. `feat(fire): expose member-lensed hero-headline selector + rewrite FIRE-headline guardrail tests`
  2. `feat(fire): FireHero headline lenses to the selected member's individual FIRE (option B)`
  3. `feat(fire): hide whole-household-only projection + milestones under the member lens`
- Stage commits via `git-manager-agent` (secret scan). **NEVER `git add -A`** — stage only the files each
  stage names; the working tree has unrelated untracked `docs/goals/*.md` + `scripts/*.mjs` — DO NOT stage them.
- Branch `feat/member-lensed-fire-headline`; on success merge `--no-ff` → `main`, push, then self-clean the
  worktree (§0.1.4). Co-author trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Update `docs/PROJECT-LOG.md` D-2026-06-13-02 to "BUILT + shipped (`<merge-sha>`)" as part of the final
  commit. Do NOT deploy to prod (Abhay's gate).

---

## 7. Definition of Done (all MUST be true)

**Build / change:**
- [x] `useFireDerive` exposes `heroHeadline` (household byte-identical on default; member individual FIRE when lensed; honest "—" when unreachable).
- [x] `FireHero.vue` headline + corpus-progress + stats lens to the selected member; the band + plan/win KPIs + bridge subline + delta are HIDDEN under the member lens; the member caveat (`fire-hero-member-caveat`) renders; Whole household is byte-identical.
- [x] `Dashboard.vue` hides `FireProjectionChart` + `FireMilestonesCard` under the member lens; everything else unchanged.
- [x] Guardrail tests REWRITTEN not deleted: kernel household-invariance kept; new locks = default-byte-identical + member-sourced-from-`individualFireByMember` + lensed-age sane-bounds + unreachable→null.

**Static gates:**
- [x] root `type-check` 0 errors · `test:unit` no regression (incl. rewritten guardrail + new locks) · `build` succeeds. (server gates skipped — reason: server untouched.)

**Rule 24 (per UI screen — render):**
- [x] screenshot + ARIA + console pass for Whole-household AND Priya AND Rohit; PNGs read + confirmed; zero NEW console errors.

**Rule 32 (interactive functionality):**
- [x] the "View as" dropdown switch RECOMPUTES the big FIRE age live; household-only sub-parts hide/reappear; no NEW console error.

**Rule 25 (write path):** skipped — reason: `no write-path change` (display-only).

**Rule 31 (output plausibility):**
- [x] each lensed FIRE age is persona-sane (≥ current age, ≤ planToAge); default Whole-household view byte-identical; `headline-plausibility.spec.ts` locks added/rewritten. FinTech-validated end-to-end.

**Rule 29 (independent review — every non-trivial diff):**
- [x] `code-reviewer-agent` on each stage diff; **`fintech-domain-analyst` on Stage A**; every blocker/HIGH acted on or filed.

**Rule 26 (cross-page consistency):**
- [x] member hero headline agrees (±1) with the IndividualFireCard row + the `individualFireByMember` path; Whole-household headline equals the household FIRE everywhere.

**Rule 33 (blind independent test verification):**
- [x] every UI verdict re-checked by a separate context-blind agent (same inputs + raw evidence, paths confirmed in-worktree); coverage + verdict concur; dissents reconciled.

**Member-landscape (mandatory):**
- [x] `lens-coverage-invariant.spec.ts` green; FULL `e2e/member-lens-sweep.spec.ts` green WITH the new dashboard FIRE-age-differs assertion.

**Prod Tier-2 re-verify (post-merge):**
- [x] headed live re-verify on `abhayfaircent` — screenshots show the big FIRE age DIFFERS per member on the deployed build (OR DEFERRED with "session expired"/"prod not yet deployed — Abhay's gate", never faked).

**a11y / Lighthouse:**
- [x] zero Critical+Serious WCAG 2.1 AA on the dashboard (or DEFERRED w/ reason).

**Ship:**
- [x] 3 conventional commits pushed to `feat/member-lensed-fire-headline`.
- [x] **On success only:** merged `--no-ff` → `main`, pushed, worktree self-cleaned (§0.1.4). PROJECT-LOG D-2026-06-13-02 updated to "BUILT + shipped (`<sha>`)".
- [x] Deferrals logged in `docs/goals/.run/2026-06-13-member-lensed-fire-headline-DEFERRED.md` with rule status + reason.
- [x] Progress log maintained throughout (§0.3); lessons rolled into the final report + a notable lesson appended to `.claude/tasks/lessons.md`.

---

## 8. Final report (required on completion)

Open with the **SUMMARY block — DONE / PENDING / BLOCKED / NEXT** (§0.3 step 6). Then: commit SHAs +
per-stage gate results; Rule 24 verdict per screen + PNG paths; Rule 31 sane-bounds + FinTech verdict;
Rule 26 cross-page result; member-landscape sweep result; prod Tier-2 re-verify verdict (or defer reason);
a11y summary; DoD green/amber/red tally; DEFERRED entries with rule status + reason.

Plus a **LEARNINGS TO FOLD BACK** section (from the §0.3 log), routed per the canonical taxonomy in
`references/baked-in-rules.md` §0.3 step 5 (GENERIC → skill/process-rule; PRODUCT-SPECIFIC class → product
rule, else this contract; gate over prose; one home, dedup), as PROPOSALS for Abhay. Auto-append only the
one-line error→fix→lesson (with a gate-gap line) to `.claude/tasks/lessons.md`.

---

## 9. Guardrails (hard stops)

- **`src/` only.** Never write outside it; never write `D:\Abhay\VibeCoding\5Wealths\`. Strategic items → `TODO(5W):` notes.
- **No new dependencies.**
- **No FIRE-math edit** — `derive.ts` / `individual-fire.ts` are read-only here; `heroHeadline` only *selects* already-computed values. Do NOT recompute FIRE math in the composable or weaken the reachability cap.
- **No design reinvention** — reuse the existing hero template structure + `data-testid`s; extend, don't rebuild.
- **Honesty:** the member headline MUST carry the household caveat; an unreachable individual FIRE renders the honest "—", never a sentinel/absurd age. No synthetic data.
- **Option A is OUT of scope** — do NOT build per-member Monte-Carlo / projection; hide those sub-parts (option B). If tempted, log a `LEARNINGS TO FOLD BACK` note for a future contract instead.
- **Do NOT deploy to prod** — the prod deploy is Abhay's gate. The run merges to `main` + verifies on the already-deployed build (or defers the prod re-verify).
- **Stop only on a true blocker** (above). Context-budget anxiety is NOT a blocker — hand off via a one-line continuation note, never fake-complete.

---

## Authorization trail

| # | Decision | Choice |
|---|---|---|
| 1 | Should the FIRE headline lens per member, or stay household-invariant (#81)? | **Lens per member** (reverses #81; Whole household = combined) — Abhay via AskUserQuestion 2026-06-13 (D-2026-06-13-02). |
| 2 | What do the hero's household-only sub-parts (band / plan+win KPIs / projection / milestones) do under the lens? | **Option B — hide them under the member lens + caveat** (the lensed headline + corpus + stats remain). Option A (per-member MC/projection) = future enhancement, OUT of scope. Goal-anchored pre-decision (Abhay: "go as per your recommendation"). |
| 3 | Source of the per-member headline numbers? | **`individualFireByMember` + `memberFinancials`** (already-computed honest mini-household FIRE) — no new FIRE math, reachability cap preserved. |
| 4 | Persistence/verification mode? | **Display-only — Rule 25 N/A.** Demo localStorage for the E2E sweep; headed server-adapter prod re-verify on `abhayfaircent` post-merge. |
| 5 | Guardrail tests — delete or rewrite? | **Rewrite, not delete.** Kernel household-invariance kept; headline locks retargeted to: default byte-identical + member-sourced + lensed-age sane-bounds + unreachable→null. |
| 6 | Deploy to prod in this run? | **No — Abhay's gate.** Merge to `main` + verify on the deployed build (or defer). |

---

## References (loaded transitively by the skills this contract invokes)

- `rules/claude-behavior.md` — rules 15, 17, 20, 23, 24, 25, 26, 29, 31, 32, 33
- `rules/member-landscape-verification.md` — the mandatory full "Viewing as" sweep (no subset)
- `rules/goal-anchored-decisions.md` — the persona-anchored evaluation criterion (#22/#23 honesty)
- `rules/testing-strategy.md` — test PLACEMENT SSOT
- `rules/independent-test-verification.md` — rule 33 blind re-verification
- `rules/output-plausibility-verification.md` — rule 31 semantic sanity on the default lens
- `rules/operating-model.md` — rule 29 independent-reviewer edge (+ `fintech-domain-analyst` for math)
- `rules/tdd-rule.md` — red-first for the guardrail-test rewrite
- `rules/ui-verification.md` — headed via the PowerShell runner (Bash = invisible display); data-entry-vs-render
- `docs/PROJECT-LOG.md` §3 — D-2026-06-13-02 (this decision), D-2026-06-08-19/20/22 (#81 reversed)
- Skills this contract drives: `/fix-loop`, `/systematic-debugging`, `/auto-verify`, `/a11y-audit`
