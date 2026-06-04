# Scope: global

# UI Verification (headed persona sweep)

The canonical way to **visually verify the planner UI** in this project — for UI changes,
new/edited seed personas, or any "test the app in the browser" task. Full workflow lives in
the `/verify-ui` skill (loaded on demand); this is the always-on pointer + the load-bearing
gotchas so no session re-derives them.

**Run it:** `/verify-ui` → drives `scripts/verify-persona.mjs` (a **headed**, watchable
`@playwright/test` script). Standard fixture is **the Mauryas** persona.
`node scripts/verify-persona.mjs [persona=mauryas] [--headless] [--routes /a,/b]`.

**Why a script, not the MCP:** the Playwright MCP here is configured **headless**
(`--headless --isolated`) — for a watchable headed run with preserved screenshots, use the
script, NOT the MCP.

**Run headed scripts via the PowerShell tool, NOT the Bash tool (added 2026-06-04).** On this
Windows machine the **Bash tool runs sandboxed on a virtual/invisible display** — a `headless:false`
Chromium launched from Bash opens where the user CANNOT see it. The **PowerShell tool runs natively**,
so the maximized window renders on the user's real desktop. MUST launch
`node scripts/enter-persona-via-ui.mjs` (and any headed run) through the **PowerShell tool** when the
user needs to watch.

**The two gotchas (already handled by the script — do not re-discover):**
1. A fresh browser context has no data → lands on the **splash**; you MUST click **"Try the
   sample"** to enter the app before the AppBar/`.seed-switcher-btn` exists.
2. The **`.tour-overlay`** intercepts pointer events on first entry — dismiss it (Escape →
   skip/close button → DOM strip) before any click/screenshot. Also: `#app[data-hydrated]`
   is an unreliable wait — wait on concrete visible elements.

**Evidence:** screenshots are PRESERVED per-run under `verification-screenshots/<persona>-<ts>/`
(gitignored), captured on the **default product lens** (family-view off, no member selected).
The hierarchical supervisor rule above the session audits these PNGs to confirm the claim —
so a PASS exit code is necessary but NOT sufficient (rule 24/26/31): inspect the screenshots
for substance (plausible FIRE headline, all 12 asset types, the right persona's data).

## Data ENTRY is not verification (added 2026-06-04)

`/verify-ui` + `scripts/verify-persona.mjs` are **read-only** — they *load* a persona and screenshot
the screens. **"Create / enter / populate / set up data" is a DIFFERENT task: it means DRIVE THE REAL
UI (headed), form-by-form, with per-entity persistence verification** (rules 24/25/26 +
`e2e-multi-row-verification.md`). A code fixture (a `src/seeds/*.ts` seed) is NOT "entering data" — it
exercises zero forms and proves nothing about the real setup UX. A reusable *switcher persona* needs
the seed file too, so when both are wanted, do BOTH: seed = the switcher entry; the headed UI-entry
pass = the proof a real user can enter it. The realization-method (UI-entry vs fixture) is a
**consequential fork** — confirm it when the user says "create data" without naming the form; never
silently default to a fixture. The headed entry engine is `scripts/enter-persona-via-ui.mjs`.

**Two non-negotiable data-entry-testing standards (added 2026-06-04, Abhay):**
1. **Fill EVERY field — including OPTIONAL / non-mandatory ones.** Leaving optional fields blank
   (VPF top-up, per-investment-type detail fields like qty/price/units/NAV/opening-year/bank/coin/
   subtype/grams, end-year, premium-period, tax-exempt, horizon bucket, ESOP grant-country/exercise/
   FMV, employer-sector, co-borrowers, etc.) is only PARTIAL testing — the optional paths go
   unexercised. Full data-entry testing fills the *whole* form, every field, every type's detail
   accordion.
2. **After each section's save → navigate to that section's OVERVIEW / list screen and VERIFY the
   entered data actually renders there** — not just that it persisted in storage. The product's value
   is the data flowing through to the overview/dashboard; a per-section overview check (counts +
   sample substance) confirms the real functionality the way a user experiences it. This is rule-26
   cross-page verification applied *inline, per section, during entry* — not deferred to the end.

## CRITICAL RULES
- MUST treat "create/enter/populate data" as headed UI form-entry + per-entity persistence verification — a `seeds/*.ts` fixture does NOT satisfy it.
- MUST fill EVERY field on each form, including OPTIONAL ones (+ every type's detail accordion) — blank optionals = partial testing only.
- MUST, after each section's save, open that section's OVERVIEW/list screen and verify the entered data renders there (counts + sample substance), per section, inline — not just confirm storage persistence.
- MUST verify UI changes via `/verify-ui` (headed) before claiming a UI task done — screenshot is the verdict, not the exit code.
- MUST NOT use the headless MCP browser for headed verification; use the script.
- MUST preserve per-run screenshots (timestamped dir); never overwrite history.
- `/verify-ui` REPORTS a verdict; it does NOT auto-fix — failures route to `/fix-loop`.
