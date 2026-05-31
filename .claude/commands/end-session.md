# End Session Command

**Purpose**: Save current session state using the `/save-session` skill.

## Instructions

This command is a thin wrapper. Run the `/save-session` skill which handles:

1. Gathering git state (branch, status, recent commits)
2. Running type-check and capturing pass/fail
3. Analyzing session work (files modified, decisions, progress)
4. Writing a structured checkpoint to `.claude/sessions/`
5. Presenting a summary of what was saved

## Optional Argument

If `$ARGUMENTS` is provided, use it as the session name/focus description.

Example: `/project:end-session api-envelope-migration`

## Tech Stack Reminder

| Component | Technology | Location |
|-----------|------------|----------|
| Backend | **Hono** (NOT Next.js) | `server/` folder |
| Database | PostgreSQL + Prisma | `prisma/schema.prisma` |
| Auth | Better Auth | `server/lib/auth.ts` |
| Frontend | Vue 3 + Vuetify 3 | `src/` |
| State | Pinia (client) + TanStack Vue Query (server) | `src/stores/`, `src/composables/` |
