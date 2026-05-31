---
description: Session continuity system for multi-session development workflow
globs: [".claude/sessions/**/*.md", ".claude/commands/**/*.md"]
---

# Session Management

## Skill-Based System

Session continuity uses two skills:

- **`/save-session`** — End of session. Gathers git state, test status, working files, and decisions into a structured checkpoint file in `.claude/sessions/`.
- **`/start-session`** — Start of session. Reads the most recent (or named) session file, loads working files into context, and presents a briefing.

## Session File Location

All session checkpoints are stored in `.claude/sessions/` as markdown files with structured sections:
- Working Files (with status and notes)
- Git State (branch, commits, uncommitted changes)
- Key Decisions (architectural choices and rationale)
- Task Progress (completed, in-progress, blocked)
- Resume Notes (what to do first, gotchas)

## Session Start Behavior

At the beginning of every session, run `/start-session` to:
- Understand what the last session accomplished
- Know what branch and state the project is in
- See the immediate priorities

This prevents wasted time re-discovering project state and avoids repeating completed work.

## Session Handover Preserves

The session file MUST capture:
- Current branch name and remote tracking status
- All uncommitted changes (file list)
- What was done in the current session
- What needs to happen next (prioritized)
- Any blockers or open questions
- Test status (which tests pass, which fail, why)
- Relevant commands the next session will need

## When to Save

- `/save-session` — primary trigger, generates full checkpoint
- Before context compaction — save critical state so it survives
- Before switching to a different branch or task — capture current state first
