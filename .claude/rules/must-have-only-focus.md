# Scope: global

# Must-Have-Only Focus Lock

**One-line rule:** Until Abhay **explicitly approves otherwise**, work ONLY on **must-have**
features. Do NOT start or build any **good-to-have** or **nice-to-have** feature/issue without his
explicit, per-item approval. Standing directive from Abhay (2026-06-07): *"focus only on must-have
features… do not touch good-to-have / nice-to-have until I explicitly approve."*

This is a **prioritization gate** on top of `goal-anchored-decisions.md` (which decides *which*
option best serves the goal+persona) and the `documentation-management.md` feature-tiering registry
(which defines the tiers + their queryable home). It does not replace them — it freezes the build
focus to the top tier until released. Cross-reference, never duplicate (`configuration-ssot.md`).

## How tier is determined (the registry)

The tier of any work item is its **GitHub issue label** — `must-have` / `good-to-have` /
`nice-to-have` (`gh issue list --label <tier>`), per `documentation-management.md` § "Feature
tiering registry". An unlabelled new ask is tiered (goal-anchored) before any build starts; if it is
good-to-have or nice-to-have, it is **blocked pending approval** by this rule.

## ALLOWED without approval (do these freely)

- **Build / continue must-have features** (`gh issue list --label must-have`).
- **Test, verify, harden, and bug-fix ALREADY-IMPLEMENTED features of ANY tier.** Verifying or
  fixing what already exists is NOT "building a good-to-have" — it protects the goal (correct,
  honest, working). This is the explicit carve-out that reconciles "only must-have" with "fully test
  the whole app".
- **Tier-0 correctness/honesty fixes** (wrong/optimistic financial output, security, data-loss) —
  always in-scope regardless of which feature they touch (`goal-anchored-decisions.md`: optimistic
  errors for the target user are Tier-0).
- **Governance / docs / SSOT upkeep** the user requested or that the rules already mandate.

## BLOCKED pending explicit approval

- **Starting or building any `good-to-have` or `nice-to-have` feature/issue** — the live blocked set is
  the query `gh issue list --label good-to-have` / `--label nice-to-have` (this rule does NOT snapshot
  issue numbers — they go stale).
- Promoting a good-to-have/nice-to-have into active build because "the catalog looks incomplete"
  (feature-completeness bias — forbidden by `goal-anchored-decisions.md` rule 30).

## The approval gate

The lock lifts **per item** only on Abhay's explicit approval ("go ahead on #45", "build the
retention loop"). Absent that, surface the lower-tier item in **one line** as blocked-pending-approval
and keep working the allowed set — do NOT silently start it, and do NOT stop the whole turn for it
(`decision-authority.md`: escalate in one line, keep going on non-gated work).

## Seeing the live state (query, never a snapshot)

`gh issue list --label must-have` = what's buildable now; `--label good-to-have` / `--label
nice-to-have` = blocked pending approval. The query IS the live registry — this rule deliberately holds
no dated snapshot. When the must-have set is empty, the rule's effect is simply: hardening/testing the
built app is in-scope (the carve-out above); no new lower-tier build begins until approved.

## CRITICAL RULES

- MUST NOT start/build any `good-to-have` or `nice-to-have` feature/issue without Abhay's explicit
  per-item approval.
- MUST treat testing/verification/hardening/bug-fixing of already-implemented features (any tier) and
  Tier-0 correctness/honesty fixes as ALLOWED — they are not new lower-tier builds.
- MUST surface a blocked lower-tier item in ONE line (blocked-pending-approval) and keep working the
  allowed set — never silently build it, never stop the turn for it.
- MUST read the tier from the issue label (`gh issue list --label <tier>`); cross-reference
  `goal-anchored-decisions.md` + `documentation-management.md`, do not duplicate them.
