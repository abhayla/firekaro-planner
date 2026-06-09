# FINAL REPORT — Compact bridge on Dashboard + collapsible "What we assumed" on Readiness (#74 + #76)

**Run:** `/goal docs/goals/2026-06-09-bridge-card-collapsible-dedup.md` · **Date:** 2026-06-09
**Branch:** `feat/bridge-card-collapsible-dedup` → merged `--no-ff` to `main` · **Commit:** `44544d1` · **Merge:** `a379aaf`
**Worktree:** `D:/Abhay/VibeCoding/firekaro-goal-bridge-dedup` (self-cleaned on success)

## SUMMARY
- **DONE:** Dashboard now renders the **compact** accessible-money bridge (honest verdict + spendable/locked bar + bridge-income + a "See what we assumed on Readiness" link; drops the per-holding wall + unlock timeline). Readiness keeps the **full** card; its "What we assumed" block is now a **collapsible, default-collapsed** disclosure with the estimate **count** in the header (honesty stays discoverable) and a full WAI-ARIA disclosure pattern. Still **ONE** component (`variant` prop, default `full`); **no FIRE-math/derive/`src/lib` change**; regression lock added (11/11). **#74 + #76 CLOSED.**
- **PENDING:** none.
- **BLOCKED:** none.
- **NEXT:** prod deploy of the merged change is Abhay-gated (per `testing-strategy.md`). One optional follow-up below (pre-existing color-contrast).

## Change (3 files)
| File | Change |
|---|---|
| `src/components/dashboard/BridgeBreakdownCard.vue` | `variant?: "full" \| "compact"` prop (`withDefaults` → `"full"`). `compact` renders header + verdict alert (keeps `bc.effectiveFireAge`) + spendable/locked bar + bridge-income + a `:to="{ name: 'fire-readiness' }"` link; OMITS the unlock-timeline + assumptions wall (`!isCompact` gates). `full` keeps everything but the "What we assumed" block is a collapsible disclosure: native `<button>` toggle (`aria-expanded` + `aria-controls`), estimate **count** in header, chevron flip, rows in `<v-expand-transition><div v-if="assumptionsExpanded" id="bridge-assumptions-region">`. `assumptionsExpanded = ref(false)` (local-only). |
| `src/pages/fire-goals/Dashboard.vue` | the one `<BridgeBreakdownCard />` → `variant="compact"`. |
| `src/regression/bridge-card-variants.spec.ts` | NEW static-template-source regression lock (red-first; 11 assertions). |

`src/pages/fire-goals/Readiness.vue` — **UNCHANGED** (bare `<BridgeBreakdownCard />` defaults to full). Verified `git diff` empty.

## Per-gate results
| Gate | Result |
|---|---|
| `npm run type-check` (root) | ✅ 0 errors |
| `npm run test:unit` (root) | ✅ 1129/1129 (incl. new spec 11/11; red→green confirmed) |
| `npm run build` | ✅ (pre-existing chunk-size warning only) |
| **Rule 24** render (per screen) | ✅ Dashboard `/fire-goals/dashboard` shows the COMPACT bridge (assumptionRows=0, unlockRows=0, no toggle, `see-assumptions-link`→`/fire-goals/readiness`, verdict alert present); Readiness `/fire-goals/readiness` shows the FULL bridge collapsed (`aria-expanded=false`, 0 rows in DOM, header "WHAT WE ASSUMED — 12 estimates you can correct"). Screenshots captured + **viewed inline**. 0 NEW console errors (the `ws://localhost:5176` HMR-reconnect entries + Vuetify/CommandPalette framework warnings are pre-existing environmental noise, none referencing the bridge card). |
| **Rule 32** interactive | ✅ Readiness: header click expands → 12 rows + `aria-expanded=true` + chevron `mdi-chevron-up`; keyboard **Enter** (focused) collapses → 0 rows + `aria-expanded=false`; a "Fix" deep-link navigated to `/investments/overview`. Dashboard: the "See what we assumed on Readiness" link navigated to `/fire-goals/readiness`. |
| **Rule 26** cross-screen | ✅ Spendable/locked = **₹8.89 Cr / ₹1.86 Cr** identical on Dashboard (compact) and Readiness (full) — same `bc` source, no drift; bridge income ₹2.85 L/yr both. Dashboard retains the bridge verdict + bar (honesty not dropped). (Bridge is "covered" for Mauryas → success verdict on both; the effective-age path is locked in the spec source.) |
| **Rule 29** code review | ✅ `code-reviewer-agent` (adversarial): **PASS**, no blockers/HIGH. 1 MEDIUM (incomplete ARIA disclosure — add `aria-controls`/region `id`) + LOW (chevron `aria-hidden`, toggle padding) — **all applied**. Confirmed ONE component, no math change, no scope creep, `v-expand-transition` (not v-show). |
| **Rule 33** blind verify | ✅ context-blind `general-purpose` agent given raw evidence only: **CONCUR** on coverage + verdict-correctness. Two caveats raised — (1) dashboard link copy illegible in the downscaled full-page PNG → **closed** with a dashboard close-up crop (link "See what we assumed on Readiness" legible); (2) interactive behaviours not provable by static PNG → **satisfied** (performed live via MCP, evidenced above). |
| **a11y** (axe-core wcag2a/2aa, both screens) | ✅ **zero NEW Critical+Serious** from this change. The toggle/link/region/chevron flag nothing in collapsed OR expanded state (`aria-valid-attr-value`=0; toggle not flagged). The only in-card serious hits are 2 **pre-existing** `color-contrast` on the untouched `.text-success`/`.text-warning` spendable/locked currency spans. |

