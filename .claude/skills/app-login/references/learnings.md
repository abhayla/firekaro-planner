# App-Login Learnings

Two-tier knowledge store for the `app-login` skill. Read at Step 0 of every
invocation; written (with user approval) at Step 8 via `self-update-protocol.md`.

- **Consolidated Principles** — proven across 3+ uses; treat as standing rules.
- **Active Observations** — CANDIDATE/ACTIVE entries under evaluation.

---

## Consolidated Principles

<!-- State: CONSOLIDATED. Proven across 3+ applications. -->

- **Absolute-origin OAuth callback.** Better Auth resolves a relative `callbackURL`
  against `BETTER_AUTH_URL` (backend origin, port 3000). Since FIREKaro's frontend
  runs on port 5173, the redirect then 404s at `:3000/dashboard`. Always pass
  `${window.location.origin}/dashboard` as an absolute URL — this is the
  load-bearing fix and must not regress. See `src/pages/auth/signin.vue:30-34`.
- **Headed REAL Chrome with the automation signature stripped — headed-alone is NOT enough.**
  Google's sign-in rejects headless Chromium ("This browser may not be secure") AND headed
  *bundled* Chromium that carries the Playwright automation flag (proven 2026-06-10 against prod
  `firekaro.com`). Working config: launch the REAL installed Chrome via
  `chromium.launchPersistentContext(dir, { channel: 'chrome', ignoreDefaultArgs: ['--enable-automation'],
  args: ['--disable-blink-features=AutomationControlled', '--start-maximized'] })` (a persistent profile
  also lets a prior Google trust carry over). Reusable tool: `scripts/prod-login-capture.mjs` (run via
  the **PowerShell** tool so the window is visible — the Bash tool is sandboxed/invisible).
- **Session cookie is the only persistable artifact — SANITIZE the storageState.** Gmail address,
  password, and Google tokens MUST NOT touch disk. `launchPersistentContext` captures the WHOLE cookie
  jar — incl. ~47 Google cookies (`SID`/`SAPISID`/`HSID`/`__Host-*PLSID`/…, observed 2026-06-10). After
  capture, FILTER `storageState` to the app-domain cookies only (keep `__Secure-better-auth.session_*`
  for `firekaro.com`; drop every `google.com` cookie) AND delete the persistent profile dir (it stores
  the Google session). Store only the Better Auth session cookie at `e2e/.auth/user.json` (gitignored,
  ~7-day lifetime per `session.expiresIn`).
- **Dashboard landing is verified by URL + API.** A URL on `/dashboard` plus
  `GET /api/auth/get-session` returning 200 with a non-null user is the only
  acceptable success signal. A bare URL match is insufficient (the page can
  render before the session cookie is writable).

---

## Active Observations

<!-- State: CANDIDATE or ACTIVE. Under evaluation. -->

### [pattern] Google button has a stable `data-testid`
- **ID:** L-001
- **State:** ACTIVE
- **Temporal:** DYNAMIC
- **Scope:** `.claude/skills/app-login/**`
- **Date:** 2026-04-17
- **Context:** FIREKaro signin page `/auth/signin`.
- **Observation:** The "Continue with Google" button carries
  `data-testid="signin-google-button"` (see `src/pages/auth/signin.vue:87`).
  This attribute is set by the app team and is the most stable selector
  available — it survives copy tweaks and Vuetify version bumps that rename
  classes.
- **Application:** Click by `data-testid`, not by text content or class. If the
  testid disappears, halt and surface a selector-drift observation rather than
  fall back to fragile heuristics.
- **Confidence:** 0.95
- **Applied-In:** []
- **Source:** app-login
- **Supersedes:** null
- **Tags:** selector,signin,google,stable

