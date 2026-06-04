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

## CRITICAL RULES
- MUST verify UI changes via `/verify-ui` (headed) before claiming a UI task done — screenshot is the verdict, not the exit code.
- MUST NOT use the headless MCP browser for headed verification; use the script.
- MUST preserve per-run screenshots (timestamped dir); never overwrite history.
- `/verify-ui` REPORTS a verdict; it does NOT auto-fix — failures route to `/fix-loop`.
