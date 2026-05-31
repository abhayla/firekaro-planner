# Self-Update Protocol: Reference Completeness Check

This protocol defines the workflow for detecting and persisting new domain
knowledge during app-login invocations. It is executable — Step 8 of
`SKILL.md` runs this file top-to-bottom.

## N.1 Detect Pipeline Mode

1. Check if `.claude/skills/learn-n-improve/SKILL.md` exists in the project
2. Check if this skill's `references/CHANGELOG.jsonl` exists

| learn-n-improve? | CHANGELOG.jsonl? | Mode |
|---|---|---|
| Yes | * | **FULL** — knowledge flows through learnings.json |
| No | * | **STANDALONE** — knowledge scored and persisted directly |

Create `references/CHANGELOG.jsonl` if it does not exist.

## N.2 Scan Execution Context

Review the conversation for knowledge worth capturing:

| Scan For | Example |
|---|---|
| Selector drift | "`data-testid=signin-google-button` still works — do not change" |
| New Google challenge screen | "'Confirm it's you' with device-trust prompt appeared post-login" |
| Hydration timing | "10s `browser_wait_for` for 'Continue with Google' was sufficient; 5s was not" |
| StorageState serialization method | "CDP export via Bash+Node worked; MCP `browser_evaluate` returned only document.cookie" |
| Dashboard sub-routes | "`/dashboard/overview` also counts as successful landing" |
| OAuth edge case | "First-login users hit a consent screen that adds ~2s latency" |

## N.3 Admission Gate

**DO NOT record:**
- User's Gmail address, password, 2FA codes, or any Google-issued token
  (absolute — these are banned from memory, let alone reference files)
- Generic browser-automation knowledge (use Playwright, wait for elements)
- Temporary workarounds for bugs with fix dates
- Information already in CLAUDE.md, `.claude/rules/`, or existing references
- Opinions without evidence
- One-time debugging artifacts (full stack traces, URL fragments with state tokens)
- STATIC observations scoped to a single session (e.g., "today the network was slow")

If nothing passes the gate → report "References are up to date" → skip to N.7.

## N.4 Format Entries

For each observation that passes the gate, format as:

