---
description: Workflow for filing bugs as GitHub Issues. SSOT is GitHub Issues; never create docs/bugs/ markdown files. Every filed bug requires miss-analysis and sibling audit before declaring closed.
globs: ["e2e/tests/**/*.spec.ts", "src/pages/**/*.vue", "src/components/**/*.vue", "src/composables/**/*.ts", "src/utils/**/*.ts", "server/routes/**/*.ts", "server/lib/**/*.ts"]
---

# Bug Filing & Sibling Audit Protocol

## SSOT: GitHub Issues, not files

All bugs in this repo are tracked **only** in GitHub Issues
(`https://github.com/abhayla/FIREKaro-Vue/issues`). MUST NOT create any
markdown bug doc under `docs/bugs/` or anywhere else in the repo —
that folder no longer exists and re-creating it is forbidden. The
single-source-of-truth invariant means a fix's commit message can
link to one canonical Issue, and there is zero risk of file/Issue drift.

Use the `/create-github-issue` skill (under
`.claude/skills/create-github-issue/`) to file. It runs the 4-check
preflight (gh installed, gh authed, origin is github.com, token has
WRITE), computes the dedup signature, and routes to STEP 3
(create new) or STEP 4 (comment on existing).

## Skill-internal learnings are NOT bugs

Files like `.claude/skills/app-login/references/learnings.md` (the L-NNN
entries) are skill memory — guidance future skill runs consult to avoid
repeating discovery work. They are NOT a bug tracker and stay
file-based. Distinguishing rule of thumb: if an entry describes "what
this automation should remember about the app", it's a learning; if it
describes "an open work item in the product code or test suite", it's a
GitHub Issue.

## Required structure of a filed Issue

Every Issue MUST contain the following sections in order. The Issue is
NOT considered "filed" until all three are present:

1. **Reproduction + Root cause** — symptom, expected, reproduction
   steps, root-cause analysis pointing at the exact `file:line`, and a
   suggested fix.
2. **`## Why was this missed?`** — names the test that should have
   caught it, explains why it didn't (assertion gap / happy-path-only /
   shape-not-substance / tolerance that buries the signal / no
   coverage at all), and lists the specific test additions that would
   catch the next regression of this class.
3. **`## Sibling audit (Class N: ...)`** — describes the underlying
   *class* of the bug (not the instance), and reports the result of a
   repo-wide grep for other code locations exhibiting the same class.
   Every sibling location MUST be either (a) marked safe with
   evidence, (b) filed as its own Issue, or (c) flagged for a human
   spot-check with the reason why automated grep cannot confirm.

The Issue body MUST also include a `**signature:** <12-char-sha>`
footer used by `/create-github-issue`'s STEP 2 dedup search to detect
re-occurrences and comment instead of duplicating.

## MUST / MUST NOT

- MUST file the bug **before** writing any catch-tests or proposing
  fixes. The Issue number is the tracking artifact that catch-tests
  reference via `test.fixme()` / `describe.skip()` comments (e.g.,
  `// Bug: gh-issue #44`).
- MUST run the sibling audit as part of the same session as filing the
  Issue, not deferred to "later". Deferred audits accumulate as
  never-done work. The audit section is part of the Issue body, not a
  follow-up comment.
- MUST treat shape-vs-substance test gaps as a first-class class —
  when an Issue is missed because the test only asserted "card is
  visible" / "label X is present" instead of asserting the card's
  actual conveyed values, the `Why was this missed?` section MUST
  name this as a shape-vs-substance miss and the fix MUST include a
  substance assertion.
- MUST mark catch-tests added before a fix as `test.fixme()`
  (Playwright) or `describe.skip()` / `it.skip()` (Vitest), with an
  explicit comment linking to the Issue number. The project's
  history (`docs/FIXME-AUDIT-2026-04-22.md`) proves `test.fixme()`
  is an accepted bookkeeping mechanism here.
- MUST NOT create a `docs/bugs/` directory or any markdown bug file.
  GitHub Issues are SSOT.
- MUST NOT add a `test.skip` without a tracking Issue. Reference the
  Issue number in the test comment.
- MUST NOT assume a single-occurrence pattern is "contained" without
  running the sibling audit. Many bugs have been missed because the
  same defect lives in a sibling component that the author never
  thought to check.

## Catch-Test Layering

For each filed bug, choose the **minimum viable layering** that closes
the detection gap without unnecessary duplication. Common layerings:

| Bug class | Recommended layers |
|---|---|
| Logic bug in a pure computation | Unit (Vitest) — fastest, deterministic |
| Logic bug in page-level Vue computed | Unit via `@vue/test-utils` mount + mocked fetches (see `src/composables/useFamily.spec.ts` precedent) |
| Wrong number rendered on a card | E2E that asserts the substance + structural entry in `e2e/visual-tests.template.yml` |
| Class spans multiple components | Generic E2E sweep (e.g., "fresh user dashboard sweep") — only when 3+ siblings exist |

## Sibling-Audit Output Format

Inside the Issue body's `## Sibling audit` section, include a table:

```markdown
| Grep pattern / location | Hits | Verdict |
|---|---|---|
| `<regex or component pattern>` | <count, with file:line> | safe / new Issue filed / requires human check |
```

Plus a paragraph describing "the class is contained" or "the class
extends to N other files, of which M have been spot-checked manually".

## Generic Instruments

Some bug classes admit a single generic instrument that prevents future
regression across the whole codebase rather than per-component locks:

- **Empty-user dashboard sweep E2E** — walks every dashboard surface
  against a known-zero-data fixture and asserts no progress /
  completion / score widget shows > 0%. Catches the
  "empty-as-completed" class app-wide.
- **Shared-component lint / PR-review rule** — when a shared
  component (like `<YoYComparison>`) exists for a pattern, new code
  MUST use it instead of inlining a variant. Prevents the "this
  section was built before the shared component existed and never
  migrated" drift.

When a bug's sibling audit reveals a class with 3+ active instances,
prefer the generic instrument over filing 3+ identical Issues. When
the class is contained to 1 occurrence, the per-bug catch-test is
sufficient.

## Migration note (2026-05-19)

This rule was rewritten to make GitHub Issues the only bug-tracking
mechanism. The prior version (2026-05-18) prescribed
`docs/bugs/<name>.md` files; that folder has been deleted and Issues
#44 and #45 are the canonical record of those two bugs. No file/Issue
divergence risk going forward.

## Why this rule exists

Filed 2026-05-18 after a manual walkthrough surfaced two bugs (Filing
Readiness Score false positive, YoY card omits base values). Both bugs
had passing E2E tests that asserted shape but not substance. Without
this protocol, the next walkthrough would re-discover similar misses
because the lesson lives only in chat. Codifying makes the lesson
load-bearing for every future bug-filing session, not just the one
that surfaced it.
