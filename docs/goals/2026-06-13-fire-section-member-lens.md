# GOAL — Member lens across the rest of the FIRE section (Goals lenses · Readiness/StressTest/Drawdown/WhatIf badge)

**Type:** Autonomous **build** contract (run via `/goal`). Execute end-to-end with **zero user
input**. Every design decision is pre-made below — do not pause to ask; make the call the contract
specifies and keep going until the Definition of Done is fully met.

**Owner:** Abhay · **Created:** 2026-06-13 · **Scope:** `src/pages/fire-goals/` + the named libs ONLY
**Invocation:** `/goal docs/goals/2026-06-13-fire-section-member-lens.md`

---

## 0. Mission

The Dashboard's FIRE figures now lens to the selected "View as &lt;member&gt;" adult (D-2026-06-13-02,
shipped `093a339`), but the **other 5 FIRE-section screens still show household figures and do NOT
respond to the lens at all** (0 lens references today). Make the whole FIRE section respond to the
member lens, the **same way** as the Dashboard (option B):

- **`Goals.vue` LENSES** — when a member is selected, show **that member's individual FIRE target +
  progress** (from the already-computed `individualFireByMember`), with the same caveat pattern as the
  hero; "Whole household" shows the combined household FIRE (today's values, byte-identical).
- **`Readiness.vue`, `StressTest.vue`, `Drawdown.vue`, `WhatIf.vue` render the existing
  `WholeHouseholdBadge`** under a member lens — they run full **household** projections/simulations
  ("is the *family* safe to stop?", stress the *family* plan, *family* drawdown, *family* what-if) with
  no cheap per-member equivalent (that is the deferred FinTech "option A" / **#162** per-member
  projection engine). The badge makes it **honest + explicit** ("this is a whole-household figure — it
  does not change when you view &lt;member&gt;") so nothing is silently frozen. The figures themselves
  stay household (correct) and are UNCHANGED.

**The one non-negotiable outcome:** every FIRE-section screen RESPONDS to "View as &lt;member&gt;" —
Goals re-scopes its FIRE target/progress to the member, and the other four visibly show the
Whole-household badge — while the **default ("Whole household") view of every screen is byte-identical
to today**. Resolved with Abhay via AskUserQuestion 2026-06-13 ("Lens where clean, badge the rest").

---

## 0.1 WORKTREE ISOLATION (run's very first action)

> **First action, before §0.2 and any stage. Non-negotiable.** Run in a **dedicated git worktree**,
> never the user's primary interactive checkout.
>
> 1. **Isolate:** `root=$(git rev-parse --show-toplevel)`. If `root` is the primary checkout
>    (`…/firekaro-planner`), `git worktree add ../firekaro-goal-fire-section-lens -b feat/fire-section-member-lens`
>    and run every stage there. NEVER multi-commit in the primary worktree.
> 2. **Claim it:** export a unique `GOAL_RUN_TOKEN` (e.g. `fire-section-lens-<nonce>`) and write
>    `printf '%s\n' "$GOAL_RUN_TOKEN" > "$(git rev-parse --show-toplevel)/.goal-active.lock"`.
>    `.githooks/pre-commit` HARD-BLOCKS any commit whose token ≠ this lock.
> 3. **Release on exit:** FINAL action (after merge/push OR any halt/defer) removes the lock
>    `rm -f "$(git rev-parse --show-toplevel)/.goal-active.lock"` (gitignored). If `git worktree` is
>    unavailable, note it + proceed — but NEVER run in the primary checkout.
> 4. **Self-cleanup ON SUCCESS ONLY:** after merge `--no-ff` → `main` + push + lock release, `cd` to the
>    primary root and run `git worktree remove --force ../firekaro-goal-fire-section-lens ; git branch -D feat/fire-section-member-lens ; git worktree prune`
>    (Windows may print `Invalid argument` while de-registering — fine; `prune` finalises). DEFER/HALT
>    keeps the worktree + branch for resume — only the lock is released.

---

## 0.2 PREFLIGHT — idempotency · NO duplication (run's first numbered action)

> **First action, before ANY stage. Non-negotiable.** Safe to run while a parallel session implements part.
>
> 1. **Read the ledger:** `docs/PROJECT-LOG.md` §3 — D-2026-06-13-02 (the Dashboard headline lens, the
>    pattern this mirrors) + this scope's entry. PROJECT-LOG is the cross-session source of truth.
> 2. **For every screen, check the code + `git log --oneline -25` first:** `grep -n "WholeHouseholdBadge\|viewingMemberId\|individualFireByMember\|heroHeadline" src/pages/fire-goals/{Goals,Readiness,StressTest,Drawdown,WhatIf}.vue`.
>    If a screen ALREADY lenses/badges as specified → SKIP the build, verify-only. Build only the missing delta.
> 3. **Record every skip** in the final report's "skipped (already covered)" list.

---

## 0.3 PROGRESS LOG — live, cross-session-trackable

> **Append-only progress log; update BEFORE leaving each stage/event.**
> 1. **Location:** `docs/goals/.run/2026-06-13-fire-section-member-lens-PROGRESS.md` (this worktree; `.run/` gitignored).
> 2. **First line:** slug · branch · worktree · start (`date "+%Y-%m-%d %H:%M"`) · contract · mission.
> 3. **Append ≤2-line entries at:** stage start; stage done (gate result); each DEFECT; each "not working" EVENT + what you did; each independent-review outcome; each DEFER/skip; each blocker; the final result.
> 4. **Format:** `[YYYY-MM-DD HH:MM] <STAGE|PROGRESS|DEFECT|EVENT|DECISION|RECOVERY|BLOCKER|DONE> — <≤2 lines>`.
> 5. **At run-end, derive learnings + route by scope:** AUTO-append each notable error→fix→lesson (gate-gap line, dedup-grep first) to `.claude/tasks/lessons.md`; PROPOSE a **"LEARNINGS TO FOLD BACK"** section in the committed report (GENERIC→skill/process-rule; PRODUCT class→product rule, else this contract; gate over prose; one home, dedup). The run NEVER edits its own contract/skill/rule.
> 6. **Run-end SUMMARY** (final PROGRESS entry + report): **DONE** · **PENDING** (deferred + reason) · **BLOCKED** (gated + why) · **NEXT** (single next action + owner).

---

## 1. Context you need (read first)

| Thing | Path / import | Why it matters |
|---|---|---|
| **The 5 target screens** | `src/pages/fire-goals/{Goals,Readiness,StressTest,Drawdown,WhatIf}.vue` | None reference the lens today. Goals shows `fire.fireNumber`/`totalCorpus`/`progressPercent`/`yearsToRegular`; StressTest `fire.effectiveSWR`/`totalCorpus`; Drawdown `fire.fireNumber`/`fireWithdrawableCorpus`/`progressPercent`/`yearsToRegular`; WhatIf (861 lines) the full set; Readiness (53 lines) is a thin wrapper delegating to a child verdict component. |
| **The badge to REUSE** | `src/components/shared/WholeHouseholdBadge.vue` | Renders a "Whole household" chip + explanatory tooltip ONLY when `ui.viewingMemberId != null` (and not solo); renders nothing on the default view. Drop-in for the 4 simulation screens — self-gating, no props. |
| **The Dashboard precedent (the pattern to mirror)** | `src/components/dashboard/FireHero.vue` (`heroHeadline` consumption + caveat) + `src/lib/useFireDerive.ts` (`heroHeadline`, `individualFireByMember`, `memberFinancials`) | Goals reuses the SAME member-individual-FIRE source + caveat shape. `individualFireByMember[i]` = `{ memberId, name, individualFireNumber, individualFireAge, yearsToIndividualFire, attributableCorpus, anchorAge }`. |
| **Per-member FIRE source (read-only)** | `src/lib/individual-fire.ts`, `src/lib/derive.ts` (`individualFireByMember`) | Already computed + honest (reachability cap). Goals only DISPLAYS it; do NOT recompute or touch FIRE math. |
| **Lens state** | `src/stores/ui.ts` (`viewingMemberId`) | null = Whole household. |
| **Member-landscape sweep** | `e2e/member-lens-sweep.spec.ts` + `src/lib/lens-coverage-invariant.spec.ts` | Extend to cover the 5 FIRE routes (`/fire-goals/{goals,readiness,stress-test,drawdown,what-if}` — confirm the exact route paths in `src/router/index.ts`): Goals' FIRE target differs per member; the other 4 show `whole-household-badge` under a member lens. |

**Gotchas:**
- **Display-only — NO write path.** Rule 25 N/A (skip with reason). Static gates **root tree only** (`server/` untouched → skip with reason).
- **WholeHouseholdBadge is self-gating** — just mount it; do NOT add a manual `v-if="viewingMemberId"` wrapper (the component already does that). It correctly renders nothing on the default view → byte-identical default.
- **Goals must reuse the member's PROPER individual FIRE** (`individualFireByMember`), never household-FIRE ÷ 1 (#22 trap). On default lens, Goals = today's household values byte-identical.
- **Readiness is a wrapper** — place the badge in the wrapper (or the child verdict header), wherever the verdict renders, so it's visible alongside the household readiness verdict.
- **Confirm exact route paths** for the sweep from `src/router/index.ts` before editing the sweep list (don't guess).

---

## 2. STAGE A — Goals.vue lenses to the member's individual FIRE (UI; FinTech-gated)

**File(s):** `src/pages/fire-goals/Goals.vue` (edit); optionally a thin convenience computed in
`src/lib/useFireDerive.ts` if Goals needs the selected member's individual-FIRE record handy (prefer
reading `fire.individualFireByMember.value.find(r => r.memberId === ui.viewingMemberId)` inline if simple).
**Keep untouched:** `derive.ts`, `individual-fire.ts` (FIRE math read-only).

### Pre-made design decisions (do NOT deviate)
1. When `ui.viewingMemberId` resolves to an adult in `individualFireByMember` (`isMember`), Goals' FIRE
   target = that member's `individualFireNumber`, progress = `clamp(0..100, attributableCorpus / individualFireNumber)`,
   years/age from `yearsToIndividualFire`/`individualFireAge` (honest "—"/"not within horizon" when unreachable —
   never a sentinel age). Heading/eyebrow names the member ("&lt;Name&gt;'s individual FIRE goal").
2. **Caveat** (member lens only), mirroring the hero: "This is &lt;Name&gt;'s individual FIRE goal — it funds
   only their own lifestyle (excludes the children + their split of shared costs). The whole household's
   FIRE goal is ₹&lt;household fireNumber&gt; (age &lt;householdFireAge&gt;). Switch to Whole household for the family goal."
3. **Whole household (default)** = today's exact values/template (byte-identical). A stale member id → fall back to household (never crash).
4. No FIRE-math edit; no new dependency.

### Stage A acceptance
- Root static green. **Rule 24/32:** Goals renders + the FIRE target/progress recompute when switching "View as" (household → each member); caveat renders under the member lens; no NEW console error. **Rule 31:** each member's FIRE goal is sane (≥ a working adult's corpus, ≤ household; age within horizon); default byte-identical. **Rule 29:** `code-reviewer-agent` + **`fintech-domain-analyst`** (member FIRE target is the honest mini-household number, caveat sound, default unchanged). **Rule 26:** Goals' member FIRE target agrees (±1) with the hero's headline + the IndividualFireCard for the same member. **Rule 33** blind re-verify. Rule 25 skip. All green before commit.

---

## 3. STAGE B — Readiness/StressTest/Drawdown/WhatIf show the Whole-household badge under the lens (UI)

**File(s):** `src/pages/fire-goals/{Readiness,StressTest,Drawdown,WhatIf}.vue` (edit — add the badge).
**Keep untouched:** their household FIRE figures/logic (correct as-is).

### Pre-made design decisions (do NOT deviate)
1. Import `WholeHouseholdBadge` from `@/components/shared/WholeHouseholdBadge.vue` and mount it ONCE near
   the top of each screen's content (beside the page header/title, where the user sees it before the
   household figures). It self-gates (renders only when a member is active) — do NOT wrap it in a manual `v-if`.
