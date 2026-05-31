# /new-user-test-skill

Autonomous runner for the New-User Journey E2E spec.

## When to Invoke

- Before merging any PR that touches `server/routes/`, `src/composables/useFIRE.ts`, `server/lib/calculations/fire-*.ts`, or the dashboard/FIRE pages.
- After bumping Prisma schema or Better Auth config.
- As a nightly canary (CI wiring optional).
- Any time the question is "does the new-user happy path still work?"

Typical invocations:

```
/new-user-test-skill
/new-user-test-skill max_iterations: 5
/new-user-test-skill --no-wipe           # keep existing seed data (debug mode)
/new-user-test-skill --skip-preflight    # caller already validated env
/new-user-test-skill --no-capture-proof  # skip screenshot archive
```

## Preflight Requirements

Before invoking, the environment MUST have:

1. Frontend dev server listening on `5173` (`npm run dev:frontend`).
2. Backend Hono server listening on `3000` (`npm run dev:backend`).
3. PostgreSQL reachable with `.env.DATABASE_URL`.
4. `e2e/.auth/user.json` present — run `/app-login` if missing.
5. `DEV_BYPASS_AUTH=true` in `.env` for the dev-bypass identity.

The skill itself checks all five in §6 Preflight and returns `result: BLOCKED` with a `next_options` list if any fail.

## How It Differs From `/fix-loop` + the Journey Spec

| Concern | Raw `/fix-loop` on the journey spec | `/new-user-test-skill` |
|---|---|---|
| Environment preflight | No | Yes (ports, DB, auth, evidence dirs) |
| Concurrency guard (wipe isolation) | No | Yes (warns on recent section-spec mtime) |
| Structured verdict | fix-loop's own JSON | `test-results/new-user-test-skill.json` per `rules/testing.md` |
| Learnings capture | No | Appends to `learnings.md` every run |
| Rule-update proposals | No | Proposes rule changes after ≥2 matching incidents |
| Dual-mode (standalone + dispatched) | Partial | Yes — per `rules/agent-orchestration.md` §10 |
| Next-action options | No | Yes — outcome-scoped `next_options` list |

## File Map

- `SKILL.md` — operational contract (tier, preflight, execution, verdict schema).
- `learnings.md` — append-only memory across runs.
- `README.md` — this file.

## Source of Truth

The skill is a thin orchestrator. It does not re-implement test logic. See:

- `docs/NEW-USER-JOURNEY-TEST-PLAN.md` — the plan this skill certifies.
- `e2e/tests/journey/00-new-user-to-fire.spec.ts` — the spec being executed.
- `e2e/utils/calculation-helpers.ts` — math helpers used by the spec.
- `e2e/cleanup-database.ts` — the destructive wipe run in `beforeAll`.
