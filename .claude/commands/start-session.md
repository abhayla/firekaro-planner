# Start Session Command

**Purpose**: Resume development by loading a saved session checkpoint from `.claude/sessions/`.

## Instructions

This command is a thin wrapper. Run the `/start-session` skill which handles:

1. Finding the most recent (or named) session file in `.claude/sessions/`
2. Parsing working files, git state, decisions, and task progress
3. Loading key files into context (up to 10, prioritized by status)
4. Presenting a structured briefing with suggested next action
5. Waiting for user direction before starting work

## Optional Argument

If `$ARGUMENTS` is provided, use it as the session name to load.

Example: `/project:start-session api-envelope-migration`

## If No Sessions Exist

If `.claude/sessions/` is empty, perform a fresh project scan:

1. Read `CLAUDE.md` for project context
2. Run `git status` and `git log --oneline -10` to understand recent work
3. Ask the user what they want to work on

## Tech Stack Reminder

**IMPORTANT**: This project uses its own backend stack:

| Component | Technology | Location |
|-----------|------------|----------|
| Backend | **Hono** (NOT Next.js) | `server/` folder |
| Database | PostgreSQL + Prisma | `prisma/schema.prisma` |
| Auth | Better Auth | `server/lib/auth.ts` |
| Frontend | Vue 3 + Vuetify 3 | `src/` |
| State | Pinia (client) + TanStack Vue Query (server) | `src/stores/`, `src/composables/` |

- Do **NOT** reference the old Next.js project (`FIREKaro/`)
- All API development happens in `server/routes/`
