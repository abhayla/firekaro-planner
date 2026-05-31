---
name: app-login
description: >
  Logs the user into the FIREKaro-Vue app via Google OAuth using MCP Playwright
  and lands on /dashboard. Use when the user asks to log in, sign in, or open
  the dashboard. Prompts for Gmail credentials at runtime (never stored),
  persists only the session cookie to e2e/.auth/user.json (gitignored, 7-day
  lifetime), and self-improves by appending observations to references/learnings.md
  after each run per the self-update-protocol.
triggers:
  - log me in
  - login
  - sign in
  - sign me in
  - open the dashboard
  - open dashboard
  - login to firekaro
  - log into the app
allowed-tools: "Bash Read Write Edit Grep Glob mcp__playwright__browser_navigate mcp__playwright__browser_snapshot mcp__playwright__browser_click mcp__playwright__browser_type mcp__playwright__browser_wait_for mcp__playwright__browser_press_key mcp__playwright__browser_take_screenshot mcp__playwright__browser_network_requests mcp__playwright__browser_close mcp__playwright__browser_evaluate"
argument-hint: "[optional: --fresh to force re-auth, --email=<gmail> to prefill]"
type: workflow
version: "1.1.5"
---

# App Login — Google OAuth End-to-End with Session Reuse

Drive the FIREKaro-Vue Google sign-in flow end-to-end using a visible Playwright
browser. Reuse a persisted session cookie when possible. Prompt for credentials
only when no valid session exists. Never persist credentials to disk.

**Arguments:** $ARGUMENTS

---

## PREAMBLE — CRITICAL RULES (mirrored in CRITICAL RULES section at bottom)

1. **NEVER write the user's Gmail password, Gmail address, or any Google-issued
   token to disk.** Credentials live in process memory only. The only
   persistable artifact is the resulting session cookie in
   `e2e/.auth/user.json` (already gitignored).
2. **NEVER echo the password back to the user or include it in logs,
   screenshots, or learnings.md entries.** If a screenshot captures the
   password field while typing, discard it.
3. **ALWAYS use a headed (visible) browser.** A headless browser trips
   Google's automation detection and fails. The user must see what Google
   shows (2FA prompt, device challenge, CAPTCHA).
4. **ALWAYS run Reference Completeness Check (Step 0) first.** Learnings
   captured on prior runs (broken selectors, new Google challenge screens,
   hydration timing) are the only way this skill self-improves.
5. **NEVER proceed past Step 7 (dashboard verification) if the browser is
   not on a FIREKaro `/dashboard` route.** A redirect to `/auth/signin?error=oauth`
   or a backend 404 on `:3000/dashboard` is a failure, not a success.

---

## STEP 0: Reference Completeness Check

**Read:** `references/self-update-protocol.md` (full file — the protocol is
executable, not documentation).

**Read:** `references/learnings.md` (load Consolidated Principles + Active
Observations into working memory — these shape selector choices, timing
waits, and challenge-screen handling in later steps).

**Read:** `references/known-selectors.md` (current best selectors for the
Google sign-in flow and the FIREKaro signin page).