```markdown
### [TYPE] Brief title
- **ID:** L-<next-sequential>
- **State:** CANDIDATE
- **Temporal:** STATIC | DYNAMIC | ATEMPORAL
- **Scope:** global | `.claude/skills/app-login/**`
- **Date:** <today YYYY-MM-DD>
- **Context:** <one phrase — when this applies>
- **Observation:** <one sentence — what was found, with evidence inline>
- **Application:** <one sentence — what to do differently>
- **Confidence:** <0.70–1.00>
- **Applied-In:** []
- **Source:** app-login
- **Supersedes:** <ID of entry this replaces, or null>
- **Tags:** <comma-separated>
```

**Type taxonomy:**

| Type | When to Use |
|---|---|
| `gotcha` | Edge case / surprising behavior that causes failures |
| `pattern` | Reusable approach that works consistently |
| `fix` | Bug resolution pattern |
| `pitfall` | Common mistake to avoid |
| `decision` | Architectural choice with rationale |
| `preference` | Project convention (not a universal truth) |

**Confidence thresholds:**

| Score | Meaning | Action |
|---|---|---|
| 0.95+ | Confirmed working | Auto-promote at reuse threshold |
| 0.85–0.94 | Strong evidence | Standard lifecycle |
| 0.70–0.84 | Reasonable inference | Flag for confirmation on next use |
| Below 0.70 | Insufficient | Admission gate rejects — do not persist |

**State lifecycle:** `CANDIDATE → ACTIVE → CONSOLIDATED → DEPRECATED`

## N.5 Score and Gate

### FULL Mode (learn-n-improve present)

1. Map each entry to learn-n-improve JSON schema:
   - `lesson` ← Type + ": " + Observation
   - `error.context` ← Context
   - `fix.description` ← Application
   - `tags` ← Tags array + "app-login"
   - `reuse_count` ← 0
2. Write to `.claude/learnings.json`
3. Log `CREATE` action to `references/CHANGELOG.jsonl`:
   ```jsonl
   {"id":"L-001","ts":"2026-04-17T14:30:00Z","action":"CREATE","file":"references/learnings.md","confidence":0.92,"source":"app-login"}
   ```
4. Report: "N entries captured in learnings.json — will promote to references after reuse_count ≥ 2."
5. **Do NOT write to reference files yet** — learn-n-improve handles promotion.

### STANDALONE Mode (learn-n-improve absent)

1. Score each entry with a haiku subagent:
   ```
   Agent(model="haiku", prompt="Score this knowledge entry for persistence
   in the app-login skill's reference files.

   Entry: {entry_text}

   Evaluate (yes/partial/no):
   1. Specificity: Actionable for someone reading cold?
   2. Reusability: Applies to future app-login invocations, not a one-off?
   3. Non-obvious: A competent Playwright user would NOT already know this?
   4. Safety: Does NOT contain any credential, token, or user-identifying data?

   Verdict: KEEP | REVIEW | DISCARD
   Reason: <one sentence>")
   ```

2. Filter results:

   | Verdict | Action |
   |---|---|
   | KEEP | Include in presentation to user |
   | REVIEW | Include with scorer's concern flagged |
   | DISCARD | Drop — report reason to user |

3. Present surviving entries to user:
   ```
   ## Proposed Reference Updates

   | # | Type | Title | Target File | Action | Score |
   |---|---|---|---|---|---|
   | 1 | gotcha | Google "Confirm it's you" prompt | references/learnings.md | Append | KEEP |
   | 2 | pattern | CDP storageState export | references/learnings.md | Append | KEEP |

   Discarded (scored below threshold):
   - "Wait for network idle" → DISCARD: generic Playwright knowledge

   Proceed with updates? [y/n/select]
   ```

4. **Wait for user approval.** Do NOT write without confirmation.

5. On approval:
   - Write approved entries to `references/learnings.md` (Active Observations section)
   - If entry supersedes an existing entry: set old entry State to `DEPRECATED`, add `Superseded-By` pointer
   - Log all actions to `references/CHANGELOG.jsonl`

**Two-tier reference file structure (enforced in `learnings.md`):**

```markdown
## Consolidated Principles
<!-- State: CONSOLIDATED. Proven across 3+ applications. -->
- <standing rules derived from validated entries>

## Active Observations
<!-- State: CANDIDATE or ACTIVE. Under evaluation. -->
### [type] Title
- **ID:** L-042
- ...
```

## N.6 Consolidation Check (STANDALONE mode only)

FULL mode inherits learn-n-improve's staleness detection. STANDALONE mode
checks these triggers after writing entries:

| Trigger | Condition | Action |
|---|---|---|
| Count | CANDIDATE + ACTIVE entries > 30 per file | LLM consolidation pass |
| Staleness | DYNAMIC entry > 30 days with Applied-In empty | Flag `[REVIEW NEEDED]` |
| Conflict | Two ACTIVE entries contradict on same Scope | Surface for resolution |
| Promotion | Applied-In length ≥ 3 AND confidence ≥ 0.85 | Move to Consolidated Principles |
| Token budget | All ACTIVE entries in one file > ~2,000 tokens | Compress oldest entries |

If any trigger fires:
1. Run consolidation: promote, merge, flag, or deprecate as appropriate
2. Present proposed changes to user before applying
3. Log all actions to `references/CHANGELOG.jsonl`

If no triggers fire → skip.

## N.7 Version Bump

If any reference files were modified in this step:
- Bump the skill's **patch version** in SKILL.md frontmatter (e.g., 1.0.0 → 1.0.1)
- Log `VERSION_BUMP` in CHANGELOG.jsonl
