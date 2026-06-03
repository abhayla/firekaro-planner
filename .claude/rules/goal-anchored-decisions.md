# Scope: global

# Goal-Anchored Decisions

Every non-trivial decision — build vs defer vs cut, a design fork, prioritization, scope, "which
option?" — MUST be evaluated against **THIS project's documented goal and its expected users**, and
resolved to the option (or **combination** of options) that best serves them. Local engineering
convenience, feature-completeness, symmetry, or "the matrix has a hole" are NOT reasons to build —
serving the goal + the target user is. Requested by Abhay 2026-06-03.

## Anchor to the SSOTs (not a vague "goal")

"The goal" and "the users" are concrete, documented facts — read them, don't guess:

- **Product goal:** a research-grounded Indian **FIRE** planning SaaS — *planning & tracking, not
  advice* — that is **correct, honest, sticky, and friction-free** (`CLAUDE.md` "What this is";
  `docs/v6-fire-planner-product-plan.md`).
- **Primary user (LOCKED):** the **urban salaried accumulator** — someone in the *accumulation*
  phase (still earning, building corpus), whose headline number is the **FIRE date / years-to-FIRE**
  (`docs/v6-fire-planner-product-plan.md` §9). Tier-2 adjacent personas (freelancer → NRI → HUF) are
  *later*, not now.
- **Current "Now" priority order** (`.claude/rules/engineering-roles.md` stage block):
  Tier 0 **correctness/honesty** → Tier 1 **retention/onboarding (stickiness)** → Tier 2 adjacent
  personas.
- **Portfolio role + principles:** FireKaro is the Financial-pillar data layer + commercial SaaS;
  the four immutable principles — permanent/productized, scale-from-day-1, automate,
  continuously-update (`5W-CONTEXT.md`, `5W-PRINCIPLES.md`).

## How to apply (every recommendation)

1. **Name the goal + user impact explicitly** — e.g. "sharpens the accumulator's headline FIRE-date
   accuracy (Tier-0 honesty)". The anchor MUST be visible and auditable in the recommendation, never
   implicit.
2. **Prefer combinations over false binaries** — the best answer is often "ship the correctness bit
   + build the persona-aligned feature + defer the wrong-user-phase one," not a single option.
3. **Tie-break by persona + the "Now" order** — when options conflict, the *primary persona's* needs
   and the order (correctness → stickiness → friction) decide. An option serving a **non-target user
   phase** (e.g. drawdown/decumulation sophistication for a planner whose locked user is still
   *accumulating*) loses to one serving the target persona.
4. **Honesty is a goal, not a nicety** — for a FIRE planner an *optimistic* error (over-stated
   corpus / earlier-than-real FIRE date) makes the user **under-save** — the worst failure mode.
   Options that remove optimistic bias for the target user rank high **regardless of fix size**.

## Guard against (the two failure modes this rule kills)

- **Feature-completeness bias** — building X because a matrix/symmetry has a hole, not because the
  user needs it (ties to YAGNI, `claude-behavior.md` rule 21).
- **Local-optimum bias** — picking the engineering-convenient option that doesn't move the goal/user.

## Relationship to the other decision rules

This is the substantive **criterion for evaluating options**. It composes with — does not replace —
`decision-authority.md` (WHO decides + escalate-vs-decide), the **confidence gate** (converge on
intent before building), and **YAGNI** (don't build the unneeded). Decide reversible/internal work
yourself, anchored to the goal; escalate only the genuinely gated forks — with the goal/user
reasoning stated.

## CRITICAL RULES

- MUST evaluate every non-trivial decision against the documented goal + LOCKED persona — never local
  convenience, feature-completeness, or symmetry.
- MUST state the goal/user reasoning IN the recommendation (a visible, auditable anchor).
- MUST consider combinations of options, not just single options.
- MUST let the target persona + the "Now" priority order break ties; a non-target user *phase* loses.
- MUST treat optimistic/honesty errors for the target user as high-priority (Tier-0), regardless of
  fix size.