2. Do NOT change any FIRE figure, projection, simulation, or verdict on these 4 screens — they remain
   whole-household (correct). The badge is the ONLY change. Per-member projection for these is OUT of
   scope (deferred #162 / option A) — if tempted, log a LEARNINGS note, do not build it.
3. For `Readiness.vue` (wrapper), mount the badge in the wrapper or the verdict child's header so it sits
   with the rendered verdict. Whole-household (default) view byte-identical (badge renders nothing).

### Stage B acceptance
- Root static green. **Rule 24/32:** each of the 4 screens shows the `whole-household-badge` under a
  member lens and NOTHING on Whole household; the household figures are unchanged; no NEW console error.
  **Rule 29** (UI diff). **Rule 26** (always). **Rule 33** (blind). Rules 25/31 skip (no write, no new value). All green before commit.

---

## 4. Verification gates (standing rules — adapted to this tree)

> **All rules in `.claude/rules/claude-behavior.md` operative.** Rules **24, 26, 29, 31, 32, 33 MANDATORY**
> at every task + stage boundary. Rule 25 **N/A** (display-only — `rule 25 skipped: no write-path change`).
> **Member-attributable/display change → `.claude/rules/member-landscape-verification.md` applies in
> full** (the static lens-coverage scan + the FULL E2E "Viewing as" sweep — never a subset). Test
> PLACEMENT per `.claude/rules/testing-strategy.md`.

**Static gates (root only):** `npm run type-check && npm run test:unit` (`server/` untouched → skip with reason).

**Rule 24/32:** self-heal the dev server; drive Playwright MCP to each of the 5 FIRE routes; for Goals
confirm the FIRE target recomputes per member; for the 4 others confirm the badge appears under a member
lens + nothing on Whole household. Screenshot + ARIA + console clean per screen. ≤3 iterations → `/fix-loop` → `/systematic-debugging`.

**Rule 31:** Goals' per-member FIRE goal is domain-sane; every screen's Whole-household view byte-identical to today. Add/extend a Goals sane-bounds lock in `src/lib/headline-plausibility.spec.ts` if a new flagship value is introduced.

**Rule 29:** `code-reviewer-agent` on every non-trivial diff; **`fintech-domain-analyst` on the Goals
lensing** (member FIRE target honesty). Act on blocker/HIGH before commit; file deferred-but-real as Issues.

**Rule 26 (always):** Goals' member FIRE target == the hero headline + IndividualFireCard for the same member (±1). The 4 badged screens' household figures equal the Dashboard's household figures.

**Rule 33 (always):** blind context-blind re-verify of every UI verdict (evidence paths copied INTO the goal worktree + `ls`-confirmed; full-page, dropdown-open, household-vs-member pair). Reconcile dissent before accepting.

**Member-landscape sweep (mandatory):** run BOTH `src/lib/lens-coverage-invariant.spec.ts` (static — add the 5 FIRE routes' expected behavior) AND the FULL `e2e/member-lens-sweep.spec.ts` extended so: `/fire-goals/goals` FIRE target differs for ≥1 member; the other 4 FIRE routes assert the `whole-household-badge` is visible under a member lens. If the sweep "won't run", first verify the sweep itself isn't broken (waits on `.v-select:has(.mdi-eye)` + dismisses `.tour-overlay`).

**Prod Tier-2 re-verify (post-merge):** headed (PowerShell runner, NOT Bash) on live firekaro.com using the seeded `abhayfaircent` session (`e2e/.auth/user.json`; if expired → surface "SKIPPED — session expired" + DEFER, never fake). NON-DESTRUCTIVE (only the View-as dropdown). Capture screenshots of each of the 5 FIRE screens under Whole-household + ≥1 member; confirm Goals lenses + the 4 others badge. **Do NOT deploy from this run — the prod deploy is Abhay's gate.**

**Failure-recovery budget:** per-task ~15 attempts (≈5 inline → `/fix-loop` → `/systematic-debugging`) → DEFER + continue. MCP hang: 3 cycles → DEFER. Hard halt ONLY: `npm install` failure, contract decision-contradiction, irrecoverable build break after the full budget, OS denial, missing token. Context-budget anxiety is NOT a halt.

---

## 5. Commit + push

- **2 commits**, conventional, scope `feat(fire)`:
  1. `feat(fire): Goals screen lenses to the selected member's individual FIRE goal`
  2. `feat(fire): Whole-household badge on Readiness/StressTest/Drawdown/WhatIf under the member lens`
- Stage commits via `git-manager-agent` (secret scan). **NEVER `git add -A`** — stage only the named files;
  the working tree has unrelated untracked `docs/goals/*.md` + `scripts/*.mjs` — DO NOT stage them.
- Branch `feat/fire-section-member-lens`; on success merge `--no-ff` → `main`, push, self-clean the worktree
  (§0.1.4). Co-author `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Append a PROJECT-LOG line
  under D-2026-06-13-02 (or a new D-2026-06-13-03) recording the FIRE-section lens completion + the merge SHA. Do NOT deploy (Abhay's gate).

---

## 6. Definition of Done (all MUST be true)

**Build / change:**
- [ ] `Goals.vue` lenses: member's individual FIRE target + progress + caveat when lensed; household byte-identical on default; honest "—" when unreachable.
- [ ] `Readiness/StressTest/Drawdown/WhatIf` each mount `WholeHouseholdBadge` (self-gating); their household figures UNCHANGED; default byte-identical.

**Static gates:**
- [ ] root `type-check` 0 · `test:unit` no regression · `build` succeeds. (server skipped — untouched.)

**Rule 24 (per UI screen):** all 5 FIRE screens screenshot + ARIA + console pass for Whole-household AND ≥1 member; PNGs read+confirmed; zero NEW console errors.

**Rule 32 (interactive):** the "View as" dropdown re-scopes Goals' FIRE target live; the 4 others show/hide the badge on switch; no NEW console error.

**Rule 25:** skipped — `no write-path change`.

**Rule 31:** Goals' member FIRE goal sane on the default lens; every screen's Whole-household view byte-identical; FinTech-validated.

**Rule 29:** `code-reviewer-agent` on each diff; `fintech-domain-analyst` on Goals; blocker/HIGH acted on or filed.

**Rule 26:** Goals member FIRE target == hero headline + IndividualFireCard (±1); badged screens' household figures == Dashboard household figures.

**Rule 33:** every UI verdict blind-re-verified (same inputs + raw evidence in-worktree); coverage + verdict concur; dissents reconciled.

**Member-landscape:** `lens-coverage-invariant.spec.ts` green (5 FIRE routes added); FULL `member-lens-sweep` green WITH Goals-lenses + 4×badge assertions.

**Prod Tier-2 re-verify (post-merge):** headed live re-verify on `abhayfaircent` — Goals lenses + the 4 others badge under a member lens (OR DEFERRED "session expired"/"prod not yet deployed — Abhay's gate", never faked).

**a11y / Lighthouse:** zero Critical+Serious WCAG 2.1 AA on the 5 FIRE screens (or DEFERRED w/ reason).

**Ship:**
- [ ] 2 conventional commits pushed to `feat/fire-section-member-lens`.
- [ ] **On success only:** merged `--no-ff` → `main`, pushed, worktree self-cleaned (§0.1.4). PROJECT-LOG updated with the merge SHA.
- [ ] Deferrals logged in `docs/goals/.run/2026-06-13-fire-section-member-lens-DEFERRED.md` with rule status + reason.
- [ ] Progress log maintained throughout (§0.3); lessons rolled into the final report + a notable lesson appended to `.claude/tasks/lessons.md`.

---

## 7. Final report (required on completion)

Open with the **SUMMARY — DONE / PENDING / BLOCKED / NEXT** (§0.3 step 6). Then: commit SHAs + per-stage
gate results; Rule 24 verdict per screen + PNG paths; Rule 31 + FinTech verdict (Goals); Rule 26
cross-page; member-landscape sweep result; prod Tier-2 verdict (or defer reason); a11y summary; DoD
green/amber/red tally; DEFERRED entries. Plus a **LEARNINGS TO FOLD BACK** section (routed per the
canonical taxonomy) as PROPOSALS for Abhay; auto-append only the one-line lesson to `.claude/tasks/lessons.md`.

---

## 8. Guardrails (hard stops)

- **`src/pages/fire-goals/` + the named libs only.** Never write outside it; never `5Wealths\`. Strategic → `TODO(5W):`.
- **No new dependencies. No FIRE-math edit** — `derive.ts`/`individual-fire.ts` read-only; Goals only DISPLAYS the existing per-member numbers.
- **No per-member projection/simulation for the 4 badged screens** — that is the deferred #162 / option-A work, explicitly OUT of scope. The badge is the whole fix for them.
- **No design reinvention** — reuse `WholeHouseholdBadge` + the hero's `individualFireByMember`/caveat pattern.
- **Honesty:** Goals' member caveat MUST name the household number; unreachable individual FIRE → honest "—", never a sentinel. No synthetic data.
- **Do NOT deploy to prod** — Abhay's gate. Merge to `main` + verify on the deployed build (or defer the prod re-verify).
- **Stop only on a true blocker.** Context-budget anxiety is NOT a blocker — hand off via a one-line note, never fake-complete.

---

## Authorization trail

| # | Decision | Choice |
|---|---|---|
| 1 | How far should the other 5 FIRE screens lens? | **Lens where clean, badge the rest** — Goals lenses; Readiness/StressTest/Drawdown/WhatIf show the Whole-household badge. Abhay via AskUserQuestion 2026-06-13. |
| 2 | Goals' per-member FIRE source? | **`individualFireByMember`** (existing honest mini-household FIRE) — no new math; default byte-identical. |
| 3 | Badge component for the 4 simulation screens? | **Reuse `WholeHouseholdBadge`** (self-gating; existing; designed for exactly this). |
| 4 | Per-member projection/simulation for the 4 screens? | **OUT of scope** — deferred #162 / option A. The badge is the honest fix now. |
| 5 | Deploy in this run? | **No — Abhay's gate.** Merge to `main`; deploy handled post-run. |

---

## References (loaded transitively)

- `rules/claude-behavior.md` — rules 15, 17, 20, 23, 24, 25, 26, 29, 31, 32, 33
- `rules/member-landscape-verification.md` — the mandatory full "Viewing as" sweep (no subset)
- `rules/goal-anchored-decisions.md` · `rules/testing-strategy.md` · `rules/independent-test-verification.md` · `rules/output-plausibility-verification.md` · `rules/operating-model.md` · `rules/tdd-rule.md` · `rules/ui-verification.md`
- `docs/PROJECT-LOG.md` §3 — D-2026-06-13-02 (the Dashboard headline lens this mirrors)
- Skills driven: `/fix-loop`, `/systematic-debugging`, `/auto-verify`, `/a11y-audit`
