# FINAL REPORT — Member-level financial view (#81)

**SUMMARY: DONE.** All 3 phases built, independently verified, merged `--no-ff` → `main`
(`01f0866`, **Closes #81**), pushed. No PENDING, no BLOCKED. No deferrals.

Autonomous `/goal` run of `docs/goals/2026-06-08-member-level-financial-view.md`, executed in the
dedicated worktree `firekaro-goal-member-view` (branch `feat/member-level-financial-view`).

## Commits
| Commit | Phase |
|---|---|
| `fb82345` | P1 schema/migration: expense `ownerId` column + #67 migration-name fix + repo |
| `4d2c1e9` | P1 frontend: member-attributable expense rings + lens + owner picker |
| `b2aead2` | P2: standalone individual + household FIRE per adult |
| `52328d4` | P3: Financial-Health member lens (same-scope resolver) |
| `01f0866` | merge → main (Closes #81) |
| `e5fb4f5` | docs: PROJECT-LOG D-2026-06-08-22 + lessons + contract |

## Per-stage gate results
- **Static, every commit:** root `type-check` + unit (508→1100 over the run) + build; server
  `type-check` + `lint` + unit (161, incl. live Supabase integration). All green.
- **Phase 1:** Rule 24 (expenses screens + owner picker) ✓ · Rule 25 (ownerId persists — localStorage
  round-trip + live Supabase integration) ✓ · Rule 32 (Viewing-as → Rohit hides Priya's line, Household
  stays) ✓ · 0 console errors. FinTech **PASS** · code-review **APPROVE** · rule-33 blind **CONCUR**
  (after I reconciled an initial DISSENT by capturing complete evidence).
- **Phase 2:** Rule 24 (FIRE dashboard card + caveat) ✓ · Rule 26 (FIRE figures byte-identical across
  lenses) ✓ · Rule 32 (filter excludes dependents, caveat on adult select) ✓. FinTech **PASS** ·
  code-review **APPROVE** (HIGH-1 absurd-age leak caught + fixed + locked) · blind **CONCUR**.
- **Phase 3:** Rule 24/26/32 on all 6 FH screens ✓ (NetWorth, Banking, CashFlow, EmergencyFund,
  HealthScore + non-earner caveat, Reports) · 0 console errors. FinTech **PASS** (HIGH-1/HIGH-2
  same-scope Joint mismatch caught + fixed → re-verified RESOLVED) · code-review **APPROVE** · blind
  **CONCUR** (both before- and after-fix evidence).

## Evidence
`verification-evidence/phase{1,2,3}/*.png` (in the goal worktree; gitignored).

## The verification edge earned its keep — 3 real defects caught + fixed
1. **#67 migration bug** (pre-existing, latent): `member_role_collapse` migration ran `UPDATE "Member"`
   but the table is `@@map("members")` → 42P01, never deployed since #67 merged. Fixed + both pending
   migrations deployed to Supabase (closed #67's deploy gap). → lessons.md + a proposed CI gate.
2. **Phase-2 absurd-age leak**: `calculateYearsToTarget` caps at 1200 months and returns a *finite* 100
   for an unreachable target → individual FIRE age 130+. Fixed: unreachable-past-planToAge → ∞; catch-test.
3. **Phase-3 optimistic same-scope mismatch**: the FH resolver counted Joint at 100% for liquid/EMI/assets
   but at the split % for income/expenses → emergency-fund runway over-stated ~2× (Rohit 1.8 vs the honest
   0.9 months). Fixed: unified the Joint convention to the split % everywhere; substance-lock spec.

## §0.2 idempotency / skipped-as-covered
Greenfield run on `main` (no prior partial); #66/#67 confirmed merged at start; nothing skipped.

## Definition of Done — tally
- **P1:** itemised expenses carry `ownerId` (default Household; avgMonthly Household; auto-flow inherits) ✓ ·
  owner picker (hidden when solo) ✓ · member filter shows personal+Household / consolidated all ✓ ·
  existing totals + FIRE byte-identical ✓ · migration green ✓
- **P2:** standalone individual FIRE per adult ✓ · ring-3 excluded ✓ · household−Σadults gap ✓ · unified
  split % (default 50, configurable) ✓ · household FIRE invariant ✓ · filter = Household + adults
  (dependents hidden, "(you)") ✓ · caveat + comparison card ✓
- **P3:** Net Worth/Banking/CashFlow/Emergency/Health-Score lensed same-scope ✓ · individual Health Score
  + non-earner caveat ✓ · household default + invariant ✓ · Reports follows FIRE ✓
- **Static / rules 24/25/26/31/32/33 / ship:** all ✓ · PROJECT-LOG §3 + lessons.md updated ✓.

## DEFERRED
None.

## LEARNINGS TO FOLD BACK (proposals only — governance edits need Abhay's approval)
1. **CI migrate-dry-run gate** (the #67 gap): add a CI step that applies `prisma migrate deploy` to an
   ephemeral Postgres on any PR touching `server/prisma/migrations/**`, failing on error. Would have caught
   the `"Member"` table-name typo at PR time, not days later. → file as a #67-followup issue.
2. **goal-creator §0.1 / §4 note** (recurring, also hit on the prior #66/#67 run): the Playwright MCP saves
   `take_screenshot` artifacts to the **session/primary-worktree root**, NOT the goal worktree — copy or
   absolute-path them before handing paths to a rule-33 blind verifier (and `ls`-confirm existence first).
   Both this run's and the prior run's first blind verifications DISSENTED on evidence-package gaps that were
   purely a copy/scroll/dropdown-capture issue, never a real defect — a consistent ~1 reconciliation cycle
   per phase. Worth baking the "capture COMPLETE corroborating evidence (full-page, dropdown-open,
   scrolled-to-the-element) the first time" habit into the contract's §5 Rule-24/33 guidance.
3. **Plausibility bounds for non-flagship ratios** (FinTech NIT-2): if FH member ratios (emergency-months /
   DTI) ever become flagship, add sane-bounds to `headline-plausibility.spec.ts`. Not built (not flagship).