### [pattern] Hydration waits on literal button text
- **ID:** L-002
- **State:** CANDIDATE
- **Temporal:** DYNAMIC
- **Scope:** `.claude/skills/app-login/**`
- **Date:** 2026-04-17
- **Context:** First navigation to `/auth/signin` on a cold Vite dev server.
- **Observation:** `mcp__playwright__browser_wait_for` on the literal text
  `"Continue with Google"` with a 10-second timeout reliably catches
  Vue 3 + Vuetify mount completion on a warm machine. Shorter timeouts (3-5s)
  flake on cold starts. The text literal is more robust than a CSS class
  because Vuetify rewrites class names across minor versions.
- **Application:** Use `browser_wait_for` with text `"Continue with Google"`
  and timeout 10000. If the wait times out, the dev server is likely not
  running — do not escalate to a longer timeout, instead fail loud.
- **Confidence:** 0.85
- **Applied-In:** []
- **Source:** app-login
- **Supersedes:** null
- **Tags:** timing,hydration,vuetify,vite

### [pattern] Session verification endpoint
- **ID:** L-003
- **State:** ACTIVE
- **Temporal:** DYNAMIC
- **Scope:** `.claude/skills/app-login/**`
- **Date:** 2026-04-17
- **Context:** After the Google OAuth redirect lands on `/dashboard`.
- **Observation:** `GET /api/auth/get-session` returns
  `{ data: { user, session } }` on success and `{ data: null }` or 401 on
  failure. The signin page itself polls this endpoint on mount to decide
  whether to redirect already-authenticated users (see
  `src/pages/auth/signin.vue:14-23`), making it the canonical truth for
  "am I logged in".
- **Application:** Use `mcp__playwright__browser_network_requests` and look
  for a 200 response to `/api/auth/get-session` with a non-null `user` field.
  Do not rely on the URL alone — the dashboard route renders before the
  session cookie is necessarily writable.
- **Confidence:** 0.92
- **Applied-In:** []
- **Source:** app-login
- **Supersedes:** null
- **Tags:** verification,session,better-auth

### [gotcha] OAuth callbackURL must be absolute frontend origin
- **ID:** L-004
- **State:** ACTIVE
- **Temporal:** STATIC
- **Scope:** `.claude/skills/app-login/**`
- **Date:** 2026-04-17
- **Context:** Debugging a 404 `{"success":false,"error":"Not found","code":"NOT_FOUND"}`
  at `http://localhost:3000/dashboard` immediately after a successful Google
  sign-in.
- **Observation:** Better Auth resolves a relative `callbackURL` against
  `BETTER_AUTH_URL` (backend origin). Passing `callbackURL: '/dashboard'`
  redirected to the Hono server at port 3000, which has no `/dashboard` route.
  Fix was `callbackURL: \`${window.location.origin}/dashboard\`` — an absolute
  URL that resolves to the Vite frontend at port 5173. `trustedOrigins` in
  `server/lib/auth.ts` already includes the frontend origin, so no backend
  change was needed.
- **Application:** When diagnosing post-OAuth 404s, check that `callbackURL`
  is absolute and points to the frontend origin. If the signin page ever
  regresses to a relative path, this observation is the first thing to flag.
- **Confidence:** 0.98
- **Applied-In:** []
- **Source:** app-login
- **Supersedes:** null
- **Tags:** oauth,better-auth,regression-guard,signin

### [pattern] Dashboard sub-routes count as success
- **ID:** L-005
- **State:** CANDIDATE
- **Temporal:** DYNAMIC
- **Scope:** `.claude/skills/app-login/**`
- **Date:** 2026-04-17
- **Context:** FIREKaro router defines 8 top-level sections under `/dashboard`.
- **Observation:** A successful login may land on any route matching
  `http://localhost:5173/dashboard*` — not only `/dashboard` itself. Strictly
  matching `/dashboard` will reject legitimate landings on routes like
  `/dashboard/overview` if the router adds a default redirect later.
- **Application:** Treat any URL starting with `http://localhost:5173/dashboard`
  (optional trailing slash or sub-path) as a successful landing. Persist the
  session only after `/api/auth/get-session` also confirms (see L-003).
