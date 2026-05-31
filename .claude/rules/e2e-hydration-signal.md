---
description: Playwright tests wait on the data-hydrated="true" signal emitted by the app, not on fixed timeouts.
globs: ["e2e/**/*.ts", "src/main.ts", "src/utils/hydration-signal.ts"]
version: "1.0.0"
synthesized: true
private: false
---

# E2E Hydration Signal

FIREKaro's Playwright suite MUST wait on a deterministic hydration signal emitted by the Vue app, not on a fixed wall-clock delay. This supersedes the fixed 1500ms waits recommended in `rules/e2e-vuetify-timing.md`.

## The Signal

- `src/main.ts` calls `setHydrationSignal()` after `app.mount('#app')`.
- `src/utils/hydration-signal.ts` sets the attribute `data-hydrated="true"` on the `#app` root element.
- `e2e/pages/base.page.ts` waits via `page.waitForSelector('#app[data-hydrated="true"]', { timeout: 30000 })` from its base navigation helper.

Every page object that extends `BasePage` inherits the wait. Tests that navigate manually MUST either go through `BasePage.goto()` or replicate the selector wait.

## MUST / MUST NOT

- MUST wait for `#app[data-hydrated="true"]` after every top-level navigation, not for a fixed timeout.
- MUST NOT use `page.waitForTimeout(1500)` (or any fixed delay) as the primary ready signal for Vue mount. Fixed delays either flake under CI load or waste wall-clock time on fast dev machines.
- MUST NOT reuse the hydration signal as a proxy for downstream async state (API calls, Vuetify dialog open, router-view swap). The signal fires once, on first mount — subsequent route transitions and dialog opens need their own targeted waits (see `e2e-vuetify-timing.md` for Vuetify-specific timing).
- New page objects MUST extend `BasePage` instead of re-implementing `goto()`. If a page genuinely cannot extend `BasePage`, it MUST replicate the hydration selector wait verbatim.

## When Fixed Waits Are Still Acceptable

Transient animation timings (e.g., Vuetify dialog enter/leave, snackbar auto-dismiss) that do not expose a clean DOM signal MAY use short `waitForTimeout` calls — typically under 300ms — as a last resort. Annotate each occurrence with a comment explaining why no selector-based wait was possible.

## Why This Matters

Vue 3 + Vuetify 3 hydration on Vite dev server can range from ~100ms on a warm HMR reload to over 2 seconds on a cold CI machine. A single fixed delay cannot serve both. The `data-hydrated` attribute makes the wait deterministic and removes the trade-off. Tests that still use `waitForTimeout(1500)` will pass locally and flake on CI — invest the minute to migrate them.

## Migration Note

`rules/e2e-vuetify-timing.md` currently still recommends a 1500ms pre-flight wait. That section is stale; this rule supersedes it. The Vuetify-component timing advice in that rule (dialog open, menu open) is still current.
