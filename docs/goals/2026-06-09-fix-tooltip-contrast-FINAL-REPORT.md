# FINAL REPORT — Fix low-contrast / washed-out tooltips (#77)

**Contract:** `docs/goals/2026-06-09-fix-tooltip-contrast.md` · **Run date:** 2026-06-09
**Branch:** `fix/tooltip-contrast` → merged `--no-ff` to `main` · **Issue:** #77 CLOSED

## SUMMARY — DONE / PENDING / BLOCKED / NEXT
- **DONE:** Every `v-tooltip` now renders on a solid opaque slate-900 surface with readable white text. Fix commit `0dec23c`, merge `4375307` on `main` (pushed). #77 closed. All gates green.
- **PENDING:** none.
- **BLOCKED:** none.
- **NEXT:** the fix ships on the next prod deploy (no separate action). Two prose-rule proposals below (LEARNINGS) are optional follow-ups, not blockers.

## What changed (4 files, +71/−2)
| File | Change |
|---|---|
| `src/plugins/vuetify.ts` | `defaults` += `VTooltip: { contentClass: "fk-tooltip" }` (one global default → all 4 v-tooltip users). |
| `src/styles/tokens.css` | `.v-overlay__content.fk-tooltip` — slate-900 `#1e293b` bg, `#fff` text, radius 8px, padding 12px, opacity 1, shadow — all visual props `!important`. |
| `src/components/shared/InfoTip.vue` | body + formula `text-caption` → `text-body-2`. |
| `src/regression/tooltip-contrast.spec.ts` | NEW static lock (red-first proven): asserts the default + the CSS rule (incl. `!important`) + the InfoTip text class. |

## Root cause + the in-flight defect
The bare `<v-tooltip>` inherited Vuetify's translucent default surface → the busy page bled through. First in-browser render was STILL washed out (computed `bg rgb(245,247,250)`, `text rgb(238,238,238)`): Vuetify's own `.v-tooltip .v-overlay__content` rule wins at EQUAL specificity + later source order, so the un-`!important` `background`/`color`/`radius`/`padding` lost. **Fixed** by making those props `!important` (consistent with this file's existing `text-medium-emphasis` override); re-verified in-browser.

## Per-gate results
- **Static:** `type-check` 0 errors · `test:unit` 79 files / 1118 tests pass (incl. the new lock) · `build` ok.
- **Red-first:** spec failed 3/3 with edits stashed, green after — proven.
- **Rule 24 (render):** in-browser on `/fire-goals/what-if` (primary, the reported surface) — computed `bg rgb(30,41,59)`, `color rgb(255,255,255)`, `opacity 1`, `radius 8px`, `padding 12px`; screenshot confirms solid opaque legible surface, no bleed-through.
- **Rule 32 (interactive):** tooltip opens on hover; readable; no new console error on open.
- **Rule 26 (cross-surface):** dashboard `/fire-goals/dashboard` InfoTip renders IDENTICAL computed surface → single global default covers all uniformly.
- **Console:** the 23 errors observed are font-file 403s from the worktree's `node_modules` JUNCTION (Vite `@fs` allow-list across roots) — NOT from this change, NOT present in the primary checkout/prod. Zero NEW errors introduced.
- **Rule 29 (independent review):** `code-reviewer-agent` — APPROVE-WITH-NITS (0 blocker/HIGH/MED). Main nit (`.v-application` prefix instead of `!important`) DECLINED with reason: overlay teleport ancestry under `.v-application` is not guaranteed → the suggested selector risks matching nothing; verified `!important` kept.
- **Rule 33 (blind verify):** separate context-blind agent given only the BEFORE/AFTER screenshots + the bare requirement — PASS (verdict) / PASS (coverage); decisive opaque surface vs washed-out before. No verdict-changing dissent (noted: contrast is visual in the pixels; numerically computed below).
- **a11y / WCAG:** white `#ffffff` on slate-900 `#1e293b` = **≈14.6:1** — passes AAA (≥7:1), far above AA (4.5:1).
- **SKIPPED (recorded in commit):** Rule 25 (no write path), Rule 31 (no user-facing value — pure style), API behavioral test (no server/API), `fintech-domain-analyst` (no math).

## §0.2 preflight "skipped (already covered)"
None — all 4 files were absent at run start; full build executed.

## DoD tally
All DoD checkboxes GREEN. No DEFERRED entries.

## LEARNINGS TO FOLD BACK (proposals — routed per §0.3 step 5)
1. **GENERIC (vuetify/chart-theme):** overriding a Vuetify component's default visual styling from `tokens.css` needs `!important` (equal specificity + later source order), and `.v-application`-prefixed specificity is UNSAFE for teleported overlays (tooltip/menu/dialog) whose ancestry under `.v-application` isn't guaranteed. Verify the rendered computed style, not just that the rule exists. → propose a note in `chart-theme-system.md` / `vuetify-conventions.md`. (One-line lesson auto-appended to `.claude/tasks/lessons.md`.)
2. **PRODUCT process:** #77's sibling audit undercounted the `v-tooltip` users (named InfoTip + DiscoveryFooter; missed `MemberLensBadge` + `WholeHouseholdBadge`). The global-default fix covered them anyway, but the audit grep should have found all 4. → propose tightening `bug-filing-and-sibling-audit.md`'s grep step (search `\bv-tooltip\b` repo-wide, not just the reported component).
