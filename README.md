# FireKaro v5 — MVP build

This folder is the **research-grounded MVP** of FireKaro, built per the contract
at [`docs/goals/build-firekaro-mvp-v5.md`](../docs/goals/build-firekaro-mvp-v5.md).

It is **completely independent** of:

| Folder | Purpose | Port |
|---|---|---|
| `src/` (repo root) | Production app (Vue 3 + Hono + Postgres) | 5173 |
| `demo/` | v4 demo build (UI polish + storytelling — frozen) | 5174 |
| `mvp/` (this folder) | v5 MVP build (research-grounded, multi-tenant-ready) | 5175 |

The three apps live side-by-side and never write into one another. v4 demo at
`demo/` continues to be the v4 reference implementation.

---

## What v5 changes vs v4

- **Research-grounded math** — 4-bucket inflation, per-instrument-type returns,
  horizon-driven SWR, variant-multiplier model, glide path, Floor/Ceiling
  withdrawal rules.
- **Multi-tenant-ready architecture** ([ADR-0001](../docs/adr/0001-v5-portfolio-tier-stance.md))
  — every entity carries `userId`, storage is abstracted behind
  `StorageAdapter`, `AuthProvider` is stubbed. v5 ships single-user runtime
  (Abhay's machine) but v6 commercial SaaS becomes a swap-the-adapter exercise.
- **6-section onboarding questionnaire** with sticky "Skip — show me
  everything" affordance (Principle 3 alignment).
- **`/preferences` page** as the canonical home for every editable planning
  assumption — section-anchored sticky nav, 10 sections, statutory facts
  read-only.
- **4 seed personas** (vs v4's 3): Sharmas updated, new Iyers (late-30s
  sandwich-gen), Mehtas preserved, Empty preserved.
- **3 new top-level routes**: `/investments/buckets`, `/fire-goals/stress-test`,
  `/estate-planning`.

---

## Running the MVP

```bash
cd mvp
npm install
npm run dev           # http://localhost:5175
npm run test:unit     # vitest
npm run test:e2e      # playwright
npm run type-check
npm run build
```

`mvp/` does NOT share `node_modules/` with `demo/` or the root project. Run
`npm install` inside `mvp/` once.

---

## Status

Build is in progress. The contract at
[`docs/goals/build-firekaro-mvp-v5.md`](../docs/goals/build-firekaro-mvp-v5.md)
is the source of truth — 9 phases, 22 stages, ~134 tasks, ~65 DoD criteria.

Track progress via the per-stage commits (`feat(mvp-v5): <stage> — <description>`).
Deferred items land in `mvp/DEFERRED-v5.md` when triggered.

---

## Boundary contract

This folder MUST NOT modify anything outside itself except:

- `docs/audit/`, `docs/adr/`, `docs/goals/`, `CONTEXT.md` — content artifacts
- This file (`mvp/README.md`) and the `mvp/POST-RUN-NOTES-v5.md` companion

Specifically, **never modify** `src/`, `server/`, `prisma/`, `e2e/`,
`.claude/`, or any `demo/` file. See contract §0 + §1.1 Decision 1 (isolation
invariant).