### SKIPPED (with reason — recorded in the commit)
- **Rule 25** (UI→DB persistence) — no write-path change.
- **API behavioral test** — no server/API change.
- **Rule 31** (output plausibility) — no NEW user-facing value; layout/IA refactor of existing `bc` data (bridge figures confirmed byte-identical; the headline golden-master snapshot diff was line-ending-only, restored unstaged).
- **`fintech-domain-analyst`** — no math touched.

### §0.2 skipped (already covered)
- None — preflight found #74/#76 both OPEN and no `variant`/collapsible/spec present; the full delta was built.

## Definition of Done — tally
All DoD checkboxes GREEN (build/change · static gates · Rule 24 · Rule 32 · skip-set · Rule 29 · Rule 26 · Rule 33 · a11y · ship). No DEFERRED entries.

## LEARNINGS TO FOLD BACK (proposed — not auto-applied)
1. **GENERIC design-system — a canonical "collapsible disclosure" pattern.** This run produced a reusable disclosure: native `<button class="section-label …">` toggle + `aria-expanded` + `aria-controls` → `id`-ed region + `v-expand-transition`/`v-if` rows + **count-in-collapsed-header** + chevron flip + `:focus-visible` ring. #74's sibling-audit note asked for a "standard collapsible-disclosure pattern". **Propose** documenting it in `SCREEN-STANDARD.md` / `.claude/rules/vuetify-conventions.md` so future long sections reuse it instead of re-inventing.
2. **GENERIC IA — "one component reused on two screens reads redundant → parameterize with a `variant` prop"** (keep DRY, no second component, no math duplication). **Propose** as a short design-system note.
3. **PROCESS (auto-appended to `.claude/tasks/lessons.md`)** — static template-source specs must terminate open-tag assertions with `[\s>]`, not a literal `>`, so review-driven additive attributes (a11y/test-ids) don't cause a spurious red.
4. **PROCESS refinement (existing MCP-path lesson)** — `browser_take_screenshot` with `path:'./x.png'` writes to the **primary worktree ROOT** (the MCP server cwd), not `.playwright-mcp/` and not the goal worktree — `find` the actual file rather than assuming `.playwright-mcp/` before copying into the goal worktree for the blind verifier.
5. **Follow-up issue candidate (pre-existing, app-wide, out of scope)** — the `.text-success`/`.text-warning` **bold currency text fails WCAG AA color-contrast** on the light surface (surfaced by axe on the bridge's spendable/locked amounts; the same tokens recur on many cards). **Propose** filing a sibling-audited a11y issue; NOT fixed here (scope = #74/#76 only).

## Evidence
Screenshots captured to the run's gitignored `docs/goals/.run/evidence/` (ephemeral): `bridge-dashboard-compact-mauryas.png`, `bridge-readiness-full-collapsed.png`, `bridge-readiness-full-expanded.png`, `bridge-dashboard-compact-closeup.png`. Verification persona: **Mauryas** (full-spread portfolio → 12 bridge assumptions). The durable verdict is this report + the DOM/axe facts captured above.
