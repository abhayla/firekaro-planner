---
name: verify-ui
description: >
  Headed, watchable UI verification of the FireKaro planner against a seed persona —
  switches to the persona in a real browser, sweeps the section screens, and preserves
  screenshots + a console-error gate for the supervisor rule to audit. Use whenever you
  need to visually verify UI changes, a new/edited seed persona, or "test the app in the
  browser" / "verify the screens". Defaults to the Mauryas persona.
type: workflow
allowed-tools: "Bash Read Glob"
argument-hint: "[persona=mauryas] [--headless] [--routes /a,/b]"
version: "1.0.0"
---

# Verify UI (headed persona sweep)

The canonical way to visually verify the planner UI in THIS project. It drives a real,
**headed** (watchable) Chromium via `scripts/verify-persona.mjs`, switches to a seed
persona, sweeps every section screen, and **preserves the screenshots** under
`verification-screenshots/<persona>-<timestamp>/` (gitignored) so the hierarchical
supervisor rule above the session can audit the claim. **Mauryas is the standard fixture.**

## Why a script, not the Playwright MCP

The MCP Playwright server here is configured **headless** (`--headless --isolated`, see the
`project_playwright_mcp_headless_fix` memory). For a *watchable headed* run with preserved
screenshots, drive the standalone `@playwright/test` script — do NOT use the MCP for this.

## The two gotchas this skill already handles (do not re-discover them)

1. **Fresh browser context has no data → lands on the splash.** You MUST click **"Try the
   sample"** to enter the app (the AppBar + `.seed-switcher-btn` only exist post-onboarding).
   The sample loads the Sharmas; the script then switches to the requested persona.
2. **The product tour overlay (`.tour-overlay`) intercepts pointer events** on first entry —
   it must be dismissed before any click/screenshot or clicks hit the overlay and the
   screenshot is obscured. The script dismisses it (Escape → skip/close button → DOM strip)
   before every screenshot.

Also: the `#app[data-hydrated]` selector is unreliable as a wait — the script waits on
concrete visible elements (`.seed-switcher-btn`, the sample button) instead.

## STEP 1: Ensure the dev server is up

The script preflights `http://localhost:5175` and exits with a clear message if it's down.
If down, start it (self-heal) and wait for it to be ready:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5175   # expect 200
# if not 200:  npm run dev   (run in the background, then re-check)
```

## STEP 2: Run the sweep

```bash
node scripts/verify-persona.mjs                 # Mauryas, headed, full 10-screen sweep
node scripts/verify-persona.mjs mehtas          # a different persona
node scripts/verify-persona.mjs --headless      # CI / unattended (1440x900)
node scripts/verify-persona.mjs mauryas --routes /fire-goals/dashboard,/investments/holdings
```

Default full sweep (one representative screen per section): fire-dashboard · income ·
tax-planning · expenses · investments(holdings) · liabilities · insurance ·
financial-health · fire-goals · profile. Captured on the **default product lens**
(family-view off, no member selected — the lens the plausibility rule cares about).

## STEP 3: Read the verdict + inspect the screenshots

The script prints a `VERDICT: PASS ✅ / FAIL ❌` line and exits non-zero on any page error
or console error. Then **look at the PNGs yourself** (Read tool) — a PASS exit code is
necessary but NOT sufficient; the screenshot is the authoritative signal (rule 24/26):

```
verification-screenshots/<persona>-<timestamp>/*.png
```

Verify the substance, not just that it rendered: is the FIRE headline domain-plausible
(rule 31), do all 12 asset types show on investments, is the data the persona's (not the
Sharmas)? The printed `headline (FIRE)` text is captured for the record.

## STEP 4: Surface the evidence

Relay the verdict + the screenshot dir to the user, and (for a watchable run) send the key
screenshots via SendUserFile so the user + the supervisor rule can see them.

## CRITICAL RULES

- MUST run headed by default (watchable); only use `--headless` for unattended/CI.
- MUST dismiss the tour + enter via "Try the sample" — the script does this; never bypass it.
- MUST preserve screenshots per-run (timestamped dir) — never overwrite history.
- MUST inspect the screenshots, not just the exit code — the screenshot is the verdict.
- MUST NOT use the headless MCP browser for headed verification.
- This skill REPORTS a verdict; it does NOT auto-fix. Failures route to `/fix-loop`.