- **Confidence:** 0.80
- **Applied-In:** []
- **Source:** app-login
- **Supersedes:** null
- **Tags:** url-matching,dashboard,routes

### [gotcha] Dev router guard bypasses auth — URL on /dashboard is not a real auth signal
- **ID:** L-008
- **State:** ACTIVE
- **Temporal:** STATIC
- **Scope:** `.claude/skills/app-login/**`
- **Date:** 2026-04-18
- **Context:** Verifying login success in Step 7 of the skill.
- **Observation:** `src/router/index.ts:652-664` contains a dev-mode auth
  bypass: if `import.meta.env.DEV` is true and the user is not authenticated,
  the guard calls `next()` instead of `next('/auth/signin')`. This means
  any URL landing on `/dashboard` in dev reflects the bypass, NOT a
  successful session. The dual URL + `/api/auth/get-session` check
  documented in L-003 is therefore not redundant — it is the ONLY reliable
  verification in dev.
- **Application:** Never treat URL-on-/dashboard as sufficient evidence of
  login success in dev mode. Always verify `GET /api/auth/get-session`
  returns `{ data: { user, ... } }` with a non-null user object before
  Step 8 persists anything. This is also why the skill does the two-step
  check instead of trusting the router.
- **Confidence:** 0.95
- **Applied-In:** []
- **Source:** app-login
- **Supersedes:** null
- **Tags:** dev-mode,router-guard,verification,false-positive

### [gotcha] Better Auth v1.4 Vue client does not auto-navigate to OAuth URL
- **ID:** L-007
- **State:** ACTIVE
- **Temporal:** STATIC
- **Scope:** `.claude/skills/app-login/**`
- **Date:** 2026-04-18
- **Context:** Clicking "Continue with Google" on `/auth/signin` during
  OAuth driving in Step 5.
- **Observation:** `authClient.signIn.social({ provider: 'google', ... })`
  in better-auth ^1.4.10 (the version pinned in this repo) returns
  `{ data: { url: <google-oauth-url>, redirect: true }, error: null }`
  but does NOT perform the redirect itself. Without the caller setting
  `window.location.href = data.url`, the click dead-ends silently — the
  frontend never navigates to `accounts.google.com`, but the dev router
  guard (see L-008) still lets the user onto `/dashboard`, producing a
  false-positive landing that Step 7's session check correctly rejects.
  Network evidence: before fix, zero `accounts.google.com` requests;
  after fix, cross-origin GET to Google initiates. Fix lives in
  `src/pages/auth/signin.vue` around the `signInWithGoogle` handler.
- **Application:** When the skill encounters a click that yields a POST
  to `/api/auth/sign-in/social` (200) but no subsequent `accounts.google.com`
  request in the network log, the app-side manual-redirect fix is missing
  or regressed. Do not wrap this in the skill — report to the user as an
  app regression and point at `src/pages/auth/signin.vue`.
  **HISTORICAL NOTE (2026-05-24):** This recommendation is correct for
  better-auth versions BEFORE 1.4.x. In better-auth ≥ 1.4.x, the
  `redirectPlugin` performs the navigation automatically, so the manual
  `window.location.href = url` prescribed here becomes a double-navigation
  race that aborts both Google redirects. See L-009 for the current
  recommendation in better-auth ≥ 1.4.x.
- **Confidence:** 0.97
- **Applied-In:** ["2026-05-18: textbook fingerprint reproduced — POST /api/auth/sign-in/social 200, zero accounts.google.com requests, /api/auth/get-session returns data:null, URL on /dashboard via L-008 dev guard. signin.vue:34-48 awaits authClient.signIn.social but discards return value."]
- **Source:** app-login
- **Supersedes:** null
- **Superseded-By:** L-009
- **Tags:** better-auth,oauth,signin-vue,regression-guard,version-scoped

