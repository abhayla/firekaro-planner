---
description: Any documented E2E CLI flag / env-var / option that claims to change behavior MUST have a matching guard wired in the spec code.
globs: ["e2e/**", ".claude/skills/**"]
---

# E2E Documented Flags Must Be Wired

Any CLI flag, env var, or option documented in a skill, README, or test plan that claims to change E2E behavior MUST have a matching guard in the spec code. Documented-but-unwired flags are a silent footgun — callers pass the flag, nothing happens, and the bug surfaces as "my `--no-X` option didn't work."

## MUST / MUST NOT

- Every documented flag that promises to gate `beforeAll` / `beforeEach` / a `test()` body MUST be checked in that exact location. Documenting the flag in a skill `SKILL.md` / README / argument-hint while leaving the spec ignoring it is forbidden.
- Env-var gates MUST use exact-string checks (`process.env.FLAG === "1"` or `=== "true"`), not truthiness (`!!process.env.FLAG`). Truthy checks fire on `"0"` and `"false"` — both are intuitively "off" but evaluate truthy.
- When a flag is added to a skill's argument list, the same PR MUST wire the corresponding env var into every spec file whose behavior the flag claims to change.
- When a flag is REMOVED from a skill, the corresponding env check in the spec MUST be removed in the same change.
- A skill flag that does nothing ("TODO: wire me") is NEVER acceptable — either implement it or remove the documentation.

## Canonical example — `JOURNEY_SKIP_WIPE`

`/new-user-test-skill`'s `--no-wipe` flag sets `JOURNEY_SKIP_WIPE=1`. The spec at `e2e/tests/journey/00-new-user-to-fire.spec.ts` honors it:

```ts
test.beforeAll(async () => {
  if (process.env.JOURNEY_SKIP_WIPE === "1") {
    console.warn("[journey] beforeAll cleanup skipped: JOURNEY_SKIP_WIPE=1 set (debug mode)");
    return;
  }
  // ... cleanup ...
});
```

Before the 2026-04-20 fix, the flag was documented in the skill but the spec's `beforeAll` wiped unconditionally. A user passing `--no-wipe` to debug against seed data got a silent wipe anyway.

## Detection

When reviewing a PR that touches a skill argument list, grep the referenced spec files for the env-var name. If grep returns zero hits, the flag is not wired — reject or fix.

```bash
# Example detection for JOURNEY_SKIP_WIPE
grep -r "JOURNEY_SKIP_WIPE" e2e/tests/journey/ || echo "UNWIRED"
```

## Why This Matters

Skills document behavior. Specs implement behavior. When those drift, the documented contract becomes a lie and downstream debugging burns time — a contributor reads the skill, trusts the flag, and spends 30 minutes figuring out why the env var has no effect. The fix is cheap (one `if` statement) and the regression lock is cheap (grep in CI). The cost of NOT doing it is the next contributor's 30 minutes plus a bug report.
