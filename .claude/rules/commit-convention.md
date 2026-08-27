---
description: Git commit message format and pre-commit workflow
paths: []
---

# Scope: global

# Commit Convention

## Message Format

All commit messages MUST follow conventional commits format:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

## Commit Types

| Type | When to Use |
|------|-------------|
| `feat` | New feature, new page, new component, new API endpoint |
| `fix` | Bug fix, broken selector, calculation error, rendering issue |
| `refactor` | Code restructure with no behavior change |
| `test` | Adding or updating tests (unit, E2E, integration) |
| `docs` | Documentation changes (section plans, CLAUDE.md, STYLING-GUIDE.md) |
| `style` | CSS/Vuetify styling changes, formatting, whitespace |
| `chore` | Dependencies, config, tooling, CI pipeline |

## Scopes by Dashboard Section

Use the section name as scope when changes are section-specific:

| Scope | Section |
|-------|---------|
| `salary` | Salary income and CTC breakdown |
| `income` | Other income sources (rental, freelance, interest) |
| `capital-gains` | Capital gains from investments |
| `tds` | Tax Deducted at Source tracking |
| `expenses` | Monthly/annual expense tracking |
| `budgets` | Budget planning and tracking |
| `receipts` | Receipt capture and management |
| `investments` | Investment portfolio (SIP, stocks, FD, PPF) |
| `liabilities` | Loans, EMIs, credit card debt |
| `insurance` | Life, health, vehicle, property insurance |
| `financial-health` | Net worth, ratios, health score |
| `fire` | FIRE goals, projections, milestone tracking |
| `tax` | Tax planning, 80C/80D deductions, regime comparison |

Cross-cutting scopes: `auth`, `layout`, `db`, `api`, `e2e`, `ci`, `deps`

## Examples

```
feat(salary): add CTC breakdown with tax regime comparison
fix(expenses): correct monthly total when category filter active
refactor(investments): extract SIP calculator to server/lib/calculations
test(e2e): add cross-page consistency tests for financial-health
docs(income): update section plan with rental income tab details
chore(deps): bump @tanstack/vue-query to 5.x
```

## Co-Authored Commits

When Claude assists with implementation, append the co-author trailer:

```
feat(salary): add family member salary comparison view

Co-Authored-By: Claude <noreply@anthropic.com>
```

## Pre-Commit Checklist

Before every commit, run these checks in order:

1. **TypeScript validation**: `npm run type-check` — MUST pass with zero errors (run in BOTH trees: repo root + `server/`)
2. **Targeted unit tests**: `npm run test:unit -- -t "relevant-pattern"` — run tests related to changed code (`-t` filters by test name; vitest has no `--grep`)
3. **Review changes**: `git status` then `git diff` — verify only intended files are staged

> **ESLint: `server/` only.** The `server/` tree HAS a minimal ESLint gate
> (`server/eslint.config.mjs`, run via `cd server && npm run lint`) enforcing exactly two
> invariants over `server/src/**`: no raw `c.json()` (envelope discipline) and no `console.*`
> (pino-logger discipline) — nothing else. Run it alongside `type-check` + `test:unit` when
> committing `server/` changes. The **frontend root still has no ESLint** (no `eslint.config.*` /
> `lint` script there); for root-only changes the gate stays `type-check` + `test:unit`. The
> deterministic pre-commit hook (`.githooks/pre-commit`, wired by the root `prepare` script) does a
> secret scan, not linting.

If any check fails, fix before committing. NEVER use `--no-verify` to skip pre-commit hooks.

## Atomic Commit Strategy

- **Separate commits** for: backend routes, frontend components, E2E tests, documentation
- **Single commit** when: backend + frontend changes are tightly coupled and one is broken without the other
- **Schema changes FIRST**: Prisma schema modifications get their own commit before the code that uses them

```
# Example commit sequence for a new section:
git commit -m "feat(db): add Insurance prisma model with indexes"
git commit -m "feat(insurance): add CRUD routes and Zod validation"
git commit -m "feat(insurance): add composable, pages, and components"
git commit -m "test(insurance): add E2E tests for insurance section"
git commit -m "docs(insurance): add Insurance-Section-Plan.md"
```

## Multi-Line Commit Messages

Use HEREDOC syntax for multi-line messages:

```bash
git commit -m "$(cat <<'EOF'
feat(financial-health): add net worth calculation dashboard

- Overview tab with net worth trend chart and asset allocation
- Details tab with asset/liability breakdown table
- Server-side calculation in server/lib/calculations/financial-health.ts
- Invalidates investment and liability query caches on mutation

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

## Branch Naming

Feature branches follow the pattern: `feature/vue-{section}`

| Branch | Purpose |
|--------|---------|
| `feature/vue-income-tax` | Income and tax planning sections |
| `feature/vue-expenses-protection` | Expenses, insurance, liabilities |
| `feature/vue-investments` | Investment portfolio section |
| `feature/vue-fire-goals` | FIRE goals and projections |
| `feature/vue-financial-health` | Financial health dashboard |

Hotfix branches: `fix/vue-{issue-description}`