**Read:** `references/credential-protocol.md` (the "don't write credentials
to disk" invariant and its rationale).

If any referenced file is missing, report to the user and stop — do not
attempt to log in with a partially-initialized skill.

---

## STEP 1: Parse Arguments

Parse `$ARGUMENTS`:

| Flag | Effect |
|------|--------|
| `--fresh` | Skip Step 3 (session reuse). Force re-auth from Google. Use when session is stale or user wants a different Google account. |
| `--email=<gmail>` | Pre-fill the Gmail field in Step 5 so the user only types the password. The email is NOT stored — it is passed inline this run only. |
| (none) | Default: try session reuse first, fall back to full auth. |

---

## STEP 2: Prerequisites — Ensure Dev Servers Are Running

Runs on every path (session reuse and fresh auth). If either dev server is
not responding, this step automatically starts `npm run dev` (which boots
frontend + backend concurrently per `CLAUDE.md`) and polls until both ports
are ready. If auto-start fails, HALT with the last lines of server output so
the user can diagnose.

### 2.1 Probe Both Ports

```bash
FRONTEND=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/auth/signin 2>/dev/null || echo 000)
BACKEND=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/auth/get-session 2>/dev/null || echo 000)
echo "frontend=$FRONTEND backend=$BACKEND"
```

Both must return `200`. Backend `200` with body `{ data: null }` is fine
(it means unauthenticated, not broken). If both are `200` → skip to 2.4.

### 2.2 Auto-Start `npm run dev` If Either Port Is Down

1. Launch the combined dev server as a **background** Bash process:
   - Use the `Bash` tool with `run_in_background: true` and command
     `npm run dev` from the repo root.
   - Capture the returned background-process ID so its output can be read
     back if startup fails.
   - Tell the user: *"Dev servers not running — starting `npm run dev` in
     the background. Waiting up to 90 s for both ports to come up."*
2. Poll both endpoints every 2 s for up to 90 s:

```bash
for i in $(seq 1 45); do
  F=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/auth/signin 2>/dev/null || echo 000)
  B=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/auth/get-session 2>/dev/null || echo 000)
  if [ "$F" = "200" ] && [ "$B" = "200" ]; then
    echo "ready after ${i} iterations"; exit 0
  fi
  sleep 2
done
echo "timeout frontend=$F backend=$B"; exit 1
```

3. On success → proceed to 2.3. Record in Step 9 candidates that the skill
   auto-started the servers this run (only if the behavior is novel for
   `learnings.md` — otherwise suppress).
4. On timeout → read the background process output (tail ~40 lines),
   report the tail to the user verbatim, and HALT: *"Failed to start dev
   servers within 90 s. Final ports: frontend=$F backend=$B. Last output
   from `npm run dev`: [tail]. Likely causes: port already occupied,
   `DATABASE_URL` unreachable, missing `.env`. Fix and retry."*

### 2.3 Do Not Stop the Server After Sign-In

The auto-started `npm run dev` process MUST keep running after the skill
exits so the user can keep using the app. Do NOT kill the background
process in Step 8, Step 9, or during teardown.

### 2.4 Google OAuth Env Vars (fresh-auth path only)

Skip if session reuse at Step 3 succeeds. Confirm `.env` has
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `BETTER_AUTH_URL` set. If any
are missing, Better Auth's `/api/auth/sign-in/social` will 500 on click.
Tell the user which vars to add and point them at `.env.example`.

---

## STEP 3: Session Reuse Fast Path

Unless `--fresh` was passed, check for a valid persisted session:

1. Check if `e2e/.auth/user.json` exists. If not → skip to Step 4.
2. Check the file's modification time. If older than 7 days → skip to
   Step 4 (cookie lifetime per `session.expiresIn` in `server/lib/auth.ts`).
3. Open a visible Playwright browser with the stored cookies:
   - `mcp__playwright__browser_navigate` to `http://localhost:5173/`
   - Wait for hydration signal: `mcp__playwright__browser_wait_for` on
     the literal text expected on `/dashboard` (see `known-selectors.md`
     for the current dashboard landing heading)
5. If the wait succeeds → skip to Step 7 (verify dashboard).
6. If the wait times out or the browser is on `/auth/signin` → the cookie
   is invalid. Fall through to Step 4.

---

## STEP 4: Announce Manual Consent Step (Informational, No Wait)

Emit a single-line announcement so the user knows the browser is about to
open and that they (not the skill) will type credentials into Google's
form. **Do NOT wait for a reply.** The user pre-authorized this skill to
proceed when they invoked `/app-login`; pausing for a "go" on every run
was removed 2026-05-24 at user request.

Announcement (one line, then continue immediately to Step 5):

> "Opening a visible Chromium window at FIREKaro's sign-in → Google.
> You will type your Gmail + password directly in the browser; I will
> not type or store them. Waiting up to 3 min for the redirect back."

The credential-handling invariants in `references/credential-protocol.md`
still apply unconditionally — this change only removes the confirmation
gate, not the safety constraints.

---

## STEP 5: Drive Google OAuth Flow

0. **If `--fresh` was passed, clear browser cookies FIRST.** MCP Playwright
   persists cookies across skill runs — a stale Better Auth session cookie
   will trigger the signin page's auto-redirect to `/dashboard` even when
   `/api/auth/get-session` returns `null`, producing a false-positive
   landing that Step 7 correctly rejects (see L-006 in `learnings.md`).
   Skip this sub-step when `--fresh` was NOT passed (session reuse path
   intentionally keeps cookies).

   ```ts
   // Navigate to a page ON the frontend origin first. `about:blank` cannot
   // read document.cookie, and the Better Auth session cookie is HTTP-only
   // (invisible to document.cookie) — the only reliable clear is a proper
   // sign-out POST through the Vite proxy, which returns Set-Cookie with
   // an expired value.
   mcp__playwright__browser_navigate({ url: 'http://localhost:5173/' })
   mcp__playwright__browser_evaluate({
     function: `async () => {
       // Better Auth's sign-out requires Content-Type: application/json AND
       // a JSON body. Without both, it returns 415. Tested this session.
       const r = await fetch('/api/auth/sign-out', {
         method: 'POST',
         credentials: 'include',
         headers: { 'Content-Type': 'application/json' },
         body: '{}',
       })
       return { signOutStatus: r.status }
     }`
   })
   ```

   After the clear, verify `GET /api/auth/get-session` returns `null` (no
   cookie took effect). If it still returns a user, HALT and report — the
   clear did not work, and proceeding would re-land the false positive.

1. Open browser: `mcp__playwright__browser_navigate` to
   `http://localhost:5173/auth/signin`.
2. Wait for hydration: `mcp__playwright__browser_wait_for` on the text
   `"Continue with Google"` with a 10-second timeout.
3. Snapshot the page to get the current ref for the button:
   `mcp__playwright__browser_snapshot`.
4. Click the Google button by its `data-testid="signin-google-button"`
   (refer to `known-selectors.md`; update learnings if selector differs).
5. The browser redirects to `accounts.google.com`. At this point, **hand
   control to the user**: report back "Google sign-in page is open —
   please enter your credentials. I'll wait up to 3 minutes for the
   redirect back to FIREKaro."
6. Poll for the post-login redirect using a long `browser_wait_for`:
   - Wait for the URL to match `localhost:5173/**` with a 180-second
     timeout.
   - Accept both `/dashboard` (success) and `/auth/signin?error=oauth`
     (Google-side failure).
7. If the poll times out → the user likely abandoned the flow. Ask:
   "I didn't see a redirect back. Did you complete the Google sign-in?
   (yes to keep waiting / no to cancel)"

---

## STEP 6: Handle Known Challenge Screens

While the user is in Google's flow, observe the URL and DOM for known
challenge screens listed in `references/learnings.md`. Examples of
observations to record (not prescriptive actions — this skill does NOT
automate Google's security challenges):

- "2-Step Verification" prompt → observation only; user handles on phone.
- "This browser may not be secure" → observation only; record the exact
  page title and note it as a failure mode. Do NOT attempt to bypass.
- Device-trust / "Confirm it's you" → observation only.

If a NEW challenge screen appears (not in `learnings.md`), take a
redacted screenshot (blur the email field if visible), record the page
title + URL pattern, and queue it as a CANDIDATE observation in Step 9.

---

## STEP 7: Verify Dashboard Landing

1. Confirm the browser URL matches `http://localhost:5173/dashboard` OR
   a known dashboard sub-route (see `known-selectors.md`).
2. Take a non-redacted screenshot `.claude/skills/app-login/last-run.png`
   (overwritten each run, gitignored — add to `.gitignore` if missing).
3. Call `mcp__playwright__browser_network_requests` and confirm that
   `/api/auth/get-session` returned 200 with a non-null user.
4. If any of the above fails → report failure to the user with the
   actual URL and the screenshot path. Skip Step 8 (do not persist
   broken state).

---

## STEP 8: Persist Session Cookie Only

**Precondition:** Step 7 passed.

1. Export the current browser storage state to `e2e/.auth/user.json`:
   - Use `mcp__playwright__browser_evaluate` to read `document.cookie`
     and localStorage if needed, or use the Playwright context's
     `storageState()` serialization if the MCP tool supports it.
   - If MCP cannot directly serialize storageState, fall back to a
     short Node script invoked via Bash that connects to the running
     browser via CDP and writes the state. Record the method used in
     learnings.md for reuse.
2. Verify `e2e/.auth/user.json` exists and contains `cookies` with at
   least one entry whose `name` matches the Better Auth session cookie
   prefix (e.g., `better-auth.session_token`).
3. **Scan the file and confirm NO plaintext password, email, or Google
   tokens are present** (session cookie value is opaque — that's fine;
   anything resembling `@gmail.com`, `password`, or raw Google access
   tokens is NOT fine).
4. Report to user: "Logged in. Session saved to `e2e/.auth/user.json`
   (expires in 7 days). Next login within 7 days will skip credential
   entry."

---

## STEP 9: Self-Update Pass (per references/self-update-protocol.md)

Run the Reference Completeness Check output workflow:

1. **N.1 Detect Mode** — Check for `.claude/skills/learn-n-improve/SKILL.md`.
   If present → FULL mode. Else → STANDALONE mode.
2. **N.2 Scan Execution Context** — Review what happened this run. Candidate
   observations include:
   - New selector that replaced a stale one from `known-selectors.md`
   - New challenge screen Google introduced
   - Hydration timing that differed from prior runs
   - CDP/storageState serialization method that worked
   - Dashboard sub-routes that count as successful landing
3. **N.3 Admission Gate** — Reject generic knowledge, one-time artifacts,
   user-specific data, credentials, anything session-scoped.
4. **N.4 Format Entries** — Use the 13-field format from the protocol.
5. **N.5 Score and Gate** — STANDALONE: score via a haiku subagent,
   present to user, wait for approval. FULL: route through learnings.json.
6. **N.6 Consolidation Check** — Apply if triggers fire.
7. **N.7 Version Bump** — If reference files were modified, bump the
   skill's patch version in frontmatter.
8. Log every write to `references/CHANGELOG.jsonl`.

**CRITICAL:** Wait for the user's approval before writing to reference
files. Auto-writes without approval are a CRITICAL evaluator failure.

---

## CRITICAL RULES (mirror of Preamble)

- NEVER persist Gmail address, password, or Google tokens to disk. Only
  the opaque session cookie from Better Auth is persistable.
- NEVER run a headless browser for this flow — Google will block it.
- NEVER bypass Google's security challenges. Observe, record, escalate
  to the user. This skill is not a credential-stuffing tool.
- NEVER echo the password in screenshots, logs, or learnings entries.
- ALWAYS read `references/learnings.md` + `known-selectors.md` at Step 0
  before touching the browser — the skill's intelligence lives there.
- ALWAYS require user approval before writing to reference files in
  Step 9 (the self-update-protocol enforces this; do not shortcut it).
- ALWAYS verify `/dashboard` landing via URL + `/api/auth/get-session`
  200 before persisting the session cookie. A false positive persists a
  broken state that poisons the next run.
