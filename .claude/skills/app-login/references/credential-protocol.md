# Credential Protocol — Never Write Credentials to Disk

This is the load-bearing safety invariant of the `app-login` skill. Every other
rule is subordinate to the ones in this file. If a workflow step appears to
require relaxing these rules, HALT and surface the conflict to the user.

## The Invariant

The skill MUST NEVER persist any of the following to disk, memory files,
reference docs, learnings entries, logs, or screenshots:

- The user's Gmail address (even when supplied via `--email=<gmail>` flag)
- The user's Gmail password
- Any Google-issued OAuth token (access token, refresh token, ID token)
- Any 2FA code, backup code, or device-trust token
- Any HTTP body, header, or URL fragment that contains the above

The ONLY persistable artifact is the opaque Better Auth session cookie written
to `e2e/.auth/user.json`. That file MUST be gitignored (verify at Step 7) and
MUST NOT contain any of the banned fields.

## Why This Matters

FIREKaro is a personal-finance app. A leaked Gmail credential is a catastrophic
failure for the user — it exposes email, banking 2FA, cloud storage, and every
other downstream account that uses the same Google identity as the login
provider. The skill's value (faster login) is orders of magnitude smaller than
the harm of a credential leak. When the two conflict, safety wins unconditionally.

## MUST / MUST NOT

- MUST prompt for the Gmail address and password via the user-facing browser
  form, not via the skill's own text input. The user types into Google's UI
  directly.
- MUST NOT echo a credential back to the user in any form — not for
  confirmation, not for logging, not for "debugging".
- MUST NOT accept a credential supplied via skill input (e.g., in the `--email`
  flag value) except as a pre-fill hint. Treat `--email=<gmail>` as advisory
  only; the user still types the password in the browser.
- MUST NOT take a screenshot while the password field is visible and populated.
  If the workflow needs a screenshot of the Google page, capture it before the
  user types or after the redirect back to FIREKaro.
- MUST NOT log the `Authorization`, `Cookie`, or `Set-Cookie` headers during
  `mcp__playwright__browser_network_requests`. If a log line would contain
  them, redact the value to the literal string `[REDACTED]` before emitting.
- MUST NOT record a credential in `references/learnings.md` or any CHANGELOG
  entry. The admission gate in `self-update-protocol.md` N.3 rejects these
  absolutely — violations are a CRITICAL skill failure.
- MUST NOT commit `e2e/.auth/user.json` to git. Verify `.gitignore` includes
  `e2e/.auth/` at Step 7 before persisting.
- MUST NOT store the user's Gmail address in memory files, task lists, or
  session artifacts. A successful run leaves no trace of the user's identity.

## Handling the Password Field

During Step 4 of the skill:

1. Drive the browser to the FIREKaro signin page.
2. Click the Google button — this redirects to `accounts.google.com`.
3. At that point, HAND CONTROL to the user. Emit a plain-text message that
   says: *"Google sign-in page is open — please enter your credentials. I'll
   wait up to 3 minutes for the redirect back to FIREKaro."*
4. Poll for the redirect via `mcp__playwright__browser_wait_for` with a URL
   pattern (`localhost:5173/**`), not by inspecting the Google page DOM.
5. MUST NOT call `mcp__playwright__browser_type` on any field whose surrounding
   context mentions "password", "passwd", "Enter your password", or similar.

## Session Cookie Persistence

When Step 7 runs:

1. Export Playwright's storage state (cookies + relevant origins) to
   `e2e/.auth/user.json`.
2. Before persisting, scan the serialized blob for:
   - The substring `@gmail.com` (or any user email pattern)
   - The substring `password`
   - Any string resembling a Google access token (starts with `ya29.`)
   - Any string resembling a Google ID token (JWT form `eyJ...`)
3. If any match is found, ABORT the persist step and surface the finding to
   the user. Do NOT filter the file and continue — a positive match means the
   serializer is leaking and needs investigation.
4. The session cookie's value itself is opaque and is fine to persist.

## Rotation and Cleanup

- If the user runs with `--fresh`, the existing `e2e/.auth/user.json` is
  overwritten with the new session. The previous cookie is discarded; it is
  NOT moved to a backup file.
- If the skill encounters a credential leak in a log, screenshot, or reference
  file, it MUST:
  1. Halt the current step immediately.
  2. Report the leak path to the user (without re-emitting the credential).
  3. Wait for user instruction before touching the offending file.

## Auditability

- `references/CHANGELOG.jsonl` MUST record every write to a reference file,
  including the file path, timestamp, and confidence score — but NEVER the
  content. A CHANGELOG line MUST NOT contain `password`, `email`, or any
  identifier that could be traced back to the user.
- The skill MUST tolerate being audited: a reviewer reading every file in
  `.claude/skills/app-login/` must find no credential-shaped data anywhere.

## Scope of This Protocol

This file governs the `app-login` skill only. It does NOT regulate other parts
of FIREKaro (the app's own auth middleware, the Better Auth config, the user's
`.env` file). Those are the app team's responsibility. If the skill observes
credentials leaking from elsewhere in the repo, that is a finding to report —
not a license to copy the pattern.