### [gotcha] MCP Playwright persists cookies across skill runs
- **ID:** L-006
- **State:** ACTIVE
- **Temporal:** STATIC
- **Scope:** `.claude/skills/app-login/**`
- **Date:** 2026-04-18
- **Context:** Running `/app-login` (no `--fresh`) after a prior run had
  left a stale Better Auth session cookie in the MCP browser context.
- **Observation:** On fresh navigation to `/auth/signin`, the page's
  `onMounted` hook read the stale cookie and router-pushed to `/dashboard`
  immediately. `GET /api/auth/get-session` then returned `{ data: null }`
  because the backend correctly rejected the expired cookie. Result:
  false-positive URL landing + unauthenticated dashboard render (which in
  turn exposed a separate `alerts.value.filter` crash in
  `src/stores/notifications.ts`). Step 7's dual URL-plus-API check
  caught the false positive, but the stale cookie silently wasted the
  OAuth window.
- **Application:** When `--fresh` is passed, Step 5 MUST clear browser
  cookies before navigating. Clear via `about:blank` → POST to
  `/api/auth/sign-out` on both origins + `document.cookie` expiry sweep,
  then verify `/api/auth/get-session` returns null BEFORE driving the
  OAuth flow. Do NOT rely on Step 3's mtime check alone — the persisted
  file's age is decoupled from the MCP browser's in-memory cookie jar.
- **Confidence:** 0.92
- **Applied-In:** []
- **Source:** app-login
- **Supersedes:** null
- **Tags:** cookie-persistence,fresh-flag,mcp-browser,false-positive

### [gotcha] Better Auth redirectPlugin auto-redirects, conflicting with manual fix
- **ID:** L-009
- **State:** ACTIVE
- **Temporal:** STATIC
- **Scope:** `.claude/skills/app-login/**`
- **Date:** 2026-05-23
- **Context:** Clicking "Continue with Google" on /auth/signin in the MCP Playwright browser.
- **Observation:** better-auth ^1.4.10 ships a `redirectPlugin`
  (`node_modules/better-auth/dist/client/fetch-plugins.mjs:9`) whose
  `onSuccess` hook auto-fires `window.location.href = context.data.url`
  whenever the response carries `redirect: true`. signin.vue:49 ALSO
  does `window.location.href = url` (the L-007 fix). Both fire on the
  same tick, producing two cross-origin nav attempts to
  `accounts.google.com/...` that both abort with `net::ERR_ABORTED`.
  After the aborts, the page lands on `/dashboard` (dev router guard
  L-008 lets the unauth user through). `/api/auth/get-session` returns
  `{ data: null }` — the textbook L-008 false positive.
  Reproducible signal: network log shows POST `/api/auth/sign-in/social`
  → 200, then two sequential GETs to `accounts.google.com/o/oauth2/auth`
  with identical state param, both `net::ERR_ABORTED`, then GET
  `/api/auth/get-session` → 200 with null user on /dashboard.
- **Application:** When this fingerprint appears, the manual
  `window.location.href = url` in signin.vue:49 is now redundant AND
  harmful — the redirectPlugin already does it. Recommend the app team
  either (a) remove the manual assignment in signin.vue and rely on
  the plugin, or (b) disable the redirectPlugin and keep the manual
  call. Do NOT attempt to work around from the skill — this is an
  app-level fix. Supersedes L-007's prescribed workaround for
  better-auth ≥ 1.4.x.
- **Confidence:** 0.95
- **Applied-In:** ["2026-05-24: reproduced verbatim — POST /api/auth/sign-in/social 200, two sequential GET accounts.google.com both net::ERR_ABORTED (identical state param UM0waFynGpdErLHd3qNX0iqW-k2-4gaH), /api/auth/get-session returns null user on /dashboard. signin.vue:42-51 unchanged from prior reproduction."]
- **Source:** app-login
- **Supersedes:** L-007
- **Tags:** better-auth,redirect-plugin,oauth,double-navigation,regression
